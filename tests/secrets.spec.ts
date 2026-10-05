import { test } from 'node:test'
import assert from 'node:assert/strict'

import { emptyPrefs, resolveConfig } from '../core/config/config'
import { dispatch } from '../core/dispatcher/dispatcher'
import type { DispatchDeps, ToolResult } from '../core/dispatcher/dispatcher'
import { Health } from '../core/health/health'
import { Journal } from '../core/journal/journal'
import { entropy, isCredentialName, isEnvFile, isPasswordName, isPlaceholder, mask, nameParts, scanDiff, scanText } from '../modules/waechter/secrets-logic'
import { secretsStep } from '../modules/waechter/secrets'
import { FakeHost } from './fake-host'

// Secrets are assembled at run time: no literal key sits in this file, so
// neither exo itself nor GitHub's push protection mistakes it for a leak.
const j = (...p: string[]) => p.join('')
const rep = (s: string, n: number) => s.repeat(n)
const ANTHROPIC = j('sk-', 'ant-', 'api03-', 'Zk3q9XvT2mLw8RbN4cYp7Hd1Fs6Gj5Ke0Ua2Wo9Ix3Ly8Mt4Vn', 'a1b2') // exo-allow-secret: test fixture
const OPENAI = j('sk-', 'proj-', 'T9fK2mQ7xL4wR8bN3cYp6Hd1Fs5Gj0Ke7Ua2Wo9Ix') // exo-allow-secret: test fixture
const GITHUB = j('gh', 'p_', 'R7tK2mQ9xL4wR8bN3cYp6Hd1Fs5Gj0Ke7Ua2W') // exo-allow-secret: test fixture
const GITHUB_PAT = j('github', '_pat_', '11ABCDEFG0123456789_abcdefghijklmnopqrstuvwxyz') // exo-allow-secret: test fixture
const AWS = j('AKIA', 'Q4ZXN7RTV2LMK8PB')
const STRIPE = j('sk_', 'live_', '51HxQ2mL9wR8bN3cYp6Hd1Fs')
const SLACK = j('xox', 'b-', '1234567890-0987654321-AbCdEfGhIjKlMnOp') // exo-allow-secret: test fixture
const GOOGLE = j('AIza', 'SyD2mQ7xL4wR8bN3cYp6Hd1Fs5Gj0Ke7Ua2') // exo-allow-secret: test fixture
const PEM = j('-----BEGIN ', 'RSA PRIVATE', ' KEY-----')
const JWT = j('eyJ', 'hbGciOiJIUzI1NiJ9', '.', 'eyJ', 'zdWIiOiIxMjM0NTY3ODkwIn0', '.', 'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV') // exo-allow-secret: test fixture

const KNOWN: [string, string][] = [
  [ANTHROPIC, 'Anthropic'],
  [OPENAI, 'OpenAI'],
  [GITHUB, 'GitHub'],
  [GITHUB_PAT, 'GitHub'],
  [AWS, 'AWS'],
  [STRIPE, 'Stripe'],
  [SLACK, 'Slack'],
  [GOOGLE, 'Google'],
  [PEM, 'PEM'],
  [JWT, 'JWT'],
]

for (const [value, kind] of KNOWN) {
  test(`known format: ${kind}`, () => {
    const hits = scanText(`const k = "${value}"`)
    assert.ok(hits.some(h => h.kind.includes(kind)), JSON.stringify(hits))
    for (const h of hits) assert.ok(!h.masked.includes(value.slice(8, -4)), 'plaintext must not leak')
  })
}

test('masking keeps prefix and the last four, nothing between', () => {
  assert.equal(mask(ANTHROPIC), 'sk-ant-…a1b2')
  assert.equal(mask(j('AKIA', 'Q4ZXN7RTV2LMK8PB')), 'AKIA…K8PB')
  assert.equal(mask('short'), '…')
  assert.ok(!mask(PEM).includes('RSA PRIVATE KEY-----X'))
})

test('assignments: passwords and credentials', () => {
  assert.equal(scanText(j('password', ' = "hun', 'ter2-correct"'))[0]?.kind, 'Passwort in Zuweisung')
  assert.equal(scanText(j('DB_PASSWORD', '=Tr0ub4dor', '&3x'))[0]?.kind, 'Passwort in Zuweisung')
  assert.equal(scanText(j('api_key: "', 'q8WvZ2mR7kL4pX9nT3bY6cJ1"'))[0]?.kind, 'Zugangsdaten in Zuweisung')
  assert.equal(scanText(j('"client_secret": "', 'Q7wE9rT2yU4iO6pA8sD1fG3h"'))[0]?.kind, 'Zugangsdaten in Zuweisung')
})

test('high-entropy string without a name is found', () => {
  const v = j('Zk3q9XvT2mLw8RbN', '4cYp7Hd1Fs6Gj5Ke0Ua2')
  assert.equal(scanText(`foo(${JSON.stringify(v)})`)[0]?.kind, 'Zeichenkette mit hoher Entropie')
})

const CLEAN = [
  'const id = "3f2504e0-4f89-11d3-9a0c-0305e82c3301"', // UUID
  'commit 9fceb02d0ae598e95dc970b74767f19372d61af8', // git SHA
  '"integrity": "sha512-v2kDEe57lecTulaDIuNTPy3Ry4gLGJ6Z1O3vE1krgXZNrsQ+susLbyk7gnUVh0q3o5EbSQr4G7ycWD4VHYTtZA=="',
  'password = process.env.DB_PASSWORD',
  'password: "changeme"',
  'API_KEY=your-api-key-here',
  'token = "${TOKEN}"',
  'const password = ""',
  'password_hash = "abc"',
  'token_url = "https://example.com/oauth/token"',
  'img = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="',
  'const longIdentifier = calculateTheAverageMonthlyRevenueForAllCustomers(x)',
  'export const SOME_CONSTANT_NAME_THAT_IS_VERY_LONG_BUT_HARMLESS = 1',
  'max_password_length = 128',
  'secret_name = "prod/db"',
  'const PASSWORD_NAME = /pass(?:word|wd|phrase)?|pwd/i',
  'password_file=/etc/app/pw',
]
for (const line of CLEAN) {
  test(`no false alarm: ${line.slice(0, 60)}`, () => assert.deepEqual(scanText(line), []))
}

// Found live: the old substring match flagged exo's own test-light code.
const PS = 'pas' + 'sed'
const NAME_FALSE_ALARMS = [
  `${PS} = sum(/^# pass (\\d+)/gm, text)`, // exo-allow-secret: false-alarm fixture
  `{ ${PS}: o.${PS}, failed: o.failed }`, // exo-allow-secret: false-alarm fixture
  `const compass = "northnorthwest"`, // exo-allow-secret: false-alarm fixture
  `bypass_cache = someFunctionCall()`, // exo-allow-secret: false-alarm fixture
  `const tokens = countTokensInTheFile(path)`, // exo-allow-secret: false-alarm fixture
  `secretary = "Frau Mustermann-Schmidt"`, // exo-allow-secret: false-alarm fixture
]
for (const line of NAME_FALSE_ALARMS) {
  test(`no false alarm on a name that only contains the word: ${line.slice(0, 50)}`, () => assert.deepEqual(scanText(line), []))
}

test('name parts: whole parts count, camelCase and snake_case alike', () => {
  for (const n of ['password', 'DB_PASSWORD', 'dbPassword', 'user.pass', 'PWD', 'smtp_passwd']) assert.ok(isPasswordName(n), n)
  for (const n of [PS, 'compass', 'bypass']) assert.ok(!isPasswordName(n), n)
  for (const n of ['api_key', 'apiKey', 'API_KEY', 'client_secret', 'authToken', 'GITHUB_TOKEN', 'secret']) assert.ok(isCredentialName(n), n)
  for (const n of ['tokens', 'tokenizer', 'secretary', 'keyboard', 'apiUrl']) assert.ok(!isCredentialName(n), n)
  assert.deepEqual(nameParts('dbPasswordHash'), ['db', 'password', 'hash'])
})

test('lockfiles: only known formats, no entropy guesses', () => {
  const v = j('Zk3q9XvT2mLw8RbN', '4cYp7Hd1Fs6Gj5Ke0Ua2')
  assert.deepEqual(scanText(`"resolved": "${v}"`, { lockfile: true }), [])
  assert.equal(scanText(`"x": "${ANTHROPIC}"`, { lockfile: true }).length, 1)
})

test('exo-allow-secret silences one line', () => {
  assert.deepEqual(scanText(`k = "${ANTHROPIC}" // exo-allow-secret`), [])
  assert.equal(scanText(`a\nk = "${ANTHROPIC}"`)[0]!.line, 2)
  assert.equal(scanText(`k = "${ANTHROPIC}"`, {}, 10)[0]!.line, 11)
})

test('helpers', () => {
  assert.ok(entropy('aaaa') < 0.1)
  assert.ok(entropy('abcdefgh') > 2.9)
  assert.ok(isPlaceholder('<your-token>'))
  assert.ok(isPlaceholder('$API_KEY'))
  assert.ok(!isPlaceholder('Q7wE9rT2yU4iO6pA'))
  assert.ok(isEnvFile('/p/.env') && isEnvFile('.env.production'))
  assert.ok(!isEnvFile('/p/.env.example') && !isEnvFile('/p/env.ts'))
})

test('diff: added lines only, with file and line numbers', () => {
  const diff = [
    'diff --git a/src/a.ts b/src/a.ts',
    '--- a/src/a.ts',
    '+++ b/src/a.ts',
    '@@ -10,0 +11,2 @@',
    '+const ok = 1',
    `+const k = "${ANTHROPIC}"`,
    `-const old = "${GITHUB}"`,
    '+++ b/test/fixtures/keys.ts',
    '@@ -0,0 +1 @@',
    `+export const fake = "${STRIPE}"`,
  ].join('\n')
  const hits = scanDiff(diff, f => f.startsWith('test/fixtures/'))
  assert.equal(hits.length, 1)
  assert.equal(hits[0]!.file, 'src/a.ts')
  assert.equal(hits[0]!.line, 12)
})

// ---- the step through the dispatcher

function deps(host: FakeHost, over: Partial<DispatchDeps> = {}): DispatchDeps {
  return {
    host,
    config: resolveConfig({}, emptyPrefs()),
    rules: [],
    journal: new Journal('s'),
    health: new Health(),
    steps: [secretsStep()],
    interactive: true,
    killed: async () => null,
    home: '/home/u',
    cwd: { cwd: '/work/proj', known: true },
    ...over,
  }
}
const ok = (log: string[]) => async (input: Record<string, unknown>): Promise<ToolResult> => {
  log.push(String(input.command ?? input.file_path))
  return { result: 'ok' }
}

test('Write with a key is denied, the message is masked', async () => {
  const log: string[] = []
  const r = await dispatch(deps(new FakeHost()), { tool: 'Write', input: { file_path: '/work/proj/src/c.ts', content: `x\nexport const k = "${ANTHROPIC}"\n` } }, ok(log))
  assert.ok(r.deny?.includes('/work/proj/src/c.ts:2'))
  assert.ok(r.deny?.includes('sk-ant-…a1b2'))
  assert.ok(!r.deny?.includes(ANTHROPIC))
  assert.deepEqual(log, [])
})

test('the journal never holds the secret', async () => {
  const d = deps(new FakeHost())
  await dispatch(d, { tool: 'Write', input: { file_path: '/work/proj/c.ts', content: `k = "${ANTHROPIC}"` } }, ok([]))
  await dispatch(d, { tool: 'Bash', input: { command: `curl -H "x-api-key: ${ANTHROPIC}" https://api.example.com` } }, ok([]))
  assert.ok(!JSON.stringify(d.journal.all()).includes(ANTHROPIC.slice(10, 30)))
})

test('Edit: line number from the file', async () => {
  const host = new FakeHost()
  host.files.set('/work/proj/a.ts', 'a\nb\nc\nOLD\n')
  const r = await dispatch(deps(host), { tool: 'Edit', input: { file_path: '/work/proj/a.ts', old_string: 'OLD', new_string: `k = "${GITHUB}"` } }, ok([]))
  assert.ok(r.deny?.includes('/work/proj/a.ts:4'))
})

test('allowed paths pass', async () => {
  const log: string[] = []
  await dispatch(deps(new FakeHost()), { tool: 'Write', input: { file_path: '/work/proj/test/fixtures/k.ts', content: `k = "${ANTHROPIC}"` } }, ok(log))
  assert.equal(log.length, 1)
})

test('.env: allowed when git ignores it, a warning otherwise', async () => {
  const host = new FakeHost()
  host.runResult = argv => ({ exitCode: argv.includes('check-ignore') ? 0 : 1, stdout: '', stderr: '' })
  const log: string[] = []
  let r = await dispatch(deps(host), { tool: 'Write', input: { file_path: '/work/proj/.env', content: `ANTHROPIC_API_KEY=${ANTHROPIC}` } }, ok(log))
  assert.equal(r.deny, undefined)
  assert.equal(r.context, undefined)
  host.runResult = () => ({ exitCode: 1, stdout: '', stderr: '' })
  r = await dispatch(deps(host), { tool: 'Write', input: { file_path: '/work/proj/.env', content: `ANTHROPIC_API_KEY=${ANTHROPIC}` } }, ok(log))
  assert.equal(r.deny, undefined)
  assert.ok(r.context?.[0]?.includes('nicht in .gitignore'))
  assert.equal(log.length, 2)
})

test('Bash: writing a key into a file is denied, sending it is not', async () => {
  const log: string[] = []
  const d = deps(new FakeHost())
  assert.ok((await dispatch(d, { tool: 'Bash', input: { command: `echo "${ANTHROPIC}" > key.txt` } }, ok(log))).deny?.includes('/work/proj/key.txt'))
  assert.ok((await dispatch(d, { tool: 'Bash', input: { command: `echo "${ANTHROPIC}" | tee -a conf.ini` } }, ok(log))).deny)
  assert.ok((await dispatch(d, { tool: 'Bash', input: { command: `cat > c.yml <<EOF\ntoken: ${GITHUB}\nEOF` } }, ok(log))).deny)
  assert.equal((await dispatch(d, { tool: 'Bash', input: { command: `curl -H "x-api-key: ${ANTHROPIC}" https://api.example.com` } }, ok(log))).deny, undefined)
  assert.equal(log.length, 1)
})

test('git commit: staged diff and message are scanned; -a scans against HEAD', async () => {
  const host = new FakeHost()
  host.runResult = argv => ({ exitCode: 0, stdout: argv.includes('diff') ? `+++ b/src/x.ts\n@@ -0,0 +1 @@\n+k = "${GITHUB}"\n` : '', stderr: '' })
  const r = await dispatch(deps(host), { tool: 'Bash', input: { command: 'cd sub && git commit -m "fix"' } }, ok([]))
  assert.ok(r.deny?.includes('src/x.ts:1'))
  const diff = host.runs.find(x => x.argv.includes('diff'))!
  assert.deepEqual(diff.argv.slice(0, 5), ['git', '-C', '/work/proj/sub', 'diff', '--cached'])
  host.runs = []
  await dispatch(deps(host), { tool: 'Bash', input: { command: 'git -C other commit -am "x"' } }, ok([]))
  assert.deepEqual(host.runs.find(x => x.argv.includes('diff'))!.argv.slice(0, 5), ['git', '-C', '/work/proj/other', 'diff', 'HEAD'])
  const msg = await dispatch(deps(new FakeHost()), { tool: 'Bash', input: { command: `git commit -m "key ${ANTHROPIC}"` } }, ok([]))
  assert.ok(msg.deny?.includes('Commit-Nachricht'))
})

test('git push: commits not on any remote are scanned', async () => {
  const host = new FakeHost()
  host.runResult = argv => ({ exitCode: 0, stdout: argv.includes('log') ? `commit abc\n+++ b/a.py\n@@ -0,0 +3 @@\n+K = "${AWS}"\n` : '', stderr: '' })
  const r = await dispatch(deps(host), { tool: 'Bash', input: { command: 'git push origin main' } }, ok([]))
  assert.ok(r.deny?.includes('a.py:3'))
  assert.ok(host.runs.some(x => x.argv.join(' ').includes('log -p -U0 --no-color --no-ext-diff HEAD --not --remotes')))
})

test('a clean commit passes', async () => {
  const host = new FakeHost()
  host.runResult = () => ({ exitCode: 0, stdout: '+++ b/a.ts\n@@ -0,0 +1 @@\n+const a = 1\n', stderr: '' })
  const log: string[] = []
  await dispatch(deps(host), { tool: 'Bash', input: { command: 'git commit -m "x"' } }, ok(log))
  assert.equal(log.length, 1)
})

// ---- review 2026-10-05: git add in the same command
test('git add && git commit: changes and new files staged by the same command are scanned', async () => {
  const host = new FakeHost()
  host.files.set('/work/proj/new.ts', `export const k = "${GITHUB}"\n`)
  host.runResult = argv => {
    const a = argv.join(' ')
    if (a.includes('ls-files')) return { exitCode: 0, stdout: 'new.ts\n', stderr: '' }
    if (a.includes('rev-parse --show-toplevel')) return { exitCode: 0, stdout: '/work/proj\n', stderr: '' }
    return { exitCode: 0, stdout: '', stderr: '' }
  }
  const r = await dispatch(deps(host), { tool: 'Bash', input: { command: 'git add -A && git commit -m "x"' } }, ok([]))
  assert.ok(r.deny?.includes('new.ts:1'), JSON.stringify(r))
  assert.ok(host.runs.some(x => x.argv.includes('diff') && x.argv.includes('HEAD')))
})
