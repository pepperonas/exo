/**
 * #2 Secret-Wächter: Write/Edit/NotebookEdit content, Bash writes to files
 * (`>`, `>>`, `tee`, heredocs), `git commit` (message and staged diff) and
 * `git push` (commits not on any remote) are scanned before they happen.
 *
 * Writing to a `.env` is allowed when git ignores it; otherwise a warning
 * goes to the model, never a denial. The secret itself never appears in a
 * message, the journal or the store: only its masked form.
 */
import type { CallCtx, Step } from '../../core/dispatcher/dispatcher'
import { joinPath } from '../../core/cwd'
import { matchesAny } from '../../core/glob'
import { flags, gitCall } from '../../core/shell/git'
import { LOCKFILES, isEnvFile, scanDiff, scanText } from './secrets-logic'
import type { SecretHit } from './secrets-logic'

type Located = SecretHit & { file: string }

const MAX_LISTED = 5

export function denyText(hits: Located[]): string {
  const lines = hits.slice(0, MAX_LISTED).map(h => `  ${h.file}:${h.line}  ${h.kind} (${h.masked})`)
  if (hits.length > MAX_LISTED) lines.push(`  … und ${hits.length - MAX_LISTED} weitere`)
  return [
    'exo/Secret-Wächter: mögliches Geheimnis gefunden – nicht ausgeführt.',
    ...lines,
    'Lege den Wert in eine .env (die in .gitignore steht) und lies ihn über eine Umgebungsvariable.',
    'Fehlalarm? Kommentar exo-allow-secret in die Zeile, den Pfad in secretAllowPaths aufnehmen oder /exo off secrets.',
  ].join('\n')
}

const WRITE_OPS = new Set(['>', '>>', '>|', '&>', '&>>', '<>'])

const dirOf = (p: string) => p.slice(0, Math.max(1, p.lastIndexOf('/')))

async function gitIgnores(ctx: CallCtx, path: string): Promise<boolean> {
  try {
    const r = await ctx.untimed(ctx.host.run(['git', '-C', dirOf(path), 'check-ignore', '-q', path], { timeoutMs: 5000 }))
    return r.exitCode === 0
  } catch {
    return false
  }
}

/** Line of `oldString` in the file, so an Edit's findings get real line numbers. */
async function editOffset(ctx: CallCtx, path: string, oldString: string): Promise<number> {
  try {
    const text = await ctx.untimed(ctx.host.readFile(path))
    const at = text.indexOf(oldString)
    return at < 0 ? 0 : text.slice(0, at).split('\n').length - 1
  } catch {
    return 0
  }
}

async function fileTool(ctx: CallCtx): Promise<{ deny: string } | void> {
  const input = ctx.call.input
  const path = String(input.file_path ?? input.notebook_path ?? '')
  if (!path || matchesAny(path, ctx.config.secretAllowPaths)) return
  const text = String(input.content ?? input.new_string ?? input.new_source ?? '')
  if (!text) return
  if (isEnvFile(path)) {
    if (!(await gitIgnores(ctx, path))) ctx.notes.push(`exo/Secret-Wächter: ${path} steht nicht in .gitignore – Geheimnisse darin landen beim nächsten Commit im Repository.`)
    return
  }
  const offset = ctx.call.tool === 'Edit' && typeof input.old_string === 'string' ? await editOffset(ctx, path, input.old_string) : 0
  const hits = scanText(text, { lockfile: LOCKFILES.test(path) }, offset).map(h => ({ ...h, file: path }))
  if (hits.length) return { deny: denyText(hits) }
}

async function bash(ctx: CallCtx): Promise<{ deny: string } | void> {
  const raw = String(ctx.call.input.command ?? '')
  const cwd = ctx.cmdCwd.cwd
  const hits: Located[] = []

  // writes into files: the command text carries the content
  const targets: string[] = []
  for (const c of ctx.cmds) {
    for (const r of c.redirects) if (WRITE_OPS.has(r.op) && r.target && r.target.text !== '/dev/null') targets.push(r.target.text)
    if (c.program === 'tee') targets.push(...c.argv.slice(1).filter(a => !a.startsWith('-')))
  }
  const paths = targets.map(t => joinPath(cwd, t, ctx.home))
  const relevant: string[] = []
  for (const p of paths) {
    if (matchesAny(p, ctx.config.secretAllowPaths)) continue
    if (isEnvFile(p)) {
      if (!(await gitIgnores(ctx, p))) ctx.notes.push(`exo/Secret-Wächter: ${p} steht nicht in .gitignore.`)
      continue
    }
    relevant.push(p)
  }
  if (relevant.length) for (const h of scanText(raw)) hits.push({ ...h, file: relevant[0]! })

  for (const c of ctx.cmds) {
    if (c.via.some(v => v.kind === 'ssh')) continue
    const g = gitCall(c)
    if (!g) continue
    const dir = g.cwd ? joinPath(cwd, g.cwd, ctx.home) : cwd
    const skip = (f: string) => matchesAny(f, ctx.config.secretAllowPaths)
    if (g.sub === 'commit') {
      for (const h of scanText(raw)) hits.push({ ...h, file: '(Commit-Nachricht)' })
      // `git add … && git commit`: the diff is read before the add runs, so
      // everything the add would stage counts (tracked changes, new files)
      const adds = ctx.cmds.map(gitCall).filter(x => x?.sub === 'add')
      const all = flags(g.args).has('a') || flags(g.args).has('--all') || adds.length > 0
      const r = await ctx.untimed(ctx.host.run(['git', '-C', dir, 'diff', all ? 'HEAD' : '--cached', '-U0', '--no-color', '--no-ext-diff'], { timeoutMs: 20_000 }))
      if (r.exitCode === 0) hits.push(...scanDiff(r.stdout, skip))
      if (adds.length) hits.push(...(await untrackedHits(ctx, dir, adds.flatMap(a => a!.args), skip)))
    }
    if (g.sub === 'push') {
      const r = await ctx.untimed(ctx.host.run(['git', '-C', dir, 'log', '-p', '-U0', '--no-color', '--no-ext-diff', 'HEAD', '--not', '--remotes'], { timeoutMs: 20_000 }))
      if (r.exitCode === 0) hits.push(...scanDiff(r.stdout, skip))
      else ctx.notes.push('exo/Secret-Wächter: die zu pushenden Commits konnten nicht geprüft werden.')
    }
  }
  if (hits.length) return { deny: denyText(hits) }
}

const UNTRACKED_MAX = 200

/** New files a `git add <pathspec>` would stage, scanned whole. */
async function untrackedHits(ctx: CallCtx, dir: string, addArgs: string[], skip: (f: string) => boolean): Promise<Located[]> {
  const r = await ctx.untimed(ctx.host.run(['git', '-C', dir, 'ls-files', '--others', '--exclude-standard'], { timeoutMs: 20_000 })).catch(() => null)
  if (!r || r.exitCode !== 0) return []
  const specs = addArgs.filter(a => !a.startsWith('-'))
  const everything = specs.length === 0 || specs.some(a => a === '.' || a === ':/' || a === '*') || addArgs.some(a => a === '-A' || a === '--all')
  const files = r.stdout
    .split('\n')
    .filter(Boolean)
    .filter(f => everything || specs.some(p => f === p || f.startsWith(p.replace(/\/$/, '') + '/')))
    .slice(0, UNTRACKED_MAX)
  const out: Located[] = []
  for (const f of files) {
    if (skip(f)) continue
    let text: string
    try {
      text = await ctx.untimed(ctx.host.readFile(`${dir}/${f}`))
    } catch {
      continue // too big or unreadable: git add would take it, the diff check of the next commit will see it
    }
    for (const h of scanText(text, { lockfile: LOCKFILES.test(f) })) out.push({ ...h, file: f })
  }
  return out
}

export function secretsStep(): Step {
  return {
    id: 'secrets',
    async before(ctx) {
      const tool = ctx.call.tool
      if (tool === 'Write' || tool === 'Edit' || tool === 'NotebookEdit') return fileTool(ctx)
      if (tool === 'Bash' && ctx.parsed?.ok) return bash(ctx)
    },
  }
}
