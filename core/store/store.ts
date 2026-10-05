/**
 * exo's persistent state in `$.store`: a schema version with migrations, a
 * byte budget per key (the engine allows 4 MiB per plugin in all) and
 * throttled writes.
 */
import type { Host, Timer } from '../adapter/host'

export const SCHEMA_VERSION = 1

/** Bytes of JSON allowed per key. Sum stays under 3 MiB. */
export const BUDGETS = {
  schema: 64,
  prefs: 16_384,
  'journal:current': 524_288,
  sessions: 307_200,
  snapshots: 65_536,
  hours: 524_288,
  achievements: 65_536,
  lastSession: 65_536,
  health: 32_768,
  trust: 32_768,
  lessons: 65_536,
} as const

export type StoreKey = keyof typeof BUDGETS

export const THROTTLE_MS = 5_000

export type Migration = (data: Record<string, unknown>) => Record<string, unknown>

/** Migrations by the version they produce: `2` turns version 1 data into 2. */
export const MIGRATIONS: Record<number, Migration> = {}

export function runMigrations(
  data: Record<string, unknown>,
  from: number,
  to: number,
  migrations: Record<number, Migration>,
): { data: Record<string, unknown>; applied: number[] } {
  let d = data
  const applied: number[] = []
  for (let v = from + 1; v <= to; v++) {
    const m = migrations[v]
    if (!m) throw new Error(`Migration auf Schema ${v} fehlt`)
    d = m(d)
    applied.push(v)
  }
  return { data: d, applied }
}

export const jsonBytes = (value: unknown): number => new TextEncoder().encode(JSON.stringify(value) ?? '').length

/**
 * Shrinks a value until it fits `limit` bytes. `shrink` returns a smaller
 * value or `null` when it cannot shrink further.
 */
export function fit<T>(value: T, limit: number, shrink?: (v: T) => T | null): T | null {
  let v = value
  for (let i = 0; i < 64; i++) {
    if (jsonBytes(v) <= limit) return v
    if (!shrink) return null
    const next = shrink(v)
    if (next === null) return null
    v = next
  }
  return jsonBytes(v) <= limit ? v : null
}

export class StoreBox {
  private pending = new Map<StoreKey, () => unknown>()
  private timer: Timer | undefined
  warnings: string[] = []

  constructor(
    private host: Host,
    private migrations: Record<number, Migration> = MIGRATIONS,
    private version = SCHEMA_VERSION,
  ) {}

  /** Checks the schema and migrates; never throws, notes a warning instead. */
  async init(): Promise<void> {
    const raw = await this.host.storeGet('schema')
    const stored = typeof raw === 'number' ? raw : undefined
    if (stored === undefined) {
      await this.host.storeSet('schema', this.version)
      return
    }
    if (stored === this.version) return
    if (stored > this.version) {
      this.warnings.push(`Store hat Schema ${stored}, exo kennt nur ${this.version}: Daten bleiben unangetastet`)
      return
    }
    const keys = await this.host.storeKeys()
    const data: Record<string, unknown> = {}
    for (const k of keys) data[k] = await this.host.storeGet(k)
    try {
      const { data: next } = runMigrations(data, stored, this.version, this.migrations)
      for (const [k, v] of Object.entries(next)) if (k !== 'schema') await this.host.storeSet(k, v)
      await this.host.storeSet('schema', this.version)
    } catch (err) {
      this.warnings.push(`Migration fehlgeschlagen: ${(err as Error).message}`)
    }
  }

  get(key: StoreKey): Promise<unknown> {
    return this.host.storeGet(key)
  }

  /** Writes now, within the key's budget; false when it does not fit. */
  async set<T>(key: StoreKey, value: T, shrink?: (v: T) => T | null): Promise<boolean> {
    this.pending.delete(key)
    const v = fit(value, BUDGETS[key], shrink)
    if (v === null) {
      this.warnings.push(`${key}: passt nicht ins Budget von ${BUDGETS[key]} Bytes, nicht gespeichert`)
      return false
    }
    await this.host.storeSet(key, v)
    return true
  }

  /** Writes at most every THROTTLE_MS; `make` is read when the write happens. */
  later(key: StoreKey, make: () => unknown, shrink?: (v: unknown) => unknown | null): void {
    this.pending.set(key, shrink ? () => fit(make(), BUDGETS[key], shrink) : make)
    if (this.timer) return
    this.timer = this.host.after(THROTTLE_MS, () => {
      this.timer = undefined
      void this.flush()
    })
  }

  async flush(): Promise<void> {
    this.timer?.cancel()
    this.timer = undefined
    const jobs = [...this.pending]
    this.pending.clear()
    for (const [key, make] of jobs) {
      const v = make()
      if (v === null) continue
      if (jsonBytes(v) > BUDGETS[key]) {
        this.warnings.push(`${key}: passt nicht ins Budget, nicht gespeichert`)
        continue
      }
      await this.host.storeSet(key, v)
    }
  }
}
