/**
 * #20 Gummi-Ente, the pure part: five questions and a fixed template for the
 * prompt built from the answers. No model call.
 */

export const QUESTIONS = [
  'Was erwartest du?',
  'Was passiert stattdessen?',
  'Gibt es eine Fehlermeldung? (gern wörtlich)',
  'Was hast du zuletzt geändert?',
  'Ist es reproduzierbar – und wie?',
] as const

export const DUCK = [' __', '<(o )___', ' ( ._> /', "  `---'"]

export interface DuckState {
  step: number
  /** One per question; null when skipped. */
  answers: (string | null)[]
}

export const freshDuck = (): DuckState => ({ step: 0, answers: [] })

export function answer(s: DuckState, value: string | null): DuckState {
  const v = value === null ? null : value.trim() || null
  const answers = [...s.answers]
  answers[s.step] = v
  return { step: Math.min(QUESTIONS.length, s.step + 1), answers }
}

export const done = (s: DuckState) => s.step >= QUESTIONS.length

const LABELS = ['Erwartet', 'Stattdessen', 'Fehlermeldung', 'Zuletzt geändert', 'Reproduzierbar']

/** The prompt: skipped questions are left out; the error goes in a code block. */
export function buildPrompt(answers: readonly (string | null)[]): string {
  const lines = ['Ich stecke bei einem Problem fest. Bitte hilf mir, es systematisch einzugrenzen.', '']
  answers.forEach((a, i) => {
    if (!a) return
    if (i === 2) lines.push(`${LABELS[i]}:`, '```', a, '```')
    else lines.push(`${LABELS[i]}: ${a}`)
  })
  if (lines.length === 2) lines.push('(Noch keine Angaben – frag mich zuerst nach dem erwarteten und dem tatsächlichen Verhalten.)')
  lines.push('', 'Bitte: 1. mögliche Ursachen nennen, 2. die wahrscheinlichste mit einem gezielten Check prüfen, 3. erst dann etwas ändern.')
  return lines.join('\n')
}
