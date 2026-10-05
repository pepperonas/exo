/**
 * `/undo-last` and `/undo-list`: restoring a snapshot of the Aufräum-Bremse.
 * Nothing is overwritten without asking.
 */
import type { Host } from '../../core/adapter/host'
import type { StoreBox } from '../../core/store/store'
import { readSnapshots, writeSnapshots } from './brake'
import type { SnapshotMeta } from './brake-logic'

const KINDS: Record<SnapshotMeta['kind'], string> = {
  rm: 'rm -rf',
  'reset-hard': 'git reset --hard',
  checkout: 'git checkout --',
  restore: 'git restore',
  clean: 'git clean',
  revert: 'Zurücksetzen (Seitenleiste)',
}

function when(at: number, now: number): string {
  const min = Math.round((now - at) / 60_000)
  if (min < 1) return 'gerade eben'
  if (min < 60) return `vor ${min} min`
  const h = Math.round(min / 60)
  return h < 48 ? `vor ${h} h` : `vor ${Math.round(h / 24)} Tagen`
}

export async function undoList(store: StoreBox | undefined, now: number): Promise<string> {
  const list = await readSnapshots(store)
  if (!list.length) return 'Keine Schnappschüsse. Die Aufräum-Bremse legt einen vor rm -rf, git reset --hard, git checkout -- ., git restore und git clean an.'
  const lines = ['Schnappschüsse (neueste zuerst):']
  for (const s of list) {
    const parts = [s.stashRef ? 'Änderungen' : '', s.tar ? `${s.files.length} Pfad(e)` : ''].filter(Boolean).join(' + ')
    lines.push(`  ${s.id}  ${KINDS[s.kind]}  ${when(s.at, now)}  ${parts}${s.restored ? '  (wiederhergestellt)' : ''}`)
  }
  lines.push('Wiederherstellen: /undo-last (neuester) oder /undo-last <id>.')
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
  if (!s) return id ? `Kein Schnappschuss ${id}. /undo-list zeigt alle.` : 'Kein Schnappschuss vorhanden.'
  const done: string[] = []

  if (s.stashSha && s.repoRoot) {
    const status = await host.run(['git', '-C', s.repoRoot, 'status', '--porcelain', '--untracked-files=no'])
    if (status.stdout.trim()) {
      const a = await ask(host, `Im Repository gibt es inzwischen Änderungen. Den Schnappschuss ${s.id} trotzdem darüber anwenden (Konflikte möglich)?`, ['Anwenden', 'Abbrechen'])
      if (a !== 'Anwenden') return 'Abgebrochen, nichts verändert.'
    }
    const r = await host.run(['git', '-C', s.repoRoot, 'stash', 'apply', s.stashSha])
    if (r.exitCode !== 0) return `git stash apply ist fehlgeschlagen:\n${(r.stderr || r.stdout).trim().slice(0, 600)}\nDer Schnappschuss bleibt erhalten (${s.stashRef}).`
    done.push('getrackte Änderungen angewendet')
  }

  if (s.tar) {
    const exists: string[] = []
    for (const f of s.files) if (await host.exists(f).catch(() => false)) exists.push(f)
    let keepExisting = false
    if (exists.length) {
      const a = await ask(host, `${exists.length} Pfad(e) aus dem Schnappschuss gibt es schon (z. B. ${exists[0]}). Überschreiben?`, ['Überschreiben', 'Nur fehlende', 'Abbrechen'])
      if (a === null || a === 'Abbrechen') return done.length ? `${done.join('; ')}. Dateien nicht angetastet.` : 'Abgebrochen, nichts verändert.'
      keepExisting = a === 'Nur fehlende'
    }
    const r = await host.run(['tar', keepExisting ? '-xzPkf' : '-xzPf', s.tar], { timeoutMs: 300_000 })
    if (r.exitCode !== 0 && !keepExisting) return `tar ist fehlgeschlagen: ${r.stderr.trim().slice(0, 400)}`
    done.push(`${s.files.length} Pfad(e) zurückgeholt${keepExisting ? ' (vorhandene behalten)' : ''}`)
  }

  await writeSnapshots(store, list.map(x => (x.id === s.id ? { ...x, restored: true } : x)))
  return `Schnappschuss ${s.id} wiederhergestellt: ${done.join('; ') || 'nichts zu tun'}.`
}
