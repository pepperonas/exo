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

/** A child process running in the background; `stop()` kills it. */
export interface Spawned {
  chunks: AsyncIterable<{ stream: 'stdout' | 'stderr'; text: string }>
  stop(): void
  done: Promise<{ code: number | null }>
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
  /** Names in a directory. */
  list(path: string): Promise<string[]>
  /** Whether the path itself is a symlink (also one whose target is gone). */
  isLink(path: string): Promise<boolean>
  /** The path with every symlink and `..` resolved; rejects when it does not exist. */
  realPath(path: string): Promise<string>
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
  spawn(argv: readonly string[], options?: { cwd?: string }): Spawned
  /** Puts text into the prompt box as a draft; the person sends it. */
  fillPrompt(text: string): Promise<boolean>
  openPane(id: string, title: string): Promise<boolean>
  /** The conversation so far: role and text of each message. */
  messages(): Promise<{ role: 'user' | 'assistant'; text: string }[]>
  /** One completion with a small model; null when there is no answer (timeout, error). */
  complete(prompt: string, system?: string): Promise<string | null>
  copy(text: string): Promise<boolean>
  /** What the session has cost so far, when the host keeps a ledger. */
  sessionCost(): Promise<number | null>
  /** Dialog with several choices; the chosen labels. Rejects on Esc or without UI. */
  askMany(question: string, options: readonly string[]): Promise<string[]>
  /** Asks the engine to draw exo's sites again (animations). */
  redraw(): void
  /** A sound file of exo's own (`sounds/badge.wav`); never throws. */
  playSound(asset: string): Promise<void>
  /** Context fill and the 5-hour window, when the host knows them. */
  usage(): Promise<{ contextPercent?: number; fiveHour?: number }>
  /** Whether the usage-bars mod is loaded (its config rows are listed). */
  usageBarsPresent(): Promise<boolean>
  /** A pane that takes the keys (Esc closes it). */
  openDialog(id: string, title: string): Promise<boolean>
  closePane(id: string): Promise<void>
  /** Change sidebar: the list, the selected file and its diff. */
  setChanges(changes: ChangeRow[], selected: string | null, diff: string): Promise<void>
}

export interface ChangeRow {
  path: string
  added: number
  removed: number
  isNew: boolean
}
