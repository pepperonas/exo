/**
 * Before the repository goes public: every line ever committed (added or
 * removed, on every branch) and every commit message, checked for
 *  - secrets (exo's own scanner, `exo-allow-secret` honoured),
 *  - the production addresses from the local settings (read at run time,
 *    never written into this repo),
 *  - private IPv4 ranges.
 *
 *   npm run history-scan [-- <repo dir>]
 * Exit 1 on any finding.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

import { LOCKFILES, scanText } from '../modules/waechter/secrets-logic'

const repo = resolve(process.argv[2] ?? join(import.meta.dirname, '..'))
const git = (...a: string[]) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', maxBuffer: 1 << 30 })

function prodAddresses(): string[] {
  const out: string[] = []
  for (const f of ['settings.json', 'settings.local.json']) {
    const p = join(homedir(), '.claude', f)
    if (!existsSync(p)) continue
    try {
      const hosts = JSON.parse(readFileSync(p, 'utf8'))?.pluginConfigs?.exo?.options?.prodHosts
      if (Array.isArray(hosts)) for (const h of hosts) if (typeof h === 'string' && h.includes('=')) out.push(h.slice(h.indexOf('=') + 1).trim())
    } catch {
      // unreadable settings: only the generic checks run
    }
  }
  return [...new Set(out)].filter(Boolean)
}

const PRIVATE = /\b(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})\b/
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function scanHistory(): string[] {
  const findings: string[] = []
  const addrs = prodAddresses()
  const addrRe = addrs.length ? new RegExp(addrs.map(a => `(?<![\\w.])${escape(a)}(?![\\w])`).join('|')) : null
  const check = (where: string, line: string, secrets: boolean, path = '') => {
    if (addrRe?.test(line)) findings.push(`${where}: prod address`)
    if (PRIVATE.test(line)) findings.push(`${where}: private IP address`)
    // lockfiles: known key formats only (integrity hashes look random by design)
    if (secrets) for (const h of scanText(line, { lockfile: LOCKFILES.test(path) })) findings.push(`${where}: ${h.kind} (${h.masked})`)
  }
  let commit = ''
  let file = ''
  for (const raw of git('log', '-p', '--all', '--no-color', '-U0', '--format=commit %H').split('\n')) {
    if (raw.startsWith('commit ')) commit = raw.slice(7, 14)
    else if (raw.startsWith('+++ ')) file = raw.slice(6)
    else if ((raw.startsWith('+') || raw.startsWith('-')) && !raw.startsWith('---')) check(`${commit} ${file}`, raw.slice(1), raw.startsWith('+'), file)
  }
  for (const block of git('log', '--all', '--format=%h%x00%B%x01').split('\x01')) {
    const [h, msg] = block.split('\x00')
    if (h && msg) for (const l of msg.split('\n')) check(`${h.trim()} commit message`, l, true)
  }
  return findings
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const f = scanHistory()
  console.log(`Scanned: ${repo}`)
  console.log(`Prod addresses from local settings: ${prodAddresses().length}`)
  if (f.length) {
    console.log(`${f.length} finding(s):`)
    for (const x of f) console.log(`  ${x}`)
    process.exit(1)
  }
  console.log('No findings.')
}
