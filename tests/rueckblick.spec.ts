import { test } from 'node:test'
import assert from 'node:assert/strict'

import { emptyPrefs, resolveConfig } from '../core/config/config'
import type { ModuleEnv } from '../core/dispatcher/dispatcher'
import { Journal } from '../core/journal/journal'
import { StoreBox } from '../core/store/store'
import { GAP_MS, dayKey, emptyHours, hm, prune, readHours, record, toCsv, toJson, weekDays, weekTable } from '../modules/rueckblick/hours-logic'
import { hoursCommand, hoursState, hoursStep, resetHours } from '../modules/rueckblick/hours'
import { LESSONS_HEADING, appendLessons, card, facts, isDuplicate, label, lessonCandidates, parsePoints, shortLine } from '../modules/rueckblick/recap-logic'
import { BANNER, WEEK_MS, lessonsStep, recapCommand, recapStep } from '../modules/rueckblick/recap'
import { FakeHost } from './fake-host'

const P = '/work/proj'
const T0 = new Date(2026, 9, 5, 10, 0, 0).getTime() // a Monday, 10:00 local
const MIN = 60_000

function env(host: FakeHost, journal = new Journal('sess-2'), over: Partial<ModuleEnv> = {}): ModuleEnv {
  // the project exists (writes are checked against its real path)
  if (![...host.files.keys()].some(k => k.startsWith(P + '/'))) host.files.set(`${P}/package.json`, '{}')
  return { host, journal, config: resolveConfig({}, emptyPrefs()), store: new StoreBox(host), home: '/home/u', project: P, cwd: { cwd: P, known: true }, interactive: true, sessionId: journal.sessionId, ...over }
}

// ---------------------------------------------------------------- hours

test('hours: gaps up to five minutes count, longer ones are breaks', () => {
  let h = emptyHours()
  h = record(h, P, T0)
  h = record(h, P, T0 + 4 * MIN)
  h = record(h, P, T0 + 9 * MIN) // 5 min: still counts
  h = record(h, P, T0 + 9 * MIN + GAP_MS + 1) // a break
  h = record(h, P, T0 + 30 * MIN)
  assert.equal(h.days[dayKey(T0)]![P], 9 * 60)
})

test('hours: switching project gives no credit, each project counts on its own', () => {
  let h = emptyHours()
  h = record(h, P, T0)
  h = record(h, '/other', T0 + MIN)
  h = record(h, '/other', T0 + 3 * MIN)
  assert.equal(h.days[dayKey(T0)]![P], undefined)
  assert.equal(h.days[dayKey(T0)]!['/other'], 120)
})

test('hours: prune, defensive read, format', () => {
  const h = { days: { '2020-01-01': { [P]: 100 }, [dayKey(T0)]: { [P]: 50 } }, last: null }
  assert.deepEqual(Object.keys(prune(h, T0).days), [dayKey(T0)])
  assert.deepEqual(readHours({ days: { kaputt: {}, '2026-10-05': { a: 5, b: -1, c: 'x' } }, last: { project: 1 } }), { days: { '2026-10-05': { a: 5 } }, last: null })
  assert.deepEqual(readHours('müll'), emptyHours())
  assert.equal(hm(3 * 3600 + 7 * 60 + 59), '3:07')
})

test('hours: week table Monday to Sunday, exports', () => {
  const days = weekDays(T0 + 3 * 86_400_000)
  assert.equal(days[0], dayKey(T0))
  assert.equal(days.length, 7)
  const h = { days: { [dayKey(T0)]: { [P]: 3600 }, [days[2]!]: { [P]: 1800, '/x/other': 600 } }, last: null }
  const t = weekTable(h, T0)
  assert.ok(t.includes('proj') && t.includes('1:30') && t.includes('Summe'))
  assert.ok(toCsv(h).startsWith('date,project,seconds,hours\n'))
  assert.equal(JSON.parse(toJson(h)).length, 3)
  assert.ok(weekTable(emptyHours(), T0).includes('noch keine'))
})

test('hours module: journal activity counts, today in the hint line, export', async () => {
  resetHours()
  const host = new FakeHost()
  host.t = T0
  const e = env(host)
  await hoursStep().start!(e)
  e.journal.push({ type: 'prompt.submit', chars: 1 }, T0)
  e.journal.push({ type: 'tool.end', id: 'a', tool: 'Bash', ms: 1, ok: true }, T0 + 3 * MIN)
  await new Promise(r => setImmediate(r))
  assert.equal(host.slots.hours!.text, '⏱ 0:03 heute')
  assert.equal(hoursState().hours.days[dayKey(T0)]![P], 180)
  const msg = await hoursCommand(e, 'export csv')
  assert.ok(msg.includes('/home/u/.claude/exo/hours-'))
  assert.ok([...host.files.values()].some(v => v.includes(',180,')))
  assert.ok((await hoursCommand(e, '')).includes('0:03'))
})

// ---------------------------------------------------------------- facts and card

function sessionJournal(): Journal {
  const j = new Journal('sess-1')
  j.push({ type: 'prompt.submit', chars: 10 }, T0)
  // in a real session every change and test run sits next to its tool call
  for (let m = 1; m <= 5; m++) j.push({ type: 'tool.end', id: `u${m}`, tool: 'Bash', ms: 1, ok: true }, T0 + m * MIN)
  j.push({ type: 'test.run', source: 'claude', phase: 'end', ok: false, green: 46, red: 2 }, T0 + MIN)
  j.push({ type: 'file.changed', path: `${P}/a.ts`, added: 3, removed: 1, via: 'Edit' }, T0 + 2 * MIN)
  j.push({ type: 'file.changed', path: `${P}/a.ts`, added: 1, removed: 0, via: 'Edit' }, T0 + 3 * MIN)
  j.push({ type: 'file.changed', path: `${P}/b.ts`, added: 5, removed: 0, via: 'Write' }, T0 + 4 * MIN)
  j.push({ type: 'test.run', source: 'testlight', phase: 'end', ok: true, green: 48, red: 0 }, T0 + 5 * MIN)
  j.push({ type: 'turn.complete', turnId: 't1', ms: 1, claims: [], reason: 'answer' }, T0 + 6 * MIN)
  j.push({ type: 'turn.complete', turnId: 't2', ms: 1, claims: [], reason: 'answer' }, T0 + 47 * MIN)
  return j
}

test('facts: duration, turns, files merged per path, tests first and last', () => {
  const f = facts(sessionJournal().all(), 'sess-1', P, 1.234)
  assert.equal(f.endedAt - f.startedAt, 47 * MIN)
  assert.equal(f.turns, 2)
  assert.deepEqual(f.files, [
    { path: `${P}/a.ts`, added: 4, removed: 1 },
    { path: `${P}/b.ts`, added: 5, removed: 0 },
  ])
  assert.deepEqual(f.testsFirst, { ok: false, green: 46, red: 2 })
  assert.deepEqual(f.testsLast, { ok: true, green: 48, red: 0 })
  assert.equal(f.activeSec, 6 * 60) // the 41-minute gap is a break
})

test('card and short line', () => {
  const f = facts(sessionJournal().all(), 'sess-1', P, 1.234)
  const c = card(f, ['README ergänzen'], '2026-10-05')
  assert.ok(c.includes('## Rückblick – proj · 2026-10-05'))
  assert.ok(c.includes('47 min (aktiv 0:06) · 2 Turns · Kosten 1,23 $'))
  assert.ok(c.includes('2 geändert (+9 −1): a.ts, b.ts'))
  assert.ok(c.includes('Tests: 2 rot → 48/48'))
  assert.ok(c.includes('  - README ergänzen'))
  assert.equal(shortLine(f, f.endedAt + 2 * 3600_000), 'Letzte Sitzung in proj (vor 2 h): 47 min · 2 Turns · 2 Dateien · Tests 48/48')
})

test('open points: parsed, "keine", no answer', () => {
  assert.deepEqual(parsePoints('- a\n* b\nkeine'), ['a', 'b'])
  assert.deepEqual(parsePoints('Keine.'), [])
  assert.equal(parsePoints(null), null)
})

// ---------------------------------------------------------------- lessons

test('lesson candidates: marked sentences, no code', () => {
  const a = 'Ich habe es repariert. Das war die Ursache: der Cache wurde vor dem Schreiben gelesen. ```\nfalle im code\n``` Nie wieder ohne Test deployen, das kostet Stunden.'
  assert.deepEqual(lessonCandidates(a), ['Das war die Ursache: der Cache wurde vor dem Schreiben gelesen.', 'Nie wieder ohne Test deployen, das kostet Stunden.'])
  assert.deepEqual(lessonCandidates('Alles erledigt.'), [])
  // a lesson-like line inside a code block is code, not a lesson
  assert.deepEqual(lessonCandidates('Siehe:\n```ts\n// Falle: dieser Kommentar steht im Code und ist keine Lehre\n```\nfertig.'), [])
})

test('duplicates against an existing CLAUDE.md', () => {
  const md = '## Lehren\n- Nie nginx ändern, während certbot läuft.\n'
  assert.ok(isDuplicate('Nie nginx ändern, während certbot läuft!', md))
  assert.ok(isDuplicate('Falle: nginx ändern während certbot läuft', md))
  assert.ok(!isDuplicate('Die Ursache war ein fehlender Index auf der Tabelle orders.', md))
})

test('appending: new file, new heading, existing heading before the next section', () => {
  assert.equal(appendLessons(null, ['A'], 'D'), `# CLAUDE.md\n\n${LESSONS_HEADING}\n\n- A (D)\n`)
  assert.equal(appendLessons('# X\n', ['A'], 'D'), `# X\n\n${LESSONS_HEADING}\n\n- A (D)\n`)
  const t = `# X\n\n${LESSONS_HEADING}\n\n- alt\n\n## Andere\ninhalt\n`
  assert.equal(appendLessons(t, ['neu'], 'D'), `# X\n\n${LESSONS_HEADING}\n\n- alt\n- neu (D)\n\n## Andere\ninhalt\n`)
})

test('dialog labels are numbers (the text stands in the question)', () => {
  assert.equal(label('a, b, c', 0), '1')
  assert.equal(label('x'.repeat(200), 1), '2')
})

// ---------------------------------------------------------------- recap module

test('session end stores the facts; next start in the project shows the band once', async () => {
  const host = new FakeHost()
  const j1 = sessionJournal()
  await recapStep().end!(env(host, j1), 'prompt_input_exit')
  assert.equal((host.store.get('sessions') as unknown[]).length, 1)
  host.t = T0 + 47 * MIN + 3600_000
  const e2 = env(host, new Journal('sess-2'))
  await recapStep().start!(e2)
  assert.ok(host.banners[0]!.text.startsWith('Letzte Sitzung in proj'))
  host.banners = []
  await recapStep().start!(e2)
  assert.equal(host.banners.length, 0) // once
})

test('band: not for the same session, not after seven days, not for an empty session', async () => {
  const host = new FakeHost()
  await recapStep().end!(env(host, sessionJournal()), 'other')
  host.t = T0 + 47 * MIN + 60_000
  await recapStep().start!(env(host, new Journal('sess-1')))
  assert.equal(host.banners.length, 0)
  host.t = T0 + 47 * MIN + WEEK_MS + 1
  await recapStep().start!(env(host, new Journal('sess-3')))
  assert.equal(host.banners.length, 0)
  const h2 = new FakeHost()
  await recapStep().end!(env(h2, new Journal('leer')), 'other')
  assert.equal(h2.store.has('sessions'), false)
  void BANNER
})

test('/recap: card with open points from the small model; md and copy', async () => {
  const host = new FakeHost()
  host.t = T0 + 50 * MIN
  host.cost = 0.5
  host.history = [
    { role: 'user', text: 'mach' },
    { role: 'assistant', text: 'Erledigt bis auf die README.' },
  ]
  host.completeAnswer = '- README ergänzen'
  const e = env(host, sessionJournal())
  const t = await recapCommand(e, 'md', false)
  assert.ok(t.includes('README ergänzen'))
  assert.ok(t.includes('Kosten 0,50 $'))
  assert.ok(host.completions[0]!.includes('Erledigt bis auf die README.'))
  assert.ok([...host.files.keys()].some(k => k.startsWith(`${P}/.exo/recap-`)))
  await recapCommand(e, 'copy', false)
  assert.ok(host.copied[0]!.includes('## Rückblick'))
  host.completeAnswer = null
  assert.ok((await recapCommand(e, '', false)).includes('nicht rechtzeitig'))
})

test('lessons: collected from answers, offered, written only when ticked', async () => {
  const host = new FakeHost()
  host.files.set(`${P}/CLAUDE.md`, '# Projekt\n\n- Nie nginx ändern, während certbot läuft.\n')
  const e = env(host, sessionJournal())
  const step = lessonsStep()
  await step.turnComplete!(e, { turnId: 't1', answer: 'Das war die Ursache: der Cache wurde vor dem Schreiben gelesen. Falle: nginx ändern während certbot läuft.', reason: 'answer' })
  host.manyAnswers = [[]]
  assert.ok((await recapCommand(e, '', true)).includes('nichts übernommen'))
  assert.equal(host.files.get(`${P}/CLAUDE.md`)!.includes('Lehren (exo)'), false)
  const offered = host.asked[host.asked.length - 1]!.options
  assert.equal(offered.length, 1) // the certbot one is already in the file
  host.manyAnswers = [[offered[0]!]]
  assert.ok((await recapCommand(e, '', true)).includes('1 in'))
  const md = host.files.get(`${P}/CLAUDE.md`)!
  assert.ok(md.includes(LESSONS_HEADING) && md.includes('der Cache wurde vor dem Schreiben gelesen'))
  const before = host.asked.length
  await recapCommand(e, '', true)
  assert.equal(host.asked.length, before) // nothing left to offer
})

test('lessons: Esc writes nothing; lessons off offers nothing', async () => {
  const host = new FakeHost()
  const e = env(host, sessionJournal())
  await lessonsStep().turnComplete!(e, { turnId: 't1', answer: 'Die Ursache war ein fehlender Index auf der Tabelle orders.', reason: 'answer' })
  await recapCommand(e, '', true)
  assert.equal(host.files.has(`${P}/CLAUDE.md`), false)
  const n = host.asked.length
  await recapCommand(e, '', false)
  assert.equal(host.asked.length, n)
})

// ---- review: lessons are persisted instructions; writes must stay in the project
test('review: the dialog shows each lesson in full, sanitized, and exactly that is written', async () => {
  const host = new FakeHost()
  const e = env(host, sessionJournal())
  const long = 'Die Ursache war, dass `rm -rf` <b>ohne</b> Prüfung lief und **danach** die Datei fehlte, ' + 'x'.repeat(120) + ' Ende.'
  await lessonsStep().turnComplete!(e, { turnId: 't1', answer: long, reason: 'answer' })
  host.manyAnswers = [['1']]
  await recapCommand(e, '', true)
  const q = host.asked[host.asked.length - 1]!
  assert.ok(q.question.includes('Ende.'), 'full text in the question')
  assert.ok(!q.question.includes('<b>') && !q.question.includes('`') && !q.question.includes('**'))
  const md = host.files.get(`${P}/CLAUDE.md`)!
  assert.ok(md.includes('Ende.'))
  assert.ok(!md.includes('<b>') && !md.includes('`'))
})

test('review: no write through a symlink out of the project', async () => {
  const host = new FakeHost()
  host.files.set(`${P}/CLAUDE.md`, '# x\n')
  host.links.set(`${P}/CLAUDE.md`, '/home/u/.bashrc')
  const e = env(host, sessionJournal())
  await lessonsStep().turnComplete!(e, { turnId: 't1', answer: 'Die Ursache war ein fehlender Index auf der Tabelle orders.', reason: 'answer' })
  host.manyAnswers = [['1']]
  const t = await recapCommand(e, '', true)
  assert.ok(t.includes('nicht im Projekt'), t)
  assert.equal(host.files.get('/home/u/.bashrc'), undefined)
  host.links.set(`${P}/.exo`, '/etc')
  host.files.set(`${P}/.exo/x`, '')
  assert.ok((await recapCommand(e, 'md', false)).includes('nicht im Projekt'))
})
