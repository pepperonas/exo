/**
 * Line diff (Myers) for the change sidebar and the +/− counts, and a unified
 * diff `Code format="diff"` can draw. Pure.
 */

export type Op = { kind: ' ' | '-' | '+'; line: string; a: number; b: number }

/** Beyond this many lines a full diff is not worth it: counts by multiset. */
export const MAX_LINES = 20_000

const split = (t: string) => (t === '' ? [] : t.replace(/\n$/, '').split('\n'))

export function diffLines(before: string, after: string): Op[] {
  const a = split(before)
  const b = split(after)
  const n = a.length
  const m = b.length
  const max = n + m
  const v = new Int32Array(2 * max + 2)
  const trace: Int32Array[] = []
  let found = false
  for (let d = 0; d <= max && !found; d++) {
    trace.push(v.slice())
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[k - 1 + max]! < v[k + 1 + max]!) ? v[k + 1 + max]! : v[k - 1 + max]! + 1
      let y = x - k
      while (x < n && y < m && a[x] === b[y]) x++, y++
      v[k + max] = x
      if (x >= n && y >= m) {
        found = true
        break
      }
    }
  }
  const ops: Op[] = []
  let x = n
  let y = m
  for (let d = trace.length - 1; d >= 0 && (x > 0 || y > 0); d--) {
    const vd = trace[d]!
    const k = x - y
    const prevK = k === -d || (k !== d && vd[k - 1 + max]! < vd[k + 1 + max]!) ? k + 1 : k - 1
    const px = vd[prevK + max]!
    const py = px - prevK
    while (x > px && y > py) ops.push({ kind: ' ', line: a[--x]!, a: x, b: --y })
    if (d > 0) {
      if (x === px) ops.push({ kind: '+', line: b[--y]!, a: x, b: y })
      else ops.push({ kind: '-', line: a[--x]!, a: x, b: y })
    }
  }
  return ops.reverse()
}

export function counts(before: string, after: string): { added: number; removed: number } {
  const a = split(before)
  const b = split(after)
  if (a.length + b.length > MAX_LINES) {
    const bag = new Map<string, number>()
    for (const l of a) bag.set(l, (bag.get(l) ?? 0) + 1)
    let added = 0
    for (const l of b) {
      const c = bag.get(l) ?? 0
      if (c > 0) bag.set(l, c - 1)
      else added++
    }
    return { added, removed: [...bag.values()].reduce((s, c) => s + c, 0) }
  }
  let added = 0
  let removed = 0
  for (const o of diffLines(before, after)) {
    if (o.kind === '+') added++
    else if (o.kind === '-') removed++
  }
  return { added, removed }
}

/** Unified diff with `context` lines around each change; '' when equal. */
export function unified(path: string, before: string, after: string, context = 3): string {
  if (before === after) return ''
  const ops = diffLines(before, after)
  const changed = ops.map((o, i) => (o.kind !== ' ' ? i : -1)).filter(i => i >= 0)
  if (!changed.length) return ''
  const hunks: [number, number][] = []
  for (const i of changed) {
    const lo = Math.max(0, i - context)
    const hi = Math.min(ops.length - 1, i + context)
    const last = hunks[hunks.length - 1]
    if (last && lo <= last[1] + 1) last[1] = Math.max(last[1], hi)
    else hunks.push([lo, hi])
  }
  const out = [`--- a/${path}`, `+++ b/${path}`]
  for (const [lo, hi] of hunks) {
    const part = ops.slice(lo, hi + 1)
    const aStart = part.find(o => o.kind !== '+')?.a ?? part[0]!.a
    const bStart = part.find(o => o.kind !== '-')?.b ?? part[0]!.b
    const aLen = part.filter(o => o.kind !== '+').length
    const bLen = part.filter(o => o.kind !== '-').length
    out.push(`@@ -${aLen ? aStart + 1 : aStart},${aLen} +${bLen ? bStart + 1 : bStart},${bLen} @@`)
    for (const o of part) out.push(o.kind + o.line)
  }
  return out.join('\n') + '\n'
}
