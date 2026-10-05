import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { MODULE_IDS } from '../core/config/config'
import { DEFAULT_RULES_JSON } from '../core/config/rules'

const root = join(import.meta.dirname, '..')
const read = (f: string) => readFileSync(join(root, f), 'utf8')
const README = read('README.md')
const manifest = JSON.parse(read('.claude-plugin/plugin.json')) as { version: string; userConfig: Record<string, { default: unknown }> }
const pkg = JSON.parse(read('package.json')) as { version: string }
const register = read('hooks/register.tsx')

test('every userConfig option is in the README table', () => {
  for (const key of Object.keys(manifest.userConfig)) assert.ok(README.includes(`| \`${key}\` |`), key)
})

test('every module is in the README', () => {
  for (const id of MODULE_IDS) assert.ok(README.includes(`(\`${id}\`)`), id)
})

test('every command exo registers is in the README', () => {
  const names = [...register.matchAll(/^\s+\['([a-z-]+)', 'exo: /gm)].map(m => m[1]!)
  names.push('exo', 'changes')
  assert.ok(names.length >= 8, names.join(','))
  for (const n of names) assert.ok(README.includes(`/${n}`), n)
})

test('versions agree: package.json, plugin.json, CHANGELOG', () => {
  assert.equal(manifest.version, pkg.version)
  assert.ok(read('CHANGELOG.md').includes(`## [${pkg.version}]`))
})

test('the README shows the default house rule exactly as built in', () => {
  const block = /### Hausregeln[\s\S]*?```json\n([\s\S]*?)```/.exec(README)![1]!
  assert.deepEqual(JSON.parse(block), DEFAULT_RULES_JSON)
})

test('numeric defaults in the README match the manifest', () => {
  for (const key of ['snapshotMaxMb', 'dietMaxKb', 'dietMaxLines']) {
    const row = README.split('\n').find(l => l.startsWith(`| \`${key}\` |`))!
    assert.ok(row.includes(`| ${manifest.userConfig[key]!.default} |`), row)
  }
})

test('README and docs use documentation addresses only', () => {
  for (const f of ['README.md', 'CLAUDE.md', 'docs/PLAN.md']) {
    for (const ip of read(f).match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g) ?? []) assert.ok(/^(203\.0\.113|198\.51\.100|192\.0\.2)\./.test(ip), `${f}: ${ip}`)
  }
})

test('the footer closes the README', () => {
  assert.ok(README.trimEnd().endsWith('© 2026 Martin Pfeffer | celox.io'))
})
