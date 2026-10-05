/**
 * #18 Erfolge & Serien: counters from the journal, badges as data (RULES),
 * at most one new badge per turn with a toast (and a sound if wanted), quiet
 * hours respected. `/achievements` draws the collection as an ASCII card.
 */
import type { ModuleEnv, Step } from '../../core/dispatcher/dispatcher'
import { cellWidth } from '../../core/statusline/statusline'
import { dayKey, readHours } from '../rueckblick/hours-logic'
import { RULES, count, dayStreak, due, inQuiet, metrics, readAch } from './achievements-logic'
import type { AchState } from './achievements-logic'

const SOUND = 'sounds/badge.wav'

async function load(env: ModuleEnv): Promise<AchState> {
  return readAch(await env.store?.get('achievements').catch(() => null), env.sessionId)
}

/** Metrics that live outside the counters: hours, and per-session judgements. */
async function extra(env: ModuleEnv): Promise<Record<string, number>> {
  const h = readHours(await env.store?.get('hours').catch(() => null))
  let best = 0
  for (const per of Object.values(h.days)) for (const s of Object.values(per)) best = Math.max(best, s)
  const days = Object.keys(h.days).filter(d => Object.values(h.days[d]!).some(s => s > 0))
  return { activeHoursDay: best / 3600, dayStreak: dayStreak(days, dayKey(await env.host.now())) }
}

export function achievementsStep(): Step {
  /** Highest context fill and 5-h use seen this session. */
  const peak = { context: 0, fiveHour: 0 }
  return {
    id: 'achievements',
    async turnComplete(env) {
      const u = await env.host.usage().catch(() => ({}) as { contextPercent?: number; fiveHour?: number })
      peak.context = Math.max(peak.context, u.contextPercent ?? 0)
      peak.fiveHour = Math.max(peak.fiveHour, u.fiveHour ?? 0)
      const s = count(await load(env), env.journal.all())
      const next = due(s, metrics(s, await extra(env)), await env.host.usageBars().catch(() => false))
      const now = await env.host.now()
      const badge = next[0]
      if (badge) {
        s.unlocked[badge.id] = now
        if (!inQuiet(new Date(now).getHours(), env.config.quietHours)) {
          env.host.toast(`${badge.icon} Abzeichen: ${badge.title} – ${badge.text}`, 6000)
          if (env.config.sound) void env.host.playSound(SOUND)
        }
      }
      await env.store?.set('achievements', s)
      return undefined
    },
    async end(env) {
      // per-session judgements: only sessions of some length count
      const s = count(await load(env), env.journal.all())
      if ((s.counters.turns ?? 0) - (s.counters.turnsAtStart ?? 0) >= 10) {
        if (peak.context > 0 && peak.context <= 50) s.counters.contextLowSessions = (s.counters.contextLowSessions ?? 0) + 1
        if (peak.fiveHour > 0 && peak.fiveHour < 90) s.counters.pacmanSessions = (s.counters.pacmanSessions ?? 0) + 1
      }
      s.counters.removedSessionNow = 0
      await env.store?.set('achievements', s)
    },
    async start(env) {
      const s = await load(env)
      s.counters.turnsAtStart = s.counters.turns ?? 0
      s.counters.removedSessionNow = 0
      await env.store?.set('achievements', s)
    },
  }
}

const pad = (s: string, cells: number) => s + ' '.repeat(Math.max(0, cells - cellWidth(s)))

/** The collection as a card for a screenshot. */
export async function achievementsCard(env: ModuleEnv, ascii: boolean): Promise<string> {
  const s = count(await load(env), env.journal.all())
  const m = metrics(s, await extra(env))
  const bars = await env.host.usageBars().catch(() => false)
  const rules = RULES.filter(r => !r.requires || bars)
  const got = rules.filter(r => s.unlocked[r.id]).length
  const W = 58
  const head = ` exo · Erfolge ${got}/${rules.length} `
  const top = ascii ? `+${head}${'-'.repeat(W - head.length)}+` : `╭${head}${'─'.repeat(W - cellWidth(head))}╮`
  const bottom = ascii ? `+${'-'.repeat(W)}+` : `╰${'─'.repeat(W)}╯`
  const side = ascii ? '|' : '│'
  const lines = [top]
  for (const r of rules) {
    const at = s.unlocked[r.id]
    const mark = at ? (ascii ? `[${r.ascii}]` : r.icon) : ascii ? '[ ]' : '░░'
    const right = at ? new Date(at).toLocaleDateString('de-DE') : `${Math.min(Math.floor(m[r.metric] ?? 0), r.atLeast)}/${r.atLeast}`
    const left = `${mark} ${r.title}`
    // inner width W = space + left + right + space
    lines.push(`${side} ${pad(left, W - 2 - right.length)}${right} ${side}`)
  }
  lines.push(bottom)
  return lines.join('\n')
}
