/**
 * #17 Project time tracking: active time per project from the journal's
 * activity, today's total in the hint line, the week with `/hours`, an export
 * as CSV or JSON for personal use.
 */
import type { ModuleEnv, Step } from '../../core/dispatcher/dispatcher'
import type { JournalEvent } from '../../core/journal/journal'
import { exoDir } from '../../core/killswitch'
import { dayKey, emptyHours, hm, prune, readHours, record, toCsv, toJson, weekTable } from './hours-logic'
import type { Hours } from './hours-logic'

const SLOT = 'hours'
const ACTIVITY = new Set<JournalEvent['type']>(['prompt.submit', 'tool.start', 'tool.end', 'turn.complete'])

const st: { hours: Hours; env: ModuleEnv | null; shown: string; unsubscribe: (() => void) | null } = { hours: emptyHours(), env: null, shown: '', unsubscribe: null }

async function showToday(env: ModuleEnv, now: number): Promise<void> {
  const s = st.hours.days[dayKey(now)]?.[env.project] ?? 0
  const text = s >= 60 ? `⏱ ${hm(s)} today` : ''
  if (text === st.shown) return
  st.shown = text
  await env.host.setSlot(SLOT, text ? { id: SLOT, order: 30, priority: 20, text, dim: true } : null)
}

function onEvent(e: JournalEvent): void {
  const env = st.env
  if (!env || !ACTIVITY.has(e.type)) return
  st.hours = record(st.hours, env.project, e.at)
  env.store?.later('hours', () => st.hours)
  void showToday(env, e.at).catch(() => undefined)
}

export async function hoursCommand(env: ModuleEnv, args: string): Promise<string> {
  const [sub = '', fmt = 'csv'] = args.trim().split(/\s+/)
  const now = await env.host.now()
  await env.store?.flush()
  if (sub === 'export') {
    if (!env.home) return 'No home directory known.'
    const json = fmt === 'json'
    const path = `${exoDir(env.home)}/hours-${dayKey(now)}.${json ? 'json' : 'csv'}`
    await env.host.writeFile(path, json ? toJson(st.hours) : toCsv(st.hours))
    return `Exported: ${path}`
  }
  return weekTable(st.hours, now)
}

export function hoursStep(): Step {
  return {
    id: 'hours',
    async start(env) {
      st.env = env
      st.shown = ''
      const stored = readHours(await env.store?.get('hours').catch(() => null))
      st.hours = prune(stored, await env.host.now())
      st.unsubscribe?.()
      st.unsubscribe = env.journal.subscribe(onEvent)
      await showToday(env, await env.host.now())
    },
    async end(env) {
      await env.store?.set('hours', st.hours)
    },
  }
}

/** For tests. */
export function hoursState() {
  return st
}
export function resetHours(): void {
  st.unsubscribe?.()
  Object.assign(st, { hours: emptyHours(), env: null, shown: '', unsubscribe: null })
}
