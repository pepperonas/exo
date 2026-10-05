/**
 * Flattens a parsed script into the commands it would run, with the context
 * each runs in (`via`): wrappers such as `sudo`, `env` or `nice` are peeled
 * off, `bash -c "…"` and the remote part of `ssh host …` are parsed again,
 * and commands inside substitutions are included.
 */
import { parse } from './parse'
import type { Redirect, Script, SimpleCommand, Word } from './parse'

export interface SshInfo {
  host: string
  user: string | null
  port: string | null
  /** The remote command as ssh hands it to the remote shell; '' for none. */
  remote: string
  /** The remote command did not parse. */
  remoteUnparsable: boolean
  /** Commands ssh runs on THIS machine (`-o ProxyCommand=…`, `LocalCommand`). */
  localCommands: string[]
  /** One of them did not parse. */
  localUnparsable: boolean
}

export interface Via {
  kind: 'sudo' | 'env' | 'wrapper' | 'shell' | 'ssh' | 'subst' | 'xargs' | 'heredoc'
  /** The program that introduced this level (`sudo`, `nice`, `bash`, …). */
  name: string
  host?: string
  user?: string | null
}

export interface Cmd {
  /** Program and arguments after peeling wrappers, as cooked text. */
  argv: string[]
  words: Word[]
  /** Basename of `argv[0]`. */
  program: string
  redirects: Redirect[]
  assigns: string[]
  via: Via[]
  /** Ran in the background (`&`). */
  background: boolean
  ssh?: SshInfo
}

export const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh', 'ash', 'fish'])

export const basename = (p: string): string => p.slice(p.lastIndexOf('/') + 1)

/** Options that take a separate argument, per wrapper. */
const WRAPPERS: Record<string, { kind: Via['kind']; arg: Set<string>; leading?: 'duration' | 'assign' }> = {
  sudo: { kind: 'sudo', arg: new Set(['-u', '-g', '-h', '-p', '-C', '-D', '-r', '-t', '-U', '-T', '-R']) },
  doas: { kind: 'sudo', arg: new Set(['-u', '-C']) },
  env: { kind: 'env', arg: new Set(['-u', '-C', '-S', '--unset', '--chdir', '--split-string']), leading: 'assign' },
  nice: { kind: 'wrapper', arg: new Set(['-n', '--adjustment']) },
  nohup: { kind: 'wrapper', arg: new Set() },
  time: { kind: 'wrapper', arg: new Set(['-f', '-o']) },
  command: { kind: 'wrapper', arg: new Set() },
  builtin: { kind: 'wrapper', arg: new Set() },
  exec: { kind: 'wrapper', arg: new Set(['-a']) },
  timeout: { kind: 'wrapper', arg: new Set(['-s', '-k', '--signal', '--kill-after']), leading: 'duration' },
  gtimeout: { kind: 'wrapper', arg: new Set(['-s', '-k', '--signal', '--kill-after']), leading: 'duration' },
  stdbuf: { kind: 'wrapper', arg: new Set(['-i', '-o', '-e']) },
  ionice: { kind: 'wrapper', arg: new Set(['-c', '-n', '-p', '-P', '-u']) },
  caffeinate: { kind: 'wrapper', arg: new Set(['-t', '-w']) },
  chronic: { kind: 'wrapper', arg: new Set() },
  unbuffer: { kind: 'wrapper', arg: new Set() },
  xargs: { kind: 'xargs', arg: new Set(['-a', '-d', '-E', '-I', '-L', '-n', '-P', '-s', '--arg-file', '--delimiter', '--max-args', '--max-procs', '--max-chars', '--replace']) },
}

const SSH_ARG = new Set(['-b', '-c', '-D', '-E', '-e', '-F', '-I', '-i', '-J', '-L', '-l', '-m', '-O', '-o', '-p', '-Q', '-R', '-S', '-W', '-w', '-B'])

/**
 * Peels one wrapper off `words`; returns the rest and the level, or null
 * when `words[0]` is no wrapper (or `command -v`, which runs nothing).
 */
function peel(words: Word[]): { rest: Word[]; via: Via } | null {
  const name = basename(words[0]?.text ?? '')
  const spec = WRAPPERS[name]
  if (!spec) return null
  let i = 1
  if (name === 'command' && (words[1]?.text === '-v' || words[1]?.text === '-V')) return { rest: [], via: { kind: 'wrapper', name } }
  for (; i < words.length; i++) {
    const t = words[i]!.text
    if (t === '--') {
      i++
      break
    }
    if (spec.leading === 'assign' && /^[A-Za-z_][A-Za-z0-9_]*=/.test(t)) continue
    if (name === 'nice' && /^-\d+$/.test(t)) continue
    if (!t.startsWith('-') || t === '-') break
    const opt = t.includes('=') ? t.slice(0, t.indexOf('=')) : t
    // `-u root` takes the next word; `-uroot` and `--user=root` carry it.
    if (spec.arg.has(opt) && !t.includes('=')) i++
  }
  if (spec.leading === 'duration' && i < words.length) i++
  const via: Via = { kind: spec.kind, name }
  if (spec.kind === 'sudo') {
    const u = words.findIndex(w => w.text === '-u')
    via.user = u > 0 && u < i ? (words[u + 1]?.text ?? null) : 'root'
  }
  return { rest: words.slice(i), via }
}

/** `bash -lc "script" …`: the script, or null when this is no `-c` call. */
function shellScript(words: Word[]): string | null {
  let sawC = false
  for (let i = 1; i < words.length; i++) {
    const t = words[i]!.text
    if (t === '--') {
      return sawC ? (words[i + 1]?.text ?? null) : null
    }
    if (t === '-o' || t === '+o' || t === '-O' || t === '+O') {
      i++
      continue
    }
    if (t.startsWith('--')) continue
    if (/^[-+][A-Za-z]+$/.test(t)) {
      if (t.startsWith('-') && t.includes('c')) sawC = true
      continue
    }
    return sawC ? t : null
  }
  return null
}

/** Destination and remote command of an ssh call, or null without one. */
/** ssh options whose value is a command run locally. */
const SSH_LOCAL = /^(proxycommand|localcommand)\s*(?:=|\s)\s*(.+)$/is

export function sshInfo(words: Word[]): SshInfo | null {
  let user: string | null = null
  let port: string | null = null
  const localCommands: string[] = []
  let i = 1
  for (; i < words.length; i++) {
    const t = words[i]!.text
    if (t === '--') {
      i++
      break
    }
    if (!t.startsWith('-')) break
    const flag = t.slice(0, 2)
    if (SSH_ARG.has(flag)) {
      const value = t.length > 2 ? t.slice(2) : words[++i]?.text ?? ''
      if (flag === '-l') user = value
      if (flag === '-p') port = value
      if (flag === '-o') {
        const m = SSH_LOCAL.exec(value)
        if (m) localCommands.push(m[2]!)
      }
    }
  }
  const dest = words[i]?.text
  if (!dest) return localCommands.length ? { host: '', user, port, remote: '', remoteUnparsable: false, localCommands, localUnparsable: false } : null
  let host = dest
  const url = /^ssh:\/\/(?:([^@/]+)@)?([^:/]+)(?::(\d+))?/.exec(dest)
  if (url) {
    user = url[1] ?? user
    host = url[2]!
    port = url[3] ?? port
  } else if (dest.includes('@')) {
    user = dest.slice(0, dest.lastIndexOf('@'))
    host = dest.slice(dest.lastIndexOf('@') + 1)
  }
  const remote = words
    .slice(i + 1)
    .map(w => w.text)
    .join(' ')
  return { host, user, port, remote, remoteUnparsable: false, localCommands, localUnparsable: false }
}

export function commands(script: Script, via: Via[] = []): Cmd[] {
  const out: Cmd[] = []
  for (const entry of script.entries) {
    for (const c of entry.pipeline.commands) {
      if (c.type === 'simple') simple(c, via, entry.op === '&', out)
      else {
        out.push(...commands(c.body, via))
        for (const r of c.redirects) for (const s of r.target?.subs ?? []) out.push(...commands(s, [...via, { kind: 'subst', name: '$()' }]))
      }
    }
  }
  return out
}

function simple(c: SimpleCommand, via: Via[], background: boolean, out: Cmd[]): void {
  const subVia = [...via, { kind: 'subst', name: '$()' } as Via]
  for (const w of [...c.assigns, ...c.words]) for (const s of w.subs) out.push(...commands(s, subVia))
  for (const r of c.redirects) for (const s of r.target?.subs ?? []) out.push(...commands(s, subVia))

  let words = c.words
  let chain = via
  for (let guard = 0; guard < 16; guard++) {
    const p = peel(words)
    if (!p) break
    words = p.rest
    chain = [...chain, p.via]
  }
  if (!words.length) return

  const program = basename(words[0]!.text)
  const cmd: Cmd = {
    argv: words.map(w => w.text),
    words,
    program,
    redirects: c.redirects,
    assigns: c.assigns.map(w => w.text),
    via: chain,
    background,
  }
  out.push(cmd)

  if (SHELLS.has(program)) {
    const inner = shellScript(words)
    const next: Via[] = [...chain, { kind: 'shell', name: program }]
    if (inner !== null) {
      const r = parse(inner)
      if (r.ok) out.push(...commands(r.script, next))
    } else if (words.length === 1 || words.slice(1).every(w => w.text.startsWith('-'))) {
      for (const r of c.redirects) {
        const body = r.heredoc?.body ?? (r.op === '<<<' ? r.target?.text : undefined)
        if (body === undefined) continue
        const parsed = parse(body)
        if (parsed.ok) out.push(...commands(parsed.script, [...chain, { kind: 'heredoc', name: program }]))
      }
    }
  }

  if (program === 'find') {
    // `-exec cmd … ;` / `-execdir … +` / `-ok …`: commands find runs
    for (let i = 1; i < words.length; i++) {
      if (!/^-(exec|execdir|ok|okdir)$/.test(words[i]!.text)) continue
      let j = i + 1
      while (j < words.length && words[j]!.text !== ';' && words[j]!.text !== '+') j++
      const inner = words.slice(i + 1, j)
      if (inner.length) simple({ type: 'simple', assigns: [], words: inner, redirects: [] }, [...chain, { kind: 'wrapper', name: 'find' }], background, out)
      i = j
    }
  }

  if (program === 'ssh') {
    const info = sshInfo(words)
    if (info) {
      for (const local of info.localCommands) {
        const r = parse(local)
        if (r.ok) out.push(...commands(r.script, [...chain, { kind: 'shell', name: 'ssh-local' }]))
        else info.localUnparsable = true
      }
      if (!info.host) return
      cmd.ssh = info
      if (info.remote) {
        const r = parse(info.remote)
        if (r.ok) out.push(...commands(r.script, [...chain, { kind: 'ssh', name: 'ssh', host: info.host, user: info.user }]))
        else info.remoteUnparsable = true
      } else {
        for (const r of c.redirects) {
          const body = r.heredoc?.body
          if (body === undefined) continue
          const parsed = parse(body)
          if (parsed.ok) out.push(...commands(parsed.script, [...chain, { kind: 'ssh', name: 'ssh', host: info.host, user: info.user }]))
        }
      }
    }
  }
}

/** Parses and flattens in one step; `null` when the command does not parse. */
export function commandsOf(src: string): Cmd[] | null {
  const r = parse(src)
  return r.ok ? commands(r.script) : null
}

const SUBCOMMANDS = new Set(['git', 'npm', 'pnpm', 'yarn', 'bun', 'cargo', 'docker', 'systemctl', 'kubectl', 'gh', 'pip', 'pip3', 'brew', 'go', 'make', 'npx', 'uv', 'poetry'])

/**
 * A short, argument-free description of what a command runs, for the
 * journal: program names (plus the subcommand of tools like git), never
 * arguments, so no path, host or value from the command is kept.
 */
export function summarize(src: string, max = 120): string {
  const cmds = commandsOf(src)
  if (!cmds) return '(nicht lesbar)'
  const parts = cmds.map(c => {
    const sub = SUBCOMMANDS.has(c.program) ? c.argv.slice(1).find(a => /^[a-z][a-z0-9:-]*$/.test(a)) : undefined
    const where = c.via.some(v => v.kind === 'ssh') ? 'ssh:' : ''
    return where + (sub ? `${c.program} ${sub}` : c.program)
  })
  const s = parts.join(' · ')
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}
