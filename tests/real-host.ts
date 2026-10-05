/**
 * A Host on the real file system and real processes, for tests that must
 * prove a thing works for real (snapshots, restore). Dialog answers and the
 * store stay in memory.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import type { EnvName, Host, RunOptions, Timer } from '../core/adapter/host'
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
}
