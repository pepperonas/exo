/**
 * Reads a git command line: global options (`-C dir`, `-c k=v`, …) peeled
 * off, the subcommand and its arguments returned.
 */
import type { Cmd } from './words'

export interface GitCall {
  sub: string
  args: string[]
  /** `-C dir` (the last one wins, relative ones stack as git does). */
  cwd: string | null
}

const WITH_ARG = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--super-prefix', '--config-env', '--exec-path', '--list-cmds'])

export function gitCall(cmd: Cmd): GitCall | null {
  if (cmd.program !== 'git') return null
  const a = cmd.argv
  let cwd: string | null = null
  let i = 1
  for (; i < a.length; i++) {
    const t = a[i]!
    if (!t.startsWith('-')) break
    if (t === '-C') {
      const d = a[++i] ?? ''
      cwd = cwd && !d.startsWith('/') && !d.startsWith('~') ? `${cwd}/${d}` : d
      continue
    }
    if (WITH_ARG.has(t)) i++
  }
  const sub = a[i]
  if (!sub) return null
  return { sub, args: a.slice(i + 1), cwd }
}

/** Short flags as a set: `-fdx` → f, d, x; long flags kept whole. */
export function flags(args: readonly string[]): Set<string> {
  const out = new Set<string>()
  for (const t of args) {
    if (t === '--') break
    if (t.startsWith('--')) out.add(t.split('=')[0]!)
    else if (t.startsWith('-') && t.length > 1) for (const ch of t.slice(1)) out.add(ch)
  }
  return out
}
