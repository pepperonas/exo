/**
 * exo's configuration: userConfig values, overridden by what `/exo` stored,
 * with defaults for everything. Pure; the caller supplies both sources.
 */

export type ModuleGroup = 'waechter' | 'cockpit' | 'rueckblick' | 'extras'
export type FailPolicy = 'closed' | 'open'

export const MODULES = [
  { id: 'secrets', group: 'waechter', label: 'Secret-Wächter', policy: 'closed' },
  { id: 'prodShield', group: 'waechter', label: 'Prod-Schild', policy: 'closed' },
  { id: 'brake', group: 'waechter', label: 'Aufräum-Bremse', policy: 'open' },
  { id: 'diet', group: 'waechter', label: 'Kontext-Diät', policy: 'open' },
  { id: 'testLight', group: 'cockpit', label: 'Testampel', policy: 'open' },
  { id: 'doneCheck', group: 'cockpit', label: 'Fertig-Prüfer', policy: 'open' },
  { id: 'sidebar', group: 'cockpit', label: 'Änderungs-Seitenleiste', policy: 'open' },
  { id: 'ci', group: 'cockpit', label: 'CI-Ampel', policy: 'open' },
  { id: 'recap', group: 'rueckblick', label: 'Recap', policy: 'open' },
  { id: 'lessons', group: 'rueckblick', label: 'Lehren-Sammler', policy: 'open' },
  { id: 'hours', group: 'rueckblick', label: 'Zeiterfassung', policy: 'open' },
  { id: 'achievements', group: 'extras', label: 'Erfolge', policy: 'open' },
  { id: 'cinema', group: 'extras', label: 'Spinner-Kino', policy: 'open' },
  { id: 'duck', group: 'extras', label: 'Gummi-Ente', policy: 'open' },
] as const satisfies readonly { id: string; group: ModuleGroup; label: string; policy: FailPolicy }[]

export type ModuleId = (typeof MODULES)[number]['id']
export const MODULE_IDS: readonly ModuleId[] = MODULES.map(m => m.id)
export const isModuleId = (v: unknown): v is ModuleId => typeof v === 'string' && (MODULE_IDS as readonly string[]).includes(v)
export const moduleInfo = (id: ModuleId) => MODULES.find(m => m.id === id)!

export interface ProdHost {
  name: string
  address: string
}

export interface Prefs {
  /** `/exo off`: every module off. */
  allOff: boolean
  /** `/exo on|off <module>`: overrides of single modules. */
  modules: Partial<Record<ModuleId, boolean>>
}

export interface Config {
  enabled: Record<ModuleId, boolean>
  allOff: boolean
  prodHosts: ProdHost[]
  secretAllowPaths: string[]
  snapshotMaxMb: number
  dietMaxKb: number
  dietMaxLines: number
  testCommand: string
  quietHours: { from: number; to: number } | null
  sound: boolean
  reducedMotion: boolean
  /** Values that were ignored, as readable lines for `/exo`. */
  errors: string[]
}

export const DEFAULT_SECRET_ALLOW = ['**/test/fixtures/**', '**/*.example', '**/.env.example']

const clampInt = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v)))

export function emptyPrefs(): Prefs {
  return { allOff: false, modules: {} }
}

/** Reads stored prefs defensively: anything malformed falls back to empty. */
export function readPrefs(stored: unknown): Prefs {
  const p = emptyPrefs()
  if (!stored || typeof stored !== 'object') return p
  const s = stored as Record<string, unknown>
  if (typeof s.allOff === 'boolean') p.allOff = s.allOff
  if (s.modules && typeof s.modules === 'object') {
    for (const [k, v] of Object.entries(s.modules as Record<string, unknown>)) if (isModuleId(k) && typeof v === 'boolean') p.modules[k] = v
  }
  return p
}

/** `name=adresse` → host; both parts non-empty, no spaces. */
export function parseProdHost(entry: string): ProdHost | null {
  const m = /^\s*([^=\s]+)\s*=\s*([^=\s]+)\s*$/.exec(entry)
  return m ? { name: m[1]!, address: m[2]! } : null
}

/** `HH-HH` (hours, 0-23); `""` means none. */
export function parseQuietHours(s: string): { from: number; to: number } | null | 'invalid' {
  if (!s.trim()) return null
  const m = /^\s*(\d{1,2})\s*-\s*(\d{1,2})\s*$/.exec(s)
  if (!m) return 'invalid'
  const from = Number(m[1])
  const to = Number(m[2])
  if (from > 23 || to > 23) return 'invalid'
  return { from, to }
}

export function resolveConfig(options: Readonly<Record<string, unknown>>, prefs: Prefs): Config {
  const errors: string[] = []
  const bool = (key: string, d: boolean): boolean => {
    const v = options[key]
    if (v === undefined) return d
    if (typeof v === 'boolean') return v
    errors.push(`${key}: kein Wahrheitswert, Standard ${d} gilt`)
    return d
  }
  const num = (key: string, d: number, lo: number, hi: number): number => {
    const v = options[key]
    if (v === undefined) return d
    if (typeof v === 'number' && Number.isFinite(v)) {
      if (v < lo || v > hi) errors.push(`${key}: ${v} außerhalb ${lo}–${hi}, auf den Rand gesetzt`)
      return clampInt(v, lo, hi)
    }
    errors.push(`${key}: keine Zahl, Standard ${d} gilt`)
    return d
  }
  const str = (key: string, d: string): string => {
    const v = options[key]
    if (v === undefined) return d
    if (typeof v === 'string') return v
    errors.push(`${key}: kein Text, Standard gilt`)
    return d
  }
  const list = (key: string, d: string[]): string[] => {
    const v = options[key]
    if (v === undefined) return d
    if (Array.isArray(v) && v.every(x => typeof x === 'string')) return [...v]
    errors.push(`${key}: keine Textliste, Standard gilt`)
    return d
  }

  const enabled = {} as Record<ModuleId, boolean>
  for (const id of MODULE_IDS) enabled[id] = prefs.allOff ? false : (prefs.modules[id] ?? bool(id, true))

  const prodHosts: ProdHost[] = []
  for (const entry of list('prodHosts', [])) {
    const h = parseProdHost(entry)
    if (h) prodHosts.push(h)
    else errors.push(`prodHosts: Eintrag ohne Form name=adresse ignoriert`)
  }

  const qh = parseQuietHours(str('quietHours', '22-07'))
  if (qh === 'invalid') errors.push('quietHours: erwartet HH-HH, keine Ruhezeit gesetzt')

  return {
    enabled,
    allOff: prefs.allOff,
    prodHosts,
    secretAllowPaths: list('secretAllowPaths', DEFAULT_SECRET_ALLOW),
    snapshotMaxMb: num('snapshotMaxMb', 500, 1, 100_000),
    dietMaxKb: num('dietMaxKb', 256, 1, 1_000_000),
    dietMaxLines: num('dietMaxLines', 2000, 50, 10_000_000),
    testCommand: str('testCommand', ''),
    quietHours: qh === 'invalid' ? null : qh,
    sound: bool('sound', false),
    reducedMotion: bool('reducedMotion', false),
    errors,
  }
}
