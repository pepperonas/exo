/**
 * exo protects its own switches from the agent it guards.
 *
 * Without this, Claude could switch every guard off with one call
 * (`touch ~/.claude/exo/DISABLED`, emptying rules.json, setting an exo
 * option to false in settings.json). Changing those files therefore needs
 * a yes from the person in a dialog; without an interactive UI it is
 * denied. Reading them stays free.
 *
 * Deliberately broad, because the cheap tricks must not work:
 * - Bash is judged on the raw text AND on the words as the shell cooks them
 *   (`DIS""ABLED` is `DISABLED`), and the bare file names count on their
 *   own: the Bash tool keeps its working directory between calls, so a
 *   `cd ~/.claude/exo` in one call and `touch DISABLED` in the next must
 *   not slip through.
 * - "Only reads" is a short list of programs that cannot run other
 *   programs, with no writing redirect (`>&file` included) and no
 *   environment prefix.
 * - Paths are normalised (`//`, `.`, `..`) and compared without case
 *   (macOS file systems ignore it), and resolved through symlinks.
 * - Tools exo does not know are checked for any path into ~/.claude/exo.
 *
 * A seatbelt, not a sandbox: an agent with a shell can still find another
 * way (editing the mod itself, base64 piped into a shell). This closes the
 * obvious doors.
 */
import { MODULE_IDS } from './config/config'
import type { ToolCall } from './dispatcher/dispatcher'
import { parse } from './shell/parse'
import { commands } from './shell/words'
import type { Cmd } from './shell/words'

/** Programs that only read and cannot run another program. */
const READ_ONLY = new Set(['cat', 'head', 'tail', 'ls', 'wc', 'stat', 'file', 'grep', 'egrep', 'fgrep', 'jq', 'diff', 'cmp', 'echo', 'printf', 'test', '[', 'pwd', 'cd', 'true', 'md5', 'md5sum', 'shasum', 'sha256sum'])
/** Tools that never write files. */
const READ_TOOLS = new Set(['Read', 'Grep', 'Glob', 'LS', 'NotebookRead', 'WebFetch', 'WebSearch', 'ToolSearch', 'TodoWrite', 'TaskGet', 'TaskList', 'AskUserQuestion', 'ListMcpResourcesTool', 'ReadMcpResourceTool', 'ReadMcpResourceDirTool'])
const FILE_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit'])

const OPTION_KEYS = [...MODULE_IDS, 'prodHosts', 'secretAllowPaths', 'snapshotMaxMb', 'dietMaxKb', 'dietMaxLines', 'testCommand', 'quietHours']

/** `/a//b/./c/../d` → `/a/b/d`, lower case. */
export function normPath(p: string): string {
  const abs = p.startsWith('/')
  const out: string[] = []
  for (const part of p.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') out.pop()
    else out.push(part)
  }
  return ((abs ? '/' : '') + out.join('/')).toLowerCase()
}

const isExoPath = (p: string) => /(^|\/)\.claude\/exo(\/|$)/.test(normPath(p))
const isSettings = (p: string) => /(^|\/)\.claude\/settings(\.local)?\.json$/.test(normPath(p))
const mentionsExoConfig = (text: string) => /\bexo\b|pluginConfigs/i.test(text) || OPTION_KEYS.some(k => text.includes(`"${k}"`))

/** Text that names one of exo's switches, in any spelling the shell accepts. */
function namesControl(text: string): boolean {
  const t = text.replace(/\/+/g, '/')
  return (
    /\.claude\/exo\b/i.test(t) ||
    /\bexo\/(disabled|rules\.json)\b/i.test(t) ||
    /\bDISABLED\b/.test(t) ||
    (/\bdisabled\b/i.test(t) && /\.claude|\bexo\b/i.test(t)) ||
    /\brules\.json\b/i.test(t) ||
    (/settings(\.local)?\.json/i.test(t) && /\bexo\b|pluginConfigs/i.test(t))
  )
}

/** Every word the shell would see, cooked: argv, assignments, redirect targets, heredocs. */
function cookedText(cmds: Cmd[]): string {
  const parts: string[] = []
  for (const c of cmds) {
    parts.push(...c.argv, ...c.assigns)
    for (const r of c.redirects) {
      if (r.target) parts.push(r.target.text)
      if (r.heredoc) parts.push(r.heredoc.body)
    }
  }
  return parts.join(' ')
}

/** Whether a redirect writes to a file (`>&2` does not, `>&file` does). */
function writes(op: string, target: string | undefined): boolean {
  if (target === '/dev/null') return false
  if (op === '>&' || op === '<&') return op === '>&' && !/^(\d+|-)$/.test(target ?? '')
  return op === '>' || op === '>>' || op === '>|' || op === '&>' || op === '&>>' || op === '<>'
}

/** Only programs from READ_ONLY, no writing redirect, no environment prefix. */
function onlyReads(cmds: Cmd[]): boolean {
  return cmds.every(c => READ_ONLY.has(c.program) && c.assigns.length === 0 && !c.via.some(v => v.kind === 'env' || v.kind === 'xargs') && !c.redirects.some(r => writes(r.op, r.target?.text)))
}

/** Strings inside a tool's input, a few levels deep. */
function strings(v: unknown, depth = 0, out: string[] = []): string[] {
  if (depth > 4 || out.length > 200) return out
  if (typeof v === 'string') out.push(v)
  else if (Array.isArray(v)) for (const x of v) strings(x, depth + 1, out)
  else if (v && typeof v === 'object') for (const x of Object.values(v)) strings(x, depth + 1, out)
  return out
}

/** Paths a file-writing call targets, for the symlink check. */
export function targetPaths(call: ToolCall): string[] {
  const input = call.input
  if (FILE_TOOLS.has(call.tool)) return [String(input.file_path ?? input.notebook_path ?? '')].filter(Boolean)
  if (call.tool === 'Bash' || READ_TOOLS.has(call.tool)) return []
  return strings(input).filter(s => s.startsWith('/') && !s.includes('\n') && s.length < 4096)
}

/** Whether a tool call would change exo's switches (without the file system). */
export function touchesControl(call: ToolCall): boolean {
  const input = call.input
  if (call.tool === 'Bash') {
    const raw = typeof input.command === 'string' ? input.command : ''
    const r = parse(raw)
    if (!r.ok) return namesControl(raw)
    const cmds = commands(r.script)
    if (!namesControl(raw) && !namesControl(cookedText(cmds))) return false
    return !onlyReads(cmds)
  }
  if (FILE_TOOLS.has(call.tool)) {
    const path = String(input.file_path ?? input.notebook_path ?? '')
    if (isExoPath(path)) return true
    if (isSettings(path)) {
      const text = [input.content, input.old_string, input.new_string, input.new_source].filter(x => typeof x === 'string').join('\n')
      return mentionsExoConfig(text)
    }
    return false
  }
  if (READ_TOOLS.has(call.tool)) return false
  // A tool exo does not know (an MCP server's, a later built-in): any path
  // into ~/.claude/exo, or a settings file next to exo options, counts.
  const all = strings(input)
  return all.some(s => isExoPath(s)) || (all.some(s => isSettings(s)) && all.some(s => mentionsExoConfig(s)))
}

/**
 * The same, with the targets of file-writing calls resolved through
 * symlinks (`realPath` from the engine). A path that does not resolve yet
 * (a new file) is judged by its parent's real path.
 */
export async function touchesControlResolved(call: ToolCall, realPath: (path: string) => Promise<string>): Promise<boolean> {
  if (touchesControl(call)) return true
  for (const p of targetPaths(call)) {
    let real: string | null = null
    for (let cur = p, tail = ''; cur && cur !== '/'; ) {
      try {
        real = (await realPath(cur)) + tail
        break
      } catch {
        const cut = cur.lastIndexOf('/')
        tail = cur.slice(cut) + tail
        cur = cur.slice(0, cut)
      }
    }
    if (real && real !== p && (isExoPath(real) || (isSettings(real) && touchesControl({ ...call, input: { ...call.input, file_path: real } })))) return true
  }
  return false
}

export const ALLOW = 'Zulassen'
export const REFUSE = 'Ablehnen'

export const CONTROL_QUESTION = (what: string) => `Claude will exos Steuerdateien ändern (Notausschalter, Hausregeln oder exo-Einstellungen): ${what} – zulassen?`

export const CONTROL_DENIED =
  'exo: Änderung an exos Steuerdateien abgelehnt. exo abschalten kannst nur du selbst: touch ~/.claude/exo/DISABLED in einem eigenen Terminal, oder /exo off.'
