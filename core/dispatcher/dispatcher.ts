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
import { counts } from '../diff'
import { cwdAfter } from '../cwd'
import type { CwdGuess } from '../cwd'
import { READ_TOOLS } from '../tools'
import { changeIs, readControl, settleEffects, undoneText } from '../integrity'
import type { ControlState } from '../integrity'
import type { StoreBox } from '../store/store'
import { ALLOW, CONTROL_DENIED, CONTROL_QUESTION, REFUSE, touchesControlResolved } from '../selfprotect'

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
  /** The user's home directory, when known. */
  home: string | undefined
  /** Where the Bash tool stands before this call (exo's guess, see core/cwd). */
  cwd: CwdGuess
  /** Where the command itself ends up after its own top-level `cd`s. */
  cmdCwd: CwdGuess
  /** Scratch space shared by a step's before and after. */
  memo: Record<string, unknown>
  /** exo's store, for modules that keep state across sessions. */
  store: StoreBox | undefined
  /** File tools: the file's text before the call; null when it did not exist. */
  fileBefore: string | null | undefined
}

export type BeforeResult = { deny: string } | { input: Record<string, unknown> } | undefined | void

/** What a module sees outside a tool call (start, prompt, end of turn). */
export interface ModuleEnv {
  host: Host
  journal: Journal
  config: Config
  store: StoreBox | undefined
  home: string | undefined
  /** Git root of the session, else its working directory. */
  project: string
  cwd: CwdGuess
  interactive: boolean
  sessionId: string
}

export interface TurnEnd {
  turnId: string
  answer: string
  reason: string
}

export interface Step {
  id: ModuleId
  /** At session start (and after a reload). Long-lived work starts here. */
  start?(env: ModuleEnv): void | Promise<void>
  /** Lines the model reads beside the next prompt. */
  promptContext?(env: ModuleEnv): string[] | Promise<string[]>
  /** At session end: fast, no model, no process (the engine gives one short bound). */
  end?(env: ModuleEnv, reason: string): void | Promise<void>
  /** A line shown beneath the answer, or nothing. */
  turnComplete?(env: ModuleEnv, t: TurnEnd): string | undefined | Promise<string | undefined>
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
  home?: string
  /** The Bash tool's working directory as exo follows it. */
  cwd?: CwdGuess
  store?: StoreBox
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

/** When exo's own dispatcher fails, only tools that cannot change anything pass. */
export const isGuardedTool = (tool: string) => !READ_TOOLS.has(tool)

export function failClosedMessage(id: ModuleId | 'core', err: string): string {
  const label = id === 'core' ? 'core' : moduleInfo(id).label.toLowerCase()
  const off = id === 'core' ? '/exo off' : `/exo off ${id}`
  return `exo/${label} is broken (${err}). This call was denied to be safe. Switch off: ${off} · ${KILL_HINT}`
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
    home: deps.home,
    cwd: deps.cwd ?? { cwd: '/', known: false },
    cmdCwd: deps.cwd ?? { cwd: '/', known: false },
    memo: {},
    store: deps.store,
    fileBefore: undefined,
    async untimed<T>(work: Promise<T>): Promise<T> {
      const t0 = clock()
      try {
        return await work
      } finally {
        untimedMs += clock() - t0
      }
    },
  }

  const setCmdCwd = () => {
    ctx.cmdCwd = ctx.parsed?.ok ? cwdAfter(ctx.parsed.script, ctx.cwd, ctx.home) : ctx.cwd
  }
  setCmdCwd()

  /**
   * The file a Write/Edit the person allowed was shown to change: that one
   * change is not asked about again. A Bash approval covers nothing, since a
   * command's text does not show everything it does.
   */
  let approvedPath: string | null = null

  // Self protection: always on, whatever the module switches say.
  try {
    if (await touchesControlResolved(ctx.call, p => deps.host.realPath(p), { before: ctx.cwd, after: ctx.cmdCwd }, ctx.home)) {
      const what = isBash ? summarize(String(input.command ?? '')) : String(input.file_path ?? input.notebook_path ?? '')
      let allowed = false
      if (deps.interactive) {
        try {
          allowed = (await ctx.untimed(deps.host.ask(CONTROL_QUESTION(what), [ALLOW, REFUSE]))) === ALLOW
        } catch {
          allowed = false // Esc, or nobody to ask
        }
      }
      if (!allowed) {
        deps.journal.push({ type: 'tool.end', id: call.id ?? '', tool: call.tool, ms: 0, ok: false, denied: 'self' }, clock())
        return { deny: CONTROL_DENIED }
      }
      if (!isBash) approvedPath = String(input.file_path ?? input.notebook_path ?? '') || null
    }
  } catch (err) {
    const msg = errorText(err)
    deps.health.fail('core', msg, clock())
    return { deny: failClosedMessage('core', msg) }
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
        setCmdCwd()
      }
    }
  }
  const ownMs = clock() - t0 - untimedMs
  const budget = deps.budgetMs ?? BUDGET_MS
  if (ownMs > budget) {
    deps.health.budgetHit('core')
    deps.journal.push({ type: 'budget.exceeded', module: 'dispatcher', ms: ownMs }, clock())
  }

  // Effect check: the switches before a call that can change things …
  const guardEffects = deps.home !== undefined && !READ_TOOLS.has(call.tool)
  let before: ControlState | null = null
  if (guardEffects) before = await readControl(deps.host, deps.home!).catch(() => null)

  const fileTool = call.tool === 'Write' || call.tool === 'Edit' || call.tool === 'NotebookEdit'
  const filePath = fileTool ? String(input.file_path ?? input.notebook_path ?? '') : ''
  if (fileTool && filePath) {
    ctx.fileBefore = (await deps.host.exists(filePath).catch(() => false)) ? await deps.host.readFile(filePath).catch(() => undefined) : null
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

  if (fileTool && filePath && ctx.fileBefore !== undefined && result.deny === undefined && result.isError !== true) {
    try {
      const after = await deps.host.readFile(filePath)
      const c = counts(ctx.fileBefore ?? '', after)
      deps.journal.push({ type: 'file.changed', path: filePath, added: c.added, removed: c.removed, via: call.tool as 'Edit' | 'Write' | 'NotebookEdit' }, clock())
    } catch {
      // unreadable after the call (deleted, too big): no count
    }
  }

  // … and after it: a change is put to the person, undone without a yes.
  if (before) {
    try {
      const undone = await settleEffects(deps.host, deps.home!, before, deps.interactive, ctx.untimed, c => approvedPath !== null && changeIs(c, approvedPath))
      if (undone.length) {
        const text = undoneText(undone)
        ctx.notes.push(text)
        deps.host.toast(text, 8000)
        deps.journal.push({ type: 'module.error', module: 'self', message: `control change undone: ${undone.length}` }, clock())
      }
    } catch (err) {
      deps.health.fail('core', errorText(err), clock())
    }
  }

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
  if (killed || !isGuardedTool(tool)) return 'pass'
  return { deny: failClosedMessage('core', err) }
}
