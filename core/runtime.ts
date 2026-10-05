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
import type { ModuleEnv, Step, ToolCall, ToolResult, TurnEnd } from './dispatcher/dispatcher'
import { Health, errorText } from './health/health'
import { L } from './i18n'
import { Journal } from './journal/journal'
import type { JournalSnapshot, NewEvent } from './journal/journal'
import { KillSwitch, exoDir } from './killswitch'
import { cwdAfter } from './cwd'
import type { CwdGuess } from './cwd'
import { parse } from './shell/parse'
import { RESERVED } from './statusline/statusline'
import { StoreBox } from './store/store'
import { createSteps } from '../modules'

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
  /** The Bash tool's working directory as exo follows it. */
  bashCwd: CwdGuess
  /** Git root of the session, else its working directory. */
  project: string
  /** Last liveness text drawn, to skip redundant state writes. */
  shownLiveness?: string
  rulesWarned: boolean
}

export const rulesPath = (home: string) => `${exoDir(home)}/rules.json`


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

  const cwd = await host.cwd().catch(() => '/')
  const project = (await host.repoRoot().catch(() => null)) ?? cwd
  return {
    project, home, options, prefs, config, rules, journal, health, store, kill: new KillSwitch(), interactive, steps: createSteps(), rulesWarned: false, bashCwd: { cwd, known: true } }
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
      home: rt.home,
      cwd: rt.bashCwd,
      store: rt.store,
    },
    call,
    next,
  )
  if (call.tool === 'Bash' && result.deny === undefined) {
    const r = parse(String(call.input.command ?? ''))
    rt.bashCwd = r.ok ? cwdAfter(r.script, rt.bashCwd, rt.home) : { ...rt.bashCwd, known: false }
  }
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

export function moduleEnv(rt: Runtime, host: Host): ModuleEnv {
  return { host, journal: rt.journal, config: rt.config, store: rt.store, home: rt.home, project: rt.project, cwd: rt.bashCwd, interactive: rt.interactive, sessionId: rt.journal.sessionId }
}

/** Runs a lifecycle hook of every enabled module, each guarded on its own. */
async function each<T>(rt: Runtime, host: Host, call: (step: Step, env: ModuleEnv) => T | Promise<T> | undefined): Promise<T[]> {
  if (await killReason(rt, host)) return []
  const env = moduleEnv(rt, host)
  const out: T[] = []
  for (const step of rt.steps) {
    if (!rt.config.enabled[step.id]) continue
    try {
      const v = await call(step, env)
      if (v !== undefined) out.push(v)
    } catch (err) {
      rt.health.fail(step.id, errorText(err), await host.now())
    }
  }
  return out
}

export async function startModules(rt: Runtime, host: Host): Promise<void> {
  await each(rt, host, (s, env) => s.start?.(env))
}

export async function promptContexts(rt: Runtime, host: Host): Promise<string[]> {
  return (await each(rt, host, (s, env) => s.promptContext?.(env))).flat().filter(Boolean)
}

export async function turnTexts(rt: Runtime, host: Host, t: TurnEnd): Promise<string[]> {
  return (await each(rt, host, (s, env) => s.turnComplete?.(env, t))).filter((x): x is string => typeof x === 'string' && x.length > 0)
}
