/**
 * The one `tool.call` handler. Calls the modules in a fixed order:
 *
 *   0  kill switch           → everything passes
 *   0b parse Bash once, for all steps
 *   1  secrets      (closed) may deny
 *   2  prod shield  (closed) may deny, ask, rewrite (dry run)
 *   3  context diet (open)   may rewrite Read's input
 *   4  cleanup brake(open)   snapshots, only once 1–3 let the call through
 *   5  next(e)               the tool runs
 *   6  after steps   (open)  journal, test light, sidebar; may add context
 *
 * Each step runs in its own try/catch. A guard that fails (policy `closed`)
 * denies this one call and says how to switch it off; a comfort step that
 * fails is skipped. Neither ever blocks the session as a whole.
 */
import type { Host } from '../adapter/host'
import type { Config, FailPolicy, ModuleId } from '../config/config'
import { moduleInfo } from '../config/config'
import type { HouseRule } from '../config/rules'
import type { Health } from '../health/health'
import { errorText } from '../health/health'
import type { Journal } from '../journal/journal'
import { parse } from '../shell/parse'
import type { ParseResult } from '../shell/parse'
import { commands, summarize } from '../shell/words'
import type { Cmd } from '../shell/words'
import { KILL_HINT } from '../killswitch'

export interface ToolCall {
  tool: string
  input: Readonly<Record<string, unknown>>
  id?: string
}

/** The parts of the engine's ToolCallResult exo reads or adds. */
export interface ToolResult {
  deny?: string
  isError?: boolean
  context?: readonly string[]
  [key: string]: unknown
}

export interface CallCtx {
  host: Host
  call: ToolCall
  /** Bash only: the parsed command, null for other tools. */
  parsed: ParseResult | null
  /** Bash only: the flattened commands; empty when it did not parse. */
  cmds: Cmd[]
  config: Config
  rules: readonly HouseRule[]
  journal: Journal
  /** Interactive UI present (dialogs possible). */
  interactive: boolean
  /** Awaits work that does not count against the step budget (dialogs, checks). */
  untimed<T>(work: Promise<T>): Promise<T>
  /** Lines added to the model's context after the result. */
  notes: string[]
}

export type BeforeResult = { deny: string } | { input: Record<string, unknown> } | undefined | void

export interface Step {
  id: ModuleId
  before?(ctx: CallCtx): BeforeResult | Promise<BeforeResult>
  after?(ctx: CallCtx, result: ToolResult): ToolResult | void | Promise<ToolResult | void>
}

export interface DispatchDeps {
  host: Host
  config: Config
  rules: readonly HouseRule[]
  journal: Journal
  health: Health
  steps: readonly Step[]
  interactive: boolean
  /** Returns the kill reason, or null when exo is on. */
  killed(): Promise<string | null>
  /** Sum of the before steps' own time allowed per call, in ms. */
  budgetMs?: number
  clock?: () => number
}

export const BUDGET_MS = 50

/** The fixed order of the before steps; after steps run in the same order. */
export const STEP_ORDER: readonly ModuleId[] = ['secrets', 'prodShield', 'diet', 'brake', 'testLight', 'sidebar', 'doneCheck', 'ci', 'recap', 'lessons', 'hours', 'achievements', 'cinema', 'duck']

export function ordered(steps: readonly Step[]): Step[] {
  const rank = (s: Step) => STEP_ORDER.indexOf(s.id)
  return [...steps].sort((a, b) => rank(a) - rank(b))
}

/** Tools whose calls exo denies when its own dispatcher fails. */
export const GUARDED_TOOLS = new Set(['Bash', 'Write', 'Edit', 'NotebookEdit'])

export function failClosedMessage(id: ModuleId | 'core', err: string): string {
  const label = id === 'core' ? 'Kern' : moduleInfo(id).label
  const off = id === 'core' ? '/exo off' : `/exo off ${id}`
  return `exo/${label} ist gestört (${err}). Dieser Aufruf wurde zur Sicherheit abgelehnt. Abschalten: ${off} · ${KILL_HINT}`
}

function policyOf(id: ModuleId): FailPolicy {
  return moduleInfo(id).policy
}

function parseBash(input: Readonly<Record<string, unknown>>): { parsed: ParseResult; cmds: Cmd[] } {
  const parsed = parse(typeof input.command === 'string' ? input.command : '')
  return { parsed, cmds: parsed.ok ? commands(parsed.script) : [] }
}

export async function dispatch(deps: DispatchDeps, call: ToolCall, next: (input: Record<string, unknown>) => Promise<ToolResult>): Promise<ToolResult> {
  const clock = deps.clock ?? Date.now
  if (await deps.killed()) return next({ ...call.input })

  const isBash = call.tool === 'Bash'
  let input: Record<string, unknown> = { ...call.input }
  let bash = isBash ? parseBash(input) : null

  let untimedMs = 0
  const ctx: CallCtx = {
    host: deps.host,
    call: { ...call, input },
    parsed: bash?.parsed ?? null,
    cmds: bash?.cmds ?? [],
    config: deps.config,
    rules: deps.rules,
    journal: deps.journal,
    interactive: deps.interactive,
    notes: [],
    async untimed<T>(work: Promise<T>): Promise<T> {
      const t0 = clock()
      try {
        return await work
      } finally {
        untimedMs += clock() - t0
      }
    },
  }

  const steps = ordered(deps.steps)
  const t0 = clock()
  for (const step of steps) {
    if (!step.before || !deps.config.enabled[step.id]) continue
    const s0 = clock()
    const u0 = untimedMs
    let out: BeforeResult
    try {
      out = await step.before(ctx)
    } catch (err) {
      const msg = errorText(err)
      deps.health.fail(step.id, msg, clock())
      deps.journal.push({ type: 'module.error', module: step.id, message: msg }, clock())
      if (policyOf(step.id) === 'closed') {
        const deny = failClosedMessage(step.id, msg)
        deps.journal.push({ type: 'tool.end', id: call.id ?? '', tool: call.tool, ms: 0, ok: false, denied: step.id }, clock())
        return { deny }
      }
      continue
    } finally {
      deps.health.record(step.id, clock() - s0 - (untimedMs - u0))
    }
    if (out && 'deny' in out) {
      deps.journal.push({ type: 'tool.end', id: call.id ?? '', tool: call.tool, ms: 0, ok: false, denied: step.id }, clock())
      return { deny: out.deny }
    }
    if (out && 'input' in out) {
      input = { ...out.input }
      ctx.call = { ...call, input }
      if (isBash) {
        bash = parseBash(input)
        ctx.parsed = bash.parsed
        ctx.cmds = bash.cmds
      }
    }
  }
  const ownMs = clock() - t0 - untimedMs
  const budget = deps.budgetMs ?? BUDGET_MS
  if (ownMs > budget) {
    deps.health.budgetHit('core')
    deps.journal.push({ type: 'budget.exceeded', module: 'dispatcher', ms: ownMs }, clock())
  }

  const summary = isBash ? summarize(String(input.command ?? '')) : typeof input.file_path === 'string' ? input.file_path : ''
  deps.journal.push({ type: 'tool.start', id: call.id ?? '', tool: call.tool, summary }, clock())
  const started = clock()
  let result = await next(input)
  deps.journal.push(
    {
      type: 'tool.end',
      id: call.id ?? '',
      tool: call.tool,
      ms: clock() - started,
      ok: result.deny === undefined && result.isError !== true,
      ...(result.deny !== undefined ? { denied: 'engine' } : {}),
    },
    clock(),
  )

  for (const step of steps) {
    if (!step.after || !deps.config.enabled[step.id]) continue
    const s0 = clock()
    try {
      const r = await step.after(ctx, result)
      if (r) result = r
    } catch (err) {
      const msg = errorText(err)
      deps.health.fail(step.id, msg, clock())
      deps.journal.push({ type: 'module.error', module: step.id, message: msg }, clock())
    } finally {
      deps.health.record(step.id, clock() - s0)
    }
  }

  if (ctx.notes.length && result.deny === undefined) result = { ...result, context: [...(result.context ?? []), ...ctx.notes] }
  return result
}

/**
 * What the `.catch` handler answers when the dispatcher itself failed:
 * guarded tools are denied (unless the kill switch is on), others pass.
 */
export function catchDecision(tool: string, killed: boolean, alreadyRan: boolean, err: string): 'pass' | 'leave' | { deny: string } {
  if (alreadyRan) return 'leave'
  if (killed || !GUARDED_TOOLS.has(tool)) return 'pass'
  return { deny: failClosedMessage('core', err) }
}
