/**
 * Mutation check: copies the repo into a temporary folder per mutation,
 * applies it, proves by checksum that it took, runs the named tests and
 * expects them to fail. Writes docs/MUTATIONS.md.
 *
 *   npm run mutate            all
 *   npm run mutate -- <id>…   some
 */
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { MUTATIONS } from '../tests/mutations'

const root = resolve(import.meta.dirname, '..')
const only = process.argv.slice(2)
const list = only.length ? MUTATIONS.filter(m => only.includes(m.id)) : MUTATIONS
const sha = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 12)

type Row = { id: string; file: string; breaks: string; verdict: 'erkannt' | 'BLIND' | 'UNGÜLTIG'; detail: string }
const rows: Row[] = []

for (const m of list) {
  const dir = mkdtempSync(join(tmpdir(), `exo-mut-${m.id}-`))
  try {
    cpSync(root, dir, { recursive: true, filter: src => !/\/(node_modules|\.git)(\/|$)/.test(src) })
    symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'))
    const path = join(dir, m.file)
    const before = readFileSync(path, 'utf8')
    const hits = before.split(m.find).length - 1
    if (hits !== 1) {
      rows.push({ id: m.id, file: m.file, breaks: m.breaks, verdict: 'UNGÜLTIG', detail: `Fundstelle ${hits}× statt 1×` })
      continue
    }
    const after = before.replace(m.find, m.replace)
    writeFileSync(path, after)
    const written = readFileSync(path, 'utf8')
    if (sha(written) === sha(before) || sha(written) !== sha(after)) {
      rows.push({ id: m.id, file: m.file, breaks: m.breaks, verdict: 'UNGÜLTIG', detail: 'Datei unverändert' })
      continue
    }
    const r = spawnSync(process.execPath, ['--import', 'tsx', '--test', ...m.tests], { cwd: dir, encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } })
    const out = `${r.stdout}\n${r.stderr}`
    const failed = /# fail (\d+)/.exec(out)?.[1]
    if (r.status !== 0 && failed && Number(failed) > 0) rows.push({ id: m.id, file: m.file, breaks: m.breaks, verdict: 'erkannt', detail: `${failed} Test(s) rot · ${sha(before)}→${sha(written)}` })
    else if (r.status !== 0) rows.push({ id: m.id, file: m.file, breaks: m.breaks, verdict: 'UNGÜLTIG', detail: `Lauf brach ab (Status ${r.status}), kein Testergebnis – Mutant kompiliert nicht?` })
    else rows.push({ id: m.id, file: m.file, breaks: m.breaks, verdict: 'BLIND', detail: 'alle Tests grün' })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  const last = rows[rows.length - 1]!
  console.log(`${last.verdict.padEnd(9)} ${m.id.padEnd(16)} ${last.detail}`)
}

if (!only.length) {
  const date = new Date().toISOString().slice(0, 10)
  const md = [
    '# Mutationsprobe',
    '',
    `Stand ${date} · \`npm run mutate\` · ${rows.filter(r => r.verdict === 'erkannt').length}/${rows.length} erkannt`,
    '',
    'Jede Zeile bricht absichtlich ein sicherheitsrelevantes Verhalten. „erkannt“ heißt: die Mutation hat nachweislich gegriffen (Prüfsumme vorher → nachher) und die genannten Tests wurden rot.',
    '',
    '| Mutation | Datei | bricht | Ergebnis |',
    '|---|---|---|---|',
    ...rows.map(r => `| \`${r.id}\` | \`${r.file}\` | ${r.breaks} | ${r.verdict}: ${r.detail} |`),
    '',
  ].join('\n')
  writeFileSync(join(root, 'docs/MUTATIONS.md'), md)
}

const bad = rows.filter(r => r.verdict !== 'erkannt')
if (bad.length) {
  console.error(`\n${bad.length} Mutation(en) nicht erkannt oder ungültig.`)
  process.exit(1)
}
