/**
 * `/undo-last` and `/undo-list`: restoring a snapshot of the cleanup brake.
 * Nothing is overwritten without asking.
 */
import type { Host } from '../../core/adapter/host'
import type { StoreBox } from '../../core/store/store'
import { readSnapshots, writeSnapshots } from './brake'
import { paths } from './brake-logic'
import type { SnapshotMeta } from './brake-logic'

const KINDS: Record<SnapshotMeta['kind'], string> = {
  rm: 'rm -rf',
  'reset-hard': 'git reset --hard',
  checkout: 'git checkout --',
  restore: 'git restore',
  clean: 'git clean',
  revert: 'Revert (sidebar)',
}

function when(at: number, now: number): string {
  const min = Math.round((now - at) / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.round(min / 60)
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`
}

export async function undoList(store: StoreBox | undefined, now: number): Promise<string> {
  const list = await readSnapshots(store)
  if (!list.length) return 'No snapshots. The cleanup brake takes one before rm -rf, git reset --hard, git checkout -- ., git restore and git clean.'
  const lines = ['Snapshots (newest first):']
  for (const s of list) {
    const parts = [s.stashRef ? 'changes' : '', s.tar ? `${paths(s.files.length)}` : ''].filter(Boolean).join(' + ')
    lines.push(`  ${s.id}  ${KINDS[s.kind]}  ${when(s.at, now)}  ${parts}${s.restored ? '  (restored)' : ''}`)
  }
  lines.push('Restore: /undo-last (newest) or /undo-last <id>.')
  return lines.join('\n')
}

async function ask(host: Host, question: string, options: string[]): Promise<string | null> {
  try {
    return await host.ask(question, options)
  } catch {
    return null
  }
}

export async function undoLast(host: Host, store: StoreBox | undefined, id: string | undefined): Promise<string> {
  const list = await readSnapshots(store)
  const s = id ? list.find(x => x.id === id) : list.find(x => !x.restored) ?? list[0]
  if (!s) return id ? `No snapshot ${id}. /undo-list shows them all.` : 'No snapshot available.'
  const done: string[] = []

  if (s.stashSha && s.repoRoot) {
    const status = await host.run(['git', '-C', s.repoRoot, 'status', '--porcelain', '--untracked-files=no'])
    if (status.stdout.trim()) {
      const a = await ask(host, `The repository has changed since. Apply snapshot ${s.id} on top anyway (conflicts possible)?`, ['Apply', 'Cancel'])
      if (a !== 'Apply') return 'Cancelled, nothing changed.'
    }
    const r = await host.run(['git', '-C', s.repoRoot, 'stash', 'apply', s.stashSha])
    if (r.exitCode !== 0) return `git stash apply failed:\n${(r.stderr || r.stdout).trim().slice(0, 600)}\nThe snapshot is kept (${s.stashRef}).`
    done.push('tracked changes applied')
  }

  if (s.tar) {
    const exists: string[] = []
    for (const f of s.files) if (await host.exists(f).catch(() => false)) exists.push(f)
    let keepExisting = false
    if (exists.length) {
      const a = await ask(host, `${paths(exists.length)} from the snapshot already ${exists.length === 1 ? 'exists' : 'exist'} (e.g. ${exists[0]}). Overwrite?`, ['Overwrite', 'Only missing', 'Cancel'])
      if (a === null || a === 'Cancel') return done.length ? `${done.join('; ')}. Files left untouched.` : 'Cancelled, nothing changed.'
      keepExisting = a === 'Only missing'
    }
    const r = await host.run(['tar', keepExisting ? '-xzPkf' : '-xzPf', s.tar], { timeoutMs: 300_000 })
    if (r.exitCode !== 0 && !keepExisting) return `tar failed: ${r.stderr.trim().slice(0, 400)}`
    done.push(`${paths(s.files.length)}${keepExisting ? ' (existing ones kept)' : ''}`)
  }

  await writeSnapshots(store, list.map(x => (x.id === s.id ? { ...x, restored: true } : x)))
  return `Snapshot ${s.id} restored: ${done.join('; ') || 'nothing to do'}.`
}
