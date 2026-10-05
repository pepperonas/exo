import { test } from 'node:test'
import assert from 'node:assert/strict'

import { parse } from '../core/shell/parse'
import { commandsOf, summarize } from '../core/shell/words'
import type { Cmd } from '../core/shell/words'

/** `via/via:argv argv` per command, joined by ` | `. */
function show(c: Cmd): string {
  const via = c.via
    .filter(v => v.kind !== 'subst')
    .map(v => (v.kind === 'ssh' ? `ssh@${v.host}` : v.name))
    .join('/')
  const sub = c.via.some(v => v.kind === 'subst') ? '$:' : ''
  return `${sub}${via ? via + ':' : ''}${c.argv.join(' ')}${c.background ? ' &' : ''}`
}
const render = (src: string) => {
  const cmds = commandsOf(src)
  return cmds ? cmds.map(show).join(' | ') : 'FEHLER'
}

// [input, expected]
const CASES: [string, string][] = [
  // simple words and quoting
  ['ls', 'ls'],
  ['ls -la /tmp', 'ls -la /tmp'],
  ['  ls   -la  ', 'ls -la'],
  ["echo 'a b'", 'echo a b'],
  ['echo "a b"', 'echo a b'],
  ['echo a\\ b', 'echo a b'],
  ["echo 'it'\\''s'", "echo it's"],
  ['echo "say \\"hi\\""', 'echo say "hi"'],
  ['echo "a\\b"', 'echo a\\b'],
  ["echo $'a\\tb'", 'echo a\tb'],
  ["echo $'\\x41\\101'", 'echo AA'],
  ['echo ""', 'echo '],
  ["echo ''x", 'echo x'],
  ['echo a"b"c', 'echo abc'],
  ['echo \\$HOME', 'echo $HOME'],
  ['echo "$HOME"', 'echo $HOME'],
  ['echo ${HOME}/x', 'echo ${HOME}/x'],
  ['echo $((1+2))', 'echo $((1+2))'],
  ['echo #comment', 'echo'],
  ['echo a#b', 'echo a#b'],
  ['ls # list it', 'ls'],
  ['echo a \\\n b', 'echo a b'],
  // operators
  ['a && b', 'a | b'],
  ['a || b', 'a | b'],
  ['a; b', 'a | b'],
  ['a;b', 'a | b'],
  ['a | b', 'a | b'],
  ['a |& b', 'a | b'],
  ['a & b', 'a & | b'],
  ['a &', 'a &'],
  ['a\nb', 'a | b'],
  ['a && b || c; d | e', 'a | b | c | d | e'],
  ['! false', 'false'],
  ['a;', 'a'],
  ['a ;; b', 'a | b'],
  ['cd /x && npm test', 'cd /x | npm test'],
  // grouping
  ['(cd x && rm -rf y)', 'cd x | rm -rf y'],
  ['{ a; b; }', 'a | b'],
  ['( a ) && b', 'a | b'],
  ['((i++))', '((i++))'],
  ['(a; (b; c))', 'a | b | c'],
  ['{ rm -rf x; } > log', 'rm -rf x'],
  // assignments and redirects
  ['FOO=1 cmd', 'cmd'],
  ['FOO=1 BAR=2 cmd arg', 'cmd arg'],
  ['FOO=1', ''],
  ['echo hi > out.txt', 'echo hi'],
  ['echo hi >> out.txt', 'echo hi'],
  ['cmd 2>&1', 'cmd'],
  ['cmd 2> /dev/null', 'cmd'],
  ['cmd &> all.log', 'cmd'],
  ['cmd &>> all.log', 'cmd'],
  ['cmd < in.txt', 'cmd'],
  ['cmd <<< "data"', 'cmd'],
  ['>out echo hi', 'echo hi'],
  ['echo a>b', 'echo a'],
  ['cmd >| file', 'cmd'],
  // substitutions run before the command that uses them
  ['echo $(whoami)', '$:whoami | echo $(whoami)'],
  ['echo `date`', '$:date | echo `date`'],
  ['echo "x $(rm -rf a) y"', '$:rm -rf a | echo x $(rm -rf a) y'],
  ['echo $(echo $(id))', '$:id | $:echo $(id) | echo $(echo $(id))'],
  ['diff <(ls a) <(ls b)', '$:ls a | $:ls b | diff <(…) <(…)'],
  ['tee >(gzip > x.gz)', '$:gzip | tee >(…)'],
  ['cat > $(mktemp)', '$:mktemp | cat'],
  ['x=$(curl -s url) cmd', '$:curl -s url | cmd'],
  ['echo `echo \\`id\\``', '$:id | $:echo `id` | echo `echo \\`id\\``'],
  // wrappers
  ['sudo rm -rf /var/x', 'sudo:rm -rf /var/x'],
  ['sudo -u www-data rm -rf x', 'sudo:rm -rf x'],
  ['sudo -E -H systemctl restart nginx', 'sudo:systemctl restart nginx'],
  ['sudo -- rm x', 'sudo:rm x'],
  ['env FOO=1 BAR=2 node app.js', 'env:node app.js'],
  ['env -i PATH=/bin sh -c "rm -rf x"', 'env:sh -c rm -rf x | env/sh:rm -rf x'],
  ['nice -n 10 npm test', 'nice:npm test'],
  ['nice -10 make', 'nice:make'],
  ['nohup ./run.sh &', 'nohup:./run.sh &'],
  ['time npm test', 'time:npm test'],
  ['timeout 30 npm test', 'timeout:npm test'],
  ['timeout -s KILL 5s rm -rf x', 'timeout:rm -rf x'],
  ['command rm -rf x', 'command:rm -rf x'],
  ['command -v git', ''],
  ['exec node server.js', 'exec:node server.js'],
  ['sudo nice -n 5 rm -rf /x', 'sudo/nice:rm -rf /x'],
  ['/usr/bin/sudo /bin/rm -rf x', 'sudo:/bin/rm -rf x'],
  ['find . -name "*.tmp" | xargs rm -rf', 'find . -name *.tmp | xargs:rm -rf'],
  ['xargs -0 -n 1 rm -f < list', 'xargs:rm -f'],
  ['stdbuf -o0 tail -f log', 'stdbuf:tail -f log'],
  ['doas rm -rf x', 'doas:rm -rf x'],
  ['caffeinate -i npm run build', 'caffeinate:npm run build'],
  // shells
  ['bash -c "rm -rf x && ls"', 'bash -c rm -rf x && ls | bash:rm -rf x | bash:ls'],
  ["sh -c 'git push -f origin main'", 'sh -c git push -f origin main | sh:git push -f origin main'],
  ['bash -lc "npm test"', 'bash -lc npm test | bash:npm test'],
  ['bash -e -c "make"', 'bash -e -c make | bash:make'],
  ['zsh -c "echo hi"', 'zsh -c echo hi | zsh:echo hi'],
  ['bash script.sh', 'bash script.sh'],
  ['bash -o pipefail -c "a | b"', 'bash -o pipefail -c a | b | bash:a | bash:b'],
  ['bash -c "bash -c \\"rm -rf deep\\""', 'bash -c bash -c "rm -rf deep" | bash:bash -c rm -rf deep | bash/bash:rm -rf deep'],
  ['bash <<EOF\nrm -rf x\nEOF', 'bash | bash:rm -rf x'],
  ['sh <<< "rm -rf y"', 'sh | sh:rm -rf y'],
  ['sudo bash -c "rm -rf /x"', 'sudo:bash -c rm -rf /x | sudo/bash:rm -rf /x'],
  // ssh
  ['ssh prod', 'ssh prod'],
  ['ssh prod uptime', 'ssh prod uptime | ssh@prod:uptime'],
  ['ssh root@prod "systemctl restart nginx"', 'ssh root@prod systemctl restart nginx | ssh@prod:systemctl restart nginx'],
  ['ssh -p 2222 -i key.pem deploy@203.0.113.7 ls /srv', 'ssh -p 2222 -i key.pem deploy@203.0.113.7 ls /srv | ssh@203.0.113.7:ls /srv'],
  ['ssh -o StrictHostKeyChecking=no prod "a && b"', 'ssh -o StrictHostKeyChecking=no prod a && b | ssh@prod:a | ssh@prod:b'],
  ['ssh prod sudo systemctl stop app', 'ssh prod sudo systemctl stop app | ssh@prod/sudo:systemctl stop app'],
  ['ssh -t prod "bash -c \\"rm -rf /tmp/x\\""', 'ssh -t prod bash -c "rm -rf /tmp/x" | ssh@prod:bash -c rm -rf /tmp/x | ssh@prod/bash:rm -rf /tmp/x'],
  ['ssh ssh://admin@prod:2200 id', 'ssh ssh://admin@prod:2200 id | ssh@prod:id'],
  ['ssh prod <<EOF\nnginx -s reload\nEOF', 'ssh prod | ssh@prod:nginx -s reload'],
  ['ssh -J jump prod ls', 'ssh -J jump prod ls | ssh@prod:ls'],
  ['ssh -lroot prod ls', 'ssh -lroot prod ls | ssh@prod:ls'],
  ['cd x && ssh prod "cd /srv && git pull" && echo ok', 'cd x | ssh prod cd /srv && git pull | ssh@prod:cd /srv | ssh@prod:git pull | echo ok'],
  // git and friends
  ['git push --force origin main', 'git push --force origin main'],
  ['git reset --hard HEAD~1', 'git reset --hard HEAD~1'],
  ['git clean -fdx', 'git clean -fdx'],
  ['git -C repo status', 'git -C repo status'],
  ['rm -rf ~/x', 'rm -rf ~/x'],
  ['rm -rf *.log', 'rm -rf *.log'],
  ['psql -c "DELETE FROM users"', 'psql -c DELETE FROM users'],
  ['mysql -e "DROP TABLE t" db', 'mysql -e DROP TABLE t db'],
  // heredocs
  ['cat <<EOF > f\nhello\nEOF', 'cat'],
  ["cat <<'EOF'\n$HOME\nEOF", 'cat'],
  ['cat <<-EOF\n\tx\n\tEOF', 'cat'],
  ['cat <<A <<B\na\nA\nb\nB', 'cat'],
  ['cat <<EOF && echo after\nbody\nEOF', 'cat | echo after'],
  // control flow words stay commands (recognition is best effort)
  ['if true; then rm -rf x; fi', 'if true | then rm -rf x | fi'],
  ['for f in *; do rm "$f"; done', 'for f in * | do rm $f | done'],
  // multi-line
  ['npm ci\nnpm test\n', 'npm ci | npm test'],
  ['  \n\n ls \n', 'ls'],
]

// Inputs that must not parse (never throw).
const BROKEN: string[] = [
  "echo 'open",
  'echo "open',
  'echo $(open',
  '(a',
  '{ a;',
  'a &&',
  '| a',
  'a ||| b',
  'cat <<EOF\nno end',
  'echo `open',
  'echo ${x',
  "echo $'open",
  ')',
  ';',
  'a ;;; b',
  '> ',
]

for (const [src, want] of CASES) {
  test(`parse: ${JSON.stringify(src)}`, () => {
    assert.equal(render(src), want)
  })
}

for (const src of BROKEN) {
  test(`unparsable: ${JSON.stringify(src)}`, () => {
    const r = parse(src)
    assert.equal(r.ok, false)
    if (!r.ok) assert.ok(r.error.length > 0)
  })
}

test('word flags: expansion, glob, tilde, quoted', () => {
  const r = parse('rm -rf "$DIR" *.log ~/x \'lit*\' a{b,c}')
  assert.ok(r.ok)
  if (!r.ok) return
  const c = r.script.entries[0]!.pipeline.commands[0]!
  assert.equal(c.type, 'simple')
  if (c.type !== 'simple') return
  const [, , dir, logs, home, lit, brace] = c.words
  assert.equal(dir!.expansion, true)
  assert.equal(dir!.quoted, true)
  assert.equal(logs!.glob, true)
  assert.equal(home!.tilde, true)
  assert.equal(lit!.glob, false)
  assert.equal(brace!.glob, true)
})

test('redirect targets and heredoc bodies are kept', () => {
  const r = parse("cat > out.txt <<'EOF'\nsecret=1\nEOF")
  assert.ok(r.ok)
  if (!r.ok) return
  const c = r.script.entries[0]!.pipeline.commands[0]!
  if (c.type !== 'simple') return assert.fail('simple expected')
  assert.equal(c.redirects[0]!.op, '>')
  assert.equal(c.redirects[0]!.target!.text, 'out.txt')
  assert.equal(c.redirects[1]!.heredoc!.body, 'secret=1\n')
  assert.equal(c.redirects[1]!.heredoc!.quoted, true)
})

test('fd numbers on redirects', () => {
  const r = parse('cmd 2>err 1>&2')
  assert.ok(r.ok)
  if (!r.ok) return
  const c = r.script.entries[0]!.pipeline.commands[0]!
  if (c.type !== 'simple') return assert.fail('simple expected')
  assert.deepEqual(
    c.redirects.map(x => [x.fd, x.op, x.target?.text]),
    [
      [2, '>', 'err'],
      [1, '>&', '2'],
    ],
  )
})

test('ssh info: user, port, host, remote', () => {
  const cmds = commandsOf('ssh -p 22 -l admin prod "uptime; df -h"')!
  const ssh = cmds.find(c => c.program === 'ssh')!
  assert.deepEqual(ssh.ssh, { host: 'prod', user: 'admin', port: '22', remote: 'uptime; df -h', remoteUnparsable: false, localCommands: [], localUnparsable: false })
})

test('ssh with an unparsable remote command is flagged', () => {
  const cmds = commandsOf(`ssh prod "echo 'open"`)!
  assert.equal(cmds[0]!.ssh!.remoteUnparsable, true)
})

test('deep nesting is refused, not a crash', () => {
  const deep = '$('.repeat(60) + 'x' + ')'.repeat(60)
  const r = parse('echo ' + deep)
  assert.equal(r.ok, false)
})

test('very long input is refused', () => {
  assert.equal(parse('a'.repeat(300_000)).ok, false)
})

test('sudo user is recorded', () => {
  const c = commandsOf('sudo -u deploy rm x')![0]!
  assert.equal(c.via[0]!.user, 'deploy')
  assert.equal(commandsOf('sudo rm x')![0]!.via[0]!.user, 'root')
})

test('summary keeps programs and subcommands, never arguments', () => {
  assert.equal(summarize('cd /secret/path && git push origin main'), 'cd · git push')
  assert.equal(summarize('ssh prod "systemctl restart app"'), 'ssh · ssh:systemctl restart')
  assert.equal(summarize('curl -H "Authorization: Bearer abc" x'), 'curl')
  assert.equal(summarize("echo 'open"), '(nicht lesbar)')
})

test('at least 120 fixtures', () => {
  assert.ok(CASES.length + BROKEN.length >= 120, `${CASES.length + BROKEN.length}`)
})

// ---- security review 2026-10-05: commands hidden from the parser
const HIDDEN: [string, string][] = [
  ['echo $(( $(rm -rf /tmp/x) + 1 ))', 'rm -rf /tmp/x'],
  ['(( $(rm -rf /tmp/x) ))', 'rm -rf /tmp/x'],
  ['echo $(( `rm -rf /tmp/x` ))', 'rm -rf /tmp/x'],
  ['echo ${x:-$(rm -rf /tmp/x)}', 'rm -rf /tmp/x'],
  ['echo "${x:-$(rm -rf /tmp/x)}"', 'rm -rf /tmp/x'],
  ["echo ${x:-'$(rm -rf /tmp/x)'}", 'rm -rf /tmp/x'],
  ['echo ${x:-${y:-$(rm -rf /tmp/x)}}', 'rm -rf /tmp/x'],
  ['echo ${x:-"}"}; rm -rf /tmp/y', 'rm -rf /tmp/y'],
  ['echo $((rm -rf /tmp/z) )', 'rm -rf /tmp/z'],
  ['((rm -rf /tmp/z) )', 'rm -rf /tmp/z'],
  ['ssh -o ProxyCommand="rm -rf /tmp/p" host ls', 'rm -rf /tmp/p'],
  ['ssh -oProxyCommand=touch\\ /tmp/q host', 'touch /tmp/q'],
  ['ssh -o "LocalCommand rm -rf /tmp/l" -o PermitLocalCommand=yes host', 'rm -rf /tmp/l'],
  ['find . -name "*.tmp" -exec rm -rf {} \;', 'rm -rf {}'],
  ['find . -execdir rm -f {} +', 'rm -f {}'],
]
for (const [src, inner] of HIDDEN) {
  test(`no hidden command: ${JSON.stringify(src)}`, () => {
    const cmds = commandsOf(src)
    assert.ok(cmds, 'must parse')
    assert.ok(cmds!.some(c => c.argv.join(' ') === inner), `${inner} fehlt in ${JSON.stringify(cmds!.map(c => c.argv.join(' ')))}`)
  })
}

test('arithmetic stays arithmetic', () => {
  assert.equal(render('echo $((1 + (2 * 3)))'), 'echo $((1 + (2 * 3)))')
  assert.equal(render('((i = (j + 1) * 2))'), '((i = (j + 1) * 2))')
})

test('ssh local commands are recorded, an unparsable one is flagged', () => {
  const ok = commandsOf('ssh -o ProxyCommand="nc %h %p" host')!.find(c => c.program === 'ssh')!
  assert.deepEqual(ok.ssh!.localCommands, ['nc %h %p'])
  const bad = commandsOf(`ssh -o "ProxyCommand=echo 'x" host`)!.find(c => c.program === 'ssh')!
  assert.equal(bad.ssh!.localUnparsable, true)
})
