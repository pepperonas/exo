/**
 * The Bash tool keeps its working directory between calls. exo cannot ask
 * for it, so it follows the `cd`s of every call: top-level ones only (a `cd`
 * inside `( … )` or `$( … )` does not outlive its subshell).
 */
import type { Script } from './shell/parse'

export interface CwdGuess {
  cwd: string
  /** False once a `cd` went somewhere exo cannot tell (`cd -`, `cd $X`). */
  known: boolean
}

export function joinPath(base: string, p: string, home: string | undefined): string {
  let path = p
  if (path === '~' || path.startsWith('~/')) {
    if (!home) return path
    path = home + path.slice(1)
  }
  const abs = path.startsWith('/') ? path : `${base.replace(/\/+$/, '')}/${path}`
  const out: string[] = []
  for (const part of abs.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') out.pop()
    else out.push(part)
  }
  return '/' + out.join('/')
}

/** Where the shell stands after `script`, starting at `start`. */
export function cwdAfter(script: Script, start: CwdGuess, home: string | undefined): CwdGuess {
  let g = { ...start }
  for (const e of script.entries) {
    if (e.pipeline.commands.length !== 1) continue
    const c = e.pipeline.commands[0]!
    if (c.type !== 'simple') continue
    const words = c.words
    if (words[0]?.text !== 'cd' && words[0]?.text !== 'pushd') continue
    const args = words.slice(1).filter(w => w.text !== '-P' && w.text !== '-L' && w.text !== '--')
    const arg = args[0]
    if (!arg) {
      g = home ? { cwd: home, known: g.known } : { ...g, known: false }
      continue
    }
    if (arg.text === '-' || arg.expansion || arg.glob) {
      g = { ...g, known: false }
      continue
    }
    g = { cwd: joinPath(g.cwd, arg.text, home), known: g.known }
  }
  return g
}
