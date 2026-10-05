/**
 * House rules (`~/.claude/exo/rules.json`): a pattern on a command against a
 * prod host, a check command, and the reason shown when the check says no.
 * Validation is pure and never throws; a bad rule is dropped with an error,
 * an unreadable file falls back to the built-in defaults.
 */

export interface HouseRule {
  id: string
  /** Host names from prodHosts, or `*` for all of them. */
  hosts: string[]
  /** Regular expression tested against the command run on the host. */
  match: RegExp
  /** argv of the check; `{host}` is replaced with the host's address. */
  check: string[]
  /** `exit0`: block when the check exits 0; `exitNonZero`: when it does not. */
  blockWhen: 'exit0' | 'exitNonZero'
  text: string
}

export interface RulesLoad {
  rules: HouseRule[]
  /** Readable problems, shown in `/exo`. */
  errors: string[]
  source: 'default' | 'file' | 'default-after-error'
}

export const RULES_VERSION = 1

/** The defaults as JSON, also what is written when no rules.json exists. */
export const DEFAULT_RULES_JSON = {
  version: RULES_VERSION,
  rules: [
    {
      id: 'nginx-certbot',
      hosts: ['*'],
      match: '\\bnginx\\b',
      check: ['ssh', '{host}', 'pgrep', '-x', 'certbot'],
      blockWhen: 'exit0',
      text: 'Never change nginx while certbot is running (certbot is running on this host right now).',
    },
  ],
}

const RULE_KEYS = new Set(['id', 'hosts', 'match', 'check', 'blockWhen', 'text'])

function validateRule(raw: unknown, index: number, seen: Set<string>): { rule?: HouseRule; error?: string } {
  const where = `Rule ${index + 1}`
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: `${where}: not an object` }
  const r = raw as Record<string, unknown>
  const unknown = Object.keys(r).filter(k => !RULE_KEYS.has(k))
  if (unknown.length) return { error: `${where}: unknown fields ${unknown.join(', ')}` }
  if (typeof r.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(r.id)) return { error: `${where}: id missing or invalid (a-z, 0-9, -)` }
  if (seen.has(r.id)) return { error: `${where}: duplicate id ${r.id}` }
  if (!Array.isArray(r.hosts) || !r.hosts.length || !r.hosts.every(h => typeof h === 'string' && h.length > 0))
    return { error: `${r.id}: hosts must be a non-empty list of strings` }
  if (typeof r.match !== 'string' || !r.match) return { error: `${r.id}: match missing` }
  let match: RegExp
  try {
    match = new RegExp(r.match)
  } catch {
    return { error: `${r.id}: match is not a valid regular expression` }
  }
  if (!Array.isArray(r.check) || !r.check.length || !r.check.every(a => typeof a === 'string'))
    return { error: `${r.id}: check must be a non-empty list of strings (argv)` }
  const placeholders = r.check.flatMap(a => (a as string).match(/\{[^}]*\}/g) ?? [])
  const bad = placeholders.filter(p => p !== '{host}')
  if (bad.length) return { error: `${r.id}: unknown placeholder ${bad.join(', ')} (only {host})` }
  if (r.blockWhen !== 'exit0' && r.blockWhen !== 'exitNonZero') return { error: `${r.id}: blockWhen must be exit0 or exitNonZero` }
  if (typeof r.text !== 'string' || !r.text.trim()) return { error: `${r.id}: text missing` }
  seen.add(r.id)
  return { rule: { id: r.id, hosts: r.hosts as string[], match, check: r.check as string[], blockWhen: r.blockWhen, text: r.text } }
}

/** Validates parsed JSON. Bad rules are dropped one by one. */
export function validateRules(json: unknown): { rules: HouseRule[]; errors: string[]; fatal: boolean } {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return { rules: [], errors: ['rules.json: not a JSON object'], fatal: true }
  const j = json as Record<string, unknown>
  if (j.version !== RULES_VERSION) return { rules: [], errors: [`rules.json: unknown version ${String(j.version)} (expected ${RULES_VERSION})`], fatal: true }
  if (!Array.isArray(j.rules)) return { rules: [], errors: ['rules.json: rules missing or not a list'], fatal: true }
  const errors: string[] = []
  const rules: HouseRule[] = []
  const seen = new Set<string>()
  j.rules.forEach((raw, i) => {
    const r = validateRule(raw, i, seen)
    if (r.rule) rules.push(r.rule)
    else errors.push(r.error!)
  })
  return { rules, errors, fatal: false }
}

export function defaultRules(): HouseRule[] {
  return validateRules(DEFAULT_RULES_JSON).rules
}

/**
 * From the file's text (or `null` when there is none) to the rules in force:
 * no file → defaults; unreadable or invalid → defaults plus the errors.
 */
export function loadRules(text: string | null): RulesLoad {
  if (text === null) return { rules: defaultRules(), errors: [], source: 'default' }
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch (err) {
    return { rules: defaultRules(), errors: [`rules.json is not valid JSON: ${(err as Error).message}`, 'The built-in rules apply.'], source: 'default-after-error' }
  }
  const v = validateRules(json)
  if (v.fatal) return { rules: defaultRules(), errors: [...v.errors, 'The built-in rules apply.'], source: 'default-after-error' }
  return { rules: v.rules, errors: v.errors, source: 'file' }
}
