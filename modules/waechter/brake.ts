/**
 * #3 Cleanup brake: a snapshot before `rm -rf`, `git reset --hard`,
 * `git checkout -- .`, `git restore .` and `git clean -f…`, restorable with
 * `/undo-last`. Over the size limit, or with paths exo cannot resolve, it
 * asks instead of waving the command through.
 */
import type { Host } from '../../core/adapter/host'
import type { CallCtx, Step } from '../../core/dispatcher/dispatcher'
import { joinPath } from '../../core/cwd'
import { exoDir } from '../../core/killswitch'
import { summarize } from '../../core/shell/words'
import type { StoreBox } from '../../core/store/store'
import { expired, parseCleanDryRun, plans, simpleGlob, snapshotId } from './brake-logic'
import type { BrakePlan, SnapshotMeta } from './brake-logic'

export const RUN_UNSAVED = 'Run without snapshot'
export const CANCEL = 'Cancel'
const META_KEEP = 60

export const snapshotsDir = (home: string) => `${exoDir(home)}/snapshots`

export async function readSnapshots(store: StoreBox | undefined): Promise<SnapshotMeta[]> {
  const v = store ? await store.get('snapshots').catch(() => null) : null
  return Array.isArray(v) ? (v as SnapshotMeta[]).filter(s => s && typeof s.id === 'string' && typeof s.at === 'number') : []
}

export async function writeSnapshots(store: StoreBox | undefined, list: SnapshotMeta[]): Promise<void> {
  if (!store) return
  const sorted = [...list].sort((a, b) => b.at - a.at).slice(0, META_KEEP)
  await store.set('snapshots', sorted, v => (v.length > 1 ? v.slice(0, -1).map(s => ({ ...s, files: s.files.slice(0, 20) })) : null))
}

async function run(ctx: CallCtx, argv: string[], timeoutMs = 60_000) {
  return ctx.untimed(ctx.host.run(argv, { timeoutMs }))
}

async function expandGlob(ctx: CallCtx, path: string): Promise<string[] | null> {
  const g = simpleGlob(path)
  if (!g) return null
  try {
    const names = await ctx.untimed(ctx.host.list(g.dir))
    // like bash: a pattern not starting with a dot does not match dot files
    const lead = path.slice(path.lastIndexOf('/') + 1)
    return names.filter(n => g.match.test(n) && (lead.startsWith('.') || !n.startsWith('.'))).map(n => joinPath(g.dir, n, undefined))
  } catch {
    return []
  }
}

async function ask(ctx: CallCtx, question: string): Promise<boolean> {
  if (!ctx.interactive) {
    ctx.notes.push(`exo/cleanup brake: ${question.replace(/ – .*$/, '')} (run without a dialog, not saved).`)
    return true
  }
  try {
    return (await ctx.untimed(ctx.host.ask(question, [RUN_UNSAVED, CANCEL]))) === RUN_UNSAVED
  } catch {
    return false
  }
}

const mb = (bytes: number) => `${(bytes / 1048576).toFixed(bytes < 10 * 1048576 ? 1 : 0)} MB`

export function brakeStep(): Step {
  return {
    id: 'brake',
    async before(ctx) {
      if (ctx.call.tool !== 'Bash' || !ctx.parsed?.ok || !ctx.home) return
      const ps = plans(ctx.cmds, ctx.cmdCwd.cwd, ctx.home)
      if (!ps.length) return

      const unresolved = ps.flatMap(p => p.unresolved)
      for (const p of ps) for (const g of p.globs) {
        const hits = await expandGlob(ctx, g)
        if (hits === null) unresolved.push(g)
        else p.paths.push(...hits)
      }
      if (unresolved.length) {
        const ok = await ask(ctx, `Cleanup brake: cannot save ${unresolved.slice(0, 3).join(', ')} (variable or pattern) – run anyway?`)
        if (!ok) return { deny: 'exo/cleanup brake: cancelled – paths with variables cannot be saved beforehand.' }
      }

      const id = snapshotId(await ctx.host.now(), Math.random().toString(36).slice(2, 6))
      const dir = `${snapshotsDir(ctx.home)}/${id}`
      const meta: SnapshotMeta = { id, at: await ctx.host.now(), kind: ps[0]!.kind, cwd: ps[0]!.cwd, summary: summarize(String(ctx.call.input.command ?? '')), files: [], bytes: 0 }
      const tarPaths: string[] = []

      for (const p of ps) {
        if (p.kind === 'rm') {
          for (const path of p.paths) if (await ctx.untimed(ctx.host.exists(path)).catch(() => false)) tarPaths.push(path)
          continue
        }
        await gitPart(ctx, p, meta, id, tarPaths)
      }

      const unique = [...new Set(tarPaths)]
      if (unique.length) {
        const du = await run(ctx, ['du', '-sk', ...unique]).catch(() => null)
        const kb = du && du.exitCode === 0 ? du.stdout.split('\n').reduce((a, l) => a + (Number(l.split('\t')[0]) || 0), 0) : 0
        meta.bytes = kb * 1024
        if (meta.bytes > ctx.config.snapshotMaxMb * 1048576) {
          const ok = await ask(ctx, `Cleanup brake: ${mb(meta.bytes)} exceeds the limit of ${ctx.config.snapshotMaxMb} MB – run without snapshot?`)
          if (!ok) return { deny: `exo/cleanup brake: cancelled – ${mb(meta.bytes)} over the snapshot limit.` }
          await dropRefs(ctx.host, meta)
          return
        }
        await run(ctx, ['mkdir', '-p', dir])
        const tar = await run(ctx, ['tar', '-czPf', `${dir}/files.tgz`, '--', ...unique], 300_000)
        if (tar.exitCode !== 0) {
          ctx.notes.push(`exo/cleanup brake: snapshot of the files failed (${tar.stderr.trim().slice(0, 120)}).`)
        } else {
          meta.tar = `${dir}/files.tgz`
          meta.files = unique.slice(0, 200)
        }
      }

      if (!meta.tar && !meta.stashRef) return // nothing to save: nothing would be lost
      await ctx.untimed(ctx.host.writeFile(`${dir}/meta.json`, JSON.stringify(meta, null, 2) + '\n'))
      await writeSnapshots(ctx.store, [meta, ...(await readSnapshots(ctx.store))])
      ctx.journal.push({ type: 'snapshot', id, kind: meta.kind }, await ctx.host.now())
      const what = [meta.stashRef ? 'tracked changes' : '', meta.tar ? `${meta.files.length} path(s), ${mb(meta.bytes)}` : ''].filter(Boolean).join(' + ')
      ctx.notes.push(`exo/cleanup brake: snapshot ${id} (${what}) – restore with /undo-last.`)
    },
  }
}

async function gitPart(ctx: CallCtx, p: BrakePlan, meta: SnapshotMeta, id: string, tarPaths: string[]): Promise<void> {
  const top = await run(ctx, ['git', '-C', p.cwd, 'rev-parse', '--show-toplevel']).catch(() => null)
  if (!top || top.exitCode !== 0) return
  const root = top.stdout.trim()
  meta.repoRoot = root
  meta.cwd = p.cwd
  if (p.stash) {
    const head = await run(ctx, ['git', '-C', root, 'rev-parse', 'HEAD']).catch(() => null)
    if (head?.exitCode === 0) meta.head = head.stdout.trim()
    const sha = await run(ctx, ['git', '-C', root, 'stash', 'create']).catch(() => null)
    const s = sha?.exitCode === 0 ? sha.stdout.trim() : ''
    if (s) {
      // a stash commit nothing points to can be garbage-collected: keep a ref
      const ref = `refs/exo/snapshots/${id}`
      const r = await run(ctx, ['git', '-C', root, 'update-ref', ref, s]).catch(() => null)
      if (r?.exitCode === 0) {
        meta.stashRef = ref
        meta.stashSha = s
      }
    }
  }
  if (p.kind === 'clean' && p.cleanArgs) {
    const r = await run(ctx, ['git', '-C', p.cwd, 'clean', ...p.cleanArgs]).catch(() => null)
    if (r?.exitCode === 0) for (const rel of parseCleanDryRun(r.stdout)) tarPaths.push(joinPath(p.cwd, rel, undefined))
  }
}

async function dropRefs(host: Host, meta: SnapshotMeta): Promise<void> {
  if (meta.stashRef && meta.repoRoot) await host.run(['git', '-C', meta.repoRoot, 'update-ref', '-d', meta.stashRef]).catch(() => undefined)
}

/** Drops snapshots past the newest 20 or older than 7 days: files, refs, metadata. */
export async function pruneSnapshots(host: Host, store: StoreBox | undefined, home: string, now: number): Promise<number> {
  const list = await readSnapshots(store)
  const old = expired(list, now)
  for (const s of old) {
    await host.run(['rm', '-rf', `${snapshotsDir(home)}/${s.id}`]).catch(() => undefined)
    await dropRefs(host, s)
  }
  if (old.length) await writeSnapshots(store, list.filter(s => !old.includes(s)))
  return old.length
}
