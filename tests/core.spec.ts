import { test } from 'node:test'
import assert from 'node:assert/strict'

import { MODULE_IDS, emptyPrefs, parseProdHost, parseQuietHours, readPrefs, resolveConfig } from '../core/config/config'
import { DEFAULT_RULES_JSON, loadRules, validateRules } from '../core/config/rules'
import { Health, errorText } from '../core/health/health'
import { Journal } from '../core/journal/journal'
import { KillSwitch, disabledPath, killReason } from '../core/killswitch'
import { cellWidth, layout, truncate } from '../core/statusline/statusline'
import type { Slot } from '../core/statusline/statusline'
import { BUDGETS, StoreBox, THROTTLE_MS, fit, jsonBytes, runMigrations } from '../core/store/store'
import { FakeHost } from './fake-host'

// ---------------------------------------------------------------- config

test('config: every module on by default', () => {
  const c = resolveConfig({}, emptyPrefs())
  for (const id of MODULE_IDS) assert.equal(c.enabled[id], true, id)
  assert.equal(c.snapshotMaxMb, 500)
  assert.deepEqual(c.prodHosts, [])
  assert.deepEqual(c.quietHours, { from: 22, to: 7 })
  assert.deepEqual(c.errors, [])
})

test('config: userConfig turns a module off, /exo overrides it', () => {
  assert.equal(resolveConfig({ cinema: false }, emptyPrefs()).enabled.cinema, false)
  assert.equal(resolveConfig({ cinema: false }, { allOff: false, modules: { cinema: true } }).enabled.cinema, true)
  assert.equal(resolveConfig({}, { allOff: false, modules: { secrets: false } }).enabled.secrets, false)
})

test('config: /exo off switches every module off', () => {
  const c = resolveConfig({}, { allOff: true, modules: { secrets: true } })
  for (const id of MODULE_IDS) assert.equal(c.enabled[id], false, id)
})

test('config: prod hosts as name=adresse, bad entries reported', () => {
  const c = resolveConfig({ prodHosts: ['vps=203.0.113.7', 'kaputt', ' alt = host.example.com '] }, emptyPrefs())
  assert.deepEqual(c.prodHosts, [
    { name: 'vps', address: '203.0.113.7' },
    { name: 'alt', address: 'host.example.com' },
  ])
  assert.equal(c.errors.length, 1)
  assert.equal(parseProdHost('a=b=c'), null)
  assert.equal(parseProdHost('=x'), null)
})

test('config: wrong types fall back to defaults with an error', () => {
  const c = resolveConfig({ secrets: 'ja', snapshotMaxMb: 'viel', prodHosts: 'x=y' }, emptyPrefs())
  assert.equal(c.enabled.secrets, true)
  assert.equal(c.snapshotMaxMb, 500)
  assert.deepEqual(c.prodHosts, [])
  assert.equal(c.errors.length, 3)
})

test('config: numbers are clamped', () => {
  const c = resolveConfig({ snapshotMaxMb: 0, dietMaxLines: 5 }, emptyPrefs())
  assert.equal(c.snapshotMaxMb, 1)
  assert.equal(c.dietMaxLines, 50)
  assert.equal(c.errors.length, 2)
})

test('config: quiet hours', () => {
  assert.deepEqual(parseQuietHours('22-07'), { from: 22, to: 7 })
  assert.equal(parseQuietHours(''), null)
  assert.equal(parseQuietHours('25-1'), 'invalid')
  assert.equal(parseQuietHours('abends'), 'invalid')
  assert.equal(resolveConfig({ quietHours: 'x' }, emptyPrefs()).quietHours, null)
})

test('prefs: malformed store values are ignored', () => {
  assert.deepEqual(readPrefs(null), emptyPrefs())
  assert.deepEqual(readPrefs({ allOff: 'yes', modules: { secrets: false, nope: true, brake: 1 } }), { allOff: false, modules: { secrets: false } })
})

// ---------------------------------------------------------------- rules

test('rules: defaults contain the certbot rule', () => {
  const r = loadRules(null)
  assert.equal(r.source, 'default')
  assert.equal(r.rules[0]!.id, 'nginx-certbot')
  assert.ok(r.rules[0]!.match.test('sudo nginx -s reload'))
  assert.deepEqual(r.rules[0]!.check, ['ssh', '{host}', 'pgrep', '-x', 'certbot'])
})

test('rules: broken JSON falls back to defaults with a warning', () => {
  const r = loadRules('{ nicht json')
  assert.equal(r.source, 'default-after-error')
  assert.equal(r.rules.length, 1)
  assert.ok(r.errors.some(e => e.includes('not valid JSON')))
})

test('rules: wrong version or shape falls back to defaults', () => {
  for (const text of ['[]', '{"version":2,"rules":[]}', '{"version":1}', '42']) {
    const r = loadRules(text)
    assert.equal(r.source, 'default-after-error', text)
    assert.equal(r.rules[0]!.id, 'nginx-certbot', text)
    assert.ok(r.errors.length > 0, text)
  }
})

test('rules: a valid file replaces the defaults', () => {
  const r = loadRules(JSON.stringify({ version: 1, rules: [{ id: 'db', hosts: ['vps'], match: 'psql', check: ['true'], blockWhen: 'exitNonZero', text: 'DB nur mit Backup' }] }))
  assert.equal(r.source, 'file')
  assert.deepEqual(r.rules.map(x => x.id), ['db'])
  assert.deepEqual(r.errors, [])
})

test('rules: bad rules are dropped one by one, each with a reason', () => {
  const good = DEFAULT_RULES_JSON.rules[0]!
  const v = validateRules({
    version: 1,
    rules: [
      good,
      { ...good, id: 'Gross' },
      { ...good, id: 'r2', match: '([' },
      { ...good, id: 'r3', check: 'ssh x' },
      { ...good, id: 'r4', check: ['ssh', '{addr}'] },
      { ...good, id: 'r5', blockWhen: 'immer' },
      { ...good, id: 'r6', text: ' ' },
      { ...good, id: 'r7', extra: 1 },
      { ...good, id: 'r8', hosts: [] },
      { ...good },
      'keine regel',
    ],
  })
  assert.equal(v.fatal, false)
  assert.deepEqual(v.rules.map(r => r.id), ['nginx-certbot'])
  assert.equal(v.errors.length, 10)
})

// ---------------------------------------------------------------- health

test('health: broken until reset, time and budget counted', () => {
  const h = new Health()
  h.record('secrets', 3)
  h.record('secrets', 7)
  h.fail('secrets', 'x'.repeat(500), 5)
  h.budgetHit('core')
  const s = h.snapshot()
  assert.equal(s.secrets!.calls, 2)
  assert.equal(s.secrets!.maxMs, 7)
  assert.equal(s.secrets!.lastError!.message.length, 200)
  assert.deepEqual(h.broken(), ['secrets'])
  h.reset('secrets')
  assert.deepEqual(h.broken(), [])
  assert.equal(s.core!.budgetHits, 1)
})

test('health: errors survive the store, broken flags do not', () => {
  const a = new Health()
  a.fail('brake', 'kaputt', 9)
  const b = new Health()
  b.restoreErrors(a.errorsForStore())
  assert.equal(b.snapshot().brake!.lastError!.message, 'kaputt')
  assert.equal(b.isBroken('brake'), false)
  b.restoreErrors('müll')
})

test('errorText is one short line', () => {
  assert.equal(errorText(new TypeError('a\n  b')), 'TypeError: a b')
  assert.equal(errorText('x'), 'x')
})

// ---------------------------------------------------------------- journal

test('journal: ring buffer keeps the newest events', () => {
  const j = new Journal('s', 3)
  for (let i = 0; i < 5; i++) j.push({ type: 'prompt.submit', chars: i }, i)
  assert.deepEqual(j.all().map(e => (e as { chars: number }).chars), [2, 3, 4])
  assert.deepEqual(j.all().map(e => e.seq), [3, 4, 5])
})

test('journal: events carry the running turn', () => {
  const j = new Journal('s')
  j.turnId = 't1'
  j.push({ type: 'prompt.submit', chars: 1 }, 1)
  j.push({ type: 'tool.end', id: 'a', tool: 'Bash', ms: 1, ok: true, turnId: 't0' }, 2)
  assert.equal(j.all()[0]!.turnId, 't1')
  assert.equal(j.all()[1]!.turnId, 't0')
  assert.equal(j.inTurn('t1').length, 1)
})

test('journal: summaries are cut', () => {
  const j = new Journal('s')
  j.push({ type: 'tool.start', id: 'a', tool: 'Bash', summary: 'x'.repeat(500) }, 1)
  assert.equal((j.all()[0] as { summary: string }).summary.length, 120)
})

test('journal: snapshot drops tool.start, restore keeps order and numbering', () => {
  const a = new Journal('s')
  a.push({ type: 'tool.start', id: 'a', tool: 'Bash', summary: 'ls' }, 1)
  a.push({ type: 'tool.end', id: 'a', tool: 'Bash', ms: 2, ok: true }, 2)
  const snap = a.snapshot()
  assert.deepEqual(snap.events.map(e => e.type), ['tool.end'])

  const b = new Journal('s')
  b.push({ type: 'prompt.submit', chars: 3 }, 3) // raced the restore
  assert.equal(b.restore(JSON.parse(JSON.stringify(snap)), 's'), true)
  assert.deepEqual(b.all().map(e => e.type), ['tool.end', 'prompt.submit'])
  assert.deepEqual(b.all().map(e => e.seq), [2, 3])
})

test('journal: restore refuses another session or garbage', () => {
  const j = new Journal('s')
  assert.equal(j.restore({ sessionId: 'other', seq: 1, events: [] }, 's'), false)
  assert.equal(j.restore('x', 's'), false)
  assert.equal(j.restore({ sessionId: 's', seq: 'x', events: [] }, 's'), false)
})

test('journal: shrink drops the oldest quarter, null when empty', () => {
  const j = new Journal('s')
  for (let i = 0; i < 8; i++) j.push({ type: 'prompt.submit', chars: i }, i)
  const s = Journal.shrink(j.snapshot())!
  assert.equal(s.events.length, 6)
  assert.equal(Journal.shrink({ sessionId: 's', seq: 0, events: [] }), null)
})

test('journal: a failing listener does not break the journal', () => {
  const j = new Journal('s')
  const seen: string[] = []
  j.subscribe(() => {
    throw new Error('boom')
  })
  j.subscribe(e => seen.push(e.type))
  j.push({ type: 'prompt.submit', chars: 1 }, 1)
  assert.deepEqual(seen, ['prompt.submit'])
})

// ---------------------------------------------------------------- store

test('store: fresh store gets the schema version', async () => {
  const h = new FakeHost()
  await new StoreBox(h).init()
  assert.equal(h.store.get('schema'), 1)
})

test('store: migrations run in order and are written back', async () => {
  const h = new FakeHost()
  h.store.set('schema', 1)
  h.store.set('prefs', { off: true })
  const box = new StoreBox(h, { 2: d => ({ ...d, prefs: { allOff: (d.prefs as { off: boolean }).off, modules: {} } }), 3: d => ({ ...d, extra: 1 }) }, 3)
  await box.init()
  assert.equal(h.store.get('schema'), 3)
  assert.deepEqual(h.store.get('prefs'), { allOff: true, modules: {} })
  assert.equal(h.store.get('extra'), 1)
})

test('store: a missing migration leaves the data and warns', async () => {
  const h = new FakeHost()
  h.store.set('schema', 1)
  const box = new StoreBox(h, {}, 2)
  await box.init()
  assert.equal(h.store.get('schema'), 1)
  assert.ok(box.warnings[0]!.includes('Migration'))
  assert.throws(() => runMigrations({}, 1, 2, {}))
})

test('store: a newer schema is left alone', async () => {
  const h = new FakeHost()
  h.store.set('schema', 9)
  const box = new StoreBox(h)
  await box.init()
  assert.equal(h.store.get('schema'), 9)
  assert.equal(box.warnings.length, 1)
})

test('store: budgets hold, shrink is used, oversize is refused', async () => {
  const h = new FakeHost()
  const box = new StoreBox(h)
  assert.equal(await box.set('prefs', { a: 'x'.repeat(BUDGETS.prefs) }), false)
  assert.equal(h.store.has('prefs'), false)
  const big = Array.from({ length: 4000 }, (_, i) => i)
  const ok = await box.set('prefs', big, v => (v.length > 1 ? v.slice(v.length / 2) : null))
  assert.equal(ok, true)
  assert.ok(jsonBytes(h.store.get('prefs')) <= BUDGETS.prefs)
  assert.equal(fit('x', 1), null)
})

test('store: total budget stays under 3 MiB of the engine\'s 4', () => {
  const sum = Object.values(BUDGETS).reduce((a, b) => a + b, 0)
  assert.ok(sum < 3 * 1024 * 1024, String(sum))
})

test('store: later() writes once per throttle window, with the latest value', async () => {
  const h = new FakeHost()
  const box = new StoreBox(h)
  let n = 0
  box.later('prefs', () => ({ n: ++n }))
  box.later('prefs', () => ({ n: ++n }))
  assert.equal(h.store.has('prefs'), false)
  await h.advance(THROTTLE_MS)
  assert.deepEqual(h.store.get('prefs'), { n: 1 })
  box.later('prefs', () => ({ n: 99 }))
  await box.flush()
  assert.deepEqual(h.store.get('prefs'), { n: 99 })
})

// ---------------------------------------------------------------- statusline

const slot = (id: string, order: number, priority: number, text: string): Slot => ({ id, order, priority, text })

test('statusline: ordered by position', () => {
  const s = layout([slot('b', 2, 1, 'B'), slot('a', 1, 1, 'A')], 80)
  assert.deepEqual(s.map(x => x.id), ['a', 'b'])
})

test('statusline: narrow lines drop whole slots, lowest priority first', () => {
  const slots = [slot('exo', 0, 100, '⛨ exo'), slot('tests', 1, 50, '● 48/48'), slot('hours', 2, 10, '⏱ 3:12 heute')]
  assert.deepEqual(layout(slots, 80).map(s => s.id), ['exo', 'tests', 'hours'])
  assert.deepEqual(layout(slots, 20).map(s => s.id), ['exo', 'tests'])
  assert.deepEqual(layout(slots, 8).map(s => s.id), ['exo'])
})

test('statusline: a single slot too wide is truncated, empty slots skipped', () => {
  const s = layout([slot('a', 0, 1, 'abcdefghij'), slot('b', 1, 0, '')], 5)
  assert.deepEqual(s.map(x => x.text), ['abcd…'])
})

test('cell width counts wide characters twice', () => {
  assert.equal(cellWidth('abc'), 3)
  assert.equal(cellWidth('⏱'), 1)
  assert.equal(cellWidth('🍺'), 2)
  assert.equal(cellWidth('日本'), 4)
  assert.equal(truncate('日本語', 4), '日…')
})

// ---------------------------------------------------------------- kill switch

test('kill switch: file, env and /exo off', () => {
  assert.equal(killReason({ env: undefined, fileExists: false, allOff: false }), null)
  assert.ok(killReason({ env: undefined, fileExists: true, allOff: false }))
  assert.ok(killReason({ env: '1', fileExists: false, allOff: false }))
  assert.equal(killReason({ env: '0', fileExists: false, allOff: false }), null)
  assert.equal(killReason({ env: 'false', fileExists: false, allOff: false }), null)
  assert.equal(killReason({ env: '', fileExists: false, allOff: false }), null)
  assert.ok(killReason({ env: undefined, fileExists: false, allOff: true }))
})

test('kill switch: the file is noticed within a second', async () => {
  const h = new FakeHost()
  let t = 0
  const k = new KillSwitch(() => t)
  assert.equal(await k.reason(h, '/home/u', false), null)
  h.files.set(disabledPath('/home/u'), '')
  assert.equal(await k.reason(h, '/home/u', false), null) // cached
  t = 1000
  assert.ok(await k.reason(h, '/home/u', false))
  assert.equal(disabledPath('/home/u/'), '/home/u/.claude/exo/DISABLED')
})

test('kill switch: a failing file check does not switch exo off', async () => {
  const h = new FakeHost()
  h.failExists = true
  assert.equal(await new KillSwitch().reason(h, '/home/u', false), null)
})
