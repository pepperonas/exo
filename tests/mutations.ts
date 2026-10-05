/**
 * Mutations for `npm run mutate`: each breaks one safety-relevant behaviour
 * on purpose; the named test files must then fail. A mutation whose `find`
 * is not in the file exactly once is invalid and reported as such.
 */
export interface Mutation {
  id: string
  file: string
  find: string
  replace: string
  /** Test files that must turn red. */
  tests: string[]
  /** What the mutation breaks, in words. */
  breaks: string
}

const SHELL = ['tests/shell.spec.ts']
const DISP = ['tests/dispatcher.spec.ts']
const CORE = ['tests/core.spec.ts']

export const MUTATIONS: Mutation[] = [
  // ---- shell parser
  { id: 'sq-quote', file: 'core/shell/parse.ts', find: 'w.text += this.s.slice(this.i + 1, end)', replace: 'w.text += this.s.slice(this.i, end)', tests: SHELL, breaks: 'einfache Anführungszeichen bleiben im Wort' },
  { id: 'and-op', file: 'core/shell/parse.ts', find: "if (this.at('&&')) return (this.i += 2), '&&'", replace: '', tests: SHELL, breaks: '&& wird nicht als Operator erkannt' },
  { id: 'dq-escape', file: 'core/shell/parse.ts', find: "else if ('$`\"\\\\'.includes(n)) {", replace: 'else if (false) {', tests: SHELL, breaks: 'Escapes in doppelten Anführungszeichen' },
  { id: 'cmdsub', file: 'core/shell/parse.ts', find: '      w.subs.push(this.sub())\n      w.expansion = true\n      return this.s.slice(start, this.i)', replace: '      this.sub()\n      w.expansion = true\n      return this.s.slice(start, this.i)', tests: SHELL, breaks: '$(…) wird nicht als Befehl erfasst' },
  { id: 'backtick', file: 'core/shell/parse.ts', find: 'w.subs.push(p.parseScript(null))', replace: 'p.parseScript(null)', tests: SHELL, breaks: 'Backticks werden nicht als Befehl erfasst' },
  { id: 'heredoc-tabs', file: 'core/shell/parse.ts', find: "const cmp = r.op === '<<-' ? line.replace(/^\\t+/, '') : line", replace: 'const cmp = line', tests: SHELL, breaks: '<<- mit Tabs findet sein Ende nicht' },
  { id: 'trailing-and', file: 'core/shell/parse.ts', find: "this.fail(`${op} ohne folgenden Befehl`)", replace: 'void 0', tests: SHELL, breaks: '`a &&` gilt als vollständig' },
  { id: 'redirect-fd', file: 'core/shell/parse.ts', find: 'const fd = m[1] ? Number(m[1]) : null', replace: 'const fd = null', tests: SHELL, breaks: 'Dateideskriptor einer Umleitung geht verloren' },
  { id: 'glob-flag', file: 'core/shell/parse.ts', find: "if (ch === '*' || ch === '?' || ch === '[') w.glob = true", replace: '', tests: SHELL, breaks: 'Globs werden nicht markiert' },
  { id: 'bash-c', file: 'core/shell/words.ts', find: "if (t.startsWith('-') && t.includes('c')) sawC = true", replace: '', tests: SHELL, breaks: 'bash -c "…" wird nicht untersucht' },
  { id: 'ssh-remote', file: 'core/shell/words.ts', find: '      if (info.remote) {', replace: '      if (false) {', tests: SHELL, breaks: 'der Remote-Befehl von ssh wird nicht untersucht' },
  { id: 'ssh-user', file: 'core/shell/words.ts', find: "    user = dest.slice(0, dest.lastIndexOf('@'))\n    host = dest.slice(dest.lastIndexOf('@') + 1)", replace: '', tests: SHELL, breaks: 'user@host wird nicht in Host und Nutzer zerlegt' },
  { id: 'sudo-peel', file: 'core/shell/words.ts', find: "  sudo: { kind: 'sudo',", replace: "  sudox: { kind: 'sudo',", tests: SHELL, breaks: 'sudo wird nicht abgeschält' },
  { id: 'xargs-peel', file: 'core/shell/words.ts', find: "  xargs: { kind: 'xargs',", replace: "  xargsx: { kind: 'xargs',", tests: SHELL, breaks: 'xargs rm wird nicht als rm erkannt' },
  { id: 'subst-cmds', file: 'core/shell/words.ts', find: '  for (const w of [...c.assigns, ...c.words]) for (const s of w.subs) out.push(...commands(s, subVia))', replace: '', tests: SHELL, breaks: 'Befehle in Substitutionen fehlen' },
  { id: 'summary-args', file: 'core/shell/words.ts', find: "    return where + (sub ? `${c.program} ${sub}` : c.program)", replace: "    return where + c.argv.join(' ')", tests: SHELL, breaks: 'Zusammenfassung enthält Argumente (Geheimnisse könnten ins Journal)' },
  { id: 'arith-subs', file: 'core/shell/parse.ts', find: "      else if (ch === '`' || (ch === '$' && (this.s[j + 1] === '(' || this.s[j + 1] === '{'))) j = this.skipSub(j, w)\n      else if (ch === '(') depth++, j++", replace: "      else if (ch === '(') depth++, j++", tests: SHELL, breaks: 'Befehle in $(( … )) bleiben unsichtbar' },
  { id: 'arith-depth', file: 'core/shell/parse.ts', find: "        if (depth === 0) return this.s[j + 1] === ')' ? j + 2 : -1", replace: "        if (this.s[j + 1] === ')') return j + 2", tests: SHELL, breaks: 'verschachtelte Klammern beenden Arithmetik zu früh' },
  { id: 'arith-fallback', file: 'core/shell/parse.ts', find: "      if (end !== -1) {\n        this.i = end\n        w.expansion = true", replace: "      if (true) {\n        this.i = end\n        w.expansion = true", tests: SHELL, breaks: '$((cmd) ) wird nicht als Befehl gelesen' },
  { id: 'brace-subs', file: 'core/shell/parse.ts', find: "      } else if (ch === '`' || (ch === '$' && (this.s[j + 1] === '(' || this.s[j + 1] === '{'))) j = this.skipSub(j, w)\n      else if (ch === '{') depth++, j++", replace: "      } else if (ch === '{') depth++, j++", tests: SHELL, breaks: 'Befehle in ${x:-$(…)} bleiben unsichtbar' },
  { id: 'brace-quoted', file: 'core/shell/parse.ts', find: "        this.subsAnywhere(this.s.slice(j + 1, k), w)\n", replace: '', tests: SHELL, breaks: "Befehle in ${x:-'$(…)'} bleiben unsichtbar" },
  { id: 'ssh-proxy', file: 'core/shell/words.ts', find: '        if (m) localCommands.push(m[2]!)', replace: '', tests: SHELL, breaks: 'ssh -o ProxyCommand führt unsichtbar lokal aus' },
  { id: 'find-exec', file: 'core/shell/words.ts', find: "      if (!/^-(exec|execdir|ok|okdir)$/.test(words[i]!.text)) continue", replace: '      continue', tests: SHELL, breaks: 'find -exec rm bleibt unsichtbar' },
  // ---- self protection
  { id: 'self-off', file: 'core/dispatcher/dispatcher.ts', find: '    if (touchesControl(ctx.call)) {', replace: '    if (false) {', tests: DISP, breaks: 'Claude kann den Notausschalter selbst setzen' },
  { id: 'self-esc', file: 'core/dispatcher/dispatcher.ts', find: '          allowed = false // Esc, or nobody to ask', replace: '          allowed = true', tests: DISP, breaks: 'Esc im Dialog erlaubt die Änderung' },
  { id: 'self-path', file: 'core/selfprotect.ts', find: '    if (isExoPath(path)) return true', replace: '', tests: DISP, breaks: 'Write auf ~/.claude/exo/ geht ungefragt durch' },
  { id: 'self-readonly', file: 'core/selfprotect.ts', find: "  return cmds.every(c => READ_ONLY.has(c.program) && !c.redirects.some(x => WRITE_OPS.has(x.op) && x.target?.text !== '/dev/null'))", replace: '  return true', tests: DISP, breaks: 'jeder Bash-Befehl gilt als nur lesend' },
  { id: 'self-settings', file: 'core/selfprotect.ts', find: '      return mentionsExoConfig(text)', replace: '      return false', tests: DISP, breaks: 'exo-Optionen in settings.json gehen ungefragt durch' },
  // ---- dispatcher
  { id: 'fail-closed', file: 'core/dispatcher/dispatcher.ts', find: "      if (policyOf(step.id) === 'closed') {", replace: '      if (false) {', tests: DISP, breaks: 'ein gestörter Wächter lässt durch' },
  { id: 'deny-stops', file: 'core/dispatcher/dispatcher.ts', find: '      return { deny: out.deny }', replace: '      void 0', tests: DISP, breaks: 'eine Ablehnung wird ignoriert' },
  { id: 'kill-first', file: 'core/dispatcher/dispatcher.ts', find: '  if (await deps.killed()) return next({ ...call.input })', replace: '', tests: DISP, breaks: 'der Notausschalter wirkt nicht im Dispatcher' },
  { id: 'step-order', file: 'core/dispatcher/dispatcher.ts', find: '  return [...steps].sort((a, b) => rank(a) - rank(b))', replace: '  return [...steps]', tests: DISP, breaks: 'die feste Reihenfolge gilt nicht' },
  { id: 'catch-guarded', file: 'core/dispatcher/dispatcher.ts', find: "  if (killed || !GUARDED_TOOLS.has(tool)) return 'pass'", replace: "  return 'pass'", tests: DISP, breaks: 'der Kern-Ausfall lässt Bash durch' },
  { id: 'catch-ran', file: 'core/dispatcher/dispatcher.ts', find: "  if (alreadyRan) return 'leave'", replace: '', tests: DISP, breaks: 'ein schon gelaufener Aufruf wird nachträglich abgelehnt' },
  { id: 'disabled-off', file: 'core/dispatcher/dispatcher.ts', find: '    if (!step.before || !deps.config.enabled[step.id]) continue', replace: '    if (!step.before) continue', tests: DISP, breaks: 'abgeschaltete Module laufen weiter' },
  // ---- kill switch, rules
  { id: 'kill-file', file: 'core/killswitch.ts', find: "  if (s.fileExists) return 'Datei ~/.claude/exo/DISABLED'", replace: '', tests: CORE, breaks: 'die DISABLED-Datei wirkt nicht' },
  { id: 'kill-env', file: 'core/killswitch.ts', find: "  if (s.env !== undefined && s.env !== '' && s.env !== '0' && s.env.toLowerCase() !== 'false') return 'EXO_DISABLE'", replace: '', tests: CORE, breaks: 'EXO_DISABLE wirkt nicht' },
  { id: 'kill-cache', file: 'core/killswitch.ts', find: '    if (!this.cached || t - this.cached.at >= this.cacheMs) {', replace: '    if (!this.cached) {', tests: CORE, breaks: 'die Datei wird nach dem ersten Blick nie wieder geprüft' },
  { id: 'rules-unknown', file: 'core/config/rules.ts', find: '  if (unknown.length) return', replace: '  if (false) return', tests: CORE, breaks: 'Tippfehler in Regelfeldern fallen nicht auf' },
  { id: 'rules-fallback', file: 'core/config/rules.ts', find: "  if (v.fatal) return { rules: defaultRules(),", replace: "  if (v.fatal) return { rules: [],", tests: CORE, breaks: 'kaputte rules.json verliert die eingebauten Regeln' },
]
