/**
 * What `/exo …` can continue with, for the line under the prompt.
 *
 * Claude Code completes a slash command's name but not its arguments, and a
 * mod cannot hand it an argument list, so exo shows the candidates itself
 * while the person types. A list to read, not tab completion. Pure: the draft
 * in, the candidates out.
 */
import { MODULES } from './config/config'

export const COMMAND = '/exo'

/** One candidate: the word, how much of it is already typed, what it does. */
export type Candidate = { word: string; typed: number; hint: string }

type Entry = { word: string; hint: string }

/** The subcommands `exoCommand` answers, in the order of `/exo help`. */
export const SUBCOMMANDS: readonly Entry[] = [
  { word: 'status', hint: 'state of all modules' },
  { word: 'on', hint: 'everything on, or one module' },
  { word: 'off', hint: 'everything off, or one module' },
  { word: 'reset', hint: "clear a module's broken mark" },
  { word: 'rules', hint: 'house rules in force' },
  { word: 'help', hint: 'all commands' },
]

const moduleEntries = (verb: string): Entry[] => MODULES.map(m => ({ word: m.id, hint: `${verb} ${m.label}` }))

/** What may follow a subcommand; a subcommand without an entry takes nothing. */
export const SECOND: Readonly<Record<string, readonly Entry[]>> = {
  on: moduleEntries('switch on:'),
  off: moduleEntries('switch off:'),
  reset: [...moduleEntries('clear the broken mark of'), { word: 'core', hint: "clear the core's broken mark" }],
}

/** Whether a draft is about this command at all (cheap; checked on every key). */
export function isOurs(draft: string): boolean {
  const t = draft.trimStart()
  return t === COMMAND || t.startsWith(`${COMMAND} `)
}

/**
 * The candidates for `draft`, or `null` when there is nothing to offer: the
 * draft is not `/exo ` plus arguments, the argument has no follow-up, there
 * are too many words, or nothing matches what is typed.
 */
export function complete(draft: string): Candidate[] | null {
  const text = draft.trimStart()
  if (!text.startsWith(`${COMMAND} `)) return null
  const rest = text.slice(COMMAND.length + 1).toLowerCase()
  const words = rest.split(/\s+/).filter(Boolean)
  const open = rest === '' || /\s$/.test(rest)
  const done = open ? words : words.slice(0, -1)
  const current = open ? '' : words[words.length - 1]!

  let pool: readonly Entry[] | undefined
  if (done.length === 0) pool = SUBCOMMANDS
  else if (done.length === 1) pool = SECOND[done[0]!]
  if (!pool) return null

  const hits = pool.filter(e => e.word.toLowerCase().startsWith(current))
  if (hits.length === 0) return null
  return hits.map(e => ({ word: e.word, typed: current.length, hint: e.hint }))
}
