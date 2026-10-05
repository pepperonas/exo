import { test } from 'node:test'
import assert from 'node:assert/strict'

import { emptyPrefs, resolveConfig } from '../core/config/config'
import { dispatch } from '../core/dispatcher/dispatcher'
import type { DispatchDeps, ToolResult } from '../core/dispatcher/dispatcher'
import { Health } from '../core/health/health'
import { Journal } from '../core/journal/journal'
import { HEAD_LINES, capTail, decide, needsCount, note, tokens } from '../modules/waechter/diet-logic'
import { dietStep } from '../modules/waechter/diet'
import { FakeHost } from './fake-host'

const base = { hasRange: false, size: 1000, lines: 10, maxKb: 256, maxLines: 2000, justCut: false }

test('decide: big, long, generated; ranges, repeats and special files pass', () => {
  assert.equal(decide({ ...base, path: '/a.ts', size: 300 * 1024, lines: 5000 }), 'gross')
  assert.equal(decide({ ...base, path: '/a.ts', size: 100_000, lines: 2500 }), 'lang')
  assert.equal(decide({ ...base, path: '/package-lock.json', size: 900_000, lines: 30_000 }), 'generiert')
  assert.equal(decide({ ...base, path: '/app.min.js', size: 50_000, lines: 300 }), 'generiert')
  assert.equal(decide({ ...base, path: '/x.log', size: 50_000, lines: 5000 }), 'generiert')
  assert.equal(decide({ ...base, path: '/yarn.lock', size: 2000, lines: 40 }), null) // short: whole
  assert.equal(decide({ ...base, path: '/a.ts', size: 300 * 1024, lines: 50 }), null) // one huge line block: Read cuts itself
  assert.equal(decide({ ...base, path: '/a.ts', size: 300 * 1024, lines: 5000, hasRange: true }), null)
  assert.equal(decide({ ...base, path: '/a.ts', size: 300 * 1024, lines: 5000, justCut: true }), null)
  assert.equal(decide({ ...base, path: '/scan.pdf', size: 9_000_000, lines: null }), null)
  assert.equal(decide({ ...base, path: '/a.ts', size: 1000, lines: null }), null)
})

test('lines are only counted where it matters', () => {
  assert.equal(needsCount('/a.ts', 100), false)
  assert.equal(needsCount('/a.ts', 50_000), true)
  assert.equal(needsCount('/yarn.lock', 100), true)
  assert.equal(needsCount('/p.png', 9_000_000), false)
})

test('note: what was shown, what was saved, the tail', () => {
  const n = note('/big.ts', 'lang', 5000, 400_000, 20_000, 'last line')
  assert.ok(n.includes('5000 lines long'))
  assert.ok(n.includes(`lines 1–${HEAD_LINES} of 5000`))
  assert.ok(n.includes('from line 4921'))
  assert.ok(n.includes(tokens(380_000).toLocaleString('en-US')))
  assert.ok(n.endsWith('last line'))
})

test('tail cap cuts at a line start', () => {
  const t = Array.from({ length: 5000 }, (_, i) => `line ${i}`).join('\n')
  const c = capTail(t, 100)
  assert.ok(c.startsWith('…\nline '))
  assert.ok(c.length <= 103)
})

function deps(host: FakeHost): DispatchDeps {
  return {
    host,
    config: resolveConfig({}, emptyPrefs()),
    rules: [],
    journal: new Journal('s'),
    health: new Health(),
    steps: [dietStep()],
    interactive: true,
    killed: async () => null,
    home: '/home/u',
  }
}

test('a big Read is cut to the head, the tail comes as context; the next Read of it passes', async () => {
  const host = new FakeHost()
  host.files.set('/p/big.ts', 'x'.repeat(300 * 1024))
  host.runResult = argv => ({ exitCode: 0, stdout: argv[0] === 'wc' ? '  5000 /p/big.ts\n' : 'tail line 1\ntail line 2\n', stderr: '' })
  const seen: Record<string, unknown>[] = []
  const read = async (input: Record<string, unknown>): Promise<ToolResult> => (seen.push(input), { result: {}, text: 'head…' })
  const d = deps(host)
  const r = await dispatch(d, { tool: 'Read', input: { file_path: '/p/big.ts' } }, read)
  assert.equal(seen[0]!.limit, HEAD_LINES)
  assert.ok(r.context?.[0]?.includes('tail line 2'))
  assert.ok(r.context?.[0]?.includes('offset/limit'))
  await dispatch(d, { tool: 'Read', input: { file_path: '/p/big.ts' } }, read)
  assert.equal(seen[1]!.limit, undefined) // second Read straight after: whole
  await dispatch(d, { tool: 'Read', input: { file_path: '/p/big.ts' } }, read)
  assert.equal(seen[2]!.limit, HEAD_LINES) // the loop guard holds for one Read only
})

test('a Read with a range, a small file or a missing file is left alone', async () => {
  const host = new FakeHost()
  host.files.set('/p/big.ts', 'x'.repeat(300 * 1024))
  host.files.set('/p/small.ts', 'a\nb\n')
  const seen: Record<string, unknown>[] = []
  const read = async (input: Record<string, unknown>): Promise<ToolResult> => (seen.push(input), { result: {} })
  const d = deps(host)
  await dispatch(d, { tool: 'Read', input: { file_path: '/p/big.ts', offset: 10, limit: 20 } }, read)
  await dispatch(d, { tool: 'Read', input: { file_path: '/p/small.ts' } }, read)
  const r = await dispatch(d, { tool: 'Read', input: { file_path: '/p/nope.ts' } }, read)
  assert.deepEqual(seen.map(s => s.limit), [20, undefined, undefined])
  assert.equal(r.context, undefined)
})

test('an error result gets no diet note', async () => {
  const host = new FakeHost()
  host.files.set('/p/big.ts', 'x'.repeat(300 * 1024))
  host.runResult = () => ({ exitCode: 0, stdout: '5000 /p/big.ts', stderr: '' })
  const r = await dispatch(deps(host), { tool: 'Read', input: { file_path: '/p/big.ts' } }, async () => ({ isError: true, text: 'EACCES' }))
  assert.equal(r.context, undefined)
})
