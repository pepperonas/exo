/**
 * Effect check for exo's switches. The text check in selfprotect.ts tries to
 * see a change coming; a command can always be spelled so it does not. This
 * one looks at the result instead: the state of the switches before a call
 * that can change things, compared with the state after it.
 *
 * A change made during a Claude call is put to the person: keep it or undo
 * it. Without an answer (Esc, no UI) it is undone. Switching exo ON (the
 * DISABLED file gone) is never undone.
 *
 * The person's own change in a second terminal can land inside a running
 * call; that is why the dialog asks instead of undoing straight away.
 */
import type { Host } from './adapter/host'
import { exoDir } from './killswitch'

export interface ControlState {
  disabled: boolean
  /** rules.json as text; null when absent. */
  rules: string | null
  /** Per settings file: the JSON of exo's entry, null without one. */
  settings: Record<string, string | null>
  /** `/exo off` and module overrides as stored. */
  prefs: string
}

export const settingsFiles = (home: string) => [`${home}/.claude/settings.json`, `${home}/.claude/settings.local.json`]

const UNREADABLE = '<unlesbar>'

/** exo's entry in a settings file, as JSON text. */
export function exoEntry(text: string): string | null {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return UNREADABLE
  }
  const pc = (json as { pluginConfigs?: Record<string, unknown> })?.pluginConfigs
  if (!pc || typeof pc !== 'object') return null
  const entries = Object.entries(pc).filter(([k]) => k === 'exo' || k.startsWith('exo@'))
  return entries.length ? JSON.stringify(Object.fromEntries(entries)) : null
}

export async function readControl(host: Host, home: string): Promise<ControlState> {
  const dir = exoDir(home)
  const disabled = await host.exists(`${dir}/DISABLED`).catch(() => false)
  const rules = (await host.exists(`${dir}/rules.json`).catch(() => false)) ? await host.readFile(`${dir}/rules.json`).catch(() => UNREADABLE) : null
  const settings: Record<string, string | null> = {}
  for (const f of settingsFiles(home)) {
    settings[f] = (await host.exists(f).catch(() => false)) ? exoEntry(await host.readFile(f).catch(() => '')) : null
  }
  const prefs = JSON.stringify((await host.storeGet('prefs').catch(() => null)) ?? null)
  return { disabled, rules, settings, prefs }
}

export type ControlChange =
  | { kind: 'disabled' }
  | { kind: 'rules'; before: string | null }
  | { kind: 'settings'; file: string; before: string | null }
  | { kind: 'prefs'; before: string }

/** What changed for the worse; switching exo on is no change worth asking about. */
export function diffControl(a: ControlState, b: ControlState): ControlChange[] {
  const out: ControlChange[] = []
  if (!a.disabled && b.disabled) out.push({ kind: 'disabled' })
  if (a.rules !== b.rules) out.push({ kind: 'rules', before: a.rules })
  for (const f of Object.keys(b.settings)) if (a.settings[f] !== b.settings[f]) out.push({ kind: 'settings', file: f, before: a.settings[f] ?? null })
  if (a.prefs !== b.prefs) out.push({ kind: 'prefs', before: a.prefs })
  return out
}

const norm = (p: string) => p.replace(/\/+/g, '/').toLowerCase()

/** Whether a change is the one to the file at `path`. */
export function changeIs(c: ControlChange, path: string): boolean {
  const p = norm(path)
  if (c.kind === 'disabled') return p.endsWith('/.claude/exo/disabled')
  if (c.kind === 'rules') return p.endsWith('/.claude/exo/rules.json')
  if (c.kind === 'settings') return norm(c.file) === p
  return false
}

export function describe(c: ControlChange): string {
  switch (c.kind) {
    case 'disabled':
      return 'der Notausschalter ~/.claude/exo/DISABLED wurde angelegt'
    case 'rules':
      return 'die Hausregeln (rules.json) wurden geändert'
    case 'settings':
      return `exos Einstellungen in ${c.file.split('/').pop()} wurden geändert`
    case 'prefs':
      return 'exos gespeicherte Schalter (/exo) wurden geändert'
  }
}

/** Puts exo's entry of a settings file back to `before`; other keys stay. */
export function restoreEntry(text: string, before: string | null): string | null {
  let json: Record<string, unknown>
  try {
    json = JSON.parse(text) as Record<string, unknown>
  } catch {
    return null
  }
  if (before === UNREADABLE) return null
  const pc = { ...((json.pluginConfigs as Record<string, unknown> | undefined) ?? {}) }
  for (const k of Object.keys(pc)) if (k === 'exo' || k.startsWith('exo@')) delete pc[k]
  if (before) Object.assign(pc, JSON.parse(before) as Record<string, unknown>)
  const next: Record<string, unknown> = { ...json }
  if (Object.keys(pc).length) next.pluginConfigs = pc
  else delete next.pluginConfigs
  return JSON.stringify(next, null, 2) + '\n'
}

/** Undoes one change; returns false when it could not. */
export async function undo(host: Host, home: string, c: ControlChange): Promise<boolean> {
  const dir = exoDir(home)
  try {
    if (c.kind === 'disabled') {
      const r = await host.run(['rm', '-f', `${dir}/DISABLED`])
      return r.exitCode === 0
    }
    if (c.kind === 'rules') {
      if (c.before === null) {
        const r = await host.run(['rm', '-f', `${dir}/rules.json`])
        return r.exitCode === 0
      }
      if (c.before === UNREADABLE) return false
      await host.writeFile(`${dir}/rules.json`, c.before)
      return true
    }
    if (c.kind === 'settings') {
      const now = await host.readFile(c.file)
      const next = restoreEntry(now, c.before)
      if (next === null) return false
      await host.writeFile(c.file, next)
      return true
    }
    await host.storeSet('prefs', JSON.parse(c.before))
    return true
  } catch {
    return false
  }
}

export const KEEP = 'Behalten'
export const REVERT = 'Rückgängig machen'
export const QUESTION = (what: string) => `Während eines Claude-Aufrufs hat sich an exo etwas geändert: ${what}. Behalten?`

/**
 * After work that could have changed the switches: each change is put to the
 * person (keep / undo); undone without a yes. Returns what was undone.
 * `skip` leaves out the change the person already allowed up front.
 */
export async function settleEffects(
  host: Host,
  home: string,
  before: ControlState,
  interactive: boolean,
  untimed: <T>(p: Promise<T>) => Promise<T> = p => p,
  skip: (c: ControlChange) => boolean = () => false,
): Promise<string[]> {
  const changes = diffControl(before, await readControl(host, home))
  const undone: string[] = []
  for (const c of changes) {
    if (skip(c)) continue
    let keep = false
    if (interactive) {
      try {
        keep = (await untimed(host.ask(QUESTION(describe(c)), [KEEP, REVERT]))) === KEEP
      } catch {
        keep = false
      }
    }
    if (!keep && (await undo(host, home, c))) undone.push(describe(c))
  }
  return undone
}

export const undoneText = (undone: string[]) =>
  `exo: rückgängig gemacht – ${undone.join('; ')}. exo abschalten kannst nur du selbst (touch ~/.claude/exo/DISABLED im eigenen Terminal oder /exo off).`
