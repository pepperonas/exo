/**
 * #20 Rubber duck, the pure part: five questions and a fixed template for the
 * prompt built from the answers. No model call.
 */

export const QUESTIONS = [
  'What do you expect?',
  'What happens instead?',
  'Is there an error message? (verbatim is best)',
  'What did you change last?',
  'Can you reproduce it – and how?',
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

const LABELS = ['Expected', 'Instead', 'Error message', 'Changed last', 'Reproducible']

/** The prompt: skipped questions are left out; the error goes in a code block. */
export function buildPrompt(answers: readonly (string | null)[]): string {
  const lines = ['I am stuck on a problem. Please help me narrow it down systematically.', '']
  answers.forEach((a, i) => {
    if (!a) return
    if (i === 2) lines.push(`${LABELS[i]}:`, '```', a, '```')
    else lines.push(`${LABELS[i]}: ${a}`)
  })
  if (lines.length === 2) lines.push('(No details yet – ask me first about the expected and the actual behaviour.)')
  lines.push('', 'Please: 1. name possible causes, 2. check the most likely one with a targeted test, 3. only then change anything.')
  return lines.join('\n')
}
