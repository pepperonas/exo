import { test } from 'node:test'
import assert from 'node:assert/strict'

import { emptyPrefs, resolveConfig } from '../core/config/config'
import { dispatch } from '../core/dispatcher/dispatcher'
import type { DispatchDeps, ModuleEnv, Step, ToolResult } from '../core/dispatcher/dispatcher'
import { Health } from '../core/health/health'
import { Journal } from '../core/journal/journal'
import { pressBanner, pressPane } from '../core/statusline/banners'
import { commandsOf } from '../core/shell/words'
import { StoreBox } from '../core/store/store'
import { ago, ciState, failedStep, nextDelay, parseRuns, poll, resetCi, slot } from '../modules/cockpit/ci'
import { WARNING, claims, donecheckStep, verdict } from '../modules/cockpit/donecheck'
import { refreshChanges, resetSidebar, revert, sidebarStep } from '../modules/cockpit/sidebar'
import { DEBOUNCE_MS, resetTestlight, slotText, testlightState, testlightStep } from '../modules/cockpit/testlight'
import { detectRunner, failureText, isSourceFile, parseRun, runKind } from '../modules/cockpit/testlight-logic'
import { FakeHost } from './fake-host'

const PROJECT = '/work/proj'

function env(host: FakeHost, journal = new Journal('s'), over: Partial<ModuleEnv> = {}): ModuleEnv {
  return { host, journal, config: resolveConfig({}, emptyPrefs()), store: new StoreBox(host), home: '/home/u', project: PROJECT, cwd: { cwd: PROJECT, known: true }, interactive: true, sessionId: 's', ...over }
}
function deps(host: FakeHost, steps: Step[], journal = new Journal('s')): DispatchDeps {
  return { host, config: resolveConfig({}, emptyPrefs()), rules: [], journal, health: new Health(), steps, interactive: true, killed: async () => null, home: '/home/u', cwd: { cwd: PROJECT, known: true }, store: new StoreBox(host) }
}
const tick = () => new Promise(r => setImmediate(r))

// ---------------------------------------------------------------- run kinds and runners

test('run kind: tests and builds Claude starts itself', () => {
  const k = (s: string) => runKind(commandsOf(s)!)
  for (const s of ['npm test', 'npm run test:unit', 'pnpm test', 'yarn test', 'npx vitest run', 'pytest -q', 'python3 -m pytest', 'cargo test', 'go test ./...', './gradlew test', 'node --import tsx --test tests/a.spec.ts', 'make test', 'cd x && npm t', 'claude plugin test .']) assert.equal(k(s), 'test', s)
  for (const s of ['npm run build', 'npx tsc -p .', 'tsc', 'cargo build', 'go build', 'make']) assert.equal(k(s), 'build', s)
  for (const s of ['npm install', 'ls', 'git status', 'ssh h npm test', 'echo test']) assert.equal(k(s), null, s)
})

test('runner detection', () => {
  const base = { root: PROJECT, hasPytest: false, hasCargo: false, hasGradlew: false, hasGradle: false, hasGoMod: false }
  const files = [`${PROJECT}/src/a.ts`]
  assert.deepEqual(detectRunner({ ...base, pkg: { devDependencies: { vitest: '1' } } }, '')!.argv(files), ['npx', '--no-install', 'vitest', 'related', '--run', 'src/a.ts'])
  assert.deepEqual(detectRunner({ ...base, pkg: { devDependencies: { jest: '1' } } }, '')!.argv(files).slice(0, 5), ['npx', '--no-install', 'jest', '--findRelatedTests', 'src/a.ts'])
  assert.equal(detectRunner({ ...base, pkg: { scripts: { test: 'node --import tsx --test tests/*.spec.ts' } } }, '')!.name, 'node')
  assert.equal(detectRunner({ ...base, pkg: { scripts: { test: 'echo "Error: no test specified" && exit 1' } } }, ''), null)
  assert.deepEqual(detectRunner({ ...base, hasPytest: true }, '')!.argv([`${PROJECT}/tests/test_a.py`]), ['python3', '-m', 'pytest', '-q', 'tests/test_a.py'])
  assert.deepEqual(detectRunner({ ...base, hasPytest: true }, '')!.argv([`${PROJECT}/app.py`]), ['python3', '-m', 'pytest', '-q'])
  assert.equal(detectRunner({ ...base, hasCargo: true }, '')!.name, 'cargo')
  assert.deepEqual(detectRunner(base, 'make check FILES={files}')!.argv(files), ['make', 'check', 'FILES={files}'])
  assert.deepEqual(detectRunner(base, 'bin/test {files}')!.argv(files), ['bin/test', 'src/a.ts'])
  assert.equal(detectRunner(base, ''), null)
})

test('source files: code yes, generated and vendored no', () => {
  assert.ok(isSourceFile('/p/src/a.ts') && isSourceFile('/p/x.py'))
  assert.ok(!isSourceFile('/p/README.md') && !isSourceFile('/p/node_modules/x/a.js') && !isSourceFile('/p/dist/a.js'))
})

const TAP = ['ok 1 - a', 'not ok 2 - adds', '  ---', "  error: 'expected 3'", "  location: 'tests/a.spec.ts:4:1'", '# pass 47', '# fail 1'].join('\n')
test('output: TAP, vitest, jest, pytest, cargo', () => {
  assert.deepEqual(parseRun('# pass 48\n# fail 0', 0), { ok: true, green: 48, red: 0, failures: '' })
  const tap = parseRun(TAP, 1)
  assert.equal(tap.ok, false)
  assert.equal(tap.red, 1)
  assert.ok(tap.failures.includes('not ok 2 - adds'))
  assert.ok(tap.failures.includes('tests/a.spec.ts:4:1'))
  assert.deepEqual(parseRun(' Tests  2 failed | 46 passed (48)', 1).red, 2)
  assert.deepEqual(parseRun('Tests:       1 failed, 2 skipped, 47 passed, 50 total', 1).green, 47)
  assert.deepEqual(parseRun('===== 2 failed, 46 passed in 1.20s =====', 1).red, 2)
  assert.deepEqual(parseRun('test result: ok. 10 passed; 0 failed;\ntest result: FAILED. 3 passed; 1 failed;', 101).red, 1)
  assert.equal(parseRun('\x1b[32m# pass 3\x1b[0m', 0).green, 3)
  assert.equal(parseRun('weird output', 2).ok, false)
})

test('failure text is capped', () => {
  const t = failureText(Array.from({ length: 500 }, (_, i) => `not ok ${i} - x`).join('\n'), 300)
  assert.ok(t.length <= 302)
})

test('slot text', () => {
  assert.deepEqual(slotText({ ok: true, green: 48, red: 0, failures: '' }).text, '● 48/48')
  assert.deepEqual(slotText({ ok: false, green: 46, red: 2, failures: '' }).text, '● 2 rot')
  assert.deepEqual(slotText({ ok: false, failures: '' }).text, '● rot')
})

// ---------------------------------------------------------------- test light flow

async function lightEnv() {
  resetTestlight()
  const host = new FakeHost()
  host.files.set(`${PROJECT}/package.json`, JSON.stringify({ scripts: { test: 'node --test' } }))
  const journal = new Journal('s')
  const step = testlightStep()
  step.start!(env(host, journal))
  return { host, journal, step }
}
const change = (journal: Journal, path = `${PROJECT}/src/a.ts`) => journal.push({ type: 'file.changed', path, added: 1, removed: 0, via: 'Edit' }, 0)

test('test light: debounced, nice, slot green', async () => {
  const { host, journal } = await lightEnv()
  host.spawnResult = () => ({ out: '# pass 48\n# fail 0\n', code: 0 })
  change(journal)
  change(journal, `${PROJECT}/src/b.ts`)
  await host.advance(DEBOUNCE_MS - 1)
  assert.equal(host.spawned.length, 0)
  await host.advance(1)
  await tick()
  assert.equal(host.spawned.length, 1)
  assert.deepEqual(host.spawned[0]!.argv.slice(0, 3), ['nice', '-n', '10'])
  assert.equal(host.spawned[0]!.cwd, PROJECT)
  host.finishAll()
  await tick()
  await tick()
  assert.equal(host.slots.tests!.text, '● 48/48')
})

test('test light: red tests reach the next prompt once', async () => {
  const { host, journal, step } = await lightEnv()
  host.spawnResult = () => ({ out: TAP, code: 1 })
  change(journal)
  await host.advance(DEBOUNCE_MS)
  await tick()
  host.finishAll()
  await tick()
  await tick()
  assert.equal(host.slots.tests!.text, '● 1 rot')
  const ctx1 = await step.promptContext!(env(host, journal))
  assert.ok(ctx1[0]!.includes('not ok 2 - adds'))
  assert.deepEqual(await step.promptContext!(env(host, journal)), [])
})

test('test light: a newer change cuts the running run off', async () => {
  const { host, journal } = await lightEnv()
  change(journal)
  await host.advance(DEBOUNCE_MS)
  await tick()
  assert.equal(host.spawned.length, 1)
  change(journal)
  assert.equal(host.spawned[0]!.stopped, true)
})

test('test light: waits while Claude runs tests itself', async () => {
  const { host, journal, step } = await lightEnv()
  const ctx = { call: { tool: 'Bash', input: { command: 'npm test' } }, parsed: { ok: true }, cmds: commandsOf('npm test')!, memo: {} as Record<string, unknown>, journal } as never
  await step.before!(ctx)
  change(journal)
  await host.advance(DEBOUNCE_MS)
  await tick()
  assert.equal(host.spawned.length, 0)
  await step.after!(ctx, { text: '# pass 3\n# fail 0' })
  await host.advance(DEBOUNCE_MS)
  await tick()
  assert.equal(host.spawned.length, 1)
  assert.equal(journal.ofType('test.run').find(e => e.source === 'claude' && e.phase === 'end')!.green, 3)
})

test('test light: changes outside the project or non-code are ignored', async () => {
  const { host, journal } = await lightEnv()
  change(journal, '/elsewhere/a.ts')
  change(journal, `${PROJECT}/README.md`)
  await host.advance(DEBOUNCE_MS)
  await tick()
  assert.equal(host.spawned.length, 0)
  assert.equal(testlightState().pending.size, 0)
})

// ---------------------------------------------------------------- done check

test('claims: German and English', () => {
  assert.deepEqual(claims('Fertig, alle Tests sind grün.'), ['fertig', 'alle tests sind grün'])
  assert.deepEqual(claims('Done – it works now.'), ['done', 'works'])
  assert.deepEqual(claims('Ich habe die Datei angesehen.'), [])
})

test('verdict: nothing changed, checked, unchecked', () => {
  const j = new Journal('s')
  j.turnId = 't1'
  assert.equal(verdict(j.all(), 't1'), 'nothing-changed')
  j.push({ type: 'file.changed', path: '/a', added: 1, removed: 0, via: 'Edit' }, 1)
  assert.equal(verdict(j.all(), 't1'), 'unchecked')
  j.push({ type: 'test.run', source: 'claude', phase: 'end', ok: false }, 2)
  assert.equal(verdict(j.all(), 't1'), 'unchecked')
  j.push({ type: 'build.run', ok: true }, 3)
  assert.equal(verdict(j.all(), 't1'), 'checked')
  j.push({ type: 'file.changed', path: '/a', added: 1, removed: 0, via: 'Edit' }, 4)
  assert.equal(verdict(j.all(), 't1'), 'unchecked') // a change after the green run
})

test('done check: warns once, only for answers with a claim', async () => {
  const host = new FakeHost()
  const j = new Journal('s')
  j.turnId = 't1'
  j.push({ type: 'file.changed', path: '/a', added: 1, removed: 0, via: 'Edit' }, 1)
  const step = donecheckStep()
  assert.equal(await step.turnComplete!(env(host, j), { turnId: 't1', answer: 'Fertig!', reason: 'answer' }), WARNING)
  assert.equal(await step.turnComplete!(env(host, j), { turnId: 't1', answer: 'Ich schaue noch.', reason: 'answer' }), undefined)
  assert.equal(await step.turnComplete!(env(host, j), { turnId: 't1', answer: 'Fertig!', reason: 'aborted' }), undefined)
})

// ---------------------------------------------------------------- core: file.changed

test('core logs file changes with +/− for Write and Edit', async () => {
  const host = new FakeHost()
  host.files.set(`${PROJECT}/a.ts`, 'a\nb\n')
  const j = new Journal('s')
  const write = (path: string, text: string) => async (): Promise<ToolResult> => (host.files.set(path, text), { result: 'ok' })
  await dispatch(deps(host, [], j), { tool: 'Edit', input: { file_path: `${PROJECT}/a.ts`, old_string: 'b', new_string: 'x\ny' } }, write(`${PROJECT}/a.ts`, 'a\nx\ny\n'))
  await dispatch(deps(host, [], j), { tool: 'Write', input: { file_path: `${PROJECT}/new.ts`, content: '1\n2\n3\n' } }, write(`${PROJECT}/new.ts`, '1\n2\n3\n'))
  const ev = j.ofType('file.changed')
  assert.deepEqual(ev.map(e => [e.path.split('/').pop(), e.added, e.removed]), [
    ['a.ts', 2, 1],
    ['new.ts', 3, 0],
  ])
})

// ---------------------------------------------------------------- sidebar

test('sidebar: files changed this session, diff, reset with a snapshot', async () => {
  resetSidebar()
  const host = new FakeHost()
  host.files.set(`${PROJECT}/a.ts`, 'one\ntwo\n')
  const step = sidebarStep()
  const e = env(host)
  await step.start!(e)
  const write = (path: string, text: string) => async (): Promise<ToolResult> => (host.files.set(path, text), { result: 'ok' })
  const d = deps(host, [step], e.journal)
  await dispatch(d, { tool: 'Edit', input: { file_path: `${PROJECT}/a.ts`, old_string: 'two', new_string: 'TWO' } }, write(`${PROJECT}/a.ts`, 'one\nTWO\n'))
  await dispatch(d, { tool: 'Edit', input: { file_path: `${PROJECT}/a.ts`, old_string: 'one', new_string: 'ONE' } }, write(`${PROJECT}/a.ts`, 'ONE\nTWO\n'))
  await dispatch(d, { tool: 'Write', input: { file_path: `${PROJECT}/n.ts`, content: 'x\n' } }, write(`${PROJECT}/n.ts`, 'x\n'))
  assert.deepEqual(host.changes.rows, [
    { path: `${PROJECT}/a.ts`, added: 2, removed: 2, isNew: false }, // against the state before the session
    { path: `${PROJECT}/n.ts`, added: 1, removed: 0, isNew: true },
  ])
  await pressPane(host, `sel:${PROJECT}/a.ts`)
  assert.equal(host.changes.selected, `${PROJECT}/a.ts`)
  assert.ok(host.changes.diff.includes('-one') && host.changes.diff.includes('+ONE'))
  assert.ok(host.changes.diff.startsWith('--- a/a.ts'))

  host.answers = ['Zurücksetzen']
  const msg = await revert(e, `${PROJECT}/a.ts`)
  assert.ok(msg.includes('zurückgesetzt'), msg)
  assert.equal(host.files.get(`${PROJECT}/a.ts`), 'one\ntwo\n')
  assert.ok(host.runs.some(r => r.argv[0] === 'tar'))
  assert.deepEqual(host.changes.rows.map(r => r.path), [`${PROJECT}/n.ts`])
})

test('sidebar: reset asks; Esc changes nothing; a new file is deleted', async () => {
  resetSidebar()
  const host = new FakeHost()
  const step = sidebarStep()
  const e = env(host)
  await step.start!(e)
  const d = deps(host, [step], e.journal)
  await dispatch(d, { tool: 'Write', input: { file_path: `${PROJECT}/n.ts`, content: 'x\n' } }, async () => (host.files.set(`${PROJECT}/n.ts`, 'x\n'), { result: 'ok' }))
  assert.equal(await revert(e, `${PROJECT}/n.ts`), 'Abgebrochen.')
  assert.equal(host.files.get(`${PROJECT}/n.ts`), 'x\n')
  host.answers = ['Zurücksetzen']
  await revert(e, `${PROJECT}/n.ts`)
  assert.ok(host.runs.some(r => r.argv.join(' ') === `rm -f -- ${PROJECT}/n.ts`))
  assert.ok(host.asked[1]!.question.includes('löschen'))
})

test('sidebar: originals survive a reload of the mod', async () => {
  resetSidebar()
  const host = new FakeHost()
  host.files.set(`${PROJECT}/a.ts`, 'old\n')
  const step = sidebarStep()
  const e = env(host)
  await step.start!(e)
  await dispatch(deps(host, [step], e.journal), { tool: 'Write', input: { file_path: `${PROJECT}/a.ts`, content: 'new\n' } }, async () => (host.files.set(`${PROJECT}/a.ts`, 'new\n'), { result: 'ok' }))
  resetSidebar() // the reload
  await refreshChanges(e)
  assert.deepEqual(host.changes.rows.map(r => [r.added, r.removed]), [[1, 1]])
})

// ---------------------------------------------------------------- CI

test('ci: parse, slot, backoff, failed step', () => {
  const run = parseRuns(JSON.stringify([{ databaseId: 7, status: 'completed', conclusion: 'failure', name: 'CI', updatedAt: '2026-10-05T10:00:00Z', url: 'u' }]))!
  assert.equal(run.state, 'red')
  assert.equal(parseRuns('[{"status":"in_progress"}]')!.state, 'running')
  assert.equal(parseRuns('[{"status":"completed","conclusion":"success"}]')!.state, 'green')
  assert.equal(parseRuns('[]'), null)
  assert.equal(parseRuns('kaputt'), null)
  assert.equal(slot(run, run.updatedAt + 3 * 60_000).text, '● CI rot · vor 3 min')
  assert.equal(nextDelay(0), 60_000)
  assert.equal(nextDelay(2), 240_000)
  assert.equal(nextDelay(10), 600_000)
  assert.equal(failedStep(JSON.stringify({ jobs: [{ name: 'test', steps: [{ name: 'checkout', conclusion: 'success' }, { name: 'npm test', conclusion: 'failure' }] }] })), 'test › npm test')
  assert.equal(ago(90 * 60_000), 'vor 2 h')
})

test('ci: a red run toasts, bands, and the button fills the prompt', async () => {
  resetCi()
  const host = new FakeHost()
  host.runResult = argv => {
    const a = argv.join(' ')
    if (a.includes('rev-parse')) return { exitCode: 0, stdout: 'main\n', stderr: '' }
    if (a.includes('run list')) return { exitCode: 0, stdout: JSON.stringify([{ databaseId: 9, status: 'completed', conclusion: 'failure', name: 'CI', updatedAt: new Date(host.t).toISOString(), url: 'https://github.com/x/y/actions/runs/9' }]), stderr: '' }
    if (a.includes('--json jobs')) return { exitCode: 0, stdout: JSON.stringify({ jobs: [{ name: 'test', steps: [{ name: 'npm test', conclusion: 'failure' }] }] }), stderr: '' }
    if (a.includes('--log-failed')) return { exitCode: 0, stdout: 'Error: expected 3', stderr: '' }
    return { exitCode: 0, stdout: '', stderr: '' }
  }
  const e = env(host)
  e.journal.push({ type: 'prompt.submit', chars: 1 }, host.t)
  await poll(e)
  assert.equal(host.slots.ci!.text, '● CI rot · gerade')
  assert.ok(host.toasts[0]!.includes('test › npm test'))
  assert.equal(host.banners[0]!.buttons[0]!.label, 'Log an Claude geben')
  await poll(e)
  assert.equal(host.toasts.length, 1) // once per run
  await pressBanner(host, 'exo-ci', 'log')
  assert.ok(host.prompts[0]!.includes('Error: expected 3'))
  assert.equal(host.banners.length, 0)
})

test('ci: idle sessions are not polled; errors back off', async () => {
  resetCi()
  const host = new FakeHost()
  const e = env(host)
  e.journal.push({ type: 'prompt.submit', chars: 1 }, host.t - 16 * 60_000)
  await poll(e)
  assert.equal(host.runs.length, 0)
  e.journal.push({ type: 'prompt.submit', chars: 1 }, host.t)
  host.runResult = () => ({ exitCode: 1, stdout: '', stderr: 'boom' })
  await poll(e)
  assert.equal(ciState().failures, 1)
})
