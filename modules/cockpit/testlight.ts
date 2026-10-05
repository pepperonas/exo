/**
 * #4 Live test light: after Edit/Write of source code the affected tests run
 * in the background (debounced 1.5 s, at low priority, a running one is cut
 * off by newer changes, never alongside a test run Claude started itself).
 * The line under the prompt shows `● 48/48` or `● 2 red`; red tests go into
 * the next prompt once.
 */
import type { Spawned } from '../../core/adapter/host'
import type { CallCtx, ModuleEnv, Step } from '../../core/dispatcher/dispatcher'
import type { JournalEvent } from '../../core/journal/journal'
import { readControl, settleEffects, undoneText } from '../../core/integrity'
import { RUNNER_CONFIG, detectRunner, fingerprint, isSourceFile, parseRun, runKind } from './testlight-logic'
import type { ProjectFacts, RunOutcome, Runner } from './testlight-logic'

export const DEBOUNCE_MS = 1_500
const OUTPUT_MAX = 200_000
const SLOT = 'tests'
const GREEN = '#3fb950'
const RED = '#f85149'

interface State {
  env: ModuleEnv | null
  pending: Set<string>
  timer: { cancel(): void } | undefined
  running: Spawned | null
  claudeRuns: number
  last: RunOutcome | null
  /** Red result not yet handed to the model. */
  undelivered: string | null
  unsubscribe: (() => void) | null
  runner: Runner | null | undefined
}

const st: State = { env: null, pending: new Set(), timer: undefined, running: null, claudeRuns: 0, last: null, undelivered: null, unsubscribe: null, runner: undefined }

async function facts(env: ModuleEnv): Promise<ProjectFacts> {
  const root = env.project
  const ex = (f: string) => env.host.exists(`${root}/${f}`).catch(() => false)
  let pkg: ProjectFacts['pkg']
  if (await ex('package.json')) {
    try {
      pkg = JSON.parse(await env.host.readFile(`${root}/package.json`))
    } catch {
      pkg = undefined
    }
  }
  const pyproject = (await ex('pyproject.toml')) ? await env.host.readFile(`${root}/pyproject.toml`).catch(() => '') : ''
  return {
    root,
    pkg,
    hasPytest: (await ex('pytest.ini')) || (await ex('conftest.py')) || (await ex('tox.ini')) || /pytest/.test(pyproject),
    hasCargo: await ex('Cargo.toml'),
    hasGradlew: await ex('gradlew'),
    hasGradle: (await ex('build.gradle')) || (await ex('build.gradle.kts')),
    hasGoMod: await ex('go.mod'),
  }
}

async function showSlot(env: ModuleEnv, text: string, color?: string, dim?: boolean): Promise<void> {
  await env.host.setSlot(SLOT, { id: SLOT, order: 10, priority: 60, text, color, dim })
}

export function slotText(o: RunOutcome): { text: string; color: string } {
  if (o.ok) return { text: o.green !== undefined ? `● ${o.green}/${o.green}` : '● green', color: GREEN }
  if (o.red) return { text: `● ${o.red} red`, color: RED }
  return { text: '● red', color: RED }
}

export const ALLOW = 'Allow'
export const DENY = "Don't allow"
type Trust = Record<string, { fp: string; allowed: boolean }>

/** The runner config's fingerprint: what the test light would run, and what decides it. */
async function configFingerprint(env: ModuleEnv): Promise<string> {
  let text = `testCommand=${env.config.testCommand}\n`
  for (const f of RUNNER_CONFIG) {
    const p = `${env.project}/${f}`
    if (await env.host.exists(p).catch(() => false)) text += `--- ${f}\n${await env.host.readFile(p).catch(() => '?')}\n`
  }
  return fingerprint(text)
}

/**
 * Commands from the project run only with consent, asked once per project and
 * again whenever the runner config changes (a cloned repo's test script, or
 * one Claude edited, would otherwise run unasked, past every guard).
 */
async function consented(env: ModuleEnv, runner: Runner, files: string[]): Promise<boolean> {
  if (!env.interactive) return false
  const fp = await configFingerprint(env)
  const all = ((await env.store?.get('trust').catch(() => null)) ?? {}) as Trust
  const known = all[env.project]
  if (known && known.fp === fp) return known.allowed
  const cmd = runner.argv(files).join(' ')
  const name = env.project.split('/').pop()
  const question = known
    ? `Test light: the test configuration in ${name} has changed. May exo keep running “${cmd}” automatically after changes?`
    : `Test light: may exo run “${cmd}” in ${name} automatically after every change? (The command comes from the project; exo asks again when the test configuration changes.)`
  let allowed = false
  try {
    allowed = (await env.host.ask(question, [ALLOW, DENY])) === ALLOW
  } catch {
    allowed = false // Esc counts as no, until the config changes
  }
  await env.store?.set('trust', { ...all, [env.project]: { fp, allowed } })
  return allowed
}

function schedule(): void {
  const env = st.env
  if (!env) return
  st.timer?.cancel()
  st.timer = env.host.after(DEBOUNCE_MS, () => void run())
}

/** One background run over the pending files. Exported for tests. */
export async function run(): Promise<void> {
  const env = st.env
  if (!env || !st.pending.size) return
  if (st.claudeRuns > 0) return schedule() // Claude is testing itself: later
  // fresh each run: the runner follows the config (package.json may have changed)
  st.runner = detectRunner(await facts(env), env.config.testCommand)
  const files = [...st.pending]
  st.pending.clear()
  if (!st.runner || !(await consented(env, st.runner, files))) return
  st.running?.stop()
  const before = env.home ? await readControl(env.host, env.home).catch(() => null) : null
  const argv = ['nice', '-n', '10', ...st.runner.argv(files)]
  await showSlot(env, '● …', undefined, true)
  env.journal.push({ type: 'test.run', source: 'testlight', phase: 'start', runner: st.runner.name }, await env.host.now())
  const child = env.host.spawn(argv, { cwd: env.project })
  st.running = child
  let out = ''
  try {
    for await (const c of child.chunks) {
      if (out.length < OUTPUT_MAX) out += c.text
    }
  } catch {
    // a child that could not start: reported as not ok below
  }
  const { code } = await child.done.catch(() => ({ code: null }))
  // what the project's test command did to exo's switches is put to the person
  if (before && env.home) {
    const undone = await settleEffects(env.host, env.home, before, env.interactive).catch(() => [])
    if (undone.length) env.host.toast(undoneText(undone), 8000)
  }
  if (st.running !== child) return // cut off by a newer run
  st.running = null
  if (code === null && !out) {
    await showSlot(env, '● –', undefined, true)
    return
  }
  const o = parseRun(out, code)
  st.last = o
  env.journal.push({ type: 'test.run', source: 'testlight', phase: 'end', ok: o.ok, green: o.green, red: o.red, runner: st.runner.name }, await env.host.now())
  st.undelivered = o.ok ? null : o.failures
  const s = slotText(o)
  await showSlot(env, s.text, s.color)
}

function onEvent(e: JournalEvent): void {
  if (e.type !== 'file.changed' || !isSourceFile(e.path)) return
  if (st.env && !e.path.startsWith(st.env.project + '/')) return
  st.pending.add(e.path)
  st.running?.stop()
  schedule()
}

export function testlightStep(): Step {
  return {
    id: 'testLight',
    start(env) {
      st.env = env
      st.runner = undefined
      st.unsubscribe?.()
      st.unsubscribe = env.journal.subscribe(onEvent)
    },
    promptContext() {
      if (!st.undelivered) return []
      const text = st.undelivered
      st.undelivered = null
      return [`exo/test light: tests are red (${st.last?.red ?? '?'} failed, runner ${st.runner?.name ?? '?'}):\n${text}`]
    },
    before(ctx: CallCtx) {
      if (ctx.call.tool !== 'Bash' || !ctx.parsed?.ok) return
      const kind = runKind(ctx.cmds)
      if (!kind) return
      ctx.memo.testlight = kind
      if (kind === 'test') {
        st.claudeRuns++
        st.running?.stop() // Claude's own run replaces the background one
        ctx.journal.push({ type: 'test.run', source: 'claude', phase: 'start' }, Date.now())
      }
    },
    after(ctx, result) {
      const kind = ctx.memo.testlight as 'test' | 'build' | undefined
      if (!kind) return
      const ok = result.deny === undefined && result.isError !== true
      if (kind === 'build') {
        ctx.journal.push({ type: 'build.run', ok }, Date.now())
        return
      }
      st.claudeRuns = Math.max(0, st.claudeRuns - 1)
      const o = parseRun(typeof result.text === 'string' ? result.text : '', ok ? 0 : 1)
      ctx.journal.push({ type: 'test.run', source: 'claude', phase: 'end', ok: o.ok, green: o.green, red: o.red }, Date.now())
    },
  }
}

/** For tests. */
export function testlightState(): State {
  return st
}
export function resetTestlight(): void {
  st.timer?.cancel()
  st.unsubscribe?.()
  Object.assign(st, { env: null, pending: new Set(), timer: undefined, running: null, claudeRuns: 0, last: null, undelivered: null, unsubscribe: null, runner: undefined })
}
