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

type Row = { id: string; file: string; breaks: string; verdict: 'caught' | 'BLIND' | 'INVALID'; detail: string }
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
      rows.push({ id: m.id, file: m.file, breaks: m.breaks, verdict: 'INVALID', detail: `anchor found ${hits}× instead of 1×` })
      continue
    }
    const after = before.replace(m.find, m.replace)
    writeFileSync(path, after)
    const written = readFileSync(path, 'utf8')
    if (sha(written) === sha(before) || sha(written) !== sha(after)) {
      rows.push({ id: m.id, file: m.file, breaks: m.breaks, verdict: 'INVALID', detail: 'file unchanged' })
      continue
    }
    const r = spawnSync(process.execPath, ['--import', 'tsx', '--test', ...m.tests], { cwd: dir, encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } })
    const out = `${r.stdout}\n${r.stderr}`
    const failed = /# fail (\d+)/.exec(out)?.[1]
    if (r.status !== 0 && failed && Number(failed) > 0) rows.push({ id: m.id, file: m.file, breaks: m.breaks, verdict: 'caught', detail: `${failed} test(s) red · ${sha(before)}→${sha(written)}` })
    else if (r.status !== 0) rows.push({ id: m.id, file: m.file, breaks: m.breaks, verdict: 'INVALID', detail: `run aborted (status ${r.status}), no test result – does the mutant compile?` })
    else rows.push({ id: m.id, file: m.file, breaks: m.breaks, verdict: 'BLIND', detail: 'all tests green' })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  const last = rows[rows.length - 1]!
  console.log(`${last.verdict.padEnd(9)} ${m.id.padEnd(16)} ${last.detail}`)
}

if (!only.length) {
  const date = new Date().toISOString().slice(0, 10)
  const md = [
    '# Mutation probe',
    '',
    `As of ${date} · \`npm run mutate\` · ${rows.filter(r => r.verdict === 'caught').length}/${rows.length} caught`,
    '',
    'Each row breaks one safety-relevant behaviour on purpose. *caught* means: the mutation provably took effect (checksum before → after) and the named tests turned red. *INVALID* means the anchor moved or the mutant does not run; *BLIND* means all tests stayed green — a weak test or redundant code.',
    '',
    '| Mutation | File | Breaks | Result |',
    '|---|---|---|---|',
    ...rows.map(r => `| \`${r.id}\` | \`${r.file}\` | ${r.breaks} | ${r.verdict}: ${r.detail} |`),
    '',
  ].join('\n')
  writeFileSync(join(root, 'docs/MUTATIONS.md'), md)
}

const bad = rows.filter(r => r.verdict !== 'caught')
if (bad.length) {
  console.error(`\n${bad.length} mutation(s) not caught or invalid.`)
  process.exit(1)
}
