/**
 * A Bash parser for recognising commands, not for running them.
 *
 * It never executes or expands anything. Words come back "cooked" (quotes
 * removed, escapes resolved), with flags for what the shell would still
 * expand: parameters and substitutions (`expansion`), globs and braces
 * (`glob`) and a leading tilde (`tilde`). Command substitutions, backticks
 * and process substitutions are parsed into nested scripts (`subs`).
 *
 * `parse` never throws: malformed input is `{ ok: false, error }`.
 */

export interface Word {
  /** The word as the command receives it, expansions left as written. */
  text: string
  /** Some part of it was quoted or escaped. */
  quoted: boolean
  /** Contains `$…`, `${…}`, `$(…)`, backticks or arithmetic. */
  expansion: boolean
  /** Contains an unquoted `*`, `?`, `[` or brace expansion. */
  glob: boolean
  /** Starts with an unquoted `~`. */
  tilde: boolean
  /** Scripts of the command and process substitutions inside the word. */
  subs: Script[]
}

export interface Heredoc {
  delimiter: string
  body: string
  /** The delimiter was quoted: the body is not expanded. */
  quoted: boolean
}

export interface Redirect {
  op: '>' | '>>' | '>|' | '<' | '<>' | '<<' | '<<-' | '<<<' | '>&' | '<&' | '&>' | '&>>'
  fd: number | null
  target: Word | null
  heredoc?: Heredoc
}

export interface SimpleCommand {
  type: 'simple'
  assigns: Word[]
  words: Word[]
  redirects: Redirect[]
}

export interface Compound {
  type: 'subshell' | 'group'
  body: Script
  redirects: Redirect[]
}

export type Command = SimpleCommand | Compound

export interface Pipeline {
  commands: Command[]
  negated: boolean
}

export interface ListEntry {
  pipeline: Pipeline
  /** The operator after this pipeline, `null` for the last one. */
  op: ';' | '&&' | '||' | '&' | null
}

export interface Script {
  entries: ListEntry[]
}

export type ParseResult = { ok: true; script: Script } | { ok: false; error: string }

export const MAX_INPUT = 200_000
const MAX_DEPTH = 24

class ParseError extends Error {}

const BLANK = new Set([' ', '\t', '\r'])
/** Characters that end an unquoted word. */
const META = new Set([' ', '\t', '\r', '\n', ';', '&', '|', '(', ')', '<', '>'])

function emptyWord(): Word {
  return { text: '', quoted: false, expansion: false, glob: false, tilde: false, subs: [] }
}

class Parser {
  i: number
  private pending: Redirect[] = []

  constructor(
    readonly s: string,
    start: number,
    readonly depth: number,
  ) {
    if (depth > MAX_DEPTH) throw new ParseError('zu tief verschachtelt')
    this.i = start
  }

  private get c(): string {
    return this.s[this.i] ?? ''
  }

  private at(str: string): boolean {
    return this.s.startsWith(str, this.i)
  }

  private fail(msg: string): never {
    throw new ParseError(`${msg} (Zeichen ${this.i})`)
  }

  /** Spaces, tabs, line continuations and comments; not newlines. */
  private skipBlank(): void {
    for (;;) {
      if (BLANK.has(this.c)) this.i++
      else if (this.at('\\\n')) this.i += 2
      else if (this.c === '#') {
        while (this.i < this.s.length && this.s[this.i] !== '\n') this.i++
      } else return
    }
  }

  /** Consumes one newline and reads the bodies of heredocs waiting for it. */
  private newline(): void {
    this.i++
    const waiting = this.pending
    this.pending = []
    for (const r of waiting) {
      const h = r.heredoc!
      const lines: string[] = []
      for (;;) {
        if (this.i >= this.s.length) this.fail(`heredoc ${h.delimiter} not terminated`)
        const end = this.s.indexOf('\n', this.i)
        const line = this.s.slice(this.i, end === -1 ? this.s.length : end)
        this.i = end === -1 ? this.s.length : end + 1
        const cmp = r.op === '<<-' ? line.replace(/^\t+/, '') : line
        if (cmp === h.delimiter) break
        lines.push(line)
      }
      h.body = lines.length ? lines.join('\n') + '\n' : ''
    }
  }

  private skipBlankAndNewlines(): void {
    for (;;) {
      this.skipBlank()
      if (this.c === '\n') this.newline()
      else return
    }
  }

  /** True when the next word is exactly `w` (an unquoted reserved word). */
  private atWord(w: string): boolean {
    if (!this.at(w)) return false
    const after = this.s[this.i + w.length]
    return after === undefined || META.has(after)
  }

  parseScript(end: ')' | '}' | null): Script {
    const entries: ListEntry[] = []
    for (;;) {
      this.skipBlankAndNewlines()
      if (this.i >= this.s.length) {
        if (end) this.fail(`${end === ')' ? 'parenthesis' : 'block'} not closed`)
        break
      }
      if (end === ')' && this.c === ')') break
      if (end === '}' && this.atWord('}')) break
      if (this.c === ';' || this.c === '&' || this.c === '|' || this.c === ')') this.fail(`unerwartetes ${this.c}`)
      const pipeline = this.parsePipeline()
      const op = this.parseOp()
      entries.push({ pipeline, op })
      if (op === '&&' || op === '||') {
        this.skipBlankAndNewlines()
        if (this.i >= this.s.length || (end === ')' && this.c === ')') || (end === '}' && this.atWord('}'))) this.fail(`${op} without a following command`)
      }
      if (op === null) {
        this.skipBlank()
        if (this.i >= this.s.length) break
        if (end === ')' && this.c === ')') break
        if (end === '}' && this.atWord('}')) break
        this.fail(`unerwartetes ${this.c}`)
      }
    }
    if (entries.length) entries[entries.length - 1]!.op = entries[entries.length - 1]!.op === '&' ? '&' : null
    if (this.pending.length && end === null) this.fail(`heredoc ${this.pending[0]!.heredoc!.delimiter} not terminated`)
    return { entries }
  }

  private parseOp(): ListEntry['op'] {
    this.skipBlank()
    if (this.at('&&')) return (this.i += 2), '&&'
    if (this.at('||')) return (this.i += 2), '||'
    if (this.at(';;')) return (this.i += 2), ';'
    if (this.c === ';') return this.i++, ';'
    if (this.c === '&' && !this.at('&>')) return this.i++, '&'
    if (this.c === '\n') return this.newline(), ';'
    return null
  }

  private parsePipeline(): Pipeline {
    let negated = false
    this.skipBlank()
    if (this.atWord('!')) {
      negated = true
      this.i++
    }
    const commands = [this.parseCommand()]
    for (;;) {
      this.skipBlank()
      if (this.c === '|' && !this.at('||')) {
        this.i += this.at('|&') ? 2 : 1
        this.skipBlankAndNewlines()
        commands.push(this.parseCommand())
      } else break
    }
    return { commands, negated }
  }

  private parseCommand(): Command {
    this.skipBlank()
    if (this.at('((')) {
      const start = this.i
      const w = { ...emptyWord(), expansion: true }
      const end = this.arithEnd(this.i, w)
      // `((cmd) )` is no arithmetic: bash reads a subshell in a subshell
      if (end !== -1) {
        this.i = end
        w.text = this.s.slice(start, end)
        return { type: 'simple', assigns: [], words: [w], redirects: this.parseRedirects() }
      }
    }
    if (this.c === '(') {
      this.i++
      const body = new Parser(this.s, this.i, this.depth + 1)
      const script = body.parseScript(')')
      this.i = body.i
      if (this.s[this.i] !== ')') this.fail('parenthesis not closed')
      this.i++
      return { type: 'subshell', body: script, redirects: this.parseRedirects() }
    }
    if (this.atWord('{')) {
      this.i++
      const script = this.parseScript('}')
      if (!this.atWord('}')) this.fail('block not closed')
      this.i++
      return { type: 'group', body: script, redirects: this.parseRedirects() }
    }
    const cmd: SimpleCommand = { type: 'simple', assigns: [], words: [], redirects: [] }
    for (;;) {
      this.skipBlank()
      const ch = this.c
      if (ch === '' || ch === '\n' || ch === ';' || ch === '|' || ch === ')') break
      if (ch === '&' && !this.at('&>')) break
      const r = this.tryRedirect()
      if (r) {
        cmd.redirects.push(r)
        continue
      }
      const start = this.i
      const w = this.parseWord()
      if (this.i === start) this.fail(`unerwartetes ${ch}`)
      if (cmd.words.length === 0 && /^[A-Za-z_][A-Za-z0-9_]*\+?=/.test(this.s.slice(start, this.i))) cmd.assigns.push(w)
      else cmd.words.push(w)
    }
    if (!cmd.words.length && !cmd.assigns.length && !cmd.redirects.length) this.fail('empty command')
    return cmd
  }

  private parseRedirects(): Redirect[] {
    const out: Redirect[] = []
    for (;;) {
      this.skipBlank()
      const r = this.tryRedirect()
      if (!r) return out
      out.push(r)
    }
  }

  private tryRedirect(): Redirect | null {
    const m = /^(\d*)(&>>|&>|>>|>&|>\||<<<|<<-|<<|<&|<>|>|<)/.exec(this.s.slice(this.i, this.i + 12))
    if (!m) return null
    const op = m[2] as Redirect['op']
    // `<(cmd)` and `>(cmd)` are process substitutions, read as words.
    if ((op === '<' || op === '>') && this.s[this.i + m[0].length] === '(' && !m[1]) return null
    if (m[1] && (op === '&>' || op === '&>>')) return null
    this.i += m[0].length
    const fd = m[1] ? Number(m[1]) : null
    this.skipBlank()
    if (op === '<<' || op === '<<-') {
      const start = this.i
      const w = this.parseWord()
      if (this.i === start) this.fail('Heredoc ohne Begrenzer')
      const r: Redirect = { op, fd, target: w, heredoc: { delimiter: w.text, body: '', quoted: w.quoted } }
      this.pending.push(r)
      return r
    }
    const start = this.i
    const target = this.parseWord()
    if (this.i === start) this.fail(`Umleitung ${op} ohne Ziel`)
    return { op, fd, target }
  }

  /** Reads `$(…)` from `i` (just past `$(`) and returns its script. */
  private sub(): Script {
    const p = new Parser(this.s, this.i, this.depth + 1)
    const script = p.parseScript(')')
    this.i = p.i
    if (this.c !== ')') this.fail('command substitution not closed')
    this.i++
    return script
  }

  /**
   * Skips a substitution (`$…` or a backtick) at `j` and adds the scripts
   * it runs to `w`; returns the index after it.
   */
  private skipSub(j: number, w: Word): number {
    const p = new Parser(this.s, j, this.depth + 1)
    if (this.s[j] === '`') p.backtick(w)
    else p.dollar(w)
    return p.i
  }

  /**
   * The end of arithmetic whose `((` starts at `from`: the index after the
   * closing `))`, nested parentheses counted, substitutions inside parsed
   * into `w` (bash runs them). -1 when the parentheses close as `)…)` with
   * something between: bash then reads `$((a) )` / `((a) )` as subshells.
   */
  private arithEnd(from: number, w: Word): number {
    let depth = 0
    let j = from + 2
    while (j < this.s.length) {
      const ch = this.s[j]
      if (ch === '\\') j += 2
      else if (ch === '`' || (ch === '$' && (this.s[j + 1] === '(' || this.s[j + 1] === '{'))) j = this.skipSub(j, w)
      else if (ch === '(') depth++, j++
      else if (ch === ')') {
        if (depth === 0) return this.s[j + 1] === ')' ? j + 2 : -1
        depth--
        j++
      } else j++
    }
    this.fail('arithmetic not closed')
  }

  /**
   * Substitutions anywhere in `text`, quoted or not: inside a `${…}` a
   * single-quoted part is literal in one context and quoting in another, so
   * the guard looks at both readings.
   */
  private subsAnywhere(text: string, w: Word): void {
    const p = new Parser(text, 0, this.depth + 1)
    while (p.i < text.length) {
      const ch = text[p.i]
      if (ch === '\\') p.i += 2
      else if (ch === '`' || (ch === '$' && (text[p.i + 1] === '(' || text[p.i + 1] === '{'))) {
        if (ch === '`') p.backtick(w)
        else p.dollar(w)
      } else p.i++
    }
  }

  /**
   * Index of the `}` closing a `${` whose content starts at `i`, with
   * quotes, nested braces and substitutions respected; substitutions inside
   * (`${x:-$(cmd)}`) are parsed into `w`, because bash runs them.
   */
  private braceEnd(w: Word): number {
    let depth = 1
    let j = this.i
    while (j < this.s.length) {
      const ch = this.s[j]
      if (ch === '\\') j += 2
      else if (ch === "'") {
        const k = this.s.indexOf("'", j + 1)
        if (k === -1) break
        this.subsAnywhere(this.s.slice(j + 1, k), w)
        j = k + 1
      } else if (ch === '"') {
        j++
        while (j < this.s.length && this.s[j] !== '"') {
          if (this.s[j] === '\\') j += 2
          else if (this.s[j] === '`' || (this.s[j] === '$' && (this.s[j + 1] === '(' || this.s[j + 1] === '{'))) j = this.skipSub(j, w)
          else j++
        }
        if (j >= this.s.length) break
        j++
      } else if (ch === '`' || (ch === '$' && (this.s[j + 1] === '(' || this.s[j + 1] === '{'))) j = this.skipSub(j, w)
      else if (ch === '{') depth++, j++
      else if (ch === '}') {
        if (--depth === 0) return j
        j++
      } else j++
    }
    this.fail('${ not closed')
  }

  /** `$…` at `i`, inside or outside double quotes; returns the raw text. */
  dollar(w: Word): string {
    const start = this.i
    if (this.at('$((')) {
      const end = this.arithEnd(this.i + 1, w)
      if (end !== -1) {
        this.i = end
        w.expansion = true
        return this.s.slice(start, this.i)
      }
      // `$((cmd) )`: a command substitution of a subshell
    }
    if (this.at('$(')) {
      this.i += 2
      w.subs.push(this.sub())
      w.expansion = true
      return this.s.slice(start, this.i)
    }
    if (this.at('${')) {
      this.i += 2
      this.i = this.braceEnd(w) + 1
      w.expansion = true
      return this.s.slice(start, this.i)
    }
    const m = /^\$([A-Za-z_][A-Za-z0-9_]*|[0-9@*#?$!-])/.exec(this.s.slice(this.i, this.i + 256))
    if (m) {
      this.i += m[0].length
      w.expansion = true
      return m[0]
    }
    this.i++
    return '$'
  }

  backtick(w: Word): string {
    const start = this.i
    let j = this.i + 1
    let inner = ''
    for (;;) {
      if (j >= this.s.length) this.fail('backtick not closed')
      const ch = this.s[j]!
      if (ch === '\\' && (this.s[j + 1] === '`' || this.s[j + 1] === '\\' || this.s[j + 1] === '$')) {
        inner += this.s[j + 1]
        j += 2
      } else if (ch === '`') break
      else {
        inner += ch
        j++
      }
    }
    this.i = j + 1
    const p = new Parser(inner, 0, this.depth + 1)
    w.subs.push(p.parseScript(null))
    w.expansion = true
    return this.s.slice(start, this.i)
  }

  private ansiC(w: Word): void {
    this.i += 2
    const map: Record<string, string> = { n: '\n', t: '\t', r: '\r', a: '\x07', b: '\b', e: '\x1b', E: '\x1b', f: '\f', v: '\v', '\\': '\\', "'": "'", '"': '"', '?': '?' }
    for (;;) {
      if (this.i >= this.s.length) this.fail("$' not closed")
      const ch = this.c
      if (ch === "'") {
        this.i++
        break
      }
      if (ch === '\\') {
        const n = this.s[this.i + 1] ?? ''
        const hex = /^x([0-9a-fA-F]{1,2})/.exec(this.s.slice(this.i + 1, this.i + 4))
        const oct = /^([0-7]{1,3})/.exec(this.s.slice(this.i + 1, this.i + 4))
        if (hex) {
          w.text += String.fromCharCode(parseInt(hex[1]!, 16))
          this.i += 1 + hex[0].length
        } else if (oct) {
          w.text += String.fromCharCode(parseInt(oct[1]!, 8))
          this.i += 1 + oct[0].length
        } else {
          w.text += map[n] ?? '\\' + n
          this.i += 2
        }
      } else {
        w.text += ch
        this.i++
      }
    }
    w.quoted = true
  }

  parseWord(): Word {
    const w = emptyWord()
    const startI = this.i
    while (this.i < this.s.length) {
      const ch = this.c
      if ((ch === '<' || ch === '>') && this.s[this.i + 1] === '(' && this.i === startI) {
        this.i += 2
        w.subs.push(this.sub())
        w.expansion = true
        w.text += `${ch}(…)`
        continue
      }
      if (META.has(ch)) break
      if (ch === '\\') {
        if (this.s[this.i + 1] === '\n') this.i += 2
        else {
          w.text += this.s[this.i + 1] ?? ''
          w.quoted = true
          this.i += 2
        }
      } else if (ch === "'") {
        const end = this.s.indexOf("'", this.i + 1)
        if (end === -1) this.fail("' not closed")
        w.text += this.s.slice(this.i + 1, end)
        w.quoted = true
        this.i = end + 1
      } else if (this.at("$'")) {
        this.ansiC(w)
      } else if (ch === '"') {
        this.i++
        w.quoted = true
        for (;;) {
          if (this.i >= this.s.length) this.fail('" not closed')
          const d = this.c
          if (d === '"') {
            this.i++
            break
          }
          if (d === '\\') {
            const n = this.s[this.i + 1] ?? ''
            if (n === '\n') this.i += 2
            else if ('$`"\\'.includes(n)) {
              w.text += n
              this.i += 2
            } else {
              w.text += '\\'
              this.i++
            }
          } else if (d === '$') w.text += this.dollar(w)
          else if (d === '`') w.text += this.backtick(w)
          else {
            w.text += d
            this.i++
          }
        }
      } else if (ch === '$') {
        w.text += this.dollar(w)
      } else if (ch === '`') {
        w.text += this.backtick(w)
      } else {
        if (ch === '*' || ch === '?' || ch === '[') w.glob = true
        if (ch === '{' && /^\{[^{}\s]*(,|\.\.)[^{}\s]*\}/.test(this.s.slice(this.i, this.i + 200))) w.glob = true
        if (ch === '~' && this.i === startI) w.tilde = true
        w.text += ch
        this.i++
      }
    }
    return w
  }
}

export function parse(src: string): ParseResult {
  if (src.length > MAX_INPUT) return { ok: false, error: 'command too long to check' }
  try {
    const p = new Parser(src, 0, 0)
    const script = p.parseScript(null)
    return { ok: true, script }
  } catch (err) {
    if (err instanceof ParseError) return { ok: false, error: err.message }
    if (err instanceof RangeError) return { ok: false, error: 'zu tief verschachtelt' }
    return { ok: false, error: `internal error: ${(err as Error)?.message ?? String(err)}` }
  }
}
