import type { ChangeRow, EnvName, FileStat, Host, RunOptions, RunResult, Spawned, Timer } from '../core/adapter/host'
import type { Banner, Slot } from '../core/statusline/statusline'

/** A host in memory: files, env, store, timers that run when told to. */
export class FakeHost implements Host {
  t = 1_000_000
  files = new Map<string, string>()
  envs: Partial<Record<EnvName, string>> = { HOME: '/home/u' }
  store = new Map<string, unknown>()
  toasts: string[] = []
  logs: string[] = []
  slots: Record<string, Slot> = {}
  banners: Banner[] = []
  killed: string | null = null
  answers: string[] = []
  asked: { question: string; options: readonly string[] }[] = []
  runs: { argv: readonly string[]; options?: RunOptions }[] = []
  runResult: (argv: readonly string[]) => RunResult = () => ({ exitCode: 0, stdout: '', stderr: '' })
  timers: { at: number; fn: () => void; every?: number; dead: boolean }[] = []
  failExists = false

  async now() {
    return this.t
  }
  async env(name: EnvName) {
    return this.envs[name]
  }
  async readFile(path: string) {
    const f = this.files.get(path)
    if (f === undefined) throw new Error(`ENOENT ${path}`)
    return f
  }
  async writeFile(path: string, text: string) {
    this.files.set(path, text)
  }
  async exists(path: string) {
    if (this.failExists) throw new Error('fs kaputt')
    return this.files.has(path)
  }
  async stat(path: string): Promise<FileStat> {
    const f = this.files.get(path)
    if (f === undefined) throw new Error(`ENOENT ${path}`)
    return { kind: 'file', size: f.length, mtimeMs: this.t }
  }
  async list(path: string) {
    const pre = path.replace(/\/$/, '') + '/'
    return [...new Set([...this.files.keys()].filter(f => f.startsWith(pre)).map(f => f.slice(pre.length).split('/')[0]!))]
  }
  links = new Map<string, string>()
  async realPath(path: string) {
    for (const [from, to] of this.links) if (path === from || path.startsWith(from + '/')) return to + path.slice(from.length)
    if (path !== '/' && !this.files.has(path) && ![...this.files.keys()].some(f => f.startsWith(path + '/'))) throw new Error(`ENOENT ${path}`)
    return path
  }
  async run(argv: readonly string[], options?: RunOptions) {
    this.runs.push({ argv, options })
    return this.runResult(argv)
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
  after(ms: number, fn: () => void): Timer {
    const t = { at: this.t + ms, fn, dead: false }
    this.timers.push(t)
    return { cancel: () => (t.dead = true) }
  }
  every(ms: number, fn: () => void): Timer {
    const t = { at: this.t + ms, fn, every: ms, dead: false }
    this.timers.push(t)
    return { cancel: () => (t.dead = true) }
  }
  /** Moves time on and fires what came due. */
  async advance(ms: number) {
    this.t += ms
    for (const t of [...this.timers]) {
      while (!t.dead && t.at <= this.t) {
        t.fn()
        if (t.every) t.at += t.every
        else t.dead = true
      }
    }
    await new Promise(r => setImmediate(r))
  }
  toast(text: string) {
    this.toasts.push(text)
  }
  log(text: string) {
    this.logs.push(text)
  }
  async ask(question: string, options: readonly string[]) {
    this.asked.push({ question, options })
    const a = this.answers.shift()
    if (a === undefined) throw new Error('dismissed')
    return a
  }
  async sessionId() {
    return 'sess-1'
  }
  async cwd() {
    return '/work/proj'
  }
  async repoRoot() {
    return '/work/proj'
  }
  async setSlot(id: string, slot: Slot | null) {
    if (slot) this.slots[id] = slot
    else delete this.slots[id]
  }
  async setBanner(id: string, banner: Banner | null) {
    this.banners = this.banners.filter(b => b.id !== id)
    if (banner) this.banners.push(banner)
  }
  async setKilled(reason: string | null) {
    this.killed = reason
  }

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
}
