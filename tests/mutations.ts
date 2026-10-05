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
const INTEG = ['tests/integrity.spec.ts']
const SEC = ['tests/secrets.spec.ts']
const PROD = ['tests/prod.spec.ts']
const BRAKE = ['tests/brake.spec.ts']
const DIET = ['tests/diet.spec.ts']
const COCK = ['tests/cockpit.spec.ts']
const RUECK = ['tests/rueckblick.spec.ts']
const EXTRAS = ['tests/extras.spec.ts']

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
  { id: 'self-off', file: 'core/dispatcher/dispatcher.ts', find: '    if (await touchesControlResolved(ctx.call, p => deps.host.realPath(p), { before: ctx.cwd, after: ctx.cmdCwd }, ctx.home)) {', replace: '    if (false) {', tests: DISP, breaks: 'Claude kann den Notausschalter selbst setzen' },
  { id: 'self-esc', file: 'core/dispatcher/dispatcher.ts', find: '          allowed = false // Esc, or nobody to ask', replace: '          allowed = true', tests: DISP, breaks: 'Esc im Dialog erlaubt die Änderung' },
  { id: 'self-path', file: 'core/selfprotect.ts', find: '    if (isExoPath(path)) return true', replace: '', tests: DISP, breaks: 'Write auf ~/.claude/exo/ geht ungefragt durch' },
  { id: 'self-readonly', file: 'core/selfprotect.ts', find: "  return cmds.every(c => READ_ONLY.has(c.program) && c.assigns.length === 0 && !c.via.some(v => v.kind === 'env' || v.kind === 'xargs') && !c.redirects.some(r => writes(r.op, r.target?.text)))", replace: '  return true', tests: DISP, breaks: 'jeder Bash-Befehl gilt als nur lesend' },
  { id: 'self-settings', file: 'core/selfprotect.ts', find: '      return mentionsExoConfig(text)', replace: '      return false', tests: DISP, breaks: 'exo-Optionen in settings.json gehen ungefragt durch' },
  { id: 'self-cooked', file: 'core/selfprotect.ts', find: '    if (namesControl(raw) || namesControl(cookedText(cmds))) return true', replace: '    if (namesControl(raw)) return true', tests: DISP, breaks: 'DIS""ABLED umgeht die Erkennung' },
  { id: 'self-bare-name', file: 'core/selfprotect.ts', find: '    /\\bDISABLED\\b/.test(t) ||\n', replace: '', tests: DISP, breaks: 'cd in einem Aufruf, touch DISABLED im nächsten' },
  { id: 'self-redir-amp', file: 'core/selfprotect.ts', find: "  if (op === '>&' || op === '<&') return op === '>&' && !/^(\\d+|-)$/.test(target ?? '')", replace: "  if (op === '>&' || op === '<&') return false", tests: DISP, breaks: '>&datei gilt als lesend' },
  { id: 'self-norm', file: 'core/selfprotect.ts', find: "  return ((abs ? '/' : '') + out.join('/')).toLowerCase()", replace: "  return p", tests: DISP, breaks: '// ./ ../ und Großschreibung umgehen den Pfadvergleich' },
  { id: 'self-unknown-tool', file: 'core/selfprotect.ts', find: '  return all.some(s => isExoPath(s)) ||', replace: '  return false &&', tests: DISP, breaks: 'MCP-Werkzeuge schreiben ungefragt in ~/.claude/exo' },
  { id: 'self-symlink', file: 'core/selfprotect.ts', find: '    if (real !== p && (isExoPath(real) ||', replace: '    if (false && (isExoPath(real) ||', tests: DISP, breaks: 'ein Symlink nach ~/.claude/exo umgeht den Schutz' },
  { id: 'self-glob', file: 'core/selfprotect.ts', find: '    if (words.some(w => w.glob && globHitsControl(w.text))) return true', replace: '', tests: DISP, breaks: 'touch DIS* umgeht den Schutz' },
  { id: 'self-expansion', file: 'core/selfprotect.ts', find: '    return words.some(w => w.expansion) &&', replace: '    return false &&', tests: DISP, breaks: 'Pfadstücke in Variablen umgehen den Schutz' },
  { id: 'self-opaque', file: 'core/selfprotect.ts', find: '    if (opaque(r.script, cmds)) return true', replace: '', tests: DISP, breaks: 'base64 -d | sh umgeht den Schutz' },
  { id: 'self-unresolved', file: 'core/selfprotect.ts', find: '    if (real === null) return true', replace: '', tests: DISP, breaks: 'ein nicht auflösbarer Pfad gilt als harmlos' },
  { id: 'self-pluginconfigs', file: 'core/selfprotect.ts', find: '    /pluginConfigs/i.test(t) ||', replace: '', tests: DISP, breaks: 'exo-Optionen über einen Symlink auf settings.json' },
  { id: 'self-cwd-dir', file: 'core/selfprotect.ts', find: '      if (dirs.some(inClaudeDir)) return true', replace: '', tests: INTEG, breaks: 'cd ~/.claude/exo, dann touch x' },
  { id: 'self-cwd-rel', file: 'core/selfprotect.ts', find: '        if (isExoPath(abs) || isSettings(abs)) return true', replace: '', tests: INTEG, breaks: 'relative Ziele nach ~/.claude/exo' },
  { id: 'self-cwd-after', file: 'core/selfprotect.ts', find: '      const dirs = [cwd.before, cwd.after]', replace: '      const dirs = [cwd.before]', tests: INTEG, breaks: 'cd innerhalb des Befehls wird übersehen' },
  // ---- effect check
  { id: 'eff-off', file: 'core/dispatcher/dispatcher.ts', find: '  if (guardEffects) before = await readControl(deps.host, deps.home!).catch(() => null)', replace: '', tests: INTEG, breaks: 'verschleierte Befehle setzen DISABLED unbemerkt' },
  { id: 'eff-esc', file: 'core/integrity.ts', find: '      } catch {\n        keep = false\n      }', replace: '      } catch {\n        keep = true\n      }', tests: INTEG, breaks: 'Esc behält die Änderung' },
  { id: 'eff-noui', file: 'core/integrity.ts', find: '    let keep = false\n    if (interactive) {', replace: '    let keep = true\n    if (interactive) {', tests: INTEG, breaks: 'ohne UI bleibt die Änderung' },
  { id: 'eff-disabled', file: 'core/integrity.ts', find: "  if (!a.disabled && b.disabled) out.push({ kind: 'disabled' })", replace: '', tests: INTEG, breaks: 'DISABLED wird nicht bemerkt' },
  { id: 'eff-rules', file: 'core/integrity.ts', find: "  if (a.rules !== b.rules) out.push({ kind: 'rules', before: a.rules })", replace: '', tests: INTEG, breaks: 'rules.json-Änderung wird nicht bemerkt' },
  { id: 'eff-settings', file: 'core/integrity.ts', find: "  for (const f of Object.keys(b.settings)) if (a.settings[f] !== b.settings[f])", replace: "  for (const f of Object.keys(b.settings)) if (false)", tests: INTEG, breaks: 'settings.json-Änderung wird nicht bemerkt' },
  { id: 'eff-prefs', file: 'core/integrity.ts', find: "  if (a.prefs !== b.prefs) out.push({ kind: 'prefs', before: a.prefs })", replace: '', tests: INTEG, breaks: '/exo-Schalter im Store unbemerkt geändert' },
  { id: 'eff-keep-others', file: 'core/integrity.ts', find: "  for (const k of Object.keys(pc)) if (k === 'exo' || k.startsWith('exo@')) delete pc[k]", replace: '  for (const k of Object.keys(pc)) delete pc[k]', tests: INTEG, breaks: 'Rücksetzen löscht fremde Plugin-Einstellungen' },
  { id: 'eff-approved', file: 'core/dispatcher/dispatcher.ts', find: ', c => approvedPath !== null && changeIs(c, approvedPath))', replace: ')', tests: INTEG, breaks: 'nach Zulassen wird ein zweites Mal gefragt (und rückgängig gemacht)' },
  { id: 'eff-approved-scope', file: 'core/dispatcher/dispatcher.ts', find: ', c => approvedPath !== null && changeIs(c, approvedPath))', replace: ', c => approvedPath !== null)', tests: INTEG, breaks: 'ein Zulassen deckt auch andere Schalter' },
  { id: 'eff-approved-bash', file: 'core/dispatcher/dispatcher.ts', find: "      if (!isBash) approvedPath = String(input.file_path ?? input.notebook_path ?? '') || null", replace: "      approvedPath = String(input.file_path ?? input.notebook_path ?? input.command ?? '') || null", tests: INTEG, breaks: 'ein Bash-Zulassen deckt die Wirkung' },
  // ---- secrets
  { id: 'sec-anthropic', file: 'modules/waechter/secrets-logic.ts', find: "{ kind: 'Anthropic-API-Schlüssel', re: /\\bsk-ant-[A-Za-z0-9_-]{20,}/g },", replace: '', tests: SEC, breaks: 'Anthropic-Schlüssel werden nicht erkannt' },
  { id: 'sec-github', file: 'modules/waechter/secrets-logic.ts', find: "{ kind: 'GitHub-Token', re: /\\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\\b/g },", replace: '', tests: SEC, breaks: 'GitHub-Tokens werden nicht erkannt' },
  { id: 'sec-pem', file: 'modules/waechter/secrets-logic.ts', find: "{ kind: 'Privater Schlüssel (PEM)', re: /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/g },", replace: '', tests: SEC, breaks: 'private Schlüssel werden nicht erkannt' },
  { id: 'sec-mask', file: 'modules/waechter/secrets-logic.ts', find: '  return `${prefix}…${tail}`', replace: '  return value', tests: SEC, breaks: 'Meldungen zeigen das Geheimnis im Klartext' },
  { id: 'sec-password', file: 'modules/waechter/secrets-logic.ts', find: "        if (value.length >= 8 && !/^\\d+$/.test(value)) add('Passwort in Zuweisung', value)", replace: '', tests: SEC, breaks: 'Passwörter in Zuweisungen fallen durch' },
  { id: 'sec-entropy', file: 'modules/waechter/secrets-logic.ts', find: '      if (entropy(v) < 4.3) continue', replace: '      continue', tests: SEC, breaks: 'Zeichenketten mit hoher Entropie fallen durch' },
  { id: 'sec-placeholder', file: 'modules/waechter/secrets-logic.ts', find: '      if (isPlaceholder(value)) continue', replace: '', tests: SEC, breaks: 'Platzhalter lösen Fehlalarm aus' },
  { id: 'sec-uuid', file: 'modules/waechter/secrets-logic.ts', find: "      if (/^[0-9a-f]+$/i.test(v) || UUID.test(v) || /^sha(?:1|256|384|512)-/.test(v)) continue", replace: '', tests: SEC, breaks: 'Hashes und UUIDs lösen Fehlalarm aus' },
  { id: 'sec-allow', file: 'modules/waechter/secrets-logic.ts', find: '    if (line.includes(ALLOW_COMMENT)) return', replace: '', tests: SEC, breaks: 'exo-allow-secret wirkt nicht' },
  { id: 'sec-diff-added', file: 'modules/waechter/secrets-logic.ts', find: "    if (raw.startsWith('+') && file && file !== '/dev/null') {", replace: "    if ((raw.startsWith('+') || raw.startsWith('-')) && file && file !== '/dev/null') {", tests: SEC, breaks: 'auch entfernte Zeilen gelten als Fund' },
  { id: 'sec-env', file: 'modules/waechter/secrets.ts', find: '  if (isEnvFile(path)) {\n    if (!(await gitIgnores(ctx, path)))', replace: '  if (false) {\n    if (!(await gitIgnores(ctx, path)))', tests: SEC, breaks: 'ignorierte .env wird blockiert' },
  { id: 'sec-commit', file: 'modules/waechter/secrets.ts', find: '      if (r.exitCode === 0) hits.push(...scanDiff(r.stdout, skip))\n      if (adds.length)', replace: '      if (adds.length)', tests: SEC, breaks: 'der Staging-Diff wird nicht geprüft' },
  { id: 'sec-push', file: 'modules/waechter/secrets.ts', find: "      const r = await ctx.untimed(ctx.host.run(['git', '-C', dir, 'log',", replace: "      const r = { exitCode: 1, stdout: '' } || await ctx.untimed(ctx.host.run(['git', '-C', dir, 'log',", tests: SEC, breaks: 'zu pushende Commits werden nicht geprüft' },
  { id: 'sec-redirect', file: 'modules/waechter/secrets.ts', find: '  if (relevant.length) for (const h of scanText(raw))', replace: '  if (false) for (const h of scanText(raw))', tests: SEC, breaks: 'echo KEY > datei geht durch' },
  { id: 'sec-add-commit', file: 'modules/waechter/secrets.ts', find: '      if (adds.length) hits.push(...(await untrackedHits(ctx, dir, adds.flatMap(a => a!.args), skip)))', replace: '', tests: SEC, breaks: 'git add -A && git commit: neue Dateien ungeprüft' },
  // ---- prod shield
  { id: 'prod-alias', file: 'modules/waechter/prod-logic.ts', find: '    for (const [alias, target] of ssh) if (target === addr || target === name || alias === name) idx.set(alias, h)', replace: '', tests: PROD, breaks: 'ssh-Aliase auf Prod werden nicht erkannt' },
  { id: 'prod-user', file: 'modules/waechter/prod-logic.ts', find: "    .replace(/^.*@/, '')", replace: '', tests: PROD, breaks: 'user@host wird nicht erkannt' },
  { id: 'prod-scp', file: 'modules/waechter/prod-logic.ts', find: "    if (c.program === 'scp' || c.program === 'rsync' || c.program === 'sftp') {", replace: '    if (false) {', tests: PROD, breaks: 'scp/rsync auf Prod gehen durch' },
  { id: 'prod-service', file: 'modules/waechter/prod-logic.ts', find: "      if (verb && SERVICE_VERBS.has(verb)) out.push(", replace: '      if (false) out.push(', tests: PROD, breaks: 'systemctl restart auf Prod wird nicht gemeldet' },
  { id: 'prod-sql-where', file: 'modules/waechter/prod-logic.ts', find: "    if (/^DELETE\\s+FROM\\b/i.test(s) && !/\\bWHERE\\b/i.test(s)) return true", replace: "    if (/^DELETE\\s+FROM\\b/i.test(s)) return true", tests: PROD, breaks: 'DELETE mit WHERE gilt als zerstörerisch' },
  { id: 'prod-sql-drop', file: 'modules/waechter/prod-logic.ts', find: "    if (/^DROP\\s+(TABLE|DATABASE|SCHEMA|VIEW|INDEX|USER|ROLE)\\b/i.test(s)) return true", replace: '', tests: PROD, breaks: 'DROP TABLE geht durch' },
  { id: 'prod-plus', file: 'modules/waechter/prod-logic.ts', find: "    if (m && (force || r.startsWith('+'))) return m[1]!", replace: '    if (m && force) return m[1]!', tests: PROD, breaks: '+main als Force-Push übersehen' },
  { id: 'prod-branch', file: 'modules/waechter/prod-logic.ts', find: "  if (force && refspecs.length === 0 && currentBranch && /^(main|master)$/.test(currentBranch)) return currentBranch", replace: '', tests: PROD, breaks: 'git push --force auf main ohne Refspec geht durch' },
  { id: 'prod-dry-drop', file: 'modules/waechter/prod-logic.ts', find: "    if (!m || /['\"`\\\\$]/.test(st) || !out.includes(st)) return null", replace: "    if (!out.includes(st)) return null", tests: PROD, breaks: 'Trockenlauf für DROP wird erfunden' },
  { id: 'prod-noui', file: 'modules/waechter/prod.ts', find: '  if (!ctx.interactive) return { deny:', replace: '  if (false) return { deny:', tests: PROD, breaks: 'ohne UI läuft ein Prod-Befehl ungefragt' },
  { id: 'prod-esc', file: 'modules/waechter/prod.ts', find: '    answer = CANCEL // Esc', replace: '    answer = RUN', tests: PROD, breaks: 'Esc führt den Prod-Befehl aus' },
  { id: 'prod-rule', file: 'modules/waechter/prod.ts', find: '      if (blocked.length) return { deny:', replace: '      if (false) return { deny:', tests: PROD, breaks: 'Hausregel (certbot) wird ignoriert' },
  { id: 'prod-unparsable', file: 'modules/waechter/prod.ts', find: '        if (!named) return\n', replace: '        return\n', tests: PROD, breaks: 'unlesbare Befehle mit Prod-Bezug gehen durch' },
  { id: 'prod-jump', file: 'modules/waechter/prod-logic.ts', find: '      for (const x of sshExtraHosts(c.argv)) remote(prodOf(x))\n    }\n    if (c.program === ', replace: '    }\n    if (c.program === ', tests: PROD, breaks: 'ssh -J/-o HostName auf Prod geht durch' },
  { id: 'prod-dot', file: 'modules/waechter/prod-logic.ts', find: "    .replace(/\\.$/, '')\n", replace: '', tests: PROD, breaks: 'vps. mit Schlusspunkt geht durch' },
  // ---- brake
  { id: 'brake-rf', file: 'modules/waechter/brake-logic.ts', find: "  return (f.has('r') || f.has('R') || f.has('--recursive')) && (f.has('f') || f.has('--force'))", replace: "  return f.has('r') && f.has('f')", tests: BRAKE, breaks: 'rm -Rf / --recursive --force werden übersehen' },
  { id: 'brake-feeder', file: 'modules/waechter/brake-logic.ts', find: '      if (feeder) {', replace: '      if (false) {', tests: BRAKE, breaks: 'xargs rm -rf wird still nicht gesichert' },
  { id: 'brake-vars', file: 'modules/waechter/brake-logic.ts', find: '        if (w.expansion) plan.unresolved.push(w.text)', replace: '        if (false) plan.unresolved.push(w.text)', tests: BRAKE, breaks: 'rm -rf "$X" wird ohne Rückfrage ausgeführt' },
  { id: 'brake-clean-n', file: 'modules/waechter/brake-logic.ts', find: "      const cleanArgs = ['-n', ...", replace: "      const cleanArgs = [...", tests: BRAKE, breaks: 'die Sicherung führt git clean echt aus' },
  { id: 'brake-ref', file: 'modules/waechter/brake.ts', find: "      const r = await run(ctx, ['git', '-C', root, 'update-ref', ref, s]).catch(() => null)", replace: '      const r = { exitCode: 0 }', tests: BRAKE, breaks: 'Stash-Commit ohne Ref (gc räumt ihn weg)' },
  { id: 'brake-untracked', file: 'modules/waechter/brake.ts', find: "    if (r?.exitCode === 0) for (const rel of parseCleanDryRun(r.stdout)) tarPaths.push(joinPath(p.cwd, rel, undefined))", replace: '', tests: BRAKE, breaks: 'git clean: ungetrackte Dateien nicht gesichert' },
  { id: 'brake-limit', file: 'modules/waechter/brake.ts', find: '        if (meta.bytes > ctx.config.snapshotMaxMb * 1048576) {', replace: '        if (false) {', tests: BRAKE, breaks: 'Größenlimit ohne Rückfrage' },
  { id: 'brake-overwrite', file: 'modules/waechter/undo.ts', find: '    if (exists.length) {', replace: '    if (false) {', tests: BRAKE, breaks: '/undo-last überschreibt ungefragt' },
  { id: 'brake-retention', file: 'modules/waechter/brake-logic.ts', find: '  return sorted.filter((s, i) => i >= KEEP_COUNT || now - s.at > KEEP_MS)', replace: '  return sorted.filter((s, i) => i >= KEEP_COUNT)', tests: BRAKE, breaks: 'alte Schnappschüsse bleiben ewig' },
  // ---- diet
  { id: 'diet-range', file: 'modules/waechter/diet-logic.ts', find: '  if (i.hasRange || i.justCut || SPECIAL.test(i.path)) return null', replace: '  if (SPECIAL.test(i.path)) return null', tests: DIET, breaks: 'gezielte Reads werden trotzdem gekürzt / Endlosschleife' },
  { id: 'diet-guard', file: 'modules/waechter/diet.ts', find: '      lastCut = path\n', replace: '', tests: DIET, breaks: 'zweites Lesen derselben Datei wird wieder gekürzt' },
  { id: 'diet-tail', file: 'modules/waechter/diet.ts', find: '          if (r.exitCode === 0) tail = capTail(r.stdout)', replace: '', tests: DIET, breaks: 'das Ende der Datei fehlt' },
  { id: 'sec-name-parts', file: 'modules/waechter/secrets-logic.ts', find: 'export const isPasswordName = (name: string) => nameParts(name).some(p => PASSWORD_PARTS.has(p) || PASSWORD_CORE.test(p))', replace: 'export const isPasswordName = (name: string) => /pass|pwd/i.test(name)', tests: SEC, breaks: 'passed/compass/bypass gelten als Passwort (Fehlalarm, live erlebt)' },
  // ---- cockpit
  { id: 'tl-debounce', file: 'modules/cockpit/testlight.ts', find: '  st.timer = env.host.after(DEBOUNCE_MS, () => void run())', replace: '  void run()', tests: COCK, breaks: 'jede Änderung startet sofort einen Testlauf' },
  { id: 'tl-nice', file: 'modules/cockpit/testlight.ts', find: "  const argv = ['nice', '-n', '10', ...st.runner.argv(files)]", replace: '  const argv = [...st.runner.argv(files)]', tests: COCK, breaks: 'Hintergrundtests mit voller Priorität' },
  { id: 'tl-claude-wait', file: 'modules/cockpit/testlight.ts', find: '  if (st.claudeRuns > 0) return schedule() // Claude is testing itself: later', replace: '', tests: COCK, breaks: 'Testampel läuft parallel zu Claudes eigenem Testlauf' },
  { id: 'tl-cut', file: 'modules/cockpit/testlight.ts', find: '  st.pending.add(e.path)\n  st.running?.stop()', replace: '  st.pending.add(e.path)', tests: COCK, breaks: 'veralteter Lauf wird nicht abgebrochen' },
  { id: 'tl-once', file: 'modules/cockpit/testlight.ts', find: '      st.undelivered = null\n      return [', replace: '      return [', tests: COCK, breaks: 'rote Tests in jedem Prompt erneut' },
  { id: 'tl-project', file: 'modules/cockpit/testlight.ts', find: "  if (st.env && !e.path.startsWith(st.env.project + '/')) return", replace: '', tests: COCK, breaks: 'Änderungen außerhalb des Projekts lösen Tests aus' },
  { id: 'tl-vitest', file: 'modules/cockpit/testlight-logic.ts', find: '    red = Number(vt[1] ?? 0)\n    green = Number(vt[2])', replace: '    green = Number(vt[2])', tests: COCK, breaks: 'vitest-Fehlschläge werden nicht gezählt' },
  { id: 'tl-ssh', file: 'modules/cockpit/testlight-logic.ts', find: "    if (c.via.some(v => v.kind === 'ssh')) continue\n    const a = c.argv", replace: '    const a = c.argv', tests: COCK, breaks: 'Tests auf einem anderen Rechner gelten als lokale' },
  { id: 'dc-files', file: 'modules/cockpit/donecheck.ts', find: "  if (!changes.length) return 'nothing-changed'", replace: "  if (!changes.length) return 'unchecked'", tests: COCK, breaks: 'Warnung auch ohne Dateiänderung' },
  { id: 'dc-after', file: 'modules/cockpit/donecheck.ts', find: '  const green = events.some(e => e.seq > after &&', replace: '  const green = events.some(e => e.seq > 0 &&', tests: COCK, breaks: 'ein grüner Lauf vor der letzten Änderung zählt' },
  { id: 'dc-reason', file: 'modules/cockpit/donecheck.ts', find: "      if (t.reason !== 'answer' || !claims(t.answer).length) return", replace: '      if (!claims(t.answer).length) return', tests: COCK, breaks: 'Warnung auch bei abgebrochenen Turns' },
  { id: 'sb-first-touch', file: 'modules/cockpit/sidebar.ts', find: '      if (!originals.has(path)) {', replace: '      if (true) {', tests: COCK, breaks: 'Ausgangsstand wird bei jeder Änderung überschrieben' },
  { id: 'sb-snapshot', file: 'modules/cockpit/sidebar.ts', find: "    const tar = await env.host.run(['tar', '-czPf', `${dir}/files.tgz`, '--', path])", replace: '    const tar = { exitCode: 0, stderr: \'\' }', tests: COCK, breaks: 'Zurücksetzen ohne Schnappschuss' },
  { id: 'sb-ask', file: 'modules/cockpit/sidebar.ts', find: "    ok = (await env.host.ask(what, ['Zurücksetzen', 'Abbrechen'])) === 'Zurücksetzen'", replace: '    ok = true', tests: COCK, breaks: 'Zurücksetzen ohne Rückfrage' },
  { id: 'sb-persist', file: 'modules/cockpit/sidebar.ts', find: '        await persist(env)\n', replace: '', tests: COCK, breaks: 'Ausgangsstände gehen beim Neuladen verloren' },
  { id: 'ci-once', file: 'modules/cockpit/ci.ts', find: "    if (run.state === 'red' && st.notified !== run.id) {", replace: "    if (run.state === 'red') {", tests: COCK, breaks: 'Toast bei jedem Abruf erneut' },
  { id: 'ci-idle', file: 'modules/cockpit/ci.ts', find: '  if (now - lastActivity > IDLE_MS) return', replace: '', tests: COCK, breaks: 'CI wird auch in ruhenden Sitzungen abgefragt' },
  { id: 'ci-backoff', file: 'modules/cockpit/ci.ts', find: 'export const nextDelay = (failures: number) => (failures === 0 ? POLL_MS : Math.min(MAX_BACKOFF_MS, POLL_MS * 2 ** failures))', replace: 'export const nextDelay = (_failures: number) => POLL_MS', tests: COCK, breaks: 'kein Backoff bei Fehlern' },
  { id: 'core-filechanged', file: 'core/dispatcher/dispatcher.ts', find: "      deps.journal.push({ type: 'file.changed', path: filePath,", replace: "      void ({ type: 'file.changed', path: filePath,", tests: COCK, breaks: 'Dateiänderungen landen nicht im Journal' },
  { id: 'tl-consent', file: 'modules/cockpit/testlight.ts', find: '  if (!st.runner || !(await consented(env, st.runner, files))) return', replace: '  if (!st.runner) return', tests: COCK, breaks: 'Projektbefehle laufen ohne Zustimmung' },
  { id: 'tl-consent-fp', file: 'modules/cockpit/testlight.ts', find: '  if (known && known.fp === fp) return known.allowed', replace: '  if (known) return known.allowed', tests: COCK, breaks: 'geänderte Test-Konfiguration läuft ohne neue Frage' },
  { id: 'tl-noui', file: 'modules/cockpit/testlight.ts', find: '  if (!env.interactive) return false\n  const fp = await configFingerprint(env)', replace: '  const fp = await configFingerprint(env)', tests: COCK, breaks: 'ohne UI wird trotzdem gefragt/gestartet' },
  { id: 'tl-effects', file: 'modules/cockpit/testlight.ts', find: '    const undone = await settleEffects(env.host, env.home, before, env.interactive).catch(() => [])', replace: '    const undone: string[] = []', tests: COCK, breaks: 'Testlauf schaltet exo unbemerkt ab' },
  { id: 'tl-argv-dot', file: 'modules/cockpit/testlight-logic.ts', find: "(f.startsWith(root + '/') ? './' + f.slice(root.length + 1)", replace: "(f.startsWith(root + '/') ? f.slice(root.length + 1)", tests: COCK, breaks: 'Dateinamen werden als Optionen gelesen' },
  { id: 'sec-name-core', file: 'modules/waechter/secrets-logic.ts', find: 'nameParts(name).some(p => PASSWORD_PARTS.has(p) || PASSWORD_CORE.test(p))', replace: 'nameParts(name).some(p => PASSWORD_PARTS.has(p))', tests: SEC, breaks: 'dbpassword/rootpwd rutschen durch' },
  { id: 'sec-name-digits', file: 'modules/waechter/secrets-logic.ts', find: "    .replace(/([A-Za-z])([0-9])/g, '$1 $2')\n", replace: '', tests: SEC, breaks: 'pass123 rutscht durch' },
  // ---- rueckblick
  { id: 'h-gap', file: 'modules/rueckblick/hours-logic.ts', find: '  if (gap <= 0 || gap > GAP_MS) return next', replace: '  if (gap <= 0) return next', tests: RUECK, breaks: 'Pausen zählen als Arbeitszeit' },
  { id: 'h-project', file: 'modules/rueckblick/hours-logic.ts', find: '  if (!last || last.project !== project) return next', replace: '  if (!last) return next', tests: RUECK, breaks: 'Projektwechsel wird dem neuen Projekt angerechnet' },
  { id: 'h-prune', file: 'modules/rueckblick/hours-logic.ts', find: '  return { ...h, days: Object.fromEntries(Object.entries(h.days).filter(([d]) => d >= cutoff)) }', replace: '  return h', tests: RUECK, breaks: 'alte Tage bleiben ewig' },
  { id: 'r-once', file: 'modules/rueckblick/recap.ts', find: "      if (!entry || entry.shown ||", replace: "      if (!entry ||", tests: RUECK, breaks: 'Hinweis „Letzte Sitzung“ erscheint jedes Mal' },
  { id: 'r-week', file: 'modules/rueckblick/recap.ts', find: ' || now - entry.facts.endedAt > WEEK_MS) return', replace: ') return', tests: RUECK, breaks: 'Hinweis auch nach mehr als sieben Tagen' },
  { id: 'r-same', file: 'modules/rueckblick/recap.ts', find: ' || entry.facts.sessionId === env.sessionId', replace: '', tests: RUECK, breaks: 'Hinweis auf die eigene, laufende Sitzung' },
  { id: 'r-empty', file: 'modules/rueckblick/recap.ts', find: '      if (!f.turns && !f.files.length) return // nothing happened: nothing worth recalling', replace: '', tests: RUECK, breaks: 'leere Sitzungen verdrängen echte' },
  { id: 'l-ticked', file: 'modules/rueckblick/recap.ts', find: '  const picked = offer.filter((_, i) => chosen.includes(labels[i]!))', replace: '  const picked = offer', tests: RUECK, breaks: 'Lehren werden ohne Häkchen geschrieben' },
  { id: 'l-esc', file: 'modules/rueckblick/recap.ts', find: "  } catch {\n    return 'Lehren: nichts übernommen.'\n  }", replace: '  } catch {\n    chosen = labels\n  }', tests: RUECK, breaks: 'Esc schreibt alle Lehren' },
  { id: 'l-dup', file: 'modules/rueckblick/recap.ts', find: "  const fresh = (await readLessons(env)).filter(l => !isDuplicate(l, existing ?? ''))", replace: '  const fresh = await readLessons(env)', tests: RUECK, breaks: 'Dubletten zur CLAUDE.md werden erneut angeboten' },
  { id: 'l-code', file: 'modules/rueckblick/recap-logic.ts', find: "    .replace(/```[\\s\\S]*?```/g, ' ')\n", replace: '', tests: RUECK, breaks: 'Code-Blöcke liefern Scheinlehren' },
  { id: 'l-label', file: 'modules/rueckblick/recap-logic.ts', find: 'export const label = (_s: string, i: number) => String(i + 1)', replace: 'export const label = (s: string, _i: number) => s.slice(0, 90)', tests: RUECK, breaks: 'Label ist ein abgeschnittener Text (Kommas, nicht vollständig gelesen)' },
  { id: 'l-sanitize', file: 'modules/rueckblick/recap-logic.ts', find: '  return sentences.filter(s => s.length >= 25 && s.length <= 300 && LESSON.test(s)).map(sanitizeLesson)', replace: '  return sentences.filter(s => s.length >= 25 && s.length <= 300 && LESSON.test(s))', tests: RUECK, breaks: 'Markup/HTML landet in der CLAUDE.md' },
  { id: 'l-fulltext', file: 'modules/rueckblick/recap.ts', find: '?\\n${listed}\\nNichts wird', replace: '? Nichts wird', tests: RUECK, breaks: 'angekreuzt wird, was nicht vollständig zu lesen war' },
  { id: 'safe-lessons', file: 'modules/rueckblick/recap.ts', find: '  if (!(await insideRoot(env.host, target, env.project))) return', replace: '  if (false) return', tests: RUECK, breaks: 'Lehren über einen Symlink nach ~/.bashrc' },
  { id: 'safe-md', file: 'modules/rueckblick/recap.ts', find: '    if (await insideRoot(env.host, path, env.project)) {', replace: '    if (true) {', tests: RUECK, breaks: '/recap md schreibt über einen Symlink nach /etc' },
  { id: 'safe-dangling', file: 'core/safepath.ts', find: '      if (await host.isLink(cur).catch(() => true)) return false\n', replace: '', tests: RUECK, breaks: 'ein verwaister Symlink leitet das Schreiben nach außen' },
  { id: 'safe-dots', file: 'core/safepath.ts', find: '  if (/(^|\\/)\\.\\.?(\\/|$)/.test(path)) return false\n', replace: '', tests: RUECK, breaks: '.. im Pfad führt aus dem Projekt' },
  { id: 'safe-missing', file: 'core/safepath.ts', find: "  return /\\bENOENT\\b|\\bENOTDIR\\b|no such file or directory/i.test(text)", replace: '  return true', tests: RUECK, breaks: 'jeder Fehler gilt als „fehlt“, die Prüfung lässt durch' },
  // ---- extras
  { id: 'duck-blank', file: 'modules/extras/duck-logic.ts', find: '  const v = value === null ? null : value.trim() || null', replace: '  const v = value', tests: EXTRAS, breaks: 'leere Antworten landen im Prompt' },
  { id: 'duck-error-block', file: 'modules/extras/duck-logic.ts', find: "    if (i === 2) lines.push(`${LABELS[i]}:`, '```', a, '```')\n    else", replace: '   ', tests: EXTRAS, breaks: 'Fehlermeldung ohne Code-Block' },
  { id: 'ach-one', file: 'modules/extras/achievements.ts', find: '      const badge = next[0]', replace: '      const badge = next[next.length - 1]', tests: EXTRAS, breaks: 'Abzeichen in falscher Reihenfolge' },
  { id: 'ach-quiet', file: 'modules/extras/achievements.ts', find: '        if (!inQuiet(new Date(now).getHours(), env.config.quietHours)) {', replace: '        if (true) {', tests: EXTRAS, breaks: 'Toasts und Töne in der Ruhezeit' },
  { id: 'ach-streak', file: 'modules/extras/achievements-logic.ts', find: '        s.streak = redInTurn ? 0 : s.streak + 1', replace: '        s.streak = s.streak + 1', tests: EXTRAS, breaks: 'roter Test bricht die Serie nicht' },
  { id: 'ach-seen', file: 'modules/extras/achievements-logic.ts', find: '    if (e.seq <= s.seenSeq) continue\n', replace: '', tests: EXTRAS, breaks: 'Ereignisse werden mehrfach gezählt' },
  { id: 'ach-requires', file: 'modules/extras/achievements-logic.ts', find: '(!r.requires || usageBars)', replace: 'true', tests: EXTRAS, breaks: 'Pac-Man-Abzeichen ohne usage-bars' },
  { id: 'ach-session', file: 'modules/extras/achievements-logic.ts', find: "    seenSeq: o.sessionId === sessionId && typeof o.seenSeq === 'number' ? o.seenSeq : 0,", replace: "    seenSeq: typeof o.seenSeq === 'number' ? o.seenSeq : 0,", tests: EXTRAS, breaks: 'neue Sitzung überspringt ihr Journal' },
  { id: 'cine-stop', file: 'modules/extras/cinema.ts', find: '  if (!animate && st.fast) {', replace: '  if (false) {', tests: EXTRAS, breaks: 'der 30-fps-Timer läuft weiter' },
  { id: 'cine-reduced', file: 'modules/extras/cinema.ts', find: '  const animate = film !== null && !env.config.reducedMotion', replace: '  const animate = film !== null', tests: EXTRAS, breaks: 'reduzierte Bewegung wird ignoriert' },
  { id: 'cine-coffee', file: 'modules/extras/cinema-logic.ts', find: "  if (turnMs !== null && turnMs >= COFFEE_AFTER_MS) return 'coffee'", replace: '', tests: EXTRAS, breaks: 'lange Turns ohne Kaffee' },
  { id: 'cine-width', file: 'modules/extras/cinema-logic.ts', find: "  return text.length > room ? text.slice(0, room - 1) + '…' : text", replace: '  return text', tests: EXTRAS, breaks: 'Spinner sprengt die Terminalbreite' },
  // ---- dispatcher
  { id: 'fail-closed', file: 'core/dispatcher/dispatcher.ts', find: "      if (policyOf(step.id) === 'closed') {", replace: '      if (false) {', tests: DISP, breaks: 'ein gestörter Wächter lässt durch' },
  { id: 'deny-stops', file: 'core/dispatcher/dispatcher.ts', find: '      return { deny: out.deny }', replace: '      void 0', tests: DISP, breaks: 'eine Ablehnung wird ignoriert' },
  { id: 'kill-first', file: 'core/dispatcher/dispatcher.ts', find: '  if (await deps.killed()) return next({ ...call.input })', replace: '', tests: DISP, breaks: 'der Notausschalter wirkt nicht im Dispatcher' },
  { id: 'step-order', file: 'core/dispatcher/dispatcher.ts', find: '  return [...steps].sort((a, b) => rank(a) - rank(b))', replace: '  return [...steps]', tests: DISP, breaks: 'die feste Reihenfolge gilt nicht' },
  { id: 'catch-guarded', file: 'core/dispatcher/dispatcher.ts', find: "  if (killed || !isGuardedTool(tool)) return 'pass'", replace: "  return 'pass'", tests: DISP, breaks: 'der Kern-Ausfall lässt Bash durch' },
  { id: 'catch-ran', file: 'core/dispatcher/dispatcher.ts', find: "  if (alreadyRan) return 'leave'", replace: '', tests: DISP, breaks: 'ein schon gelaufener Aufruf wird nachträglich abgelehnt' },
  { id: 'disabled-off', file: 'core/dispatcher/dispatcher.ts', find: '    if (!step.before || !deps.config.enabled[step.id]) continue', replace: '    if (!step.before) continue', tests: DISP, breaks: 'abgeschaltete Module laufen weiter' },
  // ---- kill switch, rules
  { id: 'kill-file', file: 'core/killswitch.ts', find: "  if (s.fileExists) return 'Datei ~/.claude/exo/DISABLED'", replace: '', tests: CORE, breaks: 'die DISABLED-Datei wirkt nicht' },
  { id: 'kill-env', file: 'core/killswitch.ts', find: "  if (s.env !== undefined && s.env !== '' && s.env !== '0' && s.env.toLowerCase() !== 'false') return 'EXO_DISABLE'", replace: '', tests: CORE, breaks: 'EXO_DISABLE wirkt nicht' },
  { id: 'kill-cache', file: 'core/killswitch.ts', find: '    if (!this.cached || t - this.cached.at >= this.cacheMs) {', replace: '    if (!this.cached) {', tests: CORE, breaks: 'die Datei wird nach dem ersten Blick nie wieder geprüft' },
  { id: 'rules-unknown', file: 'core/config/rules.ts', find: '  if (unknown.length) return', replace: '  if (false) return', tests: CORE, breaks: 'Tippfehler in Regelfeldern fallen nicht auf' },
  { id: 'rules-fallback', file: 'core/config/rules.ts', find: "  if (v.fatal) return { rules: defaultRules(),", replace: "  if (v.fatal) return { rules: [],", tests: CORE, breaks: 'kaputte rules.json verliert die eingebauten Regeln' },
]
