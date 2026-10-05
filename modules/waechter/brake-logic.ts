/**
 * #3 Aufräum-Bremse, the pure part: which commands destroy work, and what has
 * to be saved before they run.
 *
 * Trap: `git stash create` does not capture untracked files, and those are
 * exactly what `git clean` deletes. Tracked changes go into a stash commit
 * (kept alive by a ref), untracked files and `rm -rf` targets into a tar.
 */
import { joinPath } from '../../core/cwd'
import { flags, gitCall } from '../../core/shell/git'
import type { Cmd } from '../../core/shell/words'

export type BrakeKind = 'rm' | 'reset-hard' | 'checkout' | 'restore' | 'clean' | 'revert'

export interface BrakePlan {
  kind: BrakeKind
  /** Where git runs / relative paths are resolved. */
  cwd: string
  /** Save tracked changes with `git stash create`. */
  stash: boolean
  /** Absolute paths to tar (rm targets); for `clean` the list comes from `git clean -n`. */
  paths: string[]
  /** For `clean`: the flags to ask `git clean -n` with. */
  cleanArgs?: string[]
  /** Paths exo cannot resolve without running the shell ($VAR, $(…)). */
  unresolved: string[]
  /** Simple globs to expand by listing a directory. */
  globs: string[]
}

const isRecursiveForce = (args: readonly string[]): boolean => {
  const f = flags(args)
  return (f.has('r') || f.has('R') || f.has('--recursive')) && (f.has('f') || f.has('--force'))
}

/** Operands after options; everything after `--` counts. */
function operands(args: readonly string[]): { words: string[]; dashdash: boolean } {
  const i = args.indexOf('--')
  if (i >= 0) return { words: [...args.slice(0, i).filter(a => !a.startsWith('-')), ...args.slice(i + 1)], dashdash: true }
  return { words: args.filter(a => !a.startsWith('-')), dashdash: false }
}

/** One plan per destructive command; local commands only (not over ssh). */
export function plans(cmds: readonly Cmd[], cwd: string, home: string | undefined): BrakePlan[] {
  const out: BrakePlan[] = []
  for (const c of cmds) {
    if (c.via.some(v => v.kind === 'ssh')) continue

    if (c.program === 'rm' && isRecursiveForce(c.argv.slice(1))) {
      const plan: BrakePlan = { kind: 'rm', cwd, stash: false, paths: [], unresolved: [], globs: [] }
      // paths that only exist at run time: xargs feeds them, find substitutes {}
      const feeder = c.via.find(v => v.kind === 'xargs' || (v.kind === 'wrapper' && v.name === 'find'))
      if (feeder) {
        plan.unresolved.push(`${feeder.name} … rm`)
        out.push(plan)
        continue
      }
      const ops = c.words.slice(1)
      let after = false
      for (const w of ops) {
        if (!after && w.text === '--') {
          after = true
          continue
        }
        if (!after && w.text.startsWith('-')) continue
        if (w.expansion) plan.unresolved.push(w.text)
        else if (w.glob) plan.globs.push(joinPath(cwd, w.text, home))
        else plan.paths.push(joinPath(cwd, w.text, home))
      }
      if (plan.paths.length || plan.unresolved.length || plan.globs.length) out.push(plan)
      continue
    }

    const g = gitCall(c)
    if (!g) continue
    const dir = g.cwd ? joinPath(cwd, g.cwd, home) : cwd
    const f = flags(g.args)
    if (g.sub === 'reset' && f.has('--hard')) out.push({ kind: 'reset-hard', cwd: dir, stash: true, paths: [], unresolved: [], globs: [] })
    else if (g.sub === 'checkout') {
      const { words, dashdash } = operands(g.args)
      if (dashdash || words.includes('.')) out.push({ kind: 'checkout', cwd: dir, stash: true, paths: [], unresolved: [], globs: [] })
    } else if (g.sub === 'restore' && !(f.has('S') || f.has('--staged')) || (g.sub === 'restore' && (f.has('W') || f.has('--worktree')))) {
      if (operands(g.args).words.length) out.push({ kind: 'restore', cwd: dir, stash: true, paths: [], unresolved: [], globs: [] })
    } else if (g.sub === 'clean' && (f.has('f') || f.has('--force')) && !(f.has('n') || f.has('--dry-run'))) {
      const cleanArgs = ['-n', ...g.args.flatMap(a => {
        if (a === '--force') return []
        if (/^-[A-Za-z]+$/.test(a)) {
          const rest = a.slice(1).replace(/f/g, '')
          return rest ? [`-${rest}`] : []
        }
        return [a]
      })]
      out.push({ kind: 'clean', cwd: dir, stash: false, paths: [], cleanArgs, unresolved: [], globs: [] })
    }
  }
  return out
}

/** `git clean -n` output → paths relative to its cwd. */
export function parseCleanDryRun(stdout: string): string[] {
  return stdout
    .split('\n')
    .map(l => /^Would remove (.+)$/.exec(l.trim())?.[1])
    .filter((p): p is string => !!p)
    .map(p => p.replace(/\/$/, ''))
}

/** A glob on the last path segment, as a matcher (`*.log`, `build-?`). */
export function segmentMatcher(glob: string): RegExp {
  let re = ''
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i]!
    if (ch === '*') re += '[^/]*'
    else if (ch === '?') re += '[^/]'
    else if (ch === '[') {
      const end = glob.indexOf(']', i + 1)
      if (end === -1) re += '\\['
      else {
        re += '[' + glob.slice(i + 1, end).replace(/^!/, '^') + ']'
        i = end
      }
    } else re += ch.replace(/[.+^${}()|\\]/g, '\\$&')
  }
  return new RegExp(`^${re}$`)
}

/** Only the last segment may hold glob characters; otherwise exo does not expand it. */
export function simpleGlob(path: string): { dir: string; match: RegExp } | null {
  const cut = path.lastIndexOf('/')
  const dir = cut <= 0 ? '/' : path.slice(0, cut)
  const last = path.slice(cut + 1)
  if (/[*?[]/.test(dir) || /[{]/.test(last)) return null
  try {
    return { dir, match: segmentMatcher(last) }
  } catch {
    return null
  }
}

export interface SnapshotMeta {
  id: string
  at: number
  kind: BrakeKind
  cwd: string
  /** Argument-free summary of the command. */
  summary: string
  repoRoot?: string
  head?: string
  stashRef?: string
  stashSha?: string
  tar?: string
  files: string[]
  bytes: number
  restored?: boolean
}

export const KEEP_COUNT = 20
export const KEEP_MS = 7 * 86_400_000

/** Which snapshots to drop: beyond the newest 20, or older than 7 days. */
export function expired(list: readonly SnapshotMeta[], now: number): SnapshotMeta[] {
  const sorted = [...list].sort((a, b) => b.at - a.at)
  return sorted.filter((s, i) => i >= KEEP_COUNT || now - s.at > KEEP_MS)
}

export function snapshotId(now: number, rand: string): string {
  const d = new Date(now)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${rand}`
}
