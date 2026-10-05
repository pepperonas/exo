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
const COMPL = ['tests/complete.spec.ts']

export const MUTATIONS: Mutation[] = [
  // ---- /exo argument list
  { id: 'c-prefix', file: 'core/complete.ts', find: 'pool.filter(e => e.word.toLowerCase().startsWith(current))', replace: 'pool.filter(() => true)', tests: COMPL, breaks: 'a started word does not narrow the list' },
  { id: 'c-case', file: 'core/complete.ts', find: "const rest = text.slice(COMMAND.length + 1).toLowerCase()", replace: 'const rest = text.slice(COMMAND.length + 1)', tests: COMPL, breaks: 'upper case finds nothing' },
  { id: 'c-second', file: 'core/complete.ts', find: 'else if (done.length === 1) pool = SECOND[done[0]!]', replace: '', tests: COMPL, breaks: 'no module list after on/off/reset' },
  { id: 'c-many', file: 'core/complete.ts', find: 'if (done.length === 0) pool = SUBCOMMANDS', replace: 'if (done.length !== 1) pool = SUBCOMMANDS', tests: COMPL, breaks: 'a list after too many words' },
  { id: 'c-name', file: 'core/complete.ts', find: "if (!text.startsWith(`${COMMAND} `)) return null", replace: "if (!text.startsWith(COMMAND)) return null", tests: COMPL, breaks: 'other commands starting with /exo get the list' },
  { id: 'c-core', file: 'core/complete.ts', find: ", { word: 'core', hint: \"clear the core's broken mark\" }]", replace: ']', tests: COMPL, breaks: 'reset core is not offered' },
  { id: 'c-drift-extra', file: 'core/complete.ts', find: "  { word: 'help', hint: 'all commands' },", replace: "  { word: 'help', hint: 'all commands' },\n  { word: 'flip', hint: 'x' },", tests: COMPL, breaks: 'a word the handler does not understand is offered' },
  { id: 'c-handler', file: 'core/exo-command.ts', find: "if (sub === 'rules' || sub === 'regeln') {", replace: "if (sub === 'regeln') {", tests: COMPL, breaks: 'the list offers a word the handler dropped' },
  { id: 'c-drift-missing', file: 'core/complete.ts', find: "  { word: 'status', hint: 'state of all modules' },", replace: '', tests: COMPL, breaks: 'a subcommand the handler answers is not offered' },

  // ---- shell parser
  { id: 'sq-quote', file: 'core/shell/parse.ts', find: 'w.text += this.s.slice(this.i + 1, end)', replace: 'w.text += this.s.slice(this.i, end)', tests: SHELL, breaks: 'single quotes stay in the word' },
  { id: 'and-op', file: 'core/shell/parse.ts', find: "if (this.at('&&')) return (this.i += 2), '&&'", replace: '', tests: SHELL, breaks: '&& is not recognised as an operator' },
  { id: 'dq-escape', file: 'core/shell/parse.ts', find: "else if ('$`\"\\\\'.includes(n)) {", replace: 'else if (false) {', tests: SHELL, breaks: 'escapes inside double quotes' },
  { id: 'cmdsub', file: 'core/shell/parse.ts', find: '      w.subs.push(this.sub())\n      w.expansion = true\n      return this.s.slice(start, this.i)', replace: '      this.sub()\n      w.expansion = true\n      return this.s.slice(start, this.i)', tests: SHELL, breaks: '$(…) is not captured as a command' },
  { id: 'backtick', file: 'core/shell/parse.ts', find: 'w.subs.push(p.parseScript(null))', replace: 'p.parseScript(null)', tests: SHELL, breaks: 'backticks are not captured as a command' },
  { id: 'heredoc-tabs', file: 'core/shell/parse.ts', find: "const cmp = r.op === '<<-' ? line.replace(/^\\t+/, '') : line", replace: 'const cmp = line', tests: SHELL, breaks: '<<- with tabs does not find its end' },
  { id: 'trailing-and', file: 'core/shell/parse.ts', find: "this.fail(`${op} without a following command`)", replace: 'void 0', tests: SHELL, breaks: '`a &&` counts as complete' },
  { id: 'redirect-fd', file: 'core/shell/parse.ts', find: 'const fd = m[1] ? Number(m[1]) : null', replace: 'const fd = null', tests: SHELL, breaks: 'file descriptor of a redirect is lost' },
  { id: 'glob-flag', file: 'core/shell/parse.ts', find: "if (ch === '*' || ch === '?' || ch === '[') w.glob = true", replace: '', tests: SHELL, breaks: 'globs are not marked' },
  { id: 'bash-c', file: 'core/shell/words.ts', find: "if (t.startsWith('-') && t.includes('c')) sawC = true", replace: '', tests: SHELL, breaks: 'bash -c "…" is not inspected' },
  { id: 'ssh-remote', file: 'core/shell/words.ts', find: '      if (info.remote) {', replace: '      if (false) {', tests: SHELL, breaks: 'the remote command of ssh is not inspected' },
  { id: 'ssh-user', file: 'core/shell/words.ts', find: "    user = dest.slice(0, dest.lastIndexOf('@'))\n    host = dest.slice(dest.lastIndexOf('@') + 1)", replace: '', tests: SHELL, breaks: 'user@host is not split into host and user' },
  { id: 'sudo-peel', file: 'core/shell/words.ts', find: "  sudo: { kind: 'sudo',", replace: "  sudox: { kind: 'sudo',", tests: SHELL, breaks: 'sudo is not peeled off' },
  { id: 'xargs-peel', file: 'core/shell/words.ts', find: "  xargs: { kind: 'xargs',", replace: "  xargsx: { kind: 'xargs',", tests: SHELL, breaks: 'xargs rm is not recognised as rm' },
  { id: 'subst-cmds', file: 'core/shell/words.ts', find: '  for (const w of [...c.assigns, ...c.words]) for (const s of w.subs) out.push(...commands(s, subVia))', replace: '', tests: SHELL, breaks: 'commands inside substitutions are missing' },
  { id: 'summary-args', file: 'core/shell/words.ts', find: "    return where + (sub ? `${c.program} ${sub}` : c.program)", replace: "    return where + c.argv.join(' ')", tests: SHELL, breaks: 'summary contains arguments (secrets could reach the journal)' },
  { id: 'arith-subs', file: 'core/shell/parse.ts', find: "      else if (ch === '`' || (ch === '$' && (this.s[j + 1] === '(' || this.s[j + 1] === '{'))) j = this.skipSub(j, w)\n      else if (ch === '(') depth++, j++", replace: "      else if (ch === '(') depth++, j++", tests: SHELL, breaks: 'commands inside $(( … )) stay invisible' },
  { id: 'arith-depth', file: 'core/shell/parse.ts', find: "        if (depth === 0) return this.s[j + 1] === ')' ? j + 2 : -1", replace: "        if (this.s[j + 1] === ')') return j + 2", tests: SHELL, breaks: 'nested parentheses end arithmetic too early' },
  { id: 'arith-fallback', file: 'core/shell/parse.ts', find: "      if (end !== -1) {\n        this.i = end\n        w.expansion = true", replace: "      if (true) {\n        this.i = end\n        w.expansion = true", tests: SHELL, breaks: '$((cmd) ) is not read as a command' },
  { id: 'brace-subs', file: 'core/shell/parse.ts', find: "      } else if (ch === '`' || (ch === '$' && (this.s[j + 1] === '(' || this.s[j + 1] === '{'))) j = this.skipSub(j, w)\n      else if (ch === '{') depth++, j++", replace: "      } else if (ch === '{') depth++, j++", tests: SHELL, breaks: 'commands inside ${x:-$(…)} stay invisible' },
  { id: 'brace-quoted', file: 'core/shell/parse.ts', find: "        this.subsAnywhere(this.s.slice(j + 1, k), w)\n", replace: '', tests: SHELL, breaks: "commands inside ${x:-'$(…)'} stay invisible" },
  { id: 'ssh-proxy', file: 'core/shell/words.ts', find: '        if (m) localCommands.push(m[2]!)', replace: '', tests: SHELL, breaks: 'ssh -o ProxyCommand runs locally, unseen' },
  { id: 'find-exec', file: 'core/shell/words.ts', find: "      if (!/^-(exec|execdir|ok|okdir)$/.test(words[i]!.text)) continue", replace: '      continue', tests: SHELL, breaks: 'find -exec rm stays invisible' },
  // ---- self protection
  { id: 'self-off', file: 'core/dispatcher/dispatcher.ts', find: '    if (await touchesControlResolved(ctx.call, p => deps.host.realPath(p), { before: ctx.cwd, after: ctx.cmdCwd }, ctx.home)) {', replace: '    if (false) {', tests: DISP, breaks: 'Claude can set the kill switch itself' },
  { id: 'self-esc', file: 'core/dispatcher/dispatcher.ts', find: '          allowed = false // Esc, or nobody to ask', replace: '          allowed = true', tests: DISP, breaks: 'Esc in the dialog allows the change' },
  { id: 'self-path', file: 'core/selfprotect.ts', find: '    if (isExoPath(path)) return true', replace: '', tests: DISP, breaks: 'Write to ~/.claude/exo/ passes without asking' },
  { id: 'self-readonly', file: 'core/selfprotect.ts', find: "  return cmds.every(c => READ_ONLY.has(c.program) && c.assigns.length === 0 && !c.via.some(v => v.kind === 'env' || v.kind === 'xargs') && !c.redirects.some(r => writes(r.op, r.target?.text)))", replace: '  return true', tests: DISP, breaks: 'every Bash command counts as read-only' },
  { id: 'self-settings', file: 'core/selfprotect.ts', find: '      return mentionsExoConfig(text)', replace: '      return false', tests: DISP, breaks: 'exo options in settings.json pass without asking' },
  { id: 'self-cooked', file: 'core/selfprotect.ts', find: '    if (namesControl(raw) || namesControl(cookedText(cmds))) return true', replace: '    if (namesControl(raw)) return true', tests: DISP, breaks: 'DIS""ABLED bypasses detection' },
  { id: 'self-bare-name', file: 'core/selfprotect.ts', find: '    /\\bDISABLED\\b/.test(t) ||\n', replace: '', tests: DISP, breaks: 'cd in one call, touch DISABLED in the next' },
  { id: 'self-redir-amp', file: 'core/selfprotect.ts', find: "  if (op === '>&' || op === '<&') return op === '>&' && !/^(\\d+|-)$/.test(target ?? '')", replace: "  if (op === '>&' || op === '<&') return false", tests: DISP, breaks: '>&file counts as reading' },
  { id: 'self-norm', file: 'core/selfprotect.ts', find: "  return ((abs ? '/' : '') + out.join('/')).toLowerCase()", replace: "  return p", tests: DISP, breaks: '// ./ ../ and upper case bypass the path comparison' },
  { id: 'self-unknown-tool', file: 'core/selfprotect.ts', find: '  return all.some(s => isExoPath(s)) ||', replace: '  return false &&', tests: DISP, breaks: 'MCP tools write to ~/.claude/exo without asking' },
  { id: 'self-symlink', file: 'core/selfprotect.ts', find: '    if (real !== p && (isExoPath(real) ||', replace: '    if (false && (isExoPath(real) ||', tests: DISP, breaks: 'a symlink to ~/.claude/exo bypasses the protection' },
  { id: 'self-glob', file: 'core/selfprotect.ts', find: '    if (words.some(w => w.glob && globHitsControl(w.text))) return true', replace: '', tests: DISP, breaks: 'touch DIS* bypasses the protection' },
  { id: 'self-expansion', file: 'core/selfprotect.ts', find: '    return words.some(w => w.expansion) &&', replace: '    return false &&', tests: DISP, breaks: 'path pieces in variables bypass the protection' },
  { id: 'self-opaque', file: 'core/selfprotect.ts', find: '    if (opaque(r.script, cmds)) return true', replace: '', tests: DISP, breaks: 'base64 -d | sh bypasses the protection' },
  { id: 'self-unresolved', file: 'core/selfprotect.ts', find: '    if (real === null) return true', replace: '', tests: DISP, breaks: 'an unresolvable path counts as harmless' },
  { id: 'self-pluginconfigs', file: 'core/selfprotect.ts', find: '    /pluginConfigs/i.test(t) ||', replace: '', tests: DISP, breaks: 'exo options via a symlink to settings.json' },
  { id: 'self-cwd-dir', file: 'core/selfprotect.ts', find: '      if (dirs.some(inClaudeDir)) return true', replace: '', tests: INTEG, breaks: 'cd ~/.claude/exo, then touch x' },
  { id: 'self-cwd-rel', file: 'core/selfprotect.ts', find: '        if (isExoPath(abs) || isSettings(abs)) return true', replace: '', tests: INTEG, breaks: 'relative targets into ~/.claude/exo' },
  { id: 'self-cwd-after', file: 'core/selfprotect.ts', find: '      const dirs = [cwd.before, cwd.after]', replace: '      const dirs = [cwd.before]', tests: INTEG, breaks: 'cd inside the command is missed' },
  // ---- effect check
  { id: 'eff-off', file: 'core/dispatcher/dispatcher.ts', find: '  if (guardEffects) before = await readControl(deps.host, deps.home!).catch(() => null)', replace: '', tests: INTEG, breaks: 'obfuscated commands set DISABLED unnoticed' },
  { id: 'eff-esc', file: 'core/integrity.ts', find: '      } catch {\n        keep = false\n      }', replace: '      } catch {\n        keep = true\n      }', tests: INTEG, breaks: 'Esc keeps the change' },
  { id: 'eff-noui', file: 'core/integrity.ts', find: '    let keep = false\n    if (interactive) {', replace: '    let keep = true\n    if (interactive) {', tests: INTEG, breaks: 'without UI the change stays' },
  { id: 'eff-disabled', file: 'core/integrity.ts', find: "  if (!a.disabled && b.disabled) out.push({ kind: 'disabled' })", replace: '', tests: INTEG, breaks: 'DISABLED is not noticed' },
  { id: 'eff-rules', file: 'core/integrity.ts', find: "  if (a.rules !== b.rules) out.push({ kind: 'rules', before: a.rules })", replace: '', tests: INTEG, breaks: 'rules.json change is not noticed' },
  { id: 'eff-settings', file: 'core/integrity.ts', find: "  for (const f of Object.keys(b.settings)) if (a.settings[f] !== b.settings[f])", replace: "  for (const f of Object.keys(b.settings)) if (false)", tests: INTEG, breaks: 'settings.json change is not noticed' },
  { id: 'eff-prefs', file: 'core/integrity.ts', find: "  if (a.prefs !== b.prefs) out.push({ kind: 'prefs', before: a.prefs })", replace: '', tests: INTEG, breaks: '/exo switches changed in the store unnoticed' },
  { id: 'eff-keep-others', file: 'core/integrity.ts', find: "  for (const k of Object.keys(pc)) if (k === 'exo' || k.startsWith('exo@')) delete pc[k]", replace: '  for (const k of Object.keys(pc)) delete pc[k]', tests: INTEG, breaks: "reset deletes other plugins' settings" },
  { id: 'eff-approved', file: 'core/dispatcher/dispatcher.ts', find: ', c => approvedPath !== null && changeIs(c, approvedPath))', replace: ')', tests: INTEG, breaks: 'after allowing, it asks a second time (and reverts)' },
  { id: 'eff-approved-scope', file: 'core/dispatcher/dispatcher.ts', find: ', c => approvedPath !== null && changeIs(c, approvedPath))', replace: ', c => approvedPath !== null)', tests: INTEG, breaks: 'one allow also covers other switches' },
  { id: 'eff-approved-bash', file: 'core/dispatcher/dispatcher.ts', find: "      if (!isBash) approvedPath = String(input.file_path ?? input.notebook_path ?? '') || null", replace: "      approvedPath = String(input.file_path ?? input.notebook_path ?? input.command ?? '') || null", tests: INTEG, breaks: 'a Bash allow covers the effect' },
  // ---- secrets
  { id: 'sec-anthropic', file: 'modules/waechter/secrets-logic.ts', find: "{ kind: 'Anthropic API key', re: /\\bsk-ant-[A-Za-z0-9_-]{20,}/g },", replace: '', tests: SEC, breaks: 'Anthropic keys are not detected' },
  { id: 'sec-github', file: 'modules/waechter/secrets-logic.ts', find: "{ kind: 'GitHub token', re: /\\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\\b/g },", replace: '', tests: SEC, breaks: 'GitHub tokens are not detected' },
  { id: 'sec-pem', file: 'modules/waechter/secrets-logic.ts', find: "{ kind: 'Private key (PEM)', re: /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/g },", replace: '', tests: SEC, breaks: 'private keys are not detected' },
  { id: 'sec-mask', file: 'modules/waechter/secrets-logic.ts', find: '  return `${prefix}…${tail}`', replace: '  return value', tests: SEC, breaks: 'messages show the secret in plain text' },
  { id: 'sec-password', file: 'modules/waechter/secrets-logic.ts', find: "        if (value.length >= 8 && !/^\\d+$/.test(value)) add('password in assignment', value)", replace: '', tests: SEC, breaks: 'passwords in assignments slip through' },
  { id: 'sec-entropy', file: 'modules/waechter/secrets-logic.ts', find: '      if (entropy(v) < 4.3) continue', replace: '      continue', tests: SEC, breaks: 'high-entropy strings slip through' },
  { id: 'sec-placeholder', file: 'modules/waechter/secrets-logic.ts', find: '      if (isPlaceholder(value)) continue', replace: '', tests: SEC, breaks: 'placeholders trigger false alarms' },
  { id: 'sec-uuid', file: 'modules/waechter/secrets-logic.ts', find: "      if (/^[0-9a-f]+$/i.test(v) || UUID.test(v) || /^sha(?:1|256|384|512)-/.test(v)) continue", replace: '', tests: SEC, breaks: 'hashes and UUIDs trigger false alarms' },
  { id: 'sec-allow', file: 'modules/waechter/secrets-logic.ts', find: '    if (line.includes(ALLOW_COMMENT)) return', replace: '', tests: SEC, breaks: 'exo-allow-secret has no effect' },
  { id: 'sec-diff-added', file: 'modules/waechter/secrets-logic.ts', find: "    if (raw.startsWith('+') && file && file !== '/dev/null') {", replace: "    if ((raw.startsWith('+') || raw.startsWith('-')) && file && file !== '/dev/null') {", tests: SEC, breaks: 'removed lines also count as findings' },
  { id: 'sec-env', file: 'modules/waechter/secrets.ts', find: '  if (isEnvFile(path)) {\n    if (!(await gitIgnores(ctx, path)))', replace: '  if (false) {\n    if (!(await gitIgnores(ctx, path)))', tests: SEC, breaks: 'ignored .env is blocked' },
  { id: 'sec-commit', file: 'modules/waechter/secrets.ts', find: '      if (r.exitCode === 0) hits.push(...scanDiff(r.stdout, skip))\n      if (adds.length)', replace: '      if (adds.length)', tests: SEC, breaks: 'the staged diff is not checked' },
  { id: 'sec-push', file: 'modules/waechter/secrets.ts', find: "      const r = await ctx.untimed(ctx.host.run(['git', '-C', dir, 'log',", replace: "      const r = { exitCode: 1, stdout: '' } || await ctx.untimed(ctx.host.run(['git', '-C', dir, 'log',", tests: SEC, breaks: 'commits to be pushed are not checked' },
  { id: 'sec-redirect', file: 'modules/waechter/secrets.ts', find: '  if (relevant.length) for (const h of scanText(raw))', replace: '  if (false) for (const h of scanText(raw))', tests: SEC, breaks: 'echo KEY > file passes' },
  { id: 'sec-add-commit', file: 'modules/waechter/secrets.ts', find: '      if (adds.length) hits.push(...(await untrackedHits(ctx, dir, adds.flatMap(a => a!.args), skip)))', replace: '', tests: SEC, breaks: 'git add -A && git commit: new files unchecked' },
  // ---- prod shield
  { id: 'prod-alias', file: 'modules/waechter/prod-logic.ts', find: '    for (const [alias, target] of ssh) if (target === addr || target === name || alias === name) idx.set(alias, h)', replace: '', tests: PROD, breaks: 'ssh aliases to prod are not detected' },
  { id: 'prod-user', file: 'modules/waechter/prod-logic.ts', find: "    .replace(/^.*@/, '')", replace: '', tests: PROD, breaks: 'user@host is not detected' },
  { id: 'prod-scp', file: 'modules/waechter/prod-logic.ts', find: "    if (c.program === 'scp' || c.program === 'rsync' || c.program === 'sftp') {", replace: '    if (false) {', tests: PROD, breaks: 'scp/rsync to prod pass' },
  { id: 'prod-service', file: 'modules/waechter/prod-logic.ts', find: "      if (verb && SERVICE_VERBS.has(verb)) out.push(", replace: '      if (false) out.push(', tests: PROD, breaks: 'systemctl restart on prod is not reported' },
  { id: 'prod-sql-where', file: 'modules/waechter/prod-logic.ts', find: "    if (/^DELETE\\s+FROM\\b/i.test(s) && !/\\bWHERE\\b/i.test(s)) return true", replace: "    if (/^DELETE\\s+FROM\\b/i.test(s)) return true", tests: PROD, breaks: 'DELETE with WHERE counts as destructive' },
  { id: 'prod-sql-drop', file: 'modules/waechter/prod-logic.ts', find: "    if (/^DROP\\s+(TABLE|DATABASE|SCHEMA|VIEW|INDEX|USER|ROLE)\\b/i.test(s)) return true", replace: '', tests: PROD, breaks: 'DROP TABLE passes' },
  { id: 'prod-plus', file: 'modules/waechter/prod-logic.ts', find: "    if (m && (force || r.startsWith('+'))) return m[1]!", replace: '    if (m && force) return m[1]!', tests: PROD, breaks: '+main missed as a force push' },
  { id: 'prod-branch', file: 'modules/waechter/prod-logic.ts', find: "  if (force && refspecs.length === 0 && currentBranch && /^(main|master)$/.test(currentBranch)) return currentBranch", replace: '', tests: PROD, breaks: 'git push --force to main without refspec passes' },
  { id: 'prod-dry-drop', file: 'modules/waechter/prod-logic.ts', find: "    if (!m || /['\"`\\\\$]/.test(st) || !out.includes(st)) return null", replace: "    if (!out.includes(st)) return null", tests: PROD, breaks: 'a dry run for DROP is invented' },
  { id: 'prod-noui', file: 'modules/waechter/prod.ts', find: '  if (!ctx.interactive) return { deny:', replace: '  if (false) return { deny:', tests: PROD, breaks: 'without UI a prod command runs without asking' },
  { id: 'prod-esc', file: 'modules/waechter/prod.ts', find: '    answer = CANCEL // Esc', replace: '    answer = RUN', tests: PROD, breaks: 'Esc runs the prod command' },
  { id: 'prod-rule', file: 'modules/waechter/prod.ts', find: '      if (blocked.length) return { deny:', replace: '      if (false) return { deny:', tests: PROD, breaks: 'house rule (certbot) is ignored' },
  { id: 'prod-unparsable', file: 'modules/waechter/prod.ts', find: '        if (!named) return\n', replace: '        return\n', tests: PROD, breaks: 'unreadable commands referencing prod pass' },
  { id: 'prod-jump', file: 'modules/waechter/prod-logic.ts', find: '      for (const x of sshExtraHosts(c.argv)) remote(prodOf(x))\n    }\n    if (c.program === ', replace: '    }\n    if (c.program === ', tests: PROD, breaks: 'ssh -J/-o HostName to prod passes' },
  { id: 'prod-dot', file: 'modules/waechter/prod-logic.ts', find: "    .replace(/\\.$/, '')\n", replace: '', tests: PROD, breaks: 'vps. with trailing dot passes' },
  // ---- brake
  { id: 'brake-rf', file: 'modules/waechter/brake-logic.ts', find: "  return (f.has('r') || f.has('R') || f.has('--recursive')) && (f.has('f') || f.has('--force'))", replace: "  return f.has('r') && f.has('f')", tests: BRAKE, breaks: 'rm -Rf / --recursive --force are missed' },
  { id: 'brake-feeder', file: 'modules/waechter/brake-logic.ts', find: '      if (feeder) {', replace: '      if (false) {', tests: BRAKE, breaks: 'xargs rm -rf is silently not backed up' },
  { id: 'brake-vars', file: 'modules/waechter/brake-logic.ts', find: '        if (w.expansion) plan.unresolved.push(w.text)', replace: '        if (false) plan.unresolved.push(w.text)', tests: BRAKE, breaks: 'rm -rf "$X" runs without asking' },
  { id: 'brake-clean-n', file: 'modules/waechter/brake-logic.ts', find: "      const cleanArgs = ['-n', ...", replace: "      const cleanArgs = [...", tests: BRAKE, breaks: 'the backup actually runs git clean' },
  { id: 'brake-ref', file: 'modules/waechter/brake.ts', find: "      const r = await run(ctx, ['git', '-C', root, 'update-ref', ref, s]).catch(() => null)", replace: '      const r = { exitCode: 0 }', tests: BRAKE, breaks: 'stash commit without ref (gc cleans it up)' },
  { id: 'brake-untracked', file: 'modules/waechter/brake.ts', find: "    if (r?.exitCode === 0) for (const rel of parseCleanDryRun(r.stdout)) tarPaths.push(joinPath(p.cwd, rel, undefined))", replace: '', tests: BRAKE, breaks: 'git clean: untracked files not backed up' },
  { id: 'brake-limit', file: 'modules/waechter/brake.ts', find: '        if (meta.bytes > ctx.config.snapshotMaxMb * 1048576) {', replace: '        if (false) {', tests: BRAKE, breaks: 'size limit without asking' },
  { id: 'brake-overwrite', file: 'modules/waechter/undo.ts', find: '    if (exists.length) {', replace: '    if (false) {', tests: BRAKE, breaks: '/undo-last overwrites without asking' },
  { id: 'brake-retention', file: 'modules/waechter/brake-logic.ts', find: '  return sorted.filter((s, i) => i >= KEEP_COUNT || now - s.at > KEEP_MS)', replace: '  return sorted.filter((s, i) => i >= KEEP_COUNT)', tests: BRAKE, breaks: 'old snapshots stay forever' },
  // ---- diet
  { id: 'diet-range', file: 'modules/waechter/diet-logic.ts', find: '  if (i.hasRange || i.justCut || SPECIAL.test(i.path)) return null', replace: '  if (SPECIAL.test(i.path)) return null', tests: DIET, breaks: 'targeted reads are still truncated / endless loop' },
  { id: 'diet-guard', file: 'modules/waechter/diet.ts', find: '      lastCut = path\n', replace: '', tests: DIET, breaks: 'second read of the same file is truncated again' },
  { id: 'diet-tail', file: 'modules/waechter/diet.ts', find: '          if (r.exitCode === 0) tail = capTail(r.stdout)', replace: '', tests: DIET, breaks: 'the end of the file is missing' },
  { id: 'sec-name-parts', file: 'modules/waechter/secrets-logic.ts', find: 'export const isPasswordName = (name: string) => nameParts(name).some(p => PASSWORD_PARTS.has(p) || PASSWORD_CORE.test(p))', replace: 'export const isPasswordName = (name: string) => /pass|pwd/i.test(name)', tests: SEC, breaks: 'passed/compass/bypass count as passwords (false alarm, seen live)' },
  // ---- cockpit
  { id: 'tl-debounce', file: 'modules/cockpit/testlight.ts', find: '  st.timer = env.host.after(DEBOUNCE_MS, () => void run())', replace: '  void run()', tests: COCK, breaks: 'every change starts a test run immediately' },
  { id: 'tl-nice', file: 'modules/cockpit/testlight.ts', find: "  const argv = ['nice', '-n', '10', ...st.runner.argv(files)]", replace: '  const argv = [...st.runner.argv(files)]', tests: COCK, breaks: 'background tests at full priority' },
  { id: 'tl-claude-wait', file: 'modules/cockpit/testlight.ts', find: '  if (st.claudeRuns > 0) return schedule() // Claude is testing itself: later', replace: '', tests: COCK, breaks: "test light runs in parallel with Claude's own test run" },
  { id: 'tl-cut', file: 'modules/cockpit/testlight.ts', find: '  st.pending.add(e.path)\n  st.running?.stop()', replace: '  st.pending.add(e.path)', tests: COCK, breaks: 'stale run is not aborted' },
  { id: 'tl-once', file: 'modules/cockpit/testlight.ts', find: '      st.undelivered = null\n      return [', replace: '      return [', tests: COCK, breaks: 'red tests repeated in every prompt' },
  { id: 'tl-project', file: 'modules/cockpit/testlight.ts', find: "  if (st.env && !e.path.startsWith(st.env.project + '/')) return", replace: '', tests: COCK, breaks: 'changes outside the project trigger tests' },
  { id: 'tl-vitest', file: 'modules/cockpit/testlight-logic.ts', find: '    red = Number(vt[1] ?? 0)\n    green = Number(vt[2])', replace: '    green = Number(vt[2])', tests: COCK, breaks: 'vitest failures are not counted' },
  { id: 'tl-ssh', file: 'modules/cockpit/testlight-logic.ts', find: "    if (c.via.some(v => v.kind === 'ssh')) continue\n    const a = c.argv", replace: '    const a = c.argv', tests: COCK, breaks: 'tests on another machine count as local' },
  { id: 'dc-files', file: 'modules/cockpit/donecheck.ts', find: "  if (!changes.length) return 'nothing-changed'", replace: "  if (!changes.length) return 'unchecked'", tests: COCK, breaks: 'warning even without file changes' },
  { id: 'dc-after', file: 'modules/cockpit/donecheck.ts', find: '  const green = events.some(e => e.seq > after &&', replace: '  const green = events.some(e => e.seq > 0 &&', tests: COCK, breaks: 'a green run before the last change counts' },
  { id: 'dc-reason', file: 'modules/cockpit/donecheck.ts', find: "      if (t.reason !== 'answer' || !claims(t.answer).length) return", replace: '      if (!claims(t.answer).length) return', tests: COCK, breaks: 'warning even on aborted turns' },
  { id: 'sb-first-touch', file: 'modules/cockpit/sidebar.ts', find: '      if (!originals.has(path)) {', replace: '      if (true) {', tests: COCK, breaks: 'baseline is overwritten on every change' },
  { id: 'sb-snapshot', file: 'modules/cockpit/sidebar.ts', find: "    const tar = await env.host.run(['tar', '-czPf', `${dir}/files.tgz`, '--', path])", replace: '    const tar = { exitCode: 0, stderr: \'\' }', tests: COCK, breaks: 'reset without snapshot' },
  { id: 'sb-ask', file: 'modules/cockpit/sidebar.ts', find: "    ok = (await env.host.ask(what, ['Revert', 'Cancel'])) === 'Revert'", replace: '    ok = true', tests: COCK, breaks: 'revert without asking' },
  { id: 'sb-persist', file: 'modules/cockpit/sidebar.ts', find: '        await persist(env)\n', replace: '', tests: COCK, breaks: 'baselines are lost on reload' },
  { id: 'ci-once', file: 'modules/cockpit/ci.ts', find: "    if (run.state === 'red' && st.notified !== run.id) {", replace: "    if (run.state === 'red') {", tests: COCK, breaks: 'toast again on every poll' },
  { id: 'ci-idle', file: 'modules/cockpit/ci.ts', find: '  if (now - lastActivity > IDLE_MS) return', replace: '', tests: COCK, breaks: 'CI is polled even in idle sessions' },
  { id: 'ci-backoff', file: 'modules/cockpit/ci.ts', find: 'export const nextDelay = (failures: number) => (failures === 0 ? POLL_MS : Math.min(MAX_BACKOFF_MS, POLL_MS * 2 ** failures))', replace: 'export const nextDelay = (_failures: number) => POLL_MS', tests: COCK, breaks: 'no backoff on errors' },
  { id: 'core-filechanged', file: 'core/dispatcher/dispatcher.ts', find: "      deps.journal.push({ type: 'file.changed', path: filePath,", replace: "      void ({ type: 'file.changed', path: filePath,", tests: COCK, breaks: 'file changes do not reach the journal' },
  { id: 'tl-consent', file: 'modules/cockpit/testlight.ts', find: '  if (!st.runner || !(await consented(env, st.runner, files))) return', replace: '  if (!st.runner) return', tests: COCK, breaks: 'project commands run without consent' },
  { id: 'tl-consent-fp', file: 'modules/cockpit/testlight.ts', find: '  if (known && known.fp === fp) return known.allowed', replace: '  if (known) return known.allowed', tests: COCK, breaks: 'changed test config runs without asking again' },
  { id: 'tl-noui', file: 'modules/cockpit/testlight.ts', find: '  if (!env.interactive) return false\n  const fp = await configFingerprint(env)', replace: '  const fp = await configFingerprint(env)', tests: COCK, breaks: 'without UI it still asks/starts' },
  { id: 'tl-effects', file: 'modules/cockpit/testlight.ts', find: '    const undone = await settleEffects(env.host, env.home, before, env.interactive).catch(() => [])', replace: '    const undone: string[] = []', tests: COCK, breaks: 'test run silently switches exo off' },
  { id: 'tl-argv-dot', file: 'modules/cockpit/testlight-logic.ts', find: "(f.startsWith(root + '/') ? './' + f.slice(root.length + 1)", replace: "(f.startsWith(root + '/') ? f.slice(root.length + 1)", tests: COCK, breaks: 'file names are read as options' },
  { id: 'sec-name-core', file: 'modules/waechter/secrets-logic.ts', find: 'nameParts(name).some(p => PASSWORD_PARTS.has(p) || PASSWORD_CORE.test(p))', replace: 'nameParts(name).some(p => PASSWORD_PARTS.has(p))', tests: SEC, breaks: 'dbpassword/rootpwd slip through' },
  { id: 'sec-name-digits', file: 'modules/waechter/secrets-logic.ts', find: "    .replace(/([A-Za-z])([0-9])/g, '$1 $2')\n", replace: '', tests: SEC, breaks: 'pass123 slips through' },
  // ---- rueckblick
  { id: 'h-gap', file: 'modules/rueckblick/hours-logic.ts', find: '  if (gap <= 0 || gap > GAP_MS) return next', replace: '  if (gap <= 0) return next', tests: RUECK, breaks: 'breaks count as working time' },
  { id: 'h-project', file: 'modules/rueckblick/hours-logic.ts', find: '  if (!last || last.project !== project) return next', replace: '  if (!last) return next', tests: RUECK, breaks: 'project switch is credited to the new project' },
  { id: 'h-prune', file: 'modules/rueckblick/hours-logic.ts', find: '  return { ...h, days: Object.fromEntries(Object.entries(h.days).filter(([d]) => d >= cutoff)) }', replace: '  return h', tests: RUECK, breaks: 'old days stay forever' },
  { id: 'r-once', file: 'modules/rueckblick/recap.ts', find: "      if (!entry || entry.shown ||", replace: "      if (!entry ||", tests: RUECK, breaks: '"Last session" hint appears every time' },
  { id: 'r-week', file: 'modules/rueckblick/recap.ts', find: ' || now - entry.facts.endedAt > WEEK_MS) return', replace: ') return', tests: RUECK, breaks: 'hint even after more than seven days' },
  { id: 'r-same', file: 'modules/rueckblick/recap.ts', find: ' || entry.facts.sessionId === env.sessionId', replace: '', tests: RUECK, breaks: 'hint about the own, running session' },
  { id: 'r-empty', file: 'modules/rueckblick/recap.ts', find: '      if (!f.turns && !f.files.length) return // nothing happened: nothing worth recalling', replace: '', tests: RUECK, breaks: 'empty sessions push out real ones' },
  { id: 'l-ticked', file: 'modules/rueckblick/recap.ts', find: '  const picked = offer.filter((_, i) => chosen.includes(labels[i]!))', replace: '  const picked = offer', tests: RUECK, breaks: 'lessons are written without a checkmark' },
  { id: 'l-esc', file: 'modules/rueckblick/recap.ts', find: "  } catch {\n    return 'Lessons: nothing added.'\n  }", replace: '  } catch {\n    chosen = labels\n  }', tests: RUECK, breaks: 'Esc writes all lessons' },
  { id: 'l-dup', file: 'modules/rueckblick/recap.ts', find: "  const fresh = (await readLessons(env)).filter(l => !isDuplicate(l, existing ?? ''))", replace: '  const fresh = await readLessons(env)', tests: RUECK, breaks: 'duplicates of CLAUDE.md are offered again' },
  { id: 'l-code', file: 'modules/rueckblick/recap-logic.ts', find: "    .replace(/```[\\s\\S]*?```/g, ' ')\n", replace: '', tests: RUECK, breaks: 'code blocks yield fake lessons' },
  { id: 'l-label', file: 'modules/rueckblick/recap-logic.ts', find: 'export const label = (_s: string, i: number) => String(i + 1)', replace: 'export const label = (s: string, _i: number) => s.slice(0, 90)', tests: RUECK, breaks: 'label is truncated text (commas, not fully read)' },
  { id: 'l-sanitize', file: 'modules/rueckblick/recap-logic.ts', find: '  return sentences.filter(s => s.length >= 25 && s.length <= 300 && LESSON.test(s)).map(sanitizeLesson)', replace: '  return sentences.filter(s => s.length >= 25 && s.length <= 300 && LESSON.test(s))', tests: RUECK, breaks: 'markup/HTML ends up in CLAUDE.md' },
  { id: 'l-fulltext', file: 'modules/rueckblick/recap.ts', find: '?\\n${listed}\\nNothing is written', replace: '? Nothing is written', tests: RUECK, breaks: 'things not fully readable get ticked' },
  { id: 'safe-lessons', file: 'modules/rueckblick/recap.ts', find: '  if (!(await insideRoot(env.host, target, env.project))) return', replace: '  if (false) return', tests: RUECK, breaks: 'lessons via a symlink to ~/.bashrc' },
  { id: 'safe-md', file: 'modules/rueckblick/recap.ts', find: '    if (await insideRoot(env.host, path, env.project)) {', replace: '    if (true) {', tests: RUECK, breaks: '/recap md writes via a symlink to /etc' },
  { id: 'safe-dangling', file: 'core/safepath.ts', find: '      if (await host.isLink(cur).catch(() => true)) return false\n', replace: '', tests: RUECK, breaks: 'a dangling symlink redirects the write outside' },
  { id: 'safe-dots', file: 'core/safepath.ts', find: '  if (/(^|\\/)\\.\\.?(\\/|$)/.test(path)) return false\n', replace: '', tests: RUECK, breaks: '.. in the path leads out of the project' },
  { id: 'safe-missing', file: 'core/safepath.ts', find: "  return /\\bENOENT\\b|\\bENOTDIR\\b|no such file or directory/i.test(text)", replace: '  return true', tests: RUECK, breaks: 'every error counts as "missing", the check lets it through' },
  // ---- extras
  { id: 'duck-blank', file: 'modules/extras/duck-logic.ts', find: '  const v = value === null ? null : value.trim() || null', replace: '  const v = value', tests: EXTRAS, breaks: 'empty answers end up in the prompt' },
  { id: 'duck-error-block', file: 'modules/extras/duck-logic.ts', find: "    if (i === 2) lines.push(`${LABELS[i]}:`, '```', a, '```')\n    else", replace: '   ', tests: EXTRAS, breaks: 'error message without code block' },
  { id: 'ach-one', file: 'modules/extras/achievements.ts', find: '      const badge = next[0]', replace: '      const badge = next[next.length - 1]', tests: EXTRAS, breaks: 'badges in wrong order' },
  { id: 'ach-quiet', file: 'modules/extras/achievements.ts', find: '        if (!inQuiet(new Date(now).getHours(), env.config.quietHours)) {', replace: '        if (true) {', tests: EXTRAS, breaks: 'toasts and sounds during quiet hours' },
  { id: 'ach-streak', file: 'modules/extras/achievements-logic.ts', find: '        s.streak = redInTurn ? 0 : s.streak + 1', replace: '        s.streak = s.streak + 1', tests: EXTRAS, breaks: 'red test does not break the streak' },
  { id: 'ach-seen', file: 'modules/extras/achievements-logic.ts', find: '    if (e.seq <= s.seenSeq) continue\n', replace: '', tests: EXTRAS, breaks: 'events are counted multiple times' },
  { id: 'ach-requires', file: 'modules/extras/achievements-logic.ts', find: '(!r.requires || usageBars)', replace: 'true', tests: EXTRAS, breaks: 'Pac-Man badge without usage-bars' },
  { id: 'ach-session', file: 'modules/extras/achievements-logic.ts', find: "    seenSeq: o.sessionId === sessionId && typeof o.seenSeq === 'number' ? o.seenSeq : 0,", replace: "    seenSeq: typeof o.seenSeq === 'number' ? o.seenSeq : 0,", tests: EXTRAS, breaks: 'new session skips its journal' },
  { id: 'cine-stop', file: 'modules/extras/cinema.ts', find: '  if (!animate && st.fast) {', replace: '  if (false) {', tests: EXTRAS, breaks: 'the 30 fps timer keeps running' },
  { id: 'cine-reduced', file: 'modules/extras/cinema.ts', find: '  const animate = film !== null && !env.config.reducedMotion', replace: '  const animate = film !== null', tests: EXTRAS, breaks: 'reduced motion is ignored' },
  { id: 'cine-coffee', file: 'modules/extras/cinema-logic.ts', find: "  if (turnMs !== null && turnMs >= COFFEE_AFTER_MS) return 'coffee'", replace: '', tests: EXTRAS, breaks: 'long turns without coffee' },
  { id: 'cine-width', file: 'modules/extras/cinema-logic.ts', find: "  return text.length > room ? text.slice(0, room - 1) + '…' : text", replace: '  return text', tests: EXTRAS, breaks: 'spinner exceeds the terminal width' },
  // ---- dispatcher
  { id: 'fail-closed', file: 'core/dispatcher/dispatcher.ts', find: "      if (policyOf(step.id) === 'closed') {", replace: '      if (false) {', tests: DISP, breaks: 'a faulty guard lets through' },
  { id: 'deny-stops', file: 'core/dispatcher/dispatcher.ts', find: '      return { deny: out.deny }', replace: '      void 0', tests: DISP, breaks: 'a rejection is ignored' },
  { id: 'kill-first', file: 'core/dispatcher/dispatcher.ts', find: '  if (await deps.killed()) return next({ ...call.input })', replace: '', tests: DISP, breaks: 'the kill switch has no effect in the dispatcher' },
  { id: 'step-order', file: 'core/dispatcher/dispatcher.ts', find: '  return [...steps].sort((a, b) => rank(a) - rank(b))', replace: '  return [...steps]', tests: DISP, breaks: 'the fixed order does not apply' },
  { id: 'catch-guarded', file: 'core/dispatcher/dispatcher.ts', find: "  if (killed || !isGuardedTool(tool)) return 'pass'", replace: "  return 'pass'", tests: DISP, breaks: 'core failure lets Bash through' },
  { id: 'catch-ran', file: 'core/dispatcher/dispatcher.ts', find: "  if (alreadyRan) return 'leave'", replace: '', tests: DISP, breaks: 'an already executed call is rejected afterwards' },
  { id: 'disabled-off', file: 'core/dispatcher/dispatcher.ts', find: '    if (!step.before || !deps.config.enabled[step.id]) continue', replace: '    if (!step.before) continue', tests: DISP, breaks: 'disabled modules keep running' },
  // ---- kill switch, rules
  { id: 'kill-file', file: 'core/killswitch.ts', find: "  if (s.fileExists) return 'file ~/.claude/exo/DISABLED'", replace: '', tests: CORE, breaks: 'the DISABLED file has no effect' },
  { id: 'kill-env', file: 'core/killswitch.ts', find: "  if (s.env !== undefined && s.env !== '' && s.env !== '0' && s.env.toLowerCase() !== 'false') return 'EXO_DISABLE'", replace: '', tests: CORE, breaks: 'EXO_DISABLE has no effect' },
  { id: 'kill-cache', file: 'core/killswitch.ts', find: '    if (!this.cached || t - this.cached.at >= this.cacheMs) {', replace: '    if (!this.cached) {', tests: CORE, breaks: 'the file is never checked again after the first look' },
  { id: 'rules-unknown', file: 'core/config/rules.ts', find: '  if (unknown.length) return', replace: '  if (false) return', tests: CORE, breaks: 'typos in rule fields go unnoticed' },
  { id: 'rules-fallback', file: 'core/config/rules.ts', find: "  if (v.fatal) return { rules: defaultRules(),", replace: "  if (v.fatal) return { rules: [],", tests: CORE, breaks: 'broken rules.json loses the built-in rules' },
]
