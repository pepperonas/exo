/**
 * exo protects its own switches from the agent it guards.
 *
 * Without this, Claude could switch every guard off with one call
 * (`touch ~/.claude/exo/DISABLED`, emptying rules.json, setting an exo
 * option to false in settings.json). Changing those files therefore needs
 * a yes from the person in a dialog; without an interactive UI it is
 * denied. Reading them stays free.
 *
 * A seatbelt, not a sandbox: an agent with a shell can always find another
 * way (editing the mod itself, a script written elsewhere). This closes the
 * obvious door.
 */
import { MODULE_IDS } from './config/config'
import type { ToolCall } from './dispatcher/dispatcher'
import { parse } from './shell/parse'
import { commands } from './shell/words'

/** Programs that only read; with no writing redirect they change nothing. */
const READ_ONLY = new Set(['cat', 'less', 'more', 'head', 'tail', 'ls', 'wc', 'stat', 'file', 'grep', 'egrep', 'fgrep', 'rg', 'jq', 'bat', 'diff', 'cmp', 'echo', 'printf', 'test', '[', 'pwd', 'cd', 'true', 'md5', 'md5sum', 'shasum', 'sha256sum'])
const WRITE_OPS = new Set(['>', '>>', '>|', '&>', '&>>', '<>'])

const OPTION_KEYS = [...MODULE_IDS, 'prodHosts', 'secretAllowPaths', 'snapshotMaxMb', 'dietMaxKb', 'dietMaxLines', 'testCommand', 'quietHours']

const isExoPath = (p: string) => /(^|\/)\.claude\/exo(\/|$)/.test(p)
const isSettings = (p: string) => /(^|\/)\.claude\/settings(\.local)?\.json$/.test(p)
const mentionsExoConfig = (text: string) => /\bexo\b|pluginConfigs/.test(text) || OPTION_KEYS.some(k => text.includes(`"${k}"`))

function bashMentionsControl(raw: string): boolean {
  return (
    /\.claude\/exo\b/.test(raw) ||
    /\bexo\/(DISABLED|rules\.json)\b/.test(raw) ||
    (/\bDISABLED\b/.test(raw) && /\.claude|\bexo\b/.test(raw)) ||
    (/settings(\.local)?\.json/.test(raw) && /\bexo\b|pluginConfigs/.test(raw))
  )
}

/** A Bash command that demonstrably only reads. Unparsable counts as writing. */
function onlyReads(raw: string): boolean {
  const r = parse(raw)
  if (!r.ok) return false
  const cmds = commands(r.script)
  return cmds.every(c => READ_ONLY.has(c.program) && !c.redirects.some(x => WRITE_OPS.has(x.op) && x.target?.text !== '/dev/null'))
}

/** Whether a tool call would change exo's switches. */
export function touchesControl(call: ToolCall): boolean {
  const input = call.input
  if (call.tool === 'Bash') {
    const raw = typeof input.command === 'string' ? input.command : ''
    return bashMentionsControl(raw) && !onlyReads(raw)
  }
  if (call.tool === 'Write' || call.tool === 'Edit' || call.tool === 'NotebookEdit') {
    const path = String(input.file_path ?? input.notebook_path ?? '')
    if (isExoPath(path)) return true
    if (isSettings(path)) {
      const text = [input.content, input.old_string, input.new_string, input.new_source].filter(x => typeof x === 'string').join('\n')
      return mentionsExoConfig(text)
    }
  }
  return false
}

export const ALLOW = 'Zulassen'
export const REFUSE = 'Ablehnen'

export const CONTROL_QUESTION = (what: string) => `Claude will exos Steuerdateien ändern (Notausschalter, Hausregeln oder exo-Einstellungen): ${what} – zulassen?`

export const CONTROL_DENIED =
  'exo: Änderung an exos Steuerdateien abgelehnt. exo abschalten kannst nur du selbst: touch ~/.claude/exo/DISABLED in einem eigenen Terminal, oder /exo off.'
