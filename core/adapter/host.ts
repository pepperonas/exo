/**
 * Everything exo needs from the engine, as one interface. Modules and the
 * core work against `Host`; only `engine.ts` speaks to `$`. Tests hand the
 * same code a fake host.
 */
import type { Banner, Slot } from '../statusline/statusline'

export interface RunResult {
  exitCode: number
  stdout: string
  stderr: string
}

export interface RunOptions {
  cwd?: string
  timeoutMs?: number
  stdin?: string
}

export interface FileStat {
  kind: 'file' | 'dir' | 'other'
  size: number
  mtimeMs: number
}

export interface Timer {
  cancel(): void
}

/** The environment variables exo reads; the engine wants them listed. */
export type EnvName = 'HOME' | 'EXO_DISABLE' | 'NO_COLOR'

export interface Host {
  now(): Promise<number>
  env(name: EnvName): Promise<string | undefined>
  readFile(path: string): Promise<string>
  writeFile(path: string, text: string): Promise<void>
  exists(path: string): Promise<boolean>
  stat(path: string): Promise<FileStat>
  run(argv: readonly string[], options?: RunOptions): Promise<RunResult>
  storeGet(key: string): Promise<unknown>
  storeSet(key: string, value: unknown): Promise<void>
  storeDelete(key: string): Promise<void>
  storeKeys(): Promise<string[]>
  after(ms: number, fn: () => void): Timer
  every(ms: number, fn: () => void): Timer
  toast(text: string, timeoutMs?: number): void
  log(text: string): void
  /** Native dialog; resolves the chosen label, rejects on Esc or without UI. */
  ask(question: string, options: readonly string[]): Promise<string>
  sessionId(): Promise<string>
  cwd(): Promise<string>
  repoRoot(): Promise<string | null>
  /** Status line: replaces the slot with this id; `null` removes it. */
  setSlot(id: string, slot: Slot | null): Promise<void>
  /** AbovePrompt band: replaces the banner with this id; `null` removes it. */
  setBanner(id: string, banner: Banner | null): Promise<void>
  /** Whether exo is switched off by its kill switch, for drawings. */
  setKilled(reason: string | null): Promise<void>
}
