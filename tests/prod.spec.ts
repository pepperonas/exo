import { test } from 'node:test'
import assert from 'node:assert/strict'

import { emptyPrefs, resolveConfig } from '../core/config/config'
import { defaultRules } from '../core/config/rules'
import { dispatch } from '../core/dispatcher/dispatcher'
import type { DispatchDeps, ToolResult } from '../core/dispatcher/dispatcher'
import { Health } from '../core/health/health'
import { Journal } from '../core/journal/journal'
import { commandsOf } from '../core/shell/words'
import { destructiveSql, dryRun, forcedMain, inspect, parseSshConfig, pipedSql, prodIndex, remoteHostOf, sqlStatements } from '../modules/waechter/prod-logic'
import { prodStep } from '../modules/waechter/prod'
import { FakeHost } from './fake-host'

// Documentation addresses only (RFC 5737); never a real host in this repo.
const HOSTS = [
  { name: 'vps', address: '203.0.113.10' },
  { name: 'shop', address: 'shop.example.com' },
]
const SSH = parseSshConfig(
  [
    'Host celox-alias web1',
    '  HostName 203.0.113.10',
    '  User root',
    'Host *.internal',
    '  HostName 198.51.100.9',
    'Host other',
    '  HostName 198.51.100.20',
    'Host shop',
    '  HostName 198.51.100.30',
  ].join('\n'),
)
const INDEX = prodIndex(HOSTS, SSH)
const find = (src: string, branch: string | null = 'feature') => {
  const cmds = commandsOf(src)!
  return [...inspect(cmds, INDEX, branch), ...pipedSql(cmds)]
}
const kinds = (src: string, branch?: string | null) => find(src, branch).map(f => `${f.kind}${f.host ? '@' + f.host.name : ''}`)

test('ssh config: aliases to HostName, wildcards skipped', () => {
  assert.equal(SSH.get('celox-alias'), '203.0.113.10')
  assert.equal(SSH.get('web1'), '203.0.113.10')
  assert.equal(SSH.has('*.internal'), false)
})

test('prod index: name, address, aliases pointing to it, HostName behind the name', () => {
  for (const k of ['vps', '203.0.113.10', 'celox-alias', 'web1', 'shop', 'shop.example.com', '198.51.100.30']) assert.ok(INDEX.has(k), k)
  assert.equal(INDEX.has('other'), false)
})

const REMOTE: [string, string[]][] = [
  ['ssh vps', ['remote@vps']],
  ['ssh root@203.0.113.10 uptime', ['remote@vps']],
  ['ssh -p 2222 deploy@celox-alias "ls"', ['remote@vps']],
  ['ssh WEB1 ls', ['remote@vps']],
  ['scp dist.tgz vps:/srv/', ['remote@vps']],
  ['scp -r user@[203.0.113.10]:/etc/nginx ./backup', ['remote@vps']],
  ['rsync -av dist/ shop.example.com:/var/www/', ['remote@shop']],
  ['rsync -av rsync://backup@shop/data ./d', ['remote@shop']],
  ['sftp deploy@shop', ['remote@shop']],
  ['ssh other ls', []],
  ['scp a.txt ./b.txt', []],
  ['rsync -av ./a/ ./b/', []],
]
for (const [src, want] of REMOTE) test(`remote: ${src}`, () => assert.deepEqual(kinds(src), want))

test('systemctl on prod, not locally', () => {
  assert.deepEqual(kinds('ssh vps "sudo systemctl restart nginx"'), ['remote@vps', 'service@vps'])
  assert.deepEqual(kinds('ssh vps systemctl status nginx'), ['remote@vps'])
  assert.deepEqual(kinds('sudo systemctl restart nginx'), [])
  assert.deepEqual(kinds('ssh vps reboot'), ['remote@vps', 'service@vps'])
})

test('SQL: statements split, destructive ones found', () => {
  assert.deepEqual(sqlStatements("DELETE FROM a WHERE x = ';'; SELECT 1 -- c\n; /* x */ DROP TABLE b"), ["DELETE FROM a WHERE x = ';'", 'SELECT 1', 'DROP TABLE b'])
  assert.deepEqual(destructiveSql('DELETE FROM users'), ['DELETE FROM users'])
  assert.deepEqual(destructiveSql('delete from users where id = 1'), [])
  assert.deepEqual(destructiveSql('UPDATE users SET admin = true'), ['UPDATE users SET admin = true'])
  assert.deepEqual(destructiveSql('UPDATE users SET a = 1 WHERE id = 2'), [])
  assert.deepEqual(destructiveSql('TRUNCATE logs; DROP DATABASE shop'), ['TRUNCATE logs', 'DROP DATABASE shop'])
  assert.deepEqual(destructiveSql('SELECT * FROM t'), [])
})

const SQL: [string, number][] = [
  ['psql -c "DELETE FROM users"', 1],
  ['psql "$DB" -c "DROP TABLE x"', 1],
  ['mysql -e "TRUNCATE sessions" app', 1],
  ['mysql --execute="UPDATE t SET a=1"', 1],
  ['sqlite3 app.db "DELETE FROM t"', 1],
  ['psql <<SQL\nDROP TABLE x;\nSQL', 1],
  ['echo "DELETE FROM t" | psql', 1],
  ['ssh vps "psql -c \\"DROP TABLE x\\""', 1],
  ['psql -c "DELETE FROM users WHERE id = 3"', 0],
  ['echo "DELETE FROM t"', 0],
]
for (const [src, n] of SQL) test(`sql: ${src}`, () => assert.equal(find(src).filter(f => f.kind === 'sql').length, n))

test('force push: flags, refspecs, current branch', () => {
  assert.equal(forcedMain(['-f', 'origin', 'main'], null), 'main')
  assert.equal(forcedMain(['--force-with-lease', 'origin', 'HEAD:master'], null), 'master')
  assert.equal(forcedMain(['origin', '+main'], null), 'main')
  assert.equal(forcedMain(['origin', '+refs/heads/main:refs/heads/main'], null), 'main')
  assert.equal(forcedMain(['--force'], 'main'), 'main')
  assert.equal(forcedMain(['-f', '--all', 'origin'], null), 'alle Branches')
  assert.equal(forcedMain(['-f', 'origin', 'feature'], 'main'), null)
  assert.equal(forcedMain(['origin', 'main'], null), null)
  assert.equal(forcedMain(['--force'], 'feature'), null)
  assert.deepEqual(kinds('git push -f origin main'), ['force-push'])
  assert.deepEqual(kinds('git -C repo push --force', 'master'), ['force-push'])
})

test('remote host parsing', () => {
  assert.equal(remoteHostOf('u@h:/x'), 'h')
  assert.equal(remoteHostOf('h::mod'), 'h')
  assert.equal(remoteHostOf('/abs/path'), null)
  assert.equal(remoteHostOf('./rel:odd'), null)
  assert.equal(remoteHostOf('rsync://h:873/m'), 'h')
})

test('dry runs: rsync, git push, single DELETE; none for DROP or ssh', () => {
  const dr = (src: string) => dryRun(src, find(src, 'main'))
  assert.equal(dr('rsync -av dist/ vps:/srv/'), 'rsync --dry-run -av dist/ vps:/srv/')
  assert.equal(dr('git push -f origin main'), 'git push --dry-run -f origin main')
  assert.equal(dr('psql -c "DELETE FROM users"'), 'psql -c "SELECT COUNT(*) FROM users"')
  assert.equal(dr('psql -c "UPDATE users SET a = 1"'), 'psql -c "SELECT COUNT(*) FROM users"')
  assert.equal(dr('psql -c "DROP TABLE users"'), null)
  assert.equal(dr('ssh vps uptime'), null)
  assert.equal(dr('rsync a vps:/x && rsync b vps:/y'), null)
})

// ---- through the dispatcher

function deps(host: FakeHost, over: Partial<DispatchDeps> = {}): DispatchDeps {
  host.files.set('/home/u/.ssh/config', 'Host celox-alias\n  HostName 203.0.113.10\n')
  return {
    host,
    config: resolveConfig({ prodHosts: HOSTS.map(h => `${h.name}=${h.address}`) }, emptyPrefs()),
    rules: defaultRules(),
    journal: new Journal('s'),
    health: new Health(),
    steps: [prodStep()],
    interactive: true,
    killed: async () => null,
    home: '/home/u',
    cwd: { cwd: '/work', known: true },
    ...over,
  }
}
const ran = (log: string[]) => async (input: Record<string, unknown>): Promise<ToolResult> => {
  log.push(String(input.command))
  return { result: 'ok' }
}

test('a prod command asks; Ausführen runs it, with a note', async () => {
  const host = new FakeHost()
  host.answers = ['Ausführen']
  const log: string[] = []
  const r = await dispatch(deps(host), { tool: 'Bash', input: { command: 'ssh celox-alias uptime' } }, ran(log))
  assert.deepEqual(log, ['ssh celox-alias uptime'])
  assert.ok(host.asked[0]!.question.includes('ssh auf vps'))
  assert.deepEqual(host.asked[0]!.options, ['Ausführen', 'Abbrechen'])
  assert.ok(r.context?.[0]?.includes('bestätigt'))
})

test('Esc or Abbrechen denies', async () => {
  for (const answers of [[], ['Abbrechen']]) {
    const host = new FakeHost()
    host.answers = answers
    const log: string[] = []
    const r = await dispatch(deps(host), { tool: 'Bash', input: { command: 'ssh vps uptime' } }, ran(log))
    assert.ok(r.deny?.includes('abgebrochen'))
    assert.deepEqual(log, [])
  }
})

test('Trockenlauf rewrites the command', async () => {
  const host = new FakeHost()
  host.answers = ['Trockenlauf']
  const log: string[] = []
  await dispatch(deps(host), { tool: 'Bash', input: { command: 'rsync -av dist/ vps:/srv/' } }, ran(log))
  assert.deepEqual(host.asked[0]!.options, ['Ausführen', 'Abbrechen', 'Trockenlauf'])
  assert.deepEqual(log, ['rsync --dry-run -av dist/ vps:/srv/'])
})

test('without UI a prod command is denied unasked', async () => {
  const host = new FakeHost()
  const r = await dispatch(deps(host, { interactive: false }), { tool: 'Bash', input: { command: 'ssh vps ls' } }, ran([]))
  assert.ok(r.deny?.includes('ohne Dialog'))
  assert.equal(host.asked.length, 0)
})

test('house rule: certbot running on the host blocks nginx changes', async () => {
  const host = new FakeHost()
  host.runResult = argv => ({ exitCode: argv.join(' ') === 'ssh 203.0.113.10 pgrep -x certbot' ? 0 : 1, stdout: '', stderr: '' })
  const r = await dispatch(deps(host), { tool: 'Bash', input: { command: 'ssh vps "sudo nginx -s reload"' } }, ran([]))
  assert.ok(r.deny?.includes('Hausregel'))
  assert.ok(r.deny?.includes('certbot'))
  assert.equal(host.asked.length, 0)
})

test('house rule: no certbot → dialog with the check shown as passed', async () => {
  const host = new FakeHost()
  host.answers = ['Ausführen']
  host.runResult = () => ({ exitCode: 1, stdout: '', stderr: '' })
  await dispatch(deps(host), { tool: 'Bash', input: { command: 'ssh vps "sudo nginx -s reload"' } }, ran([]))
  assert.ok(host.asked[0]!.question.includes('✓ Nie nginx'))
})

test('house rule: check impossible (ssh 255) → dialog says so, person decides', async () => {
  const host = new FakeHost()
  host.answers = ['Abbrechen']
  host.runResult = () => ({ exitCode: 255, stdout: '', stderr: '' })
  await dispatch(deps(host), { tool: 'Bash', input: { command: 'ssh vps nginx -t' } }, ran([]))
  assert.ok(host.asked[0]!.question.includes('Prüfung nicht möglich'))
})

test('no prod hosts: only SQL and force push are shielded', async () => {
  const host = new FakeHost()
  const d = deps(host, { config: resolveConfig({}, emptyPrefs()) })
  const log: string[] = []
  await dispatch(d, { tool: 'Bash', input: { command: 'ssh vps ls' } }, ran(log))
  assert.equal(log.length, 1)
  assert.ok((await dispatch(d, { tool: 'Bash', input: { command: 'psql -c "TRUNCATE t"' } }, ran(log))).deny)
})

test('bare force push asks git for the branch', async () => {
  const host = new FakeHost()
  host.runResult = argv => ({ exitCode: 0, stdout: argv.includes('rev-parse') ? 'main\n' : '', stderr: '' })
  const r = await dispatch(deps(host), { tool: 'Bash', input: { command: 'git push --force' } }, ran([]))
  assert.ok(r.deny?.includes('Force-Push auf main'))
  const host2 = new FakeHost()
  host2.runResult = argv => ({ exitCode: 0, stdout: argv.includes('rev-parse') ? 'feature/x\n' : '', stderr: '' })
  const log: string[] = []
  await dispatch(deps(host2), { tool: 'Bash', input: { command: 'git push --force' } }, ran(log))
  assert.equal(log.length, 1)
})

test('an unreadable command naming a prod host asks', async () => {
  const host = new FakeHost()
  const r = await dispatch(deps(host), { tool: 'Bash', input: { command: `ssh vps "echo 'open` } }, ran([]))
  assert.ok(r.deny)
  assert.ok(host.asked[0]!.question.includes('nicht lesbarer Befehl'))
  const host2 = new FakeHost()
  const log: string[] = []
  await dispatch(deps(host2), { tool: 'Bash', input: { command: `echo 'open` } }, ran(log))
  assert.equal(log.length, 1)
})

test('secrets in the command are masked in the dialog', async () => {
  const host = new FakeHost()
  const key = ['sk-', 'ant-', 'api03-Zk3q9XvT2mLw8RbN4cYp7Hd1Fs6Gj5Ke0Ua2', 'a1b2'].join('') // exo-allow-secret: test fixture
  await dispatch(deps(host), { tool: 'Bash', input: { command: `ssh vps "export K=${key}; run"` } }, ran([]))
  assert.ok(!host.asked[0]!.question.includes(key))
  assert.ok(host.asked[0]!.question.includes('sk-ant-…a1b2'))
})

// ---- review 2026-10-05: hosts named another way
test('ssh: HostName override, jump hosts, trailing dot, upper case', () => {
  assert.deepEqual(kinds('ssh -o HostName=203.0.113.10 harmless ls'), ['remote@vps'])
  assert.deepEqual(kinds('ssh -oHostname=vps harmless'), ['remote@vps'])
  assert.deepEqual(kinds('ssh -J vps inner ls'), ['remote@vps'])
  assert.deepEqual(kinds('ssh -J a@other,root@vps:22 inner'), ['remote@vps'])
  assert.deepEqual(kinds('ssh -o ProxyJump=vps inner'), ['remote@vps'])
  assert.deepEqual(kinds('ssh VPS. ls'), ['remote@vps'])
  assert.deepEqual(kinds('scp -o HostName=203.0.113.10 f harmless:/x'), ['remote@vps'])
  assert.deepEqual(kinds('rsync -e "ssh -J vps" -a d/ inner:/x'), ['remote@vps'])
  assert.deepEqual(kinds('rsync -a d/ vps.:/x'), ['remote@vps'])
})
