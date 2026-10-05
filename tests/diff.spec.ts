import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { counts, diffLines, unified } from '../core/diff'

/** Applies ops to `before`: must give `after` back. */
function apply(ops: ReturnType<typeof diffLines>): string[] {
  return ops.filter(o => o.kind !== '-').map(o => o.line)
}

const CASES: [string, string][] = [
  ['', ''],
  ['', 'a\n'],
  ['a\n', ''],
  ['a\nb\nc\n', 'a\nb\nc\n'],
  ['a\nb\nc\n', 'a\nx\nc\n'],
  ['a\nb\nc\nd\ne\n', 'b\nc\nd\ne\nf\n'],
  ['x\ny\n', 'y\nx\n'],
  ['1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n', '1\n2\n3\nX\n5\n6\n7\n8\nY\n10\n'],
]

for (const [a, b] of CASES) {
  test(`diff reproduces the target: ${JSON.stringify(a)} → ${JSON.stringify(b)}`, () => {
    assert.deepEqual(apply(diffLines(a, b)), b.replace(/\n$/, '').split('\n').filter((_, i, arr) => !(arr.length === 1 && arr[0] === '')))
  })
}

test('counts', () => {
  assert.deepEqual(counts('a\nb\nc\n', 'a\nx\nc\nd\n'), { added: 2, removed: 1 })
  assert.deepEqual(counts('', 'a\nb\n'), { added: 2, removed: 0 })
  assert.deepEqual(counts('a\n', 'a\n'), { added: 0, removed: 0 })
})

test('counts on very long files fall back to a multiset', () => {
  const a = Array.from({ length: 15_000 }, (_, i) => `l${i}`).join('\n')
  const b = a + '\nnew'
  assert.deepEqual(counts(a, b), { added: 1, removed: 0 })
})

test('unified diff applies with patch (real tool as referee)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'exo-diff-'))
  try {
    for (const [a, b] of CASES.filter(([x, y]) => x !== y)) {
      writeFileSync(join(dir, 'f.txt'), a)
      const d = unified('f.txt', a, b)
      writeFileSync(join(dir, 'p.diff'), d)
      const r = spawnSync('patch', ['-s', '-p1', '-i', 'p.diff'], { cwd: dir, encoding: 'utf8' })
      assert.equal(r.status, 0, `${JSON.stringify(a)}→${JSON.stringify(b)}\n${d}\n${r.stderr}${r.stdout}`)
      const got = spawnSync('cat', ['f.txt'], { cwd: dir, encoding: 'utf8' }).stdout
      assert.equal(got, b)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('unified diff: equal is empty, hunks merge when close', () => {
  assert.equal(unified('f', 'a\n', 'a\n'), '')
  const d = unified('f', '1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n', '1\n2\n3\nX\n5\n6\n7\n8\nY\n10\n')
  assert.equal((d.match(/^@@/gm) ?? []).length, 1)
  const far = unified('f', Array.from({ length: 30 }, (_, i) => `${i}`).join('\n') + '\n', Array.from({ length: 30 }, (_, i) => (i === 2 || i === 25 ? 'X' : `${i}`)).join('\n') + '\n')
  assert.equal((far.match(/^@@/gm) ?? []).length, 2)
})
