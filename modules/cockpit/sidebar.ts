/**
 * #7 Changes sidebar: every file changed in this session through
 * Write/Edit, with +/− against its state before the first change, a diff,
 * and a reset (asked first, snapshot first).
 *
 * The originals are kept on disk under ~/.claude/exo/originals/<session>/,
 * so a reload of the mod does not lose them. Changes made through Bash are
 * not seen (a known limit).
 */
import type { Host } from '../../core/adapter/host'
import type { ModuleEnv, Step } from '../../core/dispatcher/dispatcher'
import { counts, unified } from '../../core/diff'
import { exoDir } from '../../core/killswitch'
import { onPane } from '../../core/statusline/banners'
import { snapshotId } from '../waechter/brake-logic'
import type { SnapshotMeta } from '../waechter/brake-logic'
import { readSnapshots, snapshotsDir, writeSnapshots } from '../waechter/brake'

interface Original {
  /** Text before the first change; null: the file did not exist. */
  text: string | null
}

const originals = new Map<string, Original>()
let selected: string | null = null
let envRef: ModuleEnv | null = null
let loadedFor = ''

const dirFor = (env: ModuleEnv) => (env.home ? `${exoDir(env.home)}/originals/${env.sessionId || 'ohne-id'}` : null)

async function persist(env: ModuleEnv): Promise<void> {
  const dir = dirFor(env)
  if (!dir) return
  const index: Record<string, string | null> = {}
  let i = 0
  for (const [path, o] of originals) {
    if (o.text === null) index[path] = null
    else {
      const file = `${dir}/${i++}.orig`
      await env.host.writeFile(file, o.text)
      index[path] = file
    }
  }
  await env.host.writeFile(`${dir}/index.json`, JSON.stringify(index, null, 2) + '\n')
}

async function load(env: ModuleEnv): Promise<void> {
  const dir = dirFor(env)
  if (!dir || loadedFor === dir) return
  loadedFor = dir
  originals.clear()
  try {
    const index = JSON.parse(await env.host.readFile(`${dir}/index.json`)) as Record<string, string | null>
    for (const [path, file] of Object.entries(index)) originals.set(path, { text: file === null ? null : await env.host.readFile(file) })
  } catch {
    // a new session: nothing to restore
  }
}

async function current(host: Host, path: string): Promise<string | null> {
  return (await host.exists(path).catch(() => false)) ? await host.readFile(path).catch(() => null) : null
}

/** Recomputes the list (and the diff of the selected file) and draws it. */
export async function refreshChanges(env: ModuleEnv): Promise<void> {
  envRef = env
  await load(env)
  const rows = []
  for (const [path, o] of originals) {
    const now = (await current(env.host, path)) ?? ''
    const c = counts(o.text ?? '', now)
    if (c.added || c.removed || (o.text === null && now !== '')) rows.push({ path, added: c.added, removed: c.removed, isNew: o.text === null })
  }
  rows.sort((a, b) => a.path.localeCompare(b.path))
  if (selected && !rows.some(r => r.path === selected)) selected = null
  let diff = ''
  if (selected) {
    const o = originals.get(selected)!
    const rel = env.project && selected.startsWith(env.project + '/') ? selected.slice(env.project.length + 1) : selected.replace(/^\//, '')
    diff = unified(rel, o.text ?? '', (await current(env.host, selected)) ?? '')
    const lines = diff.split('\n')
    if (lines.length > 2000) diff = lines.slice(0, 2000).join('\n') + '\n'
  }
  await env.host.setChanges(rows, selected, diff)
}

/** Resets a file to its state before the session, after asking; a snapshot first. */
export async function revert(env: ModuleEnv, path: string): Promise<string> {
  const o = originals.get(path)
  if (!o) return 'No original version known.'
  const what = o.text === null ? `${path} was created in this session – delete it?` : `Revert ${path} to its state before this session?`
  let ok = false
  try {
    ok = (await env.host.ask(what, ['Revert', 'Cancel'])) === 'Revert'
  } catch {
    ok = false
  }
  if (!ok) return 'Cancelled.'
  if (env.home && (await env.host.exists(path).catch(() => false))) {
    const now = await env.host.now()
    const id = snapshotId(now, Math.random().toString(36).slice(2, 6))
    const dir = `${snapshotsDir(env.home)}/${id}`
    await env.host.run(['mkdir', '-p', dir])
    const tar = await env.host.run(['tar', '-czPf', `${dir}/files.tgz`, '--', path])
    if (tar.exitCode !== 0) return `Snapshot failed, nothing changed: ${tar.stderr.trim().slice(0, 200)}`
    const meta: SnapshotMeta = { id, at: now, kind: 'revert', cwd: env.project, summary: 'Revert', tar: `${dir}/files.tgz`, files: [path], bytes: 0 }
    await env.host.writeFile(`${dir}/meta.json`, JSON.stringify(meta, null, 2) + '\n')
    await writeSnapshots(env.store, [meta, ...(await readSnapshots(env.store))])
  }
  if (o.text === null) await env.host.run(['rm', '-f', '--', path])
  else await env.host.writeFile(path, o.text)
  await refreshChanges(env)
  return `${path} reset (saved first, /undo-last brings it back).`
}

export function sidebarStep(): Step {
  return {
    id: 'sidebar',
    async start(env) {
      envRef = env
      await load(env)
      onPane('sel:', async (_host, path) => {
        if (!envRef) return
        selected = selected === path ? null : path
        await refreshChanges(envRef)
      })
      onPane('revert:', async (host, path) => {
        if (!envRef) return
        host.toast(await revert(envRef, path), 6000)
      })
      await refreshChanges(env)
    },
    async after(ctx, result) {
      const path = String(ctx.call.input.file_path ?? ctx.call.input.notebook_path ?? '')
      if (!path || ctx.fileBefore === undefined || result.deny !== undefined || result.isError) return
      const env: ModuleEnv = { host: ctx.host, journal: ctx.journal, config: ctx.config, store: ctx.store, home: ctx.home, project: envRef?.project ?? ctx.cmdCwd.cwd, cwd: ctx.cwd, interactive: ctx.interactive, sessionId: ctx.journal.sessionId }
      await load(env)
      if (!originals.has(path)) {
        originals.set(path, { text: ctx.fileBefore })
        await persist(env)
      }
      await refreshChanges(env)
    },
  }
}

/** For tests: forget everything. */
export function resetSidebar(): void {
  originals.clear()
  selected = null
  envRef = null
  loadedFor = ''
}
