/**
 * #19 Spinner cinema: while a tool runs (or a turn takes long) the spinner's
 * message becomes a little film of the activity, with real facts (tool,
 * running time). A fast redraw timer runs only while there is a film; any
 * failure falls back to the engine's own spinner.
 */
import type { ModuleEnv, Step } from '../../core/dispatcher/dispatcher'
import type { JournalEvent } from '../../core/journal/journal'
import { classify, message } from './cinema-logic'
import type { Running } from './cinema-logic'

const FAST_MS = 33
const WATCH_MS = 1_000

const st: {
  env: ModuleEnv | null
  running: Map<string, Running>
  turnStart: number | null
  fast: { cancel(): void } | undefined
  watch: { cancel(): void } | undefined
  unsubscribe: (() => void) | null
  noColor: boolean
} = { env: null, running: new Map(), turnStart: null, fast: undefined, watch: undefined, unsubscribe: null, noColor: false }

function current(): Running | null {
  let last: Running | null = null
  for (const r of st.running.values()) if (!last || r.since > last.since) last = r
  return last
}

/** Starts or stops the fast redraw depending on whether a film runs. */
function retime(now: number): void {
  const env = st.env
  if (!env) return
  const film = classify(current(), st.turnStart === null ? null : now - st.turnStart)
  const animate = film !== null && !env.config.reducedMotion
  if (animate && !st.fast) st.fast = env.host.every(FAST_MS, () => env.host.redraw())
  if (!animate && st.fast) {
    st.fast.cancel()
    st.fast = undefined
    env.host.redraw()
  }
}

function onEvent(e: JournalEvent): void {
  if (e.type === 'turn.start') {
    st.turnStart = e.at
    st.watch?.cancel()
    // once a second: the coffee after a minute, the seconds of a still film
    st.watch = st.env?.host.every(WATCH_MS, () => {
      retime(Date.now())
      if (st.env?.config.reducedMotion) st.env.host.redraw()
    })
  } else if (e.type === 'tool.start') st.running.set(e.id, { tool: e.tool, summary: e.summary, since: e.at })
  else if (e.type === 'tool.end') st.running.delete(e.id)
  else if (e.type === 'turn.complete' || e.type === 'session.end') {
    st.turnStart = null
    st.running.clear()
    st.watch?.cancel()
    st.watch = undefined
  } else return
  retime(e.at)
}

/** The spinner message for now, or null for the engine's own. */
export function spinnerMessage(now: number, columns: number): string | null {
  const env = st.env
  if (!env) return null
  const run = current()
  const film = classify(run, st.turnStart === null ? null : now - st.turnStart)
  if (!film) return null
  return message(film, run, now, st.turnStart, { ascii: st.noColor, still: env.config.reducedMotion, columns })
}

export function cinemaStep(): Step {
  return {
    id: 'cinema',
    async start(env) {
      st.env = env
      st.noColor = !!(await env.host.env('NO_COLOR').catch(() => undefined))
      st.unsubscribe?.()
      st.unsubscribe = env.journal.subscribe(onEvent)
    },
  }
}

/** For tests. */
export function cinemaState() {
  return st
}
export function resetCinema(): void {
  st.fast?.cancel()
  st.watch?.cancel()
  st.unsubscribe?.()
  Object.assign(st, { env: null, running: new Map(), turnStart: null, fast: undefined, watch: undefined, unsubscribe: null, noColor: false })
}
