/**
 * #18 Achievements & streaks, the pure part. Badges are data: a metric and a
 * threshold. A new badge on an existing metric is one line in RULES, no code.
 */
import type { JournalEvent } from '../../core/journal/journal'

export interface Rule {
  id: string
  icon: string
  /** ASCII stand-in for the card under NO_COLOR or narrow terminals. */
  ascii: string
  title: string
  text: string
  metric: string
  atLeast: number
  /** Shown only when this mod is loaded. */
  requires?: 'usage-bars'
}

export const RULES: readonly Rule[] = [
  { id: 'erster-schritt', icon: '🐣', ascii: '*', title: 'First step', text: 'The first turn with exo.', metric: 'turns', atLeast: 1 },
  { id: 'zehn-gruen', icon: '🟢', ascii: 'o', title: 'Ten green turns', text: '10 turns in a row without a red test.', metric: 'greenStreakMax', atLeast: 10 },
  { id: 'fruehaufsteher', icon: '🌅', ascii: '^', title: 'Early bird', text: 'First commit before 9 am.', metric: 'commitsBefore9', atLeast: 1 },
  { id: 'kontext-sparsam', icon: '🪶', ascii: '~', title: 'Featherweight', text: 'Context never above 50 % in a session with 10+ turns.', metric: 'contextLowSessions', atLeast: 1 },
  { id: 'pacman', icon: 'ᗧ', ascii: 'C', title: 'Pac-Man never saw the ghost', text: '5-h window never above 90 % in a session with 10+ turns.', metric: 'pacmanSessions', atLeast: 1, requires: 'usage-bars' },
  { id: 'doppelter-boden', icon: '🪂', ascii: 'v', title: 'Safety net', text: "The cleanup brake's first snapshot.", metric: 'snapshots', atLeast: 1 },
  { id: 'dicht', icon: '🔐', ascii: '#', title: 'Kept it shut', text: 'The secrets guard stopped a secret.', metric: 'secretsStopped', atLeast: 1 },
  { id: 'abgewendet', icon: '🛡', ascii: '|', title: 'Averted', text: 'A prod command was cancelled in the dialog.', metric: 'prodCancelled', atLeast: 1 },
  { id: 'testpilot', icon: '🧪', ascii: 't', title: 'Test pilot', text: '100 green test runs.', metric: 'testsGreen', atLeast: 100 },
  { id: 'nachteule', icon: '🦉', ascii: 'n', title: 'Night owl', text: 'A turn between midnight and four am.', metric: 'nightTurns', atLeast: 1 },
  { id: 'ausgemistet', icon: '🧹', ascii: '-', title: 'Spring cleaning', text: '200 lines removed in one session.', metric: 'removedSession', atLeast: 200 },
  { id: 'phoenix', icon: '🔥', ascii: '!', title: 'Phoenix', text: 'CI back from red to green.', metric: 'ciRecovered', atLeast: 1 },
  { id: 'marathon', icon: '🏃', ascii: '>', title: 'Marathon', text: 'Four hours of active time in one day.', metric: 'activeHoursDay', atLeast: 4 },
  { id: 'serie', icon: '📅', ascii: '=', title: 'Five days straight', text: 'Worked on five days in a row.', metric: 'dayStreak', atLeast: 5 },
  { id: 'quak', icon: '🦆', ascii: 'Q', title: 'Quack', text: 'Asked the rubber duck all its questions.', metric: 'duckDone', atLeast: 1 },
]

export interface AchState {
  unlocked: Record<string, number>
  /** Counters across sessions. */
  counters: Record<string, number>
  /** Turns since the last red test (the running streak). */
  streak: number
  /** The journal position already counted (per session). */
  seenSeq: number
  sessionId: string
}

export const freshAch = (sessionId = ''): AchState => ({ unlocked: {}, counters: {}, streak: 0, seenSeq: 0, sessionId })

export function readAch(v: unknown, sessionId: string): AchState {
  if (!v || typeof v !== 'object') return freshAch(sessionId)
  const o = v as Partial<AchState>
  const num = (r: unknown) => Object.fromEntries(Object.entries((r && typeof r === 'object' ? r : {}) as Record<string, unknown>).filter(([, x]) => typeof x === 'number')) as Record<string, number>
  return {
    unlocked: num(o.unlocked),
    counters: num(o.counters),
    streak: typeof o.streak === 'number' ? o.streak : 0,
    // a new session starts counting its journal from the beginning
    seenSeq: o.sessionId === sessionId && typeof o.seenSeq === 'number' ? o.seenSeq : 0,
    sessionId,
  }
}

const inc = (c: Record<string, number>, k: string, by = 1) => (c[k] = (c[k] ?? 0) + by)
const max = (c: Record<string, number>, k: string, v: number) => (c[k] = Math.max(c[k] ?? 0, v))

/** Folds new journal events into the counters. Pure: returns a new state. */
export function count(state: AchState, events: readonly JournalEvent[]): AchState {
  const s: AchState = { ...state, counters: { ...state.counters } }
  const c = s.counters
  const summaries = new Map<string, string>()
  for (const e of events) if (e.type === 'tool.start') summaries.set(e.id, e.summary)
  let redInTurn = false
  let lastCi: string | undefined = c.lastCiRed ? 'red' : undefined
  for (const e of events) {
    if (e.seq <= s.seenSeq) continue
    switch (e.type) {
      case 'turn.complete': {
        inc(c, 'turns')
        const h = new Date(e.at).getHours()
        if (h < 4) inc(c, 'nightTurns')
        s.streak = redInTurn ? 0 : s.streak + 1
        max(c, 'greenStreakMax', s.streak)
        redInTurn = false
        break
      }
      case 'test.run':
        if (e.phase === 'end') {
          if (e.ok) inc(c, 'testsGreen')
          else redInTurn = true
        }
        break
      case 'tool.end':
        if (e.denied === 'secrets') inc(c, 'secretsStopped')
        if (e.denied === 'prodShield') inc(c, 'prodCancelled')
        if (e.ok && /\bgit commit\b/.test(summaries.get(e.id) ?? '') && new Date(e.at).getHours() < 9) inc(c, 'commitsBefore9')
        break
      case 'snapshot':
        inc(c, 'snapshots')
        break
      case 'file.changed':
        inc(c, 'removedSessionNow', e.removed)
        max(c, 'removedSession', c.removedSessionNow!)
        break
      case 'ci.status':
        if (e.state === 'red') lastCi = 'red'
        if (e.state === 'green' && lastCi === 'red') {
          inc(c, 'ciRecovered')
          lastCi = 'green'
        }
        c.lastCiRed = lastCi === 'red' ? 1 : 0
        break
      case 'duck':
        inc(c, 'duckDone')
        break
    }
    s.seenSeq = Math.max(s.seenSeq, e.seq)
  }
  return s
}

/** Metrics from counters plus what comes from elsewhere (hours, session ends). */
export function metrics(s: AchState, extra: Record<string, number> = {}): Record<string, number> {
  return { ...s.counters, ...extra }
}

/** Badges reached and not yet unlocked, in RULES order. */
export function due(s: AchState, m: Record<string, number>, usageBars: boolean): Rule[] {
  return RULES.filter(r => !s.unlocked[r.id] && (!r.requires || usageBars) && (m[r.metric] ?? 0) >= r.atLeast)
}

/** Hours of the day `quiet` covers, e.g. 22–07 across midnight. */
export function inQuiet(hour: number, quiet: { from: number; to: number } | null): boolean {
  if (!quiet || quiet.from === quiet.to) return false
  return quiet.from < quiet.to ? hour >= quiet.from && hour < quiet.to : hour >= quiet.from || hour < quiet.to
}

/** Longest run of consecutive days ending today (or yesterday) with any time. */
export function dayStreak(days: readonly string[], today: string): number {
  const set = new Set(days)
  const d = new Date(`${today}T12:00:00`)
  if (!set.has(today)) d.setDate(d.getDate() - 1)
  let n = 0
  for (;;) {
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (!set.has(k)) return n
    n++
    d.setDate(d.getDate() - 1)
  }
}
