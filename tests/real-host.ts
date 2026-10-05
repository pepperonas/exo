/**
 * A Host on the real file system and real processes, for tests that must
 * prove a thing works for real (snapshots, restore). Dialog answers and the
 * store stay in memory.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import type { ChangeRow, EnvName, Host, RunOptions, Spawned, Timer } from '../core/adapter/host'
import type { Banner, Slot } from '../core/statusline/statusline'

export class RealHost implements Host {
  readonly root: string
  readonly home: string
  store = new Map<string, unknown>()
  answers: string[] = []
  asked: { question: string; options: readonly string[] }[] = []
  toasts: string[] = []

  constructor() {
    this.root = realpathSync(mkdtempSync(join(tmpdir(), 'exo-real-')))
    this.home = join(this.root, 'home')
    mkdirSync(this.home, { recursive: true })
  }
  dispose() {
    rmSync(this.root, { recursive: true, force: true })
  }
  /** Runs a shell command in `cwd`, as the tool would. */
  sh(cmd: string, cwd: string) {
    return spawnSync('bash', ['-c', cmd], { cwd, encoding: 'utf8' })
  }
  /** A git repo with one committed file, `a.txt`. */
  repo(name = 'repo'): string {
    const dir = join(this.root, name)
    mkdirSync(dir, { recursive: true })
    const g = (...a: string[]) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    g('init', '-q', '-b', 'main')
    g('config', 'user.email', 't@example.com')
    g('config', 'user.name', 't')
    g('config', 'commit.gpgsign', 'false')
    writeFileSync(join(dir, 'a.txt'), 'original\n')
    g('add', 'a.txt')
    g('commit', '-q', '-m', 'init')
    return dir
  }

  async now() {
    return Date.now()
  }
  async env(name: EnvName) {
    return name === 'HOME' ? this.home : undefined
  }
  async readFile(path: string) {
    return readFileSync(path, 'utf8')
  }
  async writeFile(path: string, text: string) {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, text)
  }
  async exists(path: string) {
    return existsSync(path)
  }
  async stat(path: string) {
    const s = statSync(path)
    return { kind: s.isFile() ? ('file' as const) : s.isDirectory() ? ('dir' as const) : ('other' as const), size: s.size, mtimeMs: s.mtimeMs }
  }
  async list(path: string) {
    return readdirSync(path)
  }
  async isLink(path: string) {
    try {
      return lstatSync(path).isSymbolicLink()
    } catch {
      return false
    }
  }
  async realPath(path: string) {
    return realpathSync(path)
  }
  async run(argv: readonly string[], options?: RunOptions) {
    const r = spawnSync(argv[0]!, argv.slice(1), { cwd: options?.cwd, input: options?.stdin, encoding: 'utf8', timeout: options?.timeoutMs ?? 30_000 })
    if (r.error) throw r.error
    return { exitCode: r.status ?? 1, stdout: r.stdout, stderr: r.stderr }
  }
  async storeGet(key: string) {
    return structuredClone(this.store.get(key))
  }
  async storeSet(key: string, value: unknown) {
    this.store.set(key, structuredClone(value))
  }
  async storeDelete(key: string) {
    this.store.delete(key)
  }
  async storeKeys() {
    return [...this.store.keys()]
  }
  after(): Timer {
    return { cancel() {} }
  }
  every(): Timer {
    return { cancel() {} }
  }
  toast(text: string) {
    this.toasts.push(text)
  }
  log() {}
  async ask(question: string, options: readonly string[]) {
    this.asked.push({ question, options })
    const a = this.answers.shift()
    if (a === undefined) throw new Error('dismissed')
    return a
  }
  async sessionId() {
    return 'real'
  }
  async cwd() {
    return this.root
  }
  async repoRoot() {
    return null
  }
  async setSlot(_id: string, _slot: Slot | null) {}
  async setBanner(_id: string, _banner: Banner | null) {}
  async setKilled() {}

  spawned: { argv: readonly string[]; cwd?: string; stopped: boolean }[] = []
  /** What a spawned child prints and exits with, per argv. */
  spawnResult: (argv: readonly string[]) => { out: string; code: number } = () => ({ out: '', code: 0 })
  spawn(argv: readonly string[], options?: { cwd?: string }): Spawned {
    const rec = { argv, cwd: options?.cwd, stopped: false }
    this.spawned.push(rec)
    const r = this.spawnResult(argv)
    let release!: () => void
    const gate = new Promise<void>(res => (release = res))
    this.releases.push(release)
    async function* gen() {
      await gate
      if (!rec.stopped) yield { stream: 'stdout' as const, text: r.out }
    }
    const chunks = gen()
    return {
      chunks,
      stop: () => {
        rec.stopped = true
        release()
      },
      done: gate.then(() => ({ code: rec.stopped ? null : r.code })),
    }
  }
  releases: (() => void)[] = []
  /** Lets every spawned child finish. */
  finishAll() {
    for (const r of this.releases.splice(0)) r()
  }
  prompts: string[] = []
  async fillPrompt(text: string) {
    this.prompts.push(text)
    return true
  }
  panes: string[] = []
  async openPane(id: string) {
    this.panes.push(id)
    return true
  }
  changes: { rows: ChangeRow[]; selected: string | null; diff: string } = { rows: [], selected: null, diff: '' }
  async setChanges(rows: ChangeRow[], selected: string | null, diff: string) {
    this.changes = { rows, selected, diff }
  }

  history: { role: 'user' | 'assistant'; text: string }[] = []
  async messages() {
    return this.history
  }
  completions: string[] = []
  completeAnswer: string | null = null
  async complete(prompt: string) {
    this.completions.push(prompt)
    return this.completeAnswer
  }
  copied: string[] = []
  async copy(text: string) {
    this.copied.push(text)
    return true
  }
  cost: number | null = null
  async sessionCost() {
    return this.cost
  }
  manyAnswers: string[][] = []
  async askMany(question: string, options: readonly string[]) {
    this.asked.push({ question, options })
    const a = this.manyAnswers.shift()
    if (a === undefined) throw new Error('dismissed')
    return a
  }

  redraws = 0
  redraw() {
    this.redraws++
  }
  sounds: string[] = []
  async playSound(asset: string) {
    this.sounds.push(asset)
  }
  usageNow: { contextPercent?: number; fiveHour?: number } = {}
  async usage() {
    return this.usageNow
  }
  usageBars = false
  async usageBarsPresent() {
    return this.usageBars
  }
  dialogs: string[] = []
  async openDialog(id: string) {
    this.dialogs.push(id)
    return true
  }
  closed: string[] = []
  async closePane(id: string) {
    this.closed.push(id)
  }
}
