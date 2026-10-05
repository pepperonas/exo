/**
 * #10 Recap and #16 Lessons, the pure part: the facts of a session from its
 * journal, the card, lesson candidates and their de-duplication against a
 * CLAUDE.md.
 */
import type { JournalEvent } from '../../core/journal/journal'
import { GAP_MS, hm, projectName } from './hours-logic'

export interface SessionFacts {
  sessionId: string
  project: string
  startedAt: number
  endedAt: number
  activeSec: number
  turns: number
  files: { path: string; added: number; removed: number }[]
  testsFirst?: { ok: boolean; green?: number; red?: number }
  testsLast?: { ok: boolean; green?: number; red?: number }
  costUsd?: number
}

export function facts(events: readonly JournalEvent[], sessionId: string, project: string, costUsd: number | null): SessionFacts {
  const at = events.map(e => e.at).filter(Boolean)
  const startedAt = at.length ? Math.min(...at) : 0
  const endedAt = at.length ? Math.max(...at) : 0
  let activeSec = 0
  const active = events.filter(e => e.type === 'prompt.submit' || e.type === 'tool.start' || e.type === 'tool.end' || e.type === 'turn.complete').map(e => e.at)
  for (let i = 1; i < active.length; i++) {
    const gap = active[i]! - active[i - 1]!
    if (gap > 0 && gap <= GAP_MS) activeSec += gap / 1000
  }
  const files = new Map<string, { added: number; removed: number }>()
  for (const e of events) if (e.type === 'file.changed') {
    const f = files.get(e.path) ?? { added: 0, removed: 0 }
    files.set(e.path, { added: f.added + e.added, removed: f.removed + e.removed })
  }
  const tests = events.filter(e => e.type === 'test.run' && e.phase === 'end') as Extract<JournalEvent, { type: 'test.run' }>[]
  const t = (e?: (typeof tests)[number]) => (e ? { ok: e.ok === true, green: e.green, red: e.red } : undefined)
  return {
    sessionId,
    project,
    startedAt,
    endedAt,
    activeSec,
    turns: events.filter(e => e.type === 'turn.complete').length,
    files: [...files].map(([path, c]) => ({ path, ...c })).sort((a, b) => a.path.localeCompare(b.path)),
    testsFirst: t(tests[0]),
    testsLast: t(tests[tests.length - 1]),
    costUsd: costUsd ?? undefined,
  }
}

const testText = (t?: SessionFacts['testsLast']) => (!t ? '–' : t.green !== undefined ? (t.ok ? `${t.green}/${t.green}` : `${t.red ?? '?'} red`) : t.ok ? 'green' : 'red')
const minutes = (ms: number) => `${Math.max(0, Math.round(ms / 60_000))} min`
const money = (usd: number) => `$${usd.toFixed(2)}`

function ago(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60_000))
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`
}

/** One line for the "Last session …" band. */
export function shortLine(f: SessionFacts, now: number): string {
  const parts = [minutes(f.endedAt - f.startedAt), `${f.turns} turns`, `${f.files.length} files`]
  if (f.testsLast) parts.push(`Tests ${testText(f.testsLast)}`)
  return `Last session in ${projectName(f.project)} (${ago(now - f.endedAt)}): ${parts.join(' · ')}`
}

export function card(f: SessionFacts, openPoints: string[] | null, date: string): string {
  const added = f.files.reduce((s, x) => s + x.added, 0)
  const removed = f.files.reduce((s, x) => s + x.removed, 0)
  const names = f.files.map(x => x.path.split('/').pop()).slice(0, 8)
  const lines = [
    `## Recap – ${projectName(f.project)} · ${date}`,
    '',
    `- Duration: ${minutes(f.endedAt - f.startedAt)} (active ${hm(f.activeSec)}) · ${f.turns} turns${f.costUsd !== undefined ? ` · cost ${money(f.costUsd)}` : ''}`,
    `- Files: ${f.files.length ? `${f.files.length} changed (+${added} −${removed}): ${names.join(', ')}${f.files.length > names.length ? ' …' : ''}` : 'none'}`,
    `- Tests: ${f.testsFirst ? `${testText(f.testsFirst)} → ${testText(f.testsLast)}` : 'no test run'}`,
  ]
  if (openPoints) lines.push(`- Open points: ${openPoints.length ? '' : 'none'}`, ...openPoints.map(p => `  - ${p}`))
  return lines.join('\n') + '\n'
}

export const OPEN_POINTS_SYSTEM = 'You summarise open points from a work log. Only what the text says, invent nothing.'
export function openPointsPrompt(answers: string[]): string {
  const text = answers.map((a, i) => `[${i + 1}] ${a.slice(0, 1500)}`).join('\n\n')
  return `Here are the latest answers of a coding assistant:\n\n${text}\n\nList at most 5 open points the assistant itself mentioned (unfinished steps, TODOs, open questions to the user). One point per line, starting with "- ". If there are none, answer only with "none".`
}

export function parsePoints(answer: string | null): string[] | null {
  if (answer === null) return null
  if (/^\s*(?:none|keine)\.?\s*$/i.test(answer)) return []
  return answer
    .split('\n')
    .map(l => l.replace(/^\s*[-*•]\s*/, '').trim())
    .filter(l => l && !/^(?:none|keine)\.?$/i.test(l))
    .slice(0, 5)
}

// ---------------------------------------------------------------- lessons

const LESSON = /\b(?:das war die ursache|die ursache war|ursache:|grundursache|falle|fallstrick|nie wieder|merke:|lehre:|wichtig zu wissen|gotcha|root cause|the cause was|lesson learned|never again|pitfall|important to know|the culprit was)\b/i

/**
 * A lesson as it may go into a CLAUDE.md, which future sessions read as
 * instructions: plain text only (no markup, no HTML, no backticks, one line).
 */
export function sanitizeLesson(s: string): string {
  return s
    .replace(/<[^>]*>/g, '')
    .replace(/[`*_~#>|[\]]/g, '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 400)
}

/** Sentences of an answer that read like a lesson. */
export function lessonCandidates(answer: string): string[] {
  const sentences = answer
    .replace(/```[\s\S]*?```/g, ' ')
    .split(/(?<=[.!?])\s+|\n+/)
    .map(s => s.replace(/^[\s>*#-]+/, '').replace(/\*\*/g, '').trim())
  return sentences.filter(s => s.length >= 25 && s.length <= 300 && LESSON.test(s)).map(sanitizeLesson)
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-zäöüß0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
const words = (s: string) => new Set(norm(s).split(' ').filter(w => w.length > 3))

/** True when the lesson is already in `existing` (substring or word overlap ≥ 0.6). */
export function isDuplicate(lesson: string, existing: string): boolean {
  const n = norm(lesson)
  if (!n) return true
  if (norm(existing).includes(n)) return true
  const w = words(lesson)
  for (const line of existing.split('\n')) {
    const lw = words(line)
    if (!lw.size || !w.size) continue
    let common = 0
    for (const x of w) if (lw.has(x)) common++
    if (common / Math.min(w.size, lw.size) >= 0.6) return true
  }
  return false
}

export const LESSONS_HEADING = '## Lessons (exo)'
/** The heading earlier versions wrote; still found, so a file never gets two. */
export const OLD_LESSONS_HEADING = '## Lehren (exo)'

/** The CLAUDE.md with the lessons appended under exo's heading (new or old). */
export function appendLessons(text: string | null, lessons: string[], date: string): string {
  const items = lessons.map(l => `- ${l} (${date})`).join('\n')
  if (text === null) return `# CLAUDE.md\n\n${LESSONS_HEADING}\n\n${items}\n`
  const heading = text.includes(LESSONS_HEADING) ? LESSONS_HEADING : text.includes(OLD_LESSONS_HEADING) ? OLD_LESSONS_HEADING : null
  if (!heading) return `${text.replace(/\n*$/, '\n')}\n${LESSONS_HEADING}\n\n${items}\n`
  const at = text.indexOf(heading) + heading.length
  const rest = text.slice(at)
  const nextHeading = rest.search(/\n## /)
  const end = nextHeading === -1 ? text.length : at + nextHeading
  return `${text.slice(0, end).replace(/\n*$/, '\n')}${items}\n${text.slice(end)}`
}

/**
 * A dialog option for a lesson: just its number. The full text stands in the
 * question, so what is ticked is what was read. (No commas: the dialog joins
 * several answers with them.)
 */
export const label = (_s: string, i: number) => String(i + 1)
