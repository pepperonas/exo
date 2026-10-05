import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { emptyPrefs, resolveConfig } from '../core/config/config'
import { dispatch } from '../core/dispatcher/dispatcher'
import type { DispatchDeps, ToolResult } from '../core/dispatcher/dispatcher'
import { Health } from '../core/health/health'
import { Journal } from '../core/journal/journal'
import { commandsOf } from '../core/shell/words'
import { StoreBox } from '../core/store/store'
import { expired, parseCleanDryRun, plans, simpleGlob } from '../modules/waechter/brake-logic'
import type { SnapshotMeta } from '../modules/waechter/brake-logic'
import { brakeStep, pruneSnapshots, readSnapshots } from '../modules/waechter/brake'
import { undoLast, undoList } from '../modules/waechter/undo'
import { RealHost } from './real-host'

const kinds = (src: string) => plans(commandsOf(src)!, '/w', '/h').map(p => p.kind)

test('detection: every spelling of rm -rf, the git commands, nothing else', () => {
  for (const src of ['rm -rf x', 'rm -fr x', 'rm -r -f x', 'rm --recursive --force x', 'rm -Rf x', 'sudo rm -rf x', 'find . | xargs rm -rf', 'cd a && rm -rf b']) assert.deepEqual(kinds(src), ['rm'], src)
  assert.deepEqual(kinds('git reset --hard HEAD~1'), ['reset-hard'])
  assert.deepEqual(kinds('git checkout -- .'), ['checkout'])
  assert.deepEqual(kinds('git checkout .'), ['checkout'])
  assert.deepEqual(kinds('git restore .'), ['restore'])
  assert.deepEqual(kinds('git restore --worktree src'), ['restore'])
  assert.deepEqual(kinds('git clean -fd'), ['clean'])
  assert.deepEqual(kinds('git clean -fdx'), ['clean'])
  assert.deepEqual(kinds('git -C repo clean --force -d'), ['clean'])
  for (const src of ['rm x', 'rm -r x', 'rm -f x', 'git reset HEAD~1', 'git reset --soft x', 'git checkout main', 'git checkout -b x', 'git restore --staged x', 'git clean -n', 'git clean -fdn', 'ssh h rm -rf /x', 'ls -rf'])
    assert.deepEqual(kinds(src), [], src)
})

test('paths fed at run time (xargs, find -exec) are unresolved', () => {
  for (const src of ['find . -name "*.o" | xargs rm -rf', 'find . -name x -exec rm -rf {} +']) {
    const [p] = plans(commandsOf(src)!, '/w', '/h')
    assert.equal(p!.unresolved.length, 1, src)
    assert.deepEqual(p!.paths, [], src)
  }
})

test('rm plans: paths resolved, variables unresolved, globs separate', () => {
  const [p] = plans(commandsOf('rm -rf build ~/tmp/x /abs "$OUT" *.log -- -weird')!, '/w', '/h')
  assert.deepEqual(p!.paths, ['/w/build', '/h/tmp/x', '/abs', '/w/-weird'])
  assert.deepEqual(p!.unresolved, ['$OUT'])
  assert.deepEqual(p!.globs, ['/w/*.log'])
})

test('clean plan: the same flags as a dry run', () => {
  assert.deepEqual(plans(commandsOf('git clean -fdx')!, '/w', '/h')[0]!.cleanArgs, ['-n', '-dx'])
  assert.deepEqual(plans(commandsOf('git clean --force -d -e keep')!, '/w', '/h')[0]!.cleanArgs, ['-n', '-d', '-e', 'keep'])
  assert.deepEqual(parseCleanDryRun('Would remove u.txt\nWould remove dir/\n'), ['u.txt', 'dir'])
})

test('simple globs only in the last segment', () => {
  assert.ok(simpleGlob('/w/*.log')!.match.test('a.log'))
  assert.equal(simpleGlob('/w/*/x'), null)
  assert.equal(simpleGlob('/w/{a,b}'), null)
})

test('retention: newest 20 within 7 days', () => {
  const now = 100 * 86_400_000
  const list: SnapshotMeta[] = Array.from({ length: 25 }, (_, i) => ({ id: `s${i}`, at: now - i * 3_600_000, kind: 'rm', cwd: '/', summary: '', files: [], bytes: 0 }))
  list.push({ id: 'old', at: now - 8 * 86_400_000, kind: 'rm', cwd: '/', summary: '', files: [], bytes: 0 })
  assert.deepEqual(expired(list, now).map(s => s.id), ['s20', 's21', 's22', 's23', 's24', 'old'])
})

// ---- for real: a throwaway repo, the command really runs, then /undo-last

function deps(host: RealHost, cwd: string, over: Partial<DispatchDeps> = {}): DispatchDeps {
  return {
    host,
    config: resolveConfig({}, emptyPrefs()),
    rules: [],
    journal: new Journal('s'),
    health: new Health(),
    steps: [brakeStep()],
    interactive: true,
    killed: async () => null,
    home: host.home,
    cwd: { cwd, known: true },
    store: new StoreBox(host),
    ...over,
  }
}
/** The tool: runs the command for real in `cwd`. */
const shell = (host: RealHost, cwd: string) => async (input: Record<string, unknown>): Promise<ToolResult> => {
  const r = host.sh(String(input.command), cwd)
  return { result: { stdout: r.stdout, stderr: r.stderr }, isError: r.status !== 0 }
}

test('git clean -fd: untracked files saved and restored', async () => {
  const host = new RealHost()
  try {
    const repo = host.repo()
    writeFileSync(join(repo, 'u.txt'), 'untracked\n')
    mkdirSync(join(repo, 'gen'))
    writeFileSync(join(repo, 'gen', 'x.js'), 'x\n')
    const d = deps(host, repo)
    const r = await dispatch(d, { tool: 'Bash', input: { command: 'git clean -fd' } }, shell(host, repo))
    assert.ok(r.context?.[0]?.includes('/undo-last'), JSON.stringify(r))
    assert.equal(existsSync(join(repo, 'u.txt')), false)
    const msg = await undoLast(host, d.store, undefined)
    assert.ok(msg.includes('restored'), msg)
    assert.equal(readFileSync(join(repo, 'u.txt'), 'utf8'), 'untracked\n')
    assert.equal(readFileSync(join(repo, 'gen', 'x.js'), 'utf8'), 'x\n')
  } finally {
    host.dispose()
  }
})

test('git reset --hard: tracked changes saved in a kept stash commit and restored', async () => {
  const host = new RealHost()
  try {
    const repo = host.repo()
    writeFileSync(join(repo, 'a.txt'), 'changed\n')
    const d = deps(host, repo)
    await dispatch(d, { tool: 'Bash', input: { command: 'git reset --hard' } }, shell(host, repo))
    assert.equal(readFileSync(join(repo, 'a.txt'), 'utf8'), 'original\n')
    const [meta] = await readSnapshots(d.store)
    assert.ok(meta!.stashRef?.startsWith('refs/exo/snapshots/'))
    assert.equal(host.sh(`git rev-parse ${meta!.stashRef}`, repo).stdout.trim(), meta!.stashSha)
    await undoLast(host, d.store, undefined)
    assert.equal(readFileSync(join(repo, 'a.txt'), 'utf8'), 'changed\n')
  } finally {
    host.dispose()
  }
})

test('rm -rf: directory saved and restored; existing files are not overwritten unasked', async () => {
  const host = new RealHost()
  try {
    const repo = host.repo()
    mkdirSync(join(repo, 'build'))
    writeFileSync(join(repo, 'build', 'out.txt'), 'old\n')
    const d = deps(host, repo)
    await dispatch(d, { tool: 'Bash', input: { command: 'rm -rf build' } }, shell(host, repo))
    assert.equal(existsSync(join(repo, 'build')), false)
    mkdirSync(join(repo, 'build'))
    writeFileSync(join(repo, 'build', 'out.txt'), 'new\n')
    host.answers = ['Only missing']
    await undoLast(host, d.store, undefined)
    assert.ok(host.asked[0]!.question.includes('Overwrite?'))
    assert.equal(readFileSync(join(repo, 'build', 'out.txt'), 'utf8'), 'new\n')
    host.answers = ['Overwrite']
    const [meta] = await readSnapshots(d.store)
    await undoLast(host, d.store, meta!.id)
    assert.equal(readFileSync(join(repo, 'build', 'out.txt'), 'utf8'), 'old\n')
  } finally {
    host.dispose()
  }
})

test('rm -rf with a glob: matches are saved', async () => {
  const host = new RealHost()
  try {
    const repo = host.repo()
    writeFileSync(join(repo, 'a.log'), '1')
    writeFileSync(join(repo, 'b.log'), '2')
    const d = deps(host, repo)
    await dispatch(d, { tool: 'Bash', input: { command: 'rm -rf *.log' } }, shell(host, repo))
    const [meta] = await readSnapshots(d.store)
    assert.deepEqual(meta!.files.map(f => f.split('/').pop()).sort(), ['a.log', 'b.log'])
  } finally {
    host.dispose()
  }
})

test('nothing to save, nothing noted; clean tree reset needs no snapshot', async () => {
  const host = new RealHost()
  try {
    const repo = host.repo()
    const d = deps(host, repo)
    const r = await dispatch(d, { tool: 'Bash', input: { command: 'rm -rf does-not-exist && git reset --hard' } }, shell(host, repo))
    assert.equal(r.context, undefined)
    assert.deepEqual(await readSnapshots(d.store), [])
  } finally {
    host.dispose()
  }
})

test('variables in the path: asked; Cancel denies', async () => {
  const host = new RealHost()
  try {
    const repo = host.repo()
    const ran: string[] = []
    const r = await dispatch(deps(host, repo), { tool: 'Bash', input: { command: 'rm -rf "$TARGET"' } }, async i => (ran.push(String(i.command)), { result: 'ok' }))
    assert.ok(r.deny?.includes('variables'))
    assert.deepEqual(ran, [])
    assert.ok(host.asked[0]!.question.includes('$TARGET'))
  } finally {
    host.dispose()
  }
})

test('over the size limit: asked instead of a silent pass', async () => {
  const host = new RealHost()
  try {
    const repo = host.repo()
    mkdirSync(join(repo, 'big'))
    writeFileSync(join(repo, 'big', 'blob'), Buffer.alloc(2 * 1048576, 7))
    const d = deps(host, repo, { config: resolveConfig({ snapshotMaxMb: 1 }, emptyPrefs()) })
    const r = await dispatch(d, { tool: 'Bash', input: { command: 'rm -rf big' } }, shell(host, repo))
    assert.ok(r.deny?.includes('snapshot limit'), JSON.stringify(r))
    assert.ok(host.asked[0]!.question.includes('limit'))
    assert.equal(existsSync(join(repo, 'big', 'blob')), true)
  } finally {
    host.dispose()
  }
})

test('/undo-list and pruning', async () => {
  const host = new RealHost()
  try {
    const repo = host.repo()
    writeFileSync(join(repo, 'u.txt'), 'x')
    const d = deps(host, repo)
    await dispatch(d, { tool: 'Bash', input: { command: 'git clean -f' } }, shell(host, repo))
    assert.ok((await undoList(d.store, Date.now())).includes('git clean'))
    const [meta] = await readSnapshots(d.store)
    assert.equal(await pruneSnapshots(host, d.store, host.home, Date.now() + 8 * 86_400_000), 1)
    assert.deepEqual(await readSnapshots(d.store), [])
    assert.equal(existsSync(join(host.home, '.claude/exo/snapshots', meta!.id)), false)
  } finally {
    host.dispose()
  }
})
