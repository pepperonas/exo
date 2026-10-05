/**
 * #17 Project time tracking, the pure part. Active time is the time between
 * two activities in the same project, as long as the gap is at most five
 * minutes; a longer gap is a break. Kept per day and project.
 */

export const GAP_MS = 5 * 60_000
export const KEEP_DAYS = 400

export interface Hours {
  /** `YYYY-MM-DD` (local) → project → active seconds. */
  days: Record<string, Record<string, number>>
  /** The last activity, to measure the next gap against. */
  last: { project: string; at: number } | null
}

export const emptyHours = (): Hours => ({ days: {}, last: null })

export function dayKey(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** One activity at `at` in `project`: adds the gap since the last one when short enough. */
export function record(h: Hours, project: string, at: number): Hours {
  const last = h.last
  const next: Hours = { days: h.days, last: { project, at } }
  if (!last || last.project !== project) return next
  const gap = at - last.at
  if (gap <= 0 || gap > GAP_MS) return next
  const key = dayKey(at)
  const day = { ...(h.days[key] ?? {}) }
  day[project] = (day[project] ?? 0) + gap / 1000
  return { days: { ...h.days, [key]: day }, last: next.last }
}

/** Drops days older than KEEP_DAYS. */
export function prune(h: Hours, now: number): Hours {
  const cutoff = dayKey(now - KEEP_DAYS * 86_400_000)
  return { ...h, days: Object.fromEntries(Object.entries(h.days).filter(([d]) => d >= cutoff)) }
}

/** Reads stored hours defensively. */
export function readHours(v: unknown): Hours {
  if (!v || typeof v !== 'object') return emptyHours()
  const o = v as Partial<Hours>
  const days: Hours['days'] = {}
  if (o.days && typeof o.days === 'object') {
    for (const [d, per] of Object.entries(o.days)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !per || typeof per !== 'object') continue
      const clean: Record<string, number> = {}
      for (const [p, s] of Object.entries(per)) if (typeof s === 'number' && Number.isFinite(s) && s >= 0) clean[p] = s
      days[d] = clean
    }
  }
  const last = o.last && typeof o.last.project === 'string' && typeof o.last.at === 'number' ? o.last : null
  return { days, last }
}

/** `3:07` from seconds. */
export function hm(seconds: number): string {
  const m = Math.floor(seconds / 60)
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
}

export const projectName = (p: string) => p.split('/').filter(Boolean).pop() ?? p

/** The seven days (Monday first) of the week containing `now`. */
export function weekDays(now: number): string[] {
  const d = new Date(now)
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => dayKey(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i).getTime()))
}

export function weekTable(h: Hours, now: number): string {
  const days = weekDays(now)
  const projects = [...new Set(days.flatMap(d => Object.keys(h.days[d] ?? {})))].sort()
  if (!projects.length) return `No time recorded this week (${days[0]} to ${days[6]}) yet.`
  const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const width = Math.max(8, ...projects.map(p => projectName(p).length))
  const pad = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length))
  const cell = (s: number) => pad(s ? hm(s) : '·', 6)
  const lines = [`Week ${days[0]} to ${days[6]}`, '', pad('Project', width + 2) + names.map(n => pad(n, 6)).join('') + 'Total']
  const total = Array<number>(7).fill(0)
  for (const p of projects) {
    let sum = 0
    const row = days.map((d, i) => {
      const s = h.days[d]?.[p] ?? 0
      sum += s
      total[i]! += s
      return cell(s)
    })
    lines.push(pad(projectName(p), width + 2) + row.join('') + hm(sum))
  }
  lines.push(pad('Total', width + 2) + total.map(cell).join('') + hm(total.reduce((a, b) => a + b, 0)))
  return lines.join('\n')
}

export function toCsv(h: Hours): string {
  const rows = ['date,project,seconds,hours']
  for (const d of Object.keys(h.days).sort()) for (const [p, s] of Object.entries(h.days[d]!).sort()) rows.push(`${d},${JSON.stringify(p)},${Math.round(s)},${(s / 3600).toFixed(2)}`)
  return rows.join('\n') + '\n'
}

export function toJson(h: Hours): string {
  const out: { date: string; project: string; seconds: number }[] = []
  for (const d of Object.keys(h.days).sort()) for (const [p, s] of Object.entries(h.days[d]!).sort()) out.push({ date: d, project: p, seconds: Math.round(s) })
  return JSON.stringify(out, null, 2) + '\n'
}
