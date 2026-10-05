import { test } from 'node:test'
import assert from 'node:assert/strict'

import { emptyPrefs, resolveConfig } from '../core/config/config'
import type { ModuleId } from '../core/config/config'
import { BUDGET_MS, STEP_ORDER, catchDecision, dispatch } from '../core/dispatcher/dispatcher'
import type { DispatchDeps, Step, ToolResult } from '../core/dispatcher/dispatcher'
import { Health } from '../core/health/health'
import { Journal } from '../core/journal/journal'
import { createRuntime, livenessText, refreshLiveness } from '../core/runtime'
import { exoCommand } from '../core/exo-command'
import { FakeHost } from './fake-host'

function deps(steps: Step[], over: Partial<DispatchDeps> = {}): DispatchDeps & { health: Health; journal: Journal } {
  return {
    host: new FakeHost(),
    config: resolveConfig({}, emptyPrefs()),
    rules: [],
    journal: new Journal('s'),
    health: new Health(),
    steps,
    interactive: true,
    killed: async () => null,
    ...over,
  } as DispatchDeps & { health: Health; journal: Journal }
}

const ran = (log: string[]) => async (input: Record<string, unknown>): Promise<ToolResult> => {
  log.push(`run:${String(input.command ?? input.file_path)}`)
  return { result: 'ok', text: 'ok' }
}

test('steps run in the fixed order, whatever order they come in', async () => {
  const log: string[] = []
  const mk = (id: ModuleId): Step => ({ id, before: () => void log.push(id), after: () => void log.push(`after:${id}`) })
  const d = deps(['brake', 'diet', 'secrets', 'prodShield'].map(id => mk(id as ModuleId)))
  await dispatch(d, { tool: 'Bash', input: { command: 'ls' } }, ran(log))
  assert.deepEqual(log, ['secrets', 'prodShield', 'diet', 'brake', 'run:ls', 'after:secrets', 'after:prodShield', 'after:diet', 'after:brake'])
  assert.deepEqual(STEP_ORDER.slice(0, 4), ['secrets', 'prodShield', 'diet', 'brake'])
})

test('a deny stops the chain: later steps and the tool never run', async () => {
  const log: string[] = []
  const d = deps([
    { id: 'secrets', before: () => ({ deny: 'Geheimnis' }) },
    { id: 'brake', before: () => void log.push('brake') },
  ])
  const r = await dispatch(d, { tool: 'Bash', input: { command: 'ls' } }, ran(log))
  assert.equal(r.deny, 'Geheimnis')
  assert.deepEqual(log, [])
  const end = d.journal.last('tool.end')!
  assert.equal(end.denied, 'secrets')
  assert.equal(end.ok, false)
})

test('a guard that throws denies this call (fail closed) and is marked broken', async () => {
  const log: string[] = []
  const d = deps([
    {
      id: 'prodShield',
      before: () => {
        throw new Error('kaputt')
      },
    },
  ])
  const r = await dispatch(d, { tool: 'Bash', input: { command: 'ls' } }, ran(log))
  assert.ok(r.deny?.includes('Prod-Schild ist gestört'))
  assert.ok(r.deny?.includes('/exo off prodShield'))
  assert.ok(r.deny?.includes('DISABLED'))
  assert.deepEqual(log, [])
  assert.equal(d.health.isBroken('prodShield'), true)
  assert.equal(d.journal.last('module.error')!.module, 'prodShield')
})

test('the next call is judged again: one failure does not block the session', async () => {
  let fail = true
  const log: string[] = []
  const d = deps([
    {
      id: 'secrets',
      before: () => {
        if (fail) throw new Error('einmal')
      },
    },
  ])
  assert.ok((await dispatch(d, { tool: 'Bash', input: { command: 'a' } }, ran(log))).deny)
  fail = false
  assert.equal((await dispatch(d, { tool: 'Bash', input: { command: 'b' } }, ran(log))).deny, undefined)
  assert.deepEqual(log, ['run:b'])
})

test('a comfort step that throws is skipped (fail open)', async () => {
  const log: string[] = []
  const d = deps([
    {
      id: 'diet',
      before: () => {
        throw new Error('kaputt')
      },
      after: () => {
        throw new Error('auch kaputt')
      },
    },
  ])
  const r = await dispatch(d, { tool: 'Read', input: { file_path: '/x' } }, ran(log))
  assert.equal(r.deny, undefined)
  assert.deepEqual(log, ['run:/x'])
  assert.equal(d.health.isBroken('diet'), true)
})

test('a switched-off module is not called', async () => {
  const log: string[] = []
  const d = deps([{ id: 'secrets', before: () => ({ deny: 'nein' }) }], { config: resolveConfig({ secrets: false }, emptyPrefs()) })
  const r = await dispatch(d, { tool: 'Bash', input: { command: 'ls' } }, ran(log))
  assert.equal(r.deny, undefined)
  assert.deepEqual(log, ['run:ls'])
})

test('kill switch: everything passes, no step runs, nothing logged', async () => {
  const log: string[] = []
  const d = deps(
    [
      {
        id: 'secrets',
        before: () => {
          throw new Error('würde blockieren')
        },
      },
    ],
    { killed: async () => 'DISABLED' },
  )
  const r = await dispatch(d, { tool: 'Bash', input: { command: 'ls' } }, ran(log))
  assert.equal(r.deny, undefined)
  assert.deepEqual(log, ['run:ls'])
  assert.equal(d.journal.size(), 0)
})

test('a rewrite reaches the tool and later steps see the re-parsed command', async () => {
  const log: string[] = []
  let seen = ''
  const d = deps([
    { id: 'prodShield', before: ctx => ({ input: { ...ctx.call.input, command: 'rsync --dry-run a b' } }) },
    { id: 'brake', before: ctx => void (seen = ctx.cmds.map(c => c.argv.join(' ')).join(';')) },
  ])
  await dispatch(d, { tool: 'Bash', input: { command: 'rsync a b' } }, ran(log))
  assert.deepEqual(log, ['run:rsync --dry-run a b'])
  assert.equal(seen, 'rsync --dry-run a b')
})

test('Bash is parsed once and handed to the steps; other tools get no parse', async () => {
  let bash = 0
  let read = 0
  const d = deps([
    {
      id: 'secrets',
      before: ctx => {
        if (ctx.parsed) bash = ctx.cmds.length
        else read++
      },
    },
  ])
  await dispatch(d, { tool: 'Bash', input: { command: 'cd x && sudo rm -rf y' } }, ran([]))
  await dispatch(d, { tool: 'Read', input: { file_path: '/a' } }, ran([]))
  assert.equal(bash, 2)
  assert.equal(read, 1)
})

test('notes from steps reach the model as context', async () => {
  const d = deps([{ id: 'brake', before: ctx => void ctx.notes.push('wiederherstellbar mit /undo-last') }])
  const r = await dispatch(d, { tool: 'Bash', input: { command: 'rm -rf x' } }, ran([]))
  assert.deepEqual(r.context, ['wiederherstellbar mit /undo-last'])
})

test('after steps may replace the result', async () => {
  const d = deps([{ id: 'diet', after: (_ctx, r) => ({ ...r, context: ['Ende der Datei'] }) }])
  const r = await dispatch(d, { tool: 'Read', input: { file_path: '/x' } }, ran([]))
  assert.deepEqual(r.context, ['Ende der Datei'])
  assert.equal(r.text, 'ok')
})

test('journal: start and end of the call, summary without arguments', async () => {
  const d = deps([])
  await dispatch(d, { tool: 'Bash', input: { command: 'curl -H "Authorization: Bearer abc" x' }, id: 't1' }, ran([]))
  const start = d.journal.last('tool.start')!
  assert.equal(start.summary, 'curl')
  assert.equal(start.id, 't1')
  assert.equal(d.journal.last('tool.end')!.ok, true)
})

test('an engine error result is logged as not ok', async () => {
  const d = deps([])
  await dispatch(d, { tool: 'Bash', input: { command: 'false' } }, async () => ({ isError: true, text: 'exit 1' }))
  assert.equal(d.journal.last('tool.end')!.ok, false)
})

test('time budget: overruns are counted, dialog time is not', async () => {
  let t = 0
  const d = deps(
    [
      {
        id: 'secrets',
        before: async ctx => {
          t += 10
          // a dialog: the time passes while it is open, and is not counted
          await ctx.untimed(new Promise<void>(r => setTimeout(() => ((t += 5_000), r()), 0)))
        },
      },
    ],
    { clock: () => t },
  )
  await dispatch(d, { tool: 'Bash', input: { command: 'ls' } }, ran([]))
  assert.equal(d.health.snapshot().core?.budgetHits ?? 0, 0)
  assert.equal(d.health.snapshot().secrets!.maxMs, 10)

  const slow = deps([{ id: 'secrets', before: () => void (t += BUDGET_MS + 1) }], { clock: () => t })
  await dispatch(slow, { tool: 'Bash', input: { command: 'ls' } }, ran([]))
  assert.equal(slow.health.snapshot().core!.budgetHits, 1)
  assert.equal(slow.journal.last('budget.exceeded')!.module, 'dispatcher')
})

test('catch decision: guarded tools denied, others pass, kill switch wins, ran calls left alone', () => {
  const d = catchDecision('Bash', false, false, 'boom')
  assert.ok(typeof d === 'object' && d.deny.includes('Kern'))
  assert.ok(typeof d === 'object' && d.deny.includes('DISABLED'))
  for (const t of ['Write', 'Edit', 'NotebookEdit']) assert.equal(typeof catchDecision(t, false, false, 'x'), 'object')
  assert.equal(catchDecision('Read', false, false, 'x'), 'pass')
  assert.equal(catchDecision('Bash', true, false, 'x'), 'pass')
  assert.equal(catchDecision('Bash', false, true, 'x'), 'leave')
})

// ---------------------------------------------------------------- runtime + /exo

test('runtime: writes default rules.json when there is none', async () => {
  const h = new FakeHost()
  const rt = await createRuntime(h, {})
  assert.ok(h.files.get('/home/u/.claude/exo/rules.json')!.includes('nginx-certbot'))
  assert.equal(rt.rules.source, 'default')
})

test('runtime: broken rules.json → defaults plus a warning in /exo', async () => {
  const h = new FakeHost()
  h.files.set('/home/u/.claude/exo/rules.json', '{ kaputt')
  const rt = await createRuntime(h, {})
  assert.equal(rt.rules.rules[0]!.id, 'nginx-certbot')
  const text = await exoCommand(rt, h, '')
  assert.ok(text.includes('rules.json ist kein gültiges JSON'))
  assert.ok(text.includes('eingebaut, rules.json fehlerhaft'))
  assert.equal(h.files.get('/home/u/.claude/exo/rules.json'), '{ kaputt') // not overwritten
})

test('runtime: restores the journal of the same session after a reload', async () => {
  const h = new FakeHost()
  const a = await createRuntime(h, {})
  a.journal.push({ type: 'prompt.submit', chars: 5 }, 1)
  await a.store.set('journal:current', a.journal.snapshot())
  const b = await createRuntime(h, {})
  assert.equal(b.journal.size(), 1)
})

test('/exo off and on: stored, kill reason set, liveness shows it', async () => {
  const h = new FakeHost()
  const rt = await createRuntime(h, {})
  assert.ok((await exoCommand(rt, h, 'off')).includes('alle Module aus'))
  assert.equal(rt.prefs.allOff, true)
  assert.deepEqual(h.store.get('prefs'), { allOff: true, modules: {} })
  assert.equal(h.slots.exo!.text, '⛨ exo aus (/exo off)')
  assert.equal(h.killed, '/exo off')
  await exoCommand(rt, h, 'on')
  assert.equal(rt.prefs.allOff, false)
  assert.equal(h.slots.exo!.text, '⛨ exo')
})

test('/exo off <modul> and unknown modules', async () => {
  const h = new FakeHost()
  const rt = await createRuntime(h, {})
  await exoCommand(rt, h, 'off cinema')
  assert.equal(rt.config.enabled.cinema, false)
  assert.equal(rt.config.enabled.secrets, true)
  assert.ok((await exoCommand(rt, h, 'off quatsch')).includes('Unbekanntes Modul'))
})

test('/exo shows broken modules and reset clears them', async () => {
  const h = new FakeHost()
  const rt = await createRuntime(h, {})
  rt.health.fail('secrets', 'TypeError: x', h.t)
  await refreshLiveness(rt, h)
  assert.equal(h.slots.exo!.text, '⛨ exo ⚠ 1 gestört')
  assert.ok((await exoCommand(rt, h, '')).includes('gestört'))
  await exoCommand(rt, h, 'reset secrets')
  assert.equal(h.slots.exo!.text, '⛨ exo')
})

test('/exo rules lists the rules; help lists the commands', async () => {
  const h = new FakeHost()
  const rt = await createRuntime(h, {})
  assert.ok((await exoCommand(rt, h, 'rules')).includes('nginx-certbot'))
  assert.ok((await exoCommand(rt, h, 'help')).includes('/exo reset <modul>'))
})

test('liveness with the DISABLED file', async () => {
  const h = new FakeHost()
  const rt = await createRuntime(h, {})
  h.files.set('/home/u/.claude/exo/DISABLED', '')
  rt.kill.invalidate()
  await refreshLiveness(rt, h)
  assert.equal(h.slots.exo!.text, livenessText(rt, 'Datei ~/.claude/exo/DISABLED'))
  assert.ok((await exoCommand(rt, h, '')).includes('exo ist AUS'))
})
