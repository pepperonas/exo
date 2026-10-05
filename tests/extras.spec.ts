import { test } from 'node:test'
import assert from 'node:assert/strict'

import { emptyPrefs, resolveConfig } from '../core/config/config'
import type { ModuleEnv } from '../core/dispatcher/dispatcher'
import { Journal } from '../core/journal/journal'
import { cellWidth } from '../core/statusline/statusline'
import { StoreBox } from '../core/store/store'
import { RULES, count, dayStreak, due, freshAch, inQuiet, metrics, readAch } from '../modules/extras/achievements-logic'
import { achievementsCard, achievementsStep } from '../modules/extras/achievements'
import { COFFEE_AFTER_MS, FRAME_MS, PACKS, classify, frame, message } from '../modules/extras/cinema-logic'
import { cinemaState, cinemaStep, resetCinema, spinnerMessage } from '../modules/extras/cinema'
import { QUESTIONS, answer, buildPrompt, done, freshDuck } from '../modules/extras/duck-logic'
import { FakeHost } from './fake-host'

const P = '/work/proj'
function env(host: FakeHost, journal = new Journal('s1'), over: Partial<ModuleEnv> = {}): ModuleEnv {
  return { host, journal, config: resolveConfig({ quietHours: '' }, emptyPrefs()), store: new StoreBox(host), home: '/home/u', project: P, cwd: { cwd: P, known: true }, interactive: true, sessionId: journal.sessionId, ...over }
}
const at = (h: number, m = 0) => new Date(2026, 9, 5, h, m).getTime()

// ---------------------------------------------------------------- duck

test('duck: five questions, skip allowed, done after the fifth', () => {
  let s = freshDuck()
  s = answer(s, 'A list with 3 entries')
  s = answer(s, null)
  s = answer(s, 'TypeError: x is undefined')
  s = answer(s, '  ')
  assert.equal(done(s), false)
  s = answer(s, 'Yes, always at start-up')
  assert.equal(done(s), true)
  assert.equal(QUESTIONS.length, 5)
  const p = buildPrompt(s.answers)
  assert.ok(p.includes('Expected: A list with 3 entries'))
  assert.ok(!p.includes('Instead'))
  assert.ok(p.includes('```\nTypeError: x is undefined\n```'))
  assert.ok(!p.includes('Changed last'))
  assert.ok(p.includes('Reproducible: Yes, always at start-up'))
})

test('duck: the template is deterministic; all skipped still gives a prompt', () => {
  const a = ['a', 'b', 'c', 'd', 'e']
  assert.equal(buildPrompt(a), buildPrompt([...a]))
  assert.ok(buildPrompt([null, null, null, null, null]).includes('No details yet'))
})

// ---------------------------------------------------------------- achievements logic

function journalWith(push: (j: Journal) => void): Journal {
  const j = new Journal('s1')
  push(j)
  return j
}

test('counting: turns, green streak broken by a red test, night turns', () => {
  const j = journalWith(j => {
    for (let i = 0; i < 3; i++) j.push({ type: 'turn.complete', turnId: `t${i}`, ms: 1, claims: [], reason: 'answer' }, at(10))
    j.push({ type: 'test.run', source: 'claude', phase: 'end', ok: false }, at(10))
    j.push({ type: 'turn.complete', turnId: 'tr', ms: 1, claims: [], reason: 'answer' }, at(2))
    j.push({ type: 'turn.complete', turnId: 'tx', ms: 1, claims: [], reason: 'answer' }, at(11))
  })
  const s = count(freshAch('s1'), j.all())
  assert.equal(s.counters.turns, 5)
  assert.equal(s.counters.greenStreakMax, 3)
  assert.equal(s.streak, 1)
  assert.equal(s.counters.nightTurns, 1)
})

test('counting: each event once, even when counted again', () => {
  const j = journalWith(j => j.push({ type: 'turn.complete', turnId: 't', ms: 1, claims: [], reason: 'answer' }, at(10)))
  const once = count(freshAch('s1'), j.all())
  assert.equal(count(once, j.all()).counters.turns, 1)
  assert.equal(readAch(once, 's2').seenSeq, 0) // a new session counts its own journal
})

test('counting: early commit, guards, snapshots, CI recovery, duck', () => {
  const j = journalWith(j => {
    j.push({ type: 'tool.start', id: 'c', tool: 'Bash', summary: 'git commit' }, at(8, 30))
    j.push({ type: 'tool.end', id: 'c', tool: 'Bash', ms: 1, ok: true }, at(8, 30))
    j.push({ type: 'tool.end', id: 's', tool: 'Write', ms: 0, ok: false, denied: 'secrets' }, at(9))
    j.push({ type: 'tool.end', id: 'p', tool: 'Bash', ms: 0, ok: false, denied: 'prodShield' }, at(9))
    j.push({ type: 'snapshot', id: 'x', kind: 'rm' }, at(9))
    j.push({ type: 'ci.status', state: 'red' }, at(9))
    j.push({ type: 'ci.status', state: 'green' }, at(9))
    j.push({ type: 'duck' }, at(9))
    j.push({ type: 'file.changed', path: '/a', added: 0, removed: 250, via: 'Edit' }, at(9))
  })
  const c = count(freshAch('s1'), j.all()).counters
  for (const k of ['commitsBefore9', 'secretsStopped', 'prodCancelled', 'snapshots', 'ciRecovered', 'duckDone']) assert.equal(c[k], 1, k)
  assert.equal(c.removedSession, 250)
})

test('badges: data rules, thresholds, usage-bars only when present', () => {
  const s = freshAch()
  assert.deepEqual(due(s, { turns: 1 }, false).map(r => r.id), ['erster-schritt'])
  assert.deepEqual(due(s, { pacmanSessions: 1 }, false), [])
  assert.deepEqual(due(s, { pacmanSessions: 1 }, true).map(r => r.id), ['pacman'])
  assert.deepEqual(due({ ...s, unlocked: { 'erster-schritt': 1 } }, { turns: 9 }, false), [])
  assert.equal(new Set(RULES.map(r => r.id)).size, RULES.length)
  assert.ok(RULES.length >= 15)
  assert.deepEqual(metrics(s, { x: 2 }), { x: 2 })
})

test('quiet hours and day streaks', () => {
  assert.ok(inQuiet(23, { from: 22, to: 7 }) && inQuiet(3, { from: 22, to: 7 }))
  assert.ok(!inQuiet(12, { from: 22, to: 7 }))
  assert.ok(inQuiet(13, { from: 12, to: 14 }))
  assert.ok(!inQuiet(5, null))
  assert.equal(dayStreak(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05'], '2026-10-05'), 5)
  assert.equal(dayStreak(['2026-10-03', '2026-10-04'], '2026-10-05'), 2) // today not yet worked
  assert.equal(dayStreak(['2026-10-01'], '2026-10-05'), 0)
})

// ---------------------------------------------------------------- achievements module

test('one badge per turn, toast and sound, nothing in quiet hours', async () => {
  const host = new FakeHost()
  host.t = at(10)
  const j = journalWith(j => {
    j.push({ type: 'snapshot', id: 'x', kind: 'rm' }, at(10))
    j.push({ type: 'turn.complete', turnId: 't', ms: 1, claims: [], reason: 'answer' }, at(10))
  })
  const e = env(host, j, { config: resolveConfig({ sound: true, quietHours: '' }, emptyPrefs()) })
  const step = achievementsStep()
  await step.turnComplete!(e, { turnId: 't', answer: '', reason: 'answer' })
  assert.equal(host.toasts.length, 1)
  assert.ok(host.toasts[0]!.includes('Badge: First step'))
  assert.deepEqual(host.sounds, ['sounds/badge.wav'])
  await step.turnComplete!(e, { turnId: 't2', answer: '', reason: 'answer' })
  assert.ok(host.toasts[1]!.includes('Safety net'))
  const quiet = new FakeHost()
  quiet.t = at(23)
  await achievementsStep().turnComplete!(env(quiet, j, { config: resolveConfig({ sound: true, quietHours: '22-07' }, emptyPrefs()) }), { turnId: 't', answer: '', reason: 'answer' })
  assert.equal(quiet.toasts.length, 0)
  assert.equal(quiet.sounds.length, 0)
  assert.ok((quiet.store.get('achievements') as { unlocked: Record<string, number> }).unlocked['erster-schritt'])
})

test('session judgements: context and the 5-hour window over a long session', async () => {
  const host = new FakeHost()
  host.usageNow = { contextPercent: 40, fiveHour: 70 }
  host.usageBarsLoaded = true
  const j = new Journal('s1')
  const e = env(host, j)
  const step = achievementsStep()
  await step.start!(e)
  for (let i = 0; i < 10; i++) {
    j.push({ type: 'turn.complete', turnId: `t${i}`, ms: 1, claims: [], reason: 'answer' }, at(10))
    await step.turnComplete!(e, { turnId: `t${i}`, answer: '', reason: 'answer' })
  }
  await step.end!(e, 'other')
  const c = (host.store.get('achievements') as { counters: Record<string, number> }).counters
  assert.equal(c.contextLowSessions, 1)
  assert.equal(c.pacmanSessions, 1)
})

test('the card: aligned, ASCII without emoji', async () => {
  const host = new FakeHost()
  const j = journalWith(j => j.push({ type: 'turn.complete', turnId: 't', ms: 1, claims: [], reason: 'answer' }, at(10)))
  const e = env(host, j)
  await achievementsStep().turnComplete!(e, { turnId: 't', answer: '', reason: 'answer' })
  const card = await achievementsCard(e, false)
  const widths = card.split('\n').map(cellWidth)
  assert.equal(new Set(widths).size, 1, card)
  assert.ok(card.includes('exo · Achievements 1/14'))
  assert.ok(card.includes('1/14')) // pac-man hidden without usage-bars
  const ascii = await achievementsCard(e, true)
  assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(ascii))
  assert.ok(ascii.includes('[*] First step'))
})

// ---------------------------------------------------------------- cinema

test('cinema: activity from the running tool, coffee after a minute', () => {
  const run = (summary: string, tool = 'Bash') => ({ tool, summary, since: 0 })
  assert.equal(classify(run('npm install'), 0), 'install')
  assert.equal(classify(run('cargo build'), 0), 'build')
  assert.equal(classify(run('rsync'), 0), 'deploy')
  assert.equal(classify(run('ssh:systemctl restart'), 0), 'deploy')
  assert.equal(classify(run('rg'), 0), 'search')
  assert.equal(classify(run('', 'Grep'), 0), 'search')
  assert.equal(classify(run('npm test'), 0), 'test')
  assert.equal(classify(run('ls'), 0), null)
  assert.equal(classify(null, COFFEE_AFTER_MS - 1), null)
  assert.equal(classify(null, COFFEE_AFTER_MS), 'coffee')
})

test('cinema: frames by time, still with reduced motion, ASCII without emoji, cut to width', () => {
  assert.notEqual(frame(PACKS.classic, 'deploy', 0, false), frame(PACKS.classic, 'deploy', FRAME_MS, false))
  assert.equal(frame(PACKS.classic, 'deploy', 5 * FRAME_MS, true), PACKS.classic.deploy[0])
  const m = message('install', { tool: 'Bash', summary: 'npm install', since: 0 }, 12_500, 0, { ascii: true, still: false, columns: 80 })
  assert.ok(m.endsWith('installs: npm install · 12s'), m)
  assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(m))
  assert.ok(message('install', { tool: 'Bash', summary: 'x'.repeat(200), since: 0 }, 0, 0, { ascii: false, still: false, columns: 60 }).length <= 30)
})

test('cinema: the fast redraw runs only while a film runs', async () => {
  resetCinema()
  const host = new FakeHost()
  const j = new Journal('s1')
  await cinemaStep().start!(env(host, j))
  j.push({ type: 'turn.start', turnId: 't' }, host.t)
  assert.equal(cinemaState().fast, undefined)
  j.push({ type: 'tool.start', id: 'a', tool: 'Bash', summary: 'npm install' }, host.t)
  assert.ok(cinemaState().fast)
  assert.ok(spinnerMessage(host.t + 1000, 80)!.includes('npm install'))
  await host.advance(100)
  assert.ok(host.redraws >= 2)
  j.push({ type: 'tool.end', id: 'a', tool: 'Bash', ms: 1, ok: true }, host.t)
  assert.equal(cinemaState().fast, undefined)
  assert.equal(spinnerMessage(host.t, 80), null)
  j.push({ type: 'turn.complete', turnId: 't', ms: 1, claims: [], reason: 'answer' }, host.t)
  assert.equal(cinemaState().watch, undefined)
})

test('cinema: reduced motion keeps the film still and starts no fast timer', async () => {
  resetCinema()
  const host = new FakeHost()
  const j = new Journal('s1')
  await cinemaStep().start!(env(host, j, { config: resolveConfig({ reducedMotion: true }, emptyPrefs()) }))
  j.push({ type: 'turn.start', turnId: 't' }, host.t)
  j.push({ type: 'tool.start', id: 'a', tool: 'Bash', summary: 'rsync' }, host.t)
  assert.equal(cinemaState().fast, undefined)
  assert.ok(spinnerMessage(host.t + 5 * FRAME_MS, 80)!.startsWith(PACKS.classic.deploy[0]!))
})
