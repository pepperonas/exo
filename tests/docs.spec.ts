import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { MODULE_IDS } from '../core/config/config'
import { DEFAULT_RULES_JSON } from '../core/config/rules'

const root = join(import.meta.dirname, '..')
const read = (f: string) => readFileSync(join(root, f), 'utf8')
const README = read('README.md')
const manifest = JSON.parse(read('.claude-plugin/plugin.json')) as { version: string; userConfig: Record<string, { default: unknown }> }
const pkg = JSON.parse(read('package.json')) as { version: string }
const register = read('hooks/register.tsx')
const market = JSON.parse(read('.claude-plugin/marketplace.json')) as { name: string; plugins: { name: string; source: string; version: string; description: string }[] }
const badge = (name: string) => README.match(new RegExp(`badge/${name}-([^-?]+)-`))?.[1]
const COUNTING = process.env.EXO_COUNTING_TESTS === '1'

/** `test(` calls in an engine test file; inside a per-surface loop each runs once per surface. */
function countEngineTests(file: string): number {
  const src = read(file)
  let n = (src.match(/^test\(/gm) ?? []).length
  for (const loop of src.matchAll(/^for \(const \w+ of \[(.*?)\][^\n]*\n([\s\S]*?)^\}/gm)) {
    n += loop[1]!.split(',').length * (loop[2]!.match(/^ {2}test\(/gm) ?? []).length
  }
  return n
}

test('every userConfig option is in the README table', () => {
  for (const key of Object.keys(manifest.userConfig)) assert.ok(README.includes(`| \`${key}\` |`), key)
})

test('every module is in the README', () => {
  for (const id of MODULE_IDS) assert.ok(README.includes(`(\`${id}\`)`), id)
})

test('every command exo registers is in the README', () => {
  const names = [...register.matchAll(/^\s+\['([a-z-]+)', ['"]exo: /gm)].map(m => m[1]!)
  names.push('exo', 'changes')
  assert.ok(names.length >= 8, names.join(','))
  for (const n of names) assert.ok(README.includes(`/${n}`), n)
})

test('versions agree: package.json, plugin.json, CHANGELOG', () => {
  assert.equal(manifest.version, pkg.version)
  assert.ok(read('CHANGELOG.md').includes(`## [${pkg.version}]`))
})

test('the README shows the default house rule exactly as built in', () => {
  const block = /### House rules[\s\S]*?```json\n([\s\S]*?)```/.exec(README)![1]!
  assert.deepEqual(JSON.parse(block), DEFAULT_RULES_JSON)
})

test('numeric defaults in the README match the manifest', () => {
  for (const key of ['snapshotMaxMb', 'dietMaxKb', 'dietMaxLines']) {
    const row = README.split('\n').find(l => l.startsWith(`| \`${key}\` |`))!
    assert.ok(row.includes(`| ${manifest.userConfig[key]!.default} |`), row)
  }
})

test('README and docs use documentation addresses only', () => {
  for (const f of ['README.md', 'CLAUDE.md', 'docs/PLAN.md', 'docs/SCREENSHOTS.md']) {
    for (const ip of read(f).match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g) ?? []) assert.ok(/^(203\.0\.113|198\.51\.100|192\.0\.2)\./.test(ip), `${f}: ${ip}`)
  }
})

test('the footer closes the README', () => {
  assert.ok(README.trimEnd().endsWith('© 2026 Martin Pfeffer | celox.io'))
})


test('one version everywhere: badge, plugin.json, package.json, marketplace, CHANGELOG, README summary', () => {
  assert.equal(badge('version'), manifest.version)
  assert.ok(/^## \[\d+\.\d+\.\d+\] - \d{4}-\d{2}-\d{2}$/m.test(read('CHANGELOG.md')), 'CHANGELOG heading format')
  assert.ok(read('CHANGELOG.md').includes(`## [${manifest.version}] - `))
  assert.ok(README.includes(`- **${manifest.version}** —`), 'README changelog summary')
})

test('the marketplace lists exo from this repo, at the same version and description', () => {
  const entry = market.plugins.find(p => p.name === 'exo')!
  assert.ok(entry)
  assert.equal(entry.source, './')
  assert.equal(entry.version, manifest.version)
  assert.equal(entry.description, (manifest as unknown as { description: string }).description)
})

test('the README install commands name the real marketplace', () => {
  const id = `exo@${market.name}`
  assert.ok(README.includes('/plugin marketplace add pepperonas/exo'))
  assert.ok(README.includes(`/plugin install ${id}`))
  assert.ok(README.includes(`claude plugin install ${id}`))
  for (const m of README.matchAll(/exo@([a-z0-9._-]+)/g)) assert.equal(m[1], market.name, m[0])
})

test('the engine-tests badge is the real number of engine tests', () => {
  const n = readdirSync(join(root, 'hooks')).filter(f => /\.test\.tsx?$/.test(f)).reduce((a, f) => a + countEngineTests(`hooks/${f}`), 0)
  assert.equal(badge('engine%20tests'), String(n))
})

/** The test runner marks its children with NODE_TEST_CONTEXT and refuses to run files inside them. */
function childEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, EXO_COUNTING_TESTS: '1' }
  delete env.NODE_TEST_CONTEXT
  return env
}

test('the node-tests badge is the real number of node tests', { skip: COUNTING }, () => {
  const files = readdirSync(join(root, 'tests')).filter(f => f.endsWith('.spec.ts')).map(f => `tests/${f}`)
  const r = spawnSync(process.execPath, ['--import', 'tsx', '--test', '--test-reporter=tap', ...files], { cwd: root, encoding: 'utf8', env: childEnv() })
  const n = /^# tests (\d+)$/m.exec(r.stdout)?.[1]
  assert.ok(n, r.stderr.slice(0, 500))
  assert.equal(badge('node%20tests'), n)
})

test('the mutations badge matches the protocol', () => {
  const m = /(\d+)\/(\d+) caught/.exec(read('docs/MUTATIONS.md'))
  assert.ok(m, 'MUTATIONS.md summary line')
  assert.equal(decodeURIComponent(badge('mutations') ?? ''), `${m[1]}/${m[2]} caught`)
})

test('every image the README and the card use exists; the card sits above the title', () => {
  for (const [, src] of README.matchAll(/<img src="(docs\/[^"]+)"/g)) assert.ok(existsSync(join(root, src!)), src)
  assert.ok(existsSync(join(root, '.claude-plugin/icon.png')))
  assert.ok(README.indexOf('docs/social.png') < README.indexOf('# 🛡️ exo'))
})

test('no lockfile in the plugin root: Claude Code would install the dev tools for every user', () => {
  for (const f of ['package-lock.json', 'npm-shrinkwrap.json']) assert.ok(!existsSync(join(root, f)), f)
  assert.match(read('.npmrc'), /^package-lock=false$/m)
  assert.equal((pkg as { dependencies?: unknown }).dependencies, undefined)
  assert.equal(badge('runtime%20dependencies'), '0')
})

test('docs are English: no German prose headings left in README, CHANGELOG, CLAUDE.md, PLAN', () => {
  for (const f of ['README.md', 'CHANGELOG.md', 'CLAUDE.md', 'docs/PLAN.md', 'docs/MUTATIONS.md']) {
    for (const h of read(f).match(/^#{1,4} .*$/gm) ?? []) assert.doesNotMatch(h, /\b(Konfiguration|Grenzen|Hausregeln|Notausschalter|Lizenz|Entwicklung|Neu|Aufbau|Ergebnis|Mutationsprobe|Etappe)\b/, `${f}: ${h}`)
  }
})
