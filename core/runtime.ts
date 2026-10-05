/**
 * exo's state for one loaded module: configuration, rules, journal, health,
 * store and kill switch. Built once per load (a hot reload builds it anew and
 * restores the journal from the store).
 */
import type { Host } from './adapter/host'
import { emptyPrefs, readPrefs, resolveConfig } from './config/config'
import type { Config, Prefs } from './config/config'
import { DEFAULT_RULES_JSON, loadRules } from './config/rules'
import type { RulesLoad } from './config/rules'
import { catchDecision, dispatch } from './dispatcher/dispatcher'
import type { Step, ToolCall, ToolResult } from './dispatcher/dispatcher'
import { Health, errorText } from './health/health'
import { L } from './i18n'
import { Journal } from './journal/journal'
import type { JournalSnapshot, NewEvent } from './journal/journal'
import { KillSwitch, exoDir } from './killswitch'
import { RESERVED } from './statusline/statusline'
import { StoreBox } from './store/store'

export interface Runtime {
  home: string | undefined
  options: Readonly<Record<string, unknown>>
  prefs: Prefs
  config: Config
  rules: RulesLoad
  journal: Journal
  health: Health
  store: StoreBox
  kill: KillSwitch
  interactive: boolean
  steps: Step[]
  /** Last liveness text drawn, to skip redundant state writes. */
  shownLiveness?: string
  rulesWarned: boolean
}

export const rulesPath = (home: string) => `${exoDir(home)}/rules.json`

/** The modules' dispatcher steps; empty in stage 1, filled from stage 2 on. */
export const STEPS: Step[] = []

export async function createRuntime(host: Host, options: Readonly<Record<string, unknown>>, interactive = true): Promise<Runtime> {
  const home = await host.env('HOME').catch(() => undefined)
  const store = new StoreBox(host)
  await store.init().catch(err => store.warnings.push(`Store: ${errorText(err)}`))
  const prefs = readPrefs(await store.get('prefs').catch(() => undefined))
  const config = resolveConfig(options, prefs)

  let rules: RulesLoad = loadRules(null)
  if (home) {
    const path = rulesPath(home)
    try {
      if (await host.exists(path)) rules = loadRules(await host.readFile(path))
      else await host.writeFile(path, JSON.stringify(DEFAULT_RULES_JSON, null, 2) + '\n')
    } catch (err) {
      rules = { ...loadRules(null), errors: [`rules.json nicht lesbar: ${errorText(err)}`, 'Es gelten die eingebauten Regeln.'], source: 'default-after-error' }
    }
  }

  const health = new Health()
  health.restoreErrors(await store.get('health').catch(() => undefined))

  const journal = new Journal()
  const sessionId = await host.sessionId().catch(() => '')
  journal.sessionId = sessionId
  journal.restore(await store.get('journal:current').catch(() => undefined), sessionId)

  return { home, options, prefs, config, rules, journal, health, store, kill: new KillSwitch(), interactive, steps: STEPS, rulesWarned: false }
}

/** Applies new prefs: recomputes the config and stores them. */
export async function setPrefs(rt: Runtime, prefs: Prefs): Promise<void> {
  rt.prefs = prefs
  rt.config = resolveConfig(rt.options, prefs)
  rt.kill.invalidate()
  await rt.store.set('prefs', prefs)
}

export function killReason(rt: Runtime, host: Host): Promise<string | null> {
  return rt.kill.reason(host, rt.home, rt.prefs.allOff)
}

/** Logs an event and schedules the throttled store write. */
export async function log(rt: Runtime, host: Host, e: NewEvent): Promise<void> {
  rt.journal.push(e, await host.now())
  saveJournalLater(rt)
}

export function saveJournalLater(rt: Runtime): void {
  rt.store.later('journal:current', () => rt.journal.snapshot(), v => Journal.shrink(v as JournalSnapshot))
  rt.store.later('health', () => rt.health.errorsForStore())
}

export async function toolCall(rt: Runtime, host: Host, call: ToolCall, next: (input: Record<string, unknown>) => Promise<ToolResult>): Promise<ToolResult> {
  const result = await dispatch(
    {
      host,
      config: rt.config,
      rules: rt.rules.rules,
      journal: rt.journal,
      health: rt.health,
      steps: rt.steps,
      interactive: rt.interactive,
      killed: () => killReason(rt, host),
    },
    call,
    next,
  )
  saveJournalLater(rt)
  return result
}

export { catchDecision }

/** The liveness slot: `⛨ exo`, with broken modules counted, or off. */
export function livenessText(rt: Runtime, killed: string | null): string {
  if (killed) return L.killed(killed)
  const broken = rt.health.broken().length
  return broken ? `${L.liveness} ${L.broken(broken)}` : L.liveness
}

export async function refreshLiveness(rt: Runtime, host: Host): Promise<void> {
  const killed = await killReason(rt, host)
  const text = livenessText(rt, killed)
  if (text === rt.shownLiveness) return
  rt.shownLiveness = text
  await host.setKilled(killed)
  await host.setSlot(RESERVED.liveness, {
    id: RESERVED.liveness,
    order: 0,
    priority: 100,
    text,
    dim: !killed && !rt.health.broken().length,
    color: killed || rt.health.broken().length ? '#d29922' : undefined,
  })
}

export function freshPrefs(): Prefs {
  return emptyPrefs()
}
