/**
 * Recognising secrets in text. Pure; the plaintext of a secret never leaves
 * this file: findings carry only a masked form (`sk-ant-…a1b2`).
 */

export interface SecretHit {
  kind: string
  /** 1-based line in the scanned text (plus the caller's offset). */
  line: number
  masked: string
}

interface Pattern {
  kind: string
  re: RegExp
}

/** Known formats. `g` flag: several per line are found. */
const PATTERNS: Pattern[] = [
  { kind: 'Anthropic API key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
  { kind: 'OpenAI API key', re: /\bsk-(?!ant-)(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{32,}/g },
  { kind: 'GitHub token', re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b/g },
  { kind: 'GitHub token', re: /\bgithub_pat_[A-Za-z0-9_]{22,}\b/g },
  { kind: 'AWS access key', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { kind: 'Stripe live key', re: /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}\b/g },
  { kind: 'Slack token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g },
  { kind: 'Slack webhook', re: /https:\/\/hooks\.slack\.com\/services\/T[A-Za-z0-9]+\/B[A-Za-z0-9]+\/[A-Za-z0-9]+/g },
  { kind: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { kind: 'Private key (PEM)', re: /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/g },
  { kind: 'JWT', re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
]

const MASK_PREFIXES = ['sk-ant-', 'sk-proj-', 'sk-svcacct-', 'sk-admin-', 'sk_live_', 'rk_live_', 'github_pat_', 'ghp_', 'gho_', 'ghu_', 'ghs_', 'ghr_', 'xoxb-', 'xoxp-', 'xoxa-', 'xoxr-', 'xoxs-', 'AKIA', 'ASIA', 'AIza', 'eyJ', 'sk-']

/** `sk-ant-api03-…` → `sk-ant-…a1b2`; short values show nothing but `…`. */
export function mask(value: string): string {
  if (value.startsWith('-----BEGIN')) return '-----BEGIN … PRIVATE KEY-----'
  if (value.startsWith('https://hooks.slack.com/')) return 'https://hooks.slack.com/…'
  const prefix = MASK_PREFIXES.find(p => value.startsWith(p)) ?? ''
  const tail = value.length - prefix.length >= 16 ? value.slice(-4) : ''
  return `${prefix}…${tail}`
}

/** Shannon entropy in bits per character. */
export function entropy(s: string): number {
  if (!s) return 0
  const counts = new Map<string, number>()
  for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1)
  let h = 0
  for (const n of counts.values()) {
    const p = n / s.length
    h -= p * Math.log2(p)
  }
  return h
}

const PLACEHOLDER = /^(?:x{3,}.*|\*{3,}|\.{3}|<[^>]*>|\{\{.*\}\}|\$\{.*\}|\$[A-Za-z_][A-Za-z0-9_]*|%[A-Z_]+%|changeme|change[-_]?me|password|passwort|secret|example|dummy|test(?:ing)?|todo|fake|placeholder|null|none|undefined|true|false|redacted)$/i
const REFERENCE = /^(?:process\.env|os\.environ|os\.getenv|env\(|getenv\(|import\.meta\.env|config\.|settings\.|self\.|this\.|ENV\[)/i

export function isPlaceholder(v: string): boolean {
  return PLACEHOLDER.test(v) || REFERENCE.test(v) || /your[-_]|example|placeholder|dummy|<[a-z_-]+>/i.test(v)
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** `dbPassword`, `DB_PASSWORD`, `user.pass` → ['db', 'password'] …: name parts, lower case. */
export function nameParts(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])([0-9])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map(x => x.toLowerCase())
}

const PASSWORD_PARTS = new Set(['password', 'passwd', 'pass', 'pwd', 'passphrase', 'passwort', 'kennwort'])
const CREDENTIAL_PARTS = new Set(['secret', 'token', 'apikey', 'credential', 'credentials'])
const CREDENTIAL_PAIRS = [
  ['api', 'key'],
  ['access', 'key'],
  ['private', 'key'],
  ['client', 'secret'],
  ['auth', 'key'],
  ['auth', 'token'],
  ['secret', 'key'],
]

/** Unmistakable cores, also inside run-together names (`dbpassword`, `apitoken`). */
const PASSWORD_CORE = /password|passwd|passphrase|passwort|kennwort|pwd$/
const CREDENTIAL_CORE = /(?:token|secret|apikey|accesskey|privatekey|secretkey|authkey)$/

/** A password by its name: a whole part (`pass`, `pwd`) or an unmistakable core; not `passed`, `bypass`. */
export const isPasswordName = (name: string) => nameParts(name).some(p => PASSWORD_PARTS.has(p) || PASSWORD_CORE.test(p))
export function isCredentialName(name: string): boolean {
  const parts = nameParts(name)
  if (parts.some(p => CREDENTIAL_PARTS.has(p) || CREDENTIAL_CORE.test(p))) return true
  return CREDENTIAL_PAIRS.some(([a, b]) => parts.some((p, i) => p === a && parts[i + 1] === b))
}

const ASSIGNMENT = /([A-Za-z_][A-Za-z0-9_.-]*)["']?\s*(?::=|=|:)\s*(["'`]?)([^\s"'`,;)}\]]+)\2/g

/** Generic high-entropy strings outside assignments. */
const LONG_TOKEN = /[A-Za-z0-9+_=-]{32,200}/g

export interface ScanOptions {
  /** A lockfile: only known formats, no entropy guesses. */
  lockfile?: boolean
}

export const LOCKFILES = /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|Cargo\.lock|poetry\.lock|Pipfile\.lock|Gemfile\.lock|composer\.lock|go\.sum|flake\.lock|uv\.lock)$/

export const ALLOW_COMMENT = 'exo-allow-secret'

/** Scans text line by line; `lineOffset` is added to the line numbers. */
export function scanText(text: string, options: ScanOptions = {}, lineOffset = 0): SecretHit[] {
  const hits: SecretHit[] = []
  const lines = text.split('\n')
  lines.forEach((line, idx) => {
    if (line.includes(ALLOW_COMMENT)) return
    const lineNo = idx + 1 + lineOffset
    const seen = new Set<string>()
    const add = (kind: string, value: string) => {
      if (seen.has(value)) return
      seen.add(value)
      hits.push({ kind, line: lineNo, masked: mask(value) })
    }
    for (const p of PATTERNS) for (const m of line.matchAll(p.re)) add(p.kind, m[0])
    if (options.lockfile) return
    if (/data:[a-z]+\/[a-z0-9.+-]+;base64,/i.test(line)) return

    for (const m of line.matchAll(ASSIGNMENT)) {
      const name = m[1]!
      const value = m[3]!
      if (seen.has(value) || [...seen].some(s => s.includes(value) || value.includes(s))) continue
      if (isPlaceholder(value)) continue
      // a regex literal or a path (`NAME = /pass(word)?/`) is no password
      if (value.startsWith('/')) continue
      if (/^(?:https?|file):\/\//.test(value) && !/:[^/@]+@/.test(value)) continue
      if (isPasswordName(name) && !/_?(?:hash|file|path|field|label|policy|length|min|max|reset|prompt)$/i.test(name)) {
        if (value.length >= 8 && !/^\d+$/.test(value)) add('password in assignment', value)
        continue
      }
      if (isCredentialName(name) && !/_?(?:name|type|url|uri|file|path|header|field|id|length|ttl|expires?)$/i.test(name)) {
        if (value.length >= 16 && entropy(value) >= 3.3 && !UUID.test(value)) add('credentials in assignment', value)
      }
    }

    for (const m of line.matchAll(LONG_TOKEN)) {
      const v = m[0]
      if (seen.has(v) || [...seen].some(s => s.includes(v) || v.includes(s))) continue
      if (/^[0-9a-f]+$/i.test(v) || UUID.test(v) || /^sha(?:1|256|384|512)-/.test(v)) continue
      if (!/[A-Z]/.test(v) || !/[a-z]/.test(v) || !/[0-9]/.test(v)) continue
      if (entropy(v) < 4.3) continue
      if (/^[A-Za-z]+(?:[-_][A-Za-z0-9]+)+$/.test(v)) continue // identifier-like-with-dashes
      add('high-entropy string', v)
    }
  })
  return hits
}

/** Added lines of a unified diff (`git diff -U0`, `git log -p`), scanned per file. */
export function scanDiff(diff: string, skip: (file: string) => boolean): (SecretHit & { file: string })[] {
  const out: (SecretHit & { file: string })[] = []
  let file = ''
  let line = 0
  for (const raw of diff.split('\n')) {
    if (raw.startsWith('+++ ')) {
      file = raw.slice(4).replace(/^b\//, '').trim()
      continue
    }
    if (raw.startsWith('--- ') || raw.startsWith('diff --git') || raw.startsWith('commit ')) continue
    const h = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw)
    if (h) {
      line = Number(h[1])
      continue
    }
    if (raw.startsWith('+') && file && file !== '/dev/null') {
      if (!skip(file)) for (const hit of scanText(raw.slice(1), { lockfile: LOCKFILES.test(file) }, line - 1)) out.push({ ...hit, file })
      line++
    }
  }
  return out
}

export const isEnvFile = (path: string) => /(^|\/)\.env(\.[A-Za-z0-9_-]+)?$/.test(path) && !/\.(example|sample|template|dist)$/.test(path)

/** The text with every known-format secret replaced by its mask (for dialogs and messages). */
export function redact(text: string): string {
  let out = text
  for (const p of PATTERNS) out = out.replace(p.re, m => mask(m))
  return out
}
