/**
 * #6 "Done?" check: when an answer claims the work is done or working,
 * but the turn changed files and no green test or build ran after the last
 * change, a quiet line appears beneath the answer. At most once per turn,
 * and only when files changed (decided after phase 2).
 */
import type { Step } from '../../core/dispatcher/dispatcher'
import type { JournalEvent } from '../../core/journal/journal'

const CLAIM =
  /\b(?:fertig|erledigt|funktioniert|klappt(?: jetzt)?|läuft (?:jetzt|wieder)|behoben|alle tests (?:sind )?grün|tests (?:sind|laufen) grün|done|works|working now|fixed|passing|resolved|all set|should work now|all tests pass(?:ed)?|tests pass)\b/gi

export function claims(answer: string): string[] {
  return [...new Set([...answer.matchAll(CLAIM)].map(m => m[0].toLowerCase()))]
}

export type Verdict = 'checked' | 'unchecked' | 'nothing-changed'

/** Was there a green test or build run after the turn's last file change? */
export function verdict(events: readonly JournalEvent[], turnId: string): Verdict {
  const changes = events.filter(e => e.type === 'file.changed' && e.turnId === turnId)
  if (!changes.length) return 'nothing-changed'
  const after = changes[changes.length - 1]!.seq
  const green = events.some(e => e.seq > after && ((e.type === 'test.run' && e.phase === 'end' && e.ok === true) || (e.type === 'build.run' && e.ok)))
  return green ? 'checked' : 'unchecked'
}

export const WARNING = '⚠ No test ran in this turn.'

export function donecheckStep(): Step {
  return {
    id: 'doneCheck',
    turnComplete(env, t) {
      if (t.reason !== 'answer' || !claims(t.answer).length) return
      return verdict(env.journal.all(), t.turnId) === 'unchecked' ? WARNING : undefined
    },
  }
}
