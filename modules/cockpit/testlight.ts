/**
 * #4 Live-Testampel: after Edit/Write of source code the affected tests run
 * in the background (debounced 1.5 s, at low priority, a running one is cut
 * off by newer changes, never alongside a test run Claude started itself).
 * The line under the prompt shows `● 48/48` or `● 2 rot`; red tests go into
 * the next prompt once.
 */
import type { Spawned } from '../../core/adapter/host'
import type { CallCtx, ModuleEnv, Step } from '../../core/dispatcher/dispatcher'
import type { JournalEvent } from '../../core/journal/journal'
import { detectRunner, isSourceFile, parseRun, runKind } from './testlight-logic'
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
  if (o.ok) return { text: o.green !== undefined ? `● ${o.green}/${o.green}` : '● grün', color: GREEN }
  if (o.red) return { text: `● ${o.red} rot`, color: RED }
  return { text: '● rot', color: RED }
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
  if (st.runner === undefined) st.runner = detectRunner(await facts(env), env.config.testCommand)
  if (!st.runner) {
    st.pending.clear()
    return
  }
  st.running?.stop()
  const files = [...st.pending]
  st.pending.clear()
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
      return [`exo/Testampel: Tests sind rot (${st.last?.red ?? '?'} fehlgeschlagen, Läufer ${st.runner?.name ?? '?'}):\n${text}`]
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
