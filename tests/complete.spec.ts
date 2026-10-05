import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { COMMAND, SECOND, SUBCOMMANDS, complete, isOurs } from '../core/complete'
import { MODULE_IDS } from '../core/config/config'

const words = (d: string) => complete(d)?.map(c => c.word) ?? null

test('nothing to offer: empty, the name alone, other text, other commands', () => {
  for (const d of ['', '/exo', '  /exo', 'hello /exo on', '/exorcist ', '/exo-recap ', '/recap ']) assert.equal(complete(d), null, JSON.stringify(d))
})

test('after "/exo " every subcommand, in help order', () => {
  assert.deepEqual(words('/exo '), ['status', 'on', 'off', 'reset', 'rules', 'help'])
  assert.deepEqual(words('  /exo '), words('/exo '))
})

test('a started word narrows by prefix, ignoring case, and says how much is typed', () => {
  assert.deepEqual(words('/exo r'), ['reset', 'rules'])
  assert.deepEqual(words('/exo O'), ['on', 'off'])
  const c = complete('/exo ru')!
  assert.deepEqual(c, [{ word: 'rules', typed: 2, hint: 'house rules in force' }])
})

test('the second word follows the first: modules after on/off, modules and core after reset', () => {
  assert.deepEqual(words('/exo on '), [...MODULE_IDS])
  assert.deepEqual(words('/exo off '), [...MODULE_IDS])
  assert.deepEqual(words('/exo reset '), [...MODULE_IDS, 'core'])
  assert.deepEqual(words('/exo off pro'), ['prodShield'])
  assert.deepEqual(words('/exo OFF PRODSH'), ['prodShield'])
  assert.equal(complete('/exo off prodsh')![0]!.typed, 6)
})

test('no list: a subcommand without follow-up, too many words, no match', () => {
  for (const d of ['/exo rules ', '/exo help ', '/exo status ', '/exo off secrets ', '/exo off secrets x', '/exo x', '/exo off nothing'])
    assert.equal(complete(d), null, d)
})

test('every candidate carries a hint', () => {
  for (const d of ['/exo ', '/exo on ', '/exo reset ']) for (const c of complete(d)!) assert.ok(c.hint.length > 3, `${d}${c.word}`)
  assert.match(complete('/exo off cinema')![0]!.hint, /Spinner cinema/)
})

test('isOurs: the name or the name plus a space, nothing else', () => {
  for (const d of ['/exo', '/exo ', ' /exo on']) assert.ok(isOurs(d), d)
  for (const d of ['', '/ex', '/exo-recap', '/exorcist', 'text']) assert.ok(!isOurs(d), d)
  assert.equal(COMMAND, '/exo')
})

test('every offered word is one the /exo handler really understands', () => {
  const src = readFileSync(join(import.meta.dirname, '..', 'core', 'exo-command.ts'), 'utf8')
  const handler = src.slice(src.indexOf('export async function exoCommand'))
  for (const { word } of SUBCOMMANDS) assert.ok(handler.includes(`sub === '${word}'`), `handler does not answer "${word}"`)
  // second words: module ids go through isModuleId; reset also takes "core"
  assert.ok(/sub === 'on' \|\| sub === 'off'[\s\S]*?isModuleId\(arg\)/.test(handler), 'on/off check module ids')
  assert.ok(/sub === 'reset'[\s\S]*?isModuleId\(arg\) && arg !== 'core'/.test(handler), 'reset takes module ids and core')
  for (const [first, list] of Object.entries(SECOND)) {
    assert.ok(handler.includes(`sub === '${first}'`), first)
    for (const { word } of list) assert.ok((MODULE_IDS as readonly string[]).includes(word) || (first === 'reset' && word === 'core'), `${first} ${word}`)
  }
})

test('every subcommand the handler answers is offered (aliases excepted)', () => {
  const src = readFileSync(join(import.meta.dirname, '..', 'core', 'exo-command.ts'), 'utf8')
  const handler = src.slice(src.indexOf('export async function exoCommand'))
  const answered = new Set([...handler.matchAll(/sub === '([a-z]+)'/g)].map(m => m[1]!))
  const aliases = new Set(['an', 'aus', 'hilfe', 'regeln'])
  const offered = new Set(SUBCOMMANDS.map(s => s.word))
  for (const w of answered) if (!aliases.has(w)) assert.ok(offered.has(w), `"${w}" is answered but not offered`)
})
