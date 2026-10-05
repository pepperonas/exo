/**
 * #1 Prod-Schild, the pure part: which commands touch production, and what a
 * dry run of them would be.
 */
import type { ProdHost } from '../../core/config/config'
import type { HouseRule } from '../../core/config/rules'
import { flags, gitCall } from '../../core/shell/git'
import type { Cmd } from '../../core/shell/words'

// ------------------------------------------------------------------ ssh config

/** `Host` aliases → `HostName`, from ~/.ssh/config (no Include, no Match). */
export function parseSshConfig(text: string): Map<string, string> {
  const out = new Map<string, string>()
  let aliases: string[] = []
  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*/, '').trim()
    if (!line) continue
    const m = /^(\S+)\s*(?:=\s*|\s+)(.+)$/.exec(line)
    if (!m) continue
    const key = m[1]!.toLowerCase()
    const value = m[2]!.trim()
    if (key === 'host') aliases = value.split(/\s+/).filter(a => !/[*?!]/.test(a))
    else if (key === 'match') aliases = []
    else if (key === 'hostname') for (const a of aliases) if (!out.has(a.toLowerCase())) out.set(a.toLowerCase(), value.toLowerCase())
  }
  return out
}

/** Every spelling under which a prod host can be reached. */
export function prodIndex(hosts: readonly ProdHost[], ssh: ReadonlyMap<string, string>): Map<string, ProdHost> {
  const idx = new Map<string, ProdHost>()
  for (const h of hosts) {
    const name = h.name.toLowerCase()
    const addr = h.address.toLowerCase()
    idx.set(name, h)
    idx.set(addr, h)
    for (const [alias, target] of ssh) if (target === addr || target === name || alias === name) idx.set(alias, h)
    const viaName = ssh.get(name)
    if (viaName) idx.set(viaName, h)
  }
  return idx
}

const stripHost = (h: string) =>
  h
    .replace(/^.*@/, '')
    .replace(/^\[(.*)\](?::\d+)?$/, '$1')
    .replace(/:\d+$/, '')
    .toLowerCase()

/** `[user@]host:path`, `host::module`, `rsync://[user@]host[:port]/x` → host. */
export function remoteHostOf(arg: string): string | null {
  const url = /^(?:rsync|sftp|scp):\/\/(?:[^@/]+@)?(\[[^\]]+\]|[^:/]+)/.exec(arg)
  if (url) return stripHost(url[1]!)
  if (arg.startsWith('/') || arg.startsWith('./') || arg.startsWith('~')) return null
  const m = /^((?:[^@/:\s]+@)?(?:\[[^\]]+\]|[^:/\s]+)):/.exec(arg)
  return m ? stripHost(m[1]!) : null
}

// ------------------------------------------------------------------ findings

export type FindingKind = 'remote' | 'service' | 'sql' | 'force-push'

export interface Finding {
  kind: FindingKind
  /** For remote/service: the prod host. */
  host?: ProdHost
  /** What it is about, for the dialog. */
  what: string
  /** Text the house rules are matched against. */
  subject: string
}

const SQL_CLIENTS = new Set(['psql', 'mysql', 'mariadb', 'sqlite3', 'sqlcmd', 'clickhouse-client', 'cockroach', 'duckdb'])

/** Splits SQL into statements; quotes respected, comments dropped. */
export function sqlStatements(sql: string): string[] {
  const out: string[] = []
  let cur = ''
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i]!
    if (ch === "'" || ch === '"' || ch === '`') {
      const end = sql.indexOf(ch, i + 1)
      const stop = end === -1 ? sql.length : end + 1
      cur += sql.slice(i, stop)
      i = stop - 1
    } else if (ch === '-' && sql[i + 1] === '-') {
      const nl = sql.indexOf('\n', i)
      i = nl === -1 ? sql.length : nl
    } else if (ch === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2)
      i = end === -1 ? sql.length : end + 1
    } else if (ch === ';') {
      if (cur.trim()) out.push(cur.trim())
      cur = ''
    } else cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

/** The destructive statements: DROP, TRUNCATE, DELETE/UPDATE without WHERE. */
export function destructiveSql(sql: string): string[] {
  return sqlStatements(sql).filter(st => {
    const s = st.replace(/\s+/g, ' ')
    if (/^DROP\s+(TABLE|DATABASE|SCHEMA|VIEW|INDEX|USER|ROLE)\b/i.test(s)) return true
    if (/^TRUNCATE\b/i.test(s)) return true
    if (/^DELETE\s+FROM\b/i.test(s) && !/\bWHERE\b/i.test(s)) return true
    if (/^UPDATE\b[\s\S]*\bSET\b/i.test(s) && !/\bWHERE\b/i.test(s)) return true
    return false
  })
}

/** The SQL a client call carries: `-c`, `-e`, `--command`, sqlite3's trailing argument, heredocs. */
export function sqlOf(c: Cmd): string[] {
  const out: string[] = []
  const a = c.argv
  for (let i = 1; i < a.length; i++) {
    const t = a[i]!
    const m = /^(?:-c|-e|--command|--execute|--query|-Q|-q)(?:=(.*))?$/.exec(t)
    if (m) out.push(m[1] ?? a[++i] ?? '')
    else if (/^--(?:command|execute|query)=/.test(t)) out.push(t.slice(t.indexOf('=') + 1))
  }
  if (c.program === 'sqlite3' || c.program === 'duckdb') {
    const pos = a.slice(1).filter(x => !x.startsWith('-'))
    if (pos.length >= 2) out.push(pos[pos.length - 1]!)
  }
  for (const r of c.redirects) {
    if (r.heredoc) out.push(r.heredoc.body)
    else if (r.op === '<<<' && r.target) out.push(r.target.text)
  }
  return out
}

const PROTECTED_BRANCH = /^(?:\+)?(?:refs\/heads\/)?(main|master)$/

/** Branches a `git push` forces, or null when it does not force main/master. */
export function forcedMain(args: readonly string[], currentBranch: string | null): string | null {
  const f = flags(args)
  const force = f.has('f') || f.has('--force') || f.has('--force-with-lease') || f.has('--force-if-includes')
  const positional = args.filter(a => !a.startsWith('-'))
  const refspecs = positional.slice(1)
  for (const r of refspecs) {
    const dst = r.includes(':') ? r.slice(r.lastIndexOf(':') + 1) : r
    const m = PROTECTED_BRANCH.exec(dst)
    if (m && (force || r.startsWith('+'))) return m[1]!
  }
  if (force && (f.has('--all') || f.has('--mirror'))) return 'alle Branches'
  if (force && refspecs.length === 0 && currentBranch && /^(main|master)$/.test(currentBranch)) return currentBranch
  return null
}

/** Whether `forcedMain` needs to know the current branch (a force push without refspec). */
export function needsBranch(cmds: readonly Cmd[]): boolean {
  return cmds.some(c => {
    const g = gitCall(c)
    if (!g || g.sub !== 'push') return false
    const f = flags(g.args)
    return (f.has('f') || f.has('--force') || f.has('--force-with-lease') || f.has('--force-if-includes')) && g.args.filter(a => !a.startsWith('-')).length <= 1
  })
}

const SERVICE_VERBS = new Set(['restart', 'stop', 'reload', 'kill', 'disable', 'mask', 'isolate', 'poweroff', 'reboot', 'halt'])

export function inspect(cmds: readonly Cmd[], index: ReadonlyMap<string, ProdHost>, currentBranch: string | null): Finding[] {
  const out: Finding[] = []
  const prodOf = (h: string | null | undefined) => (h ? index.get(stripHost(h)) : undefined)
  for (const c of cmds) {
    const remoteVia = [...c.via].reverse().find(v => v.kind === 'ssh')
    const viaHost = prodOf(remoteVia?.host)
    const line = c.argv.join(' ')

    if (c.program === 'ssh' && c.ssh) {
      const h = prodOf(c.ssh.host)
      if (h) out.push({ kind: 'remote', host: h, what: `ssh auf ${h.name}`, subject: line })
    }
    if (c.program === 'scp' || c.program === 'rsync' || c.program === 'sftp') {
      const targets = c.program === 'sftp' ? [c.argv.slice(1).find(a => !a.startsWith('-')) ?? ''] : c.argv.slice(1).filter(a => !a.startsWith('-'))
      for (const t of targets) {
        const h = prodOf(c.program === 'sftp' ? t : remoteHostOf(t))
        if (h && !out.some(f => f.kind === 'remote' && f.host === h && f.subject === line)) out.push({ kind: 'remote', host: h, what: `${c.program} mit ${h.name}`, subject: line })
      }
    }
    if (viaHost && c.program === 'systemctl') {
      const verb = c.argv.slice(1).find(a => !a.startsWith('-'))
      if (verb && SERVICE_VERBS.has(verb)) out.push({ kind: 'service', host: viaHost, what: `systemctl ${verb} auf ${viaHost.name}`, subject: line })
    }
    if (viaHost && (c.program === 'reboot' || c.program === 'shutdown' || c.program === 'poweroff')) out.push({ kind: 'service', host: viaHost, what: `${c.program} auf ${viaHost.name}`, subject: line })

    if (SQL_CLIENTS.has(c.program)) {
      for (const sql of sqlOf(c)) for (const st of destructiveSql(sql)) out.push({ kind: 'sql', host: viaHost, what: `SQL: ${st.slice(0, 80)}`, subject: st })
    }

    const g = gitCall(c)
    if (g?.sub === 'push') {
      const b = forcedMain(g.args, currentBranch)
      if (b) out.push({ kind: 'force-push', host: viaHost, what: `Force-Push auf ${b}`, subject: line })
    }
  }
  return out
}

/** SQL piped into a client (`echo "DROP …" | psql`): every word of the script counts. */
export function pipedSql(cmds: readonly Cmd[]): Finding[] {
  if (!cmds.some(c => SQL_CLIENTS.has(c.program))) return []
  const out: Finding[] = []
  for (const c of cmds) {
    if (SQL_CLIENTS.has(c.program)) continue
    for (const w of c.argv.slice(1)) for (const st of destructiveSql(w)) out.push({ kind: 'sql', what: `SQL: ${st.slice(0, 80)}`, subject: st })
  }
  return out
}

// ------------------------------------------------------------------ house rules

export function rulesFor(findings: readonly Finding[], rules: readonly HouseRule[], raw: string): { rule: HouseRule; host: ProdHost }[] {
  const out: { rule: HouseRule; host: ProdHost }[] = []
  for (const f of findings) {
    if (!f.host) continue
    for (const r of rules) {
      if (!r.hosts.includes('*') && !r.hosts.includes(f.host.name)) continue
      if (!r.match.test(f.subject) && !r.match.test(raw)) continue
      if (!out.some(o => o.rule === r && o.host === f.host)) out.push({ rule: r, host: f.host })
    }
  }
  return out
}

export const checkArgv = (rule: HouseRule, host: ProdHost) => rule.check.map(a => a.replaceAll('{host}', host.address))

// ------------------------------------------------------------------ dry run

const once = (raw: string, re: RegExp) => (raw.match(new RegExp(re.source, 'g')) ?? []).length === 1

/**
 * The same command as a dry run, or null when there is no honest one:
 * rsync and git push get `--dry-run`; a single DELETE/UPDATE without WHERE
 * becomes `SELECT COUNT(*)` of its table. DROP and TRUNCATE have none.
 */
export function dryRun(raw: string, findings: readonly Finding[]): string | null {
  const kinds = new Set(findings.map(f => f.kind))
  if (kinds.has('service')) return null
  let out = raw
  if (kinds.has('remote')) {
    const remote = findings.filter(f => f.kind === 'remote')
    if (!remote.every(f => /^rsync\b/.test(f.subject))) return null
    if (!once(out, /\brsync\b/)) return null
    out = out.replace(/\brsync\b/, 'rsync --dry-run')
  }
  if (kinds.has('force-push')) {
    if (!once(out, /\bgit\s+push\b/)) return null
    out = out.replace(/\bgit\s+push\b/, 'git push --dry-run')
  }
  if (kinds.has('sql')) {
    const sql = findings.filter(f => f.kind === 'sql')
    if (sql.length !== 1) return null
    const st = sql[0]!.subject
    const m = /^(?:DELETE\s+FROM|UPDATE)\s+([A-Za-z0-9_."]+)/i.exec(st.replace(/\s+/g, ' '))
    if (!m || /['"`\\$]/.test(st) || !out.includes(st)) return null
    out = out.replace(st, `SELECT COUNT(*) FROM ${m[1]}`)
  }
  return out === raw ? null : out
}
