/**
 * #14 CI light: only with `gh` installed and logged in and a GitHub remote.
 * Polls `gh run list` for the current branch every 60 s (backoff on errors,
 * pause after 15 min without activity). The hint line shows the state; a red
 * run raises a toast and a band with "Hand the log to Claude", which puts the
 * failed steps' log into the prompt box (the person sends it).
 */
import type { Host, Timer } from '../../core/adapter/host'
import type { ModuleEnv, Step } from '../../core/dispatcher/dispatcher'
import { onBanner } from '../../core/statusline/banners'

export const POLL_MS = 60_000
export const MAX_BACKOFF_MS = 600_000
export const IDLE_MS = 15 * 60_000
const LOG_MAX = 6_000
const SLOT = 'ci'
const BANNER = 'exo-ci'

export type CiState = 'green' | 'red' | 'running' | 'unknown'

export interface CiRun {
  id: number
  name: string
  state: CiState
  updatedAt: number
  url: string
}

/** `gh run list --json databaseId,status,conclusion,name,updatedAt,url` → the newest run. */
export function parseRuns(json: string): CiRun | null {
  let list: unknown
  try {
    list = JSON.parse(json)
  } catch {
    return null
  }
  if (!Array.isArray(list) || !list.length) return null
  const r = list[0] as { databaseId?: number; status?: string; conclusion?: string; name?: string; updatedAt?: string; url?: string }
  const state: CiState =
    r.status !== 'completed' ? 'running' : r.conclusion === 'success' ? 'green' : ['failure', 'timed_out', 'cancelled', 'startup_failure', 'action_required'].includes(r.conclusion ?? '') ? 'red' : 'unknown'
  return { id: r.databaseId ?? 0, name: r.name ?? 'CI', state, updatedAt: Date.parse(r.updatedAt ?? '') || 0, url: r.url ?? '' }
}

export function ago(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60_000))
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} d ago`
}

export function slot(run: CiRun, now: number): { text: string; color?: string; dim?: boolean } {
  const when = run.updatedAt ? ` · ${ago(now - run.updatedAt)}` : ''
  if (run.state === 'green') return { text: `● CI green${when}`, color: '#3fb950' }
  if (run.state === 'red') return { text: `● CI red${when}`, color: '#f85149' }
  if (run.state === 'running') return { text: '● CI running', dim: true }
  return { text: '● CI ?', dim: true }
}

/** The next wait: the normal interval after success, doubling after errors. */
export const nextDelay = (failures: number) => (failures === 0 ? POLL_MS : Math.min(MAX_BACKOFF_MS, POLL_MS * 2 ** failures))

/** The failed step of a run, from `gh run view --json jobs`. */
export function failedStep(json: string): string | null {
  try {
    const jobs = (JSON.parse(json) as { jobs?: { name?: string; conclusion?: string; steps?: { name?: string; conclusion?: string }[] }[] }).jobs ?? []
    for (const j of jobs) {
      const s = j.steps?.find(x => x.conclusion === 'failure')
      if (s) return `${j.name ?? 'Job'} › ${s.name ?? 'step'}`
      if (j.conclusion === 'failure') return j.name ?? 'Job'
    }
  } catch {
    // no detail, the run name stays
  }
  return null
}

export const tail = (text: string, max = LOG_MAX) => (text.length <= max ? text : '…\n' + text.slice(-max))

interface State {
  timer: Timer | undefined
  failures: number
  lastRun: CiRun | null
  notified: number | null
  active: boolean
}
const st: State = { timer: undefined, failures: 0, lastRun: null, notified: null, active: false }

async function available(host: Host, project: string): Promise<boolean> {
  try {
    const auth = await host.run(['gh', 'auth', 'status'], { timeoutMs: 10_000 })
    if (auth.exitCode !== 0) return false
    const remote = await host.run(['git', '-C', project, 'remote', 'get-url', 'origin'], { timeoutMs: 5_000 })
    return remote.exitCode === 0 && /github\.com[:/]/.test(remote.stdout)
  } catch {
    return false
  }
}

/** One poll. Exported for tests. */
export async function poll(env: ModuleEnv): Promise<void> {
  const host = env.host
  const now = await host.now()
  const lastActivity = [...env.journal.all()].reverse().find(e => e.type === 'prompt.submit' || e.type === 'tool.end')?.at ?? now
  if (now - lastActivity > IDLE_MS) return
  try {
    const branch = (await host.run(['git', '-C', env.project, 'rev-parse', '--abbrev-ref', 'HEAD'], { timeoutMs: 5_000 })).stdout.trim()
    const r = await host.run(['gh', 'run', 'list', '--branch', branch, '--limit', '1', '--json', 'databaseId,status,conclusion,name,updatedAt,url'], { cwd: env.project, timeoutMs: 20_000 })
    if (r.exitCode !== 0) throw new Error(r.stderr.trim().slice(0, 100))
    st.failures = 0
    const run = parseRuns(r.stdout)
    st.lastRun = run
    if (!run) {
      await host.setSlot(SLOT, null)
      return
    }
    const s = slot(run, now)
    await host.setSlot(SLOT, { id: SLOT, order: 20, priority: 40, ...s })
    env.journal.push({ type: 'ci.status', state: run.state, runId: run.id }, now)
    if (run.state === 'red' && st.notified !== run.id) {
      st.notified = run.id
      const jobs = await host.run(['gh', 'run', 'view', String(run.id), '--json', 'jobs'], { cwd: env.project, timeoutMs: 20_000 }).catch(() => null)
      const step = jobs?.exitCode === 0 ? failedStep(jobs.stdout) : null
      const what = `${run.name}${step ? ` – ${step}` : ''}`
      host.toast(`CI red: ${what}`, 8000)
      await host.setBanner(BANNER, { id: BANNER, text: `CI red: ${what}`, tone: 'warn', buttons: [{ key: 'log', label: 'Hand the log to Claude' }] })
      onBanner(BANNER, 'log', async h => {
        const log = await h.run(['gh', 'run', 'view', String(run.id), '--log-failed'], { cwd: env.project, timeoutMs: 60_000 }).catch(() => null)
        const text = log && log.exitCode === 0 ? tail(log.stdout) : '(log not available)'
        await h.fillPrompt(`CI is red (${what}${run.url ? `, ${run.url}` : ''}). Log of the failed steps:\n\`\`\`\n${text}\n\`\`\`\nPlease find the cause and fix it.`)
        await h.setBanner(BANNER, null)
      })
    }
    if (run.state === 'green') await host.setBanner(BANNER, null)
  } catch {
    st.failures++
  }
}

export function ciStep(): Step {
  return {
    id: 'ci',
    start(env) {
      st.timer?.cancel()
      // in the background: gh takes a moment, the session start must not wait for it
      void (async () => {
        st.active = await available(env.host, env.project)
        if (!st.active) return
        const loop = () => {
          st.timer = env.host.after(nextDelay(st.failures), () => void poll(env).finally(loop))
        }
        await poll(env)
        loop()
      })()
    },
  }
}

/** For tests. */
export function ciState(): State {
  return st
}
export function resetCi(): void {
  st.timer?.cancel()
  Object.assign(st, { timer: undefined, failures: 0, lastRun: null, notified: null, active: false })
}
