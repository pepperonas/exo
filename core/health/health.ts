/**
 * Per-module health: on, off or broken, time spent, budget overruns and the
 * last error. In memory; `/exo` reads it, the store keeps the last errors.
 */
import type { ModuleId } from '../config/config'

export type HealthKey = ModuleId | 'core'

export interface ModuleHealth {
  broken: boolean
  calls: number
  totalMs: number
  maxMs: number
  budgetHits: number
  lastError?: { at: number; message: string }
}

export const MESSAGE_MAX = 200

export class Health {
  private readonly m = new Map<HealthKey, ModuleHealth>()

  private get(id: HealthKey): ModuleHealth {
    let h = this.m.get(id)
    if (!h) {
      h = { broken: false, calls: 0, totalMs: 0, maxMs: 0, budgetHits: 0 }
      this.m.set(id, h)
    }
    return h
  }

  record(id: HealthKey, ms: number): void {
    const h = this.get(id)
    h.calls++
    h.totalMs += ms
    h.maxMs = Math.max(h.maxMs, ms)
  }

  budgetHit(id: HealthKey): void {
    this.get(id).budgetHits++
  }

  /** Marks the module broken; `message` must already be free of secrets. */
  fail(id: HealthKey, message: string, at: number): void {
    const h = this.get(id)
    h.broken = true
    h.lastError = { at, message: message.slice(0, MESSAGE_MAX) }
  }

  reset(id: HealthKey): void {
    const h = this.get(id)
    h.broken = false
  }

  isBroken(id: HealthKey): boolean {
    return this.m.get(id)?.broken ?? false
  }

  broken(): HealthKey[] {
    return [...this.m].filter(([, h]) => h.broken).map(([id]) => id)
  }

  snapshot(): Record<string, ModuleHealth> {
    return Object.fromEntries([...this.m].map(([id, h]) => [id, { ...h }]))
  }

  /** Restores last errors from the store (not the broken flag). */
  restoreErrors(saved: unknown): void {
    if (!saved || typeof saved !== 'object') return
    for (const [id, v] of Object.entries(saved as Record<string, unknown>)) {
      const e = v as { at?: unknown; message?: unknown }
      if (typeof e?.at === 'number' && typeof e.message === 'string') this.get(id as HealthKey).lastError = { at: e.at, message: e.message.slice(0, MESSAGE_MAX) }
    }
  }

  errorsForStore(): Record<string, { at: number; message: string }> {
    const out: Record<string, { at: number; message: string }> = {}
    for (const [id, h] of this.m) if (h.lastError) out[id] = h.lastError
    return out
  }
}

/** A short, single-line text of a thrown value. */
export function errorText(err: unknown): string {
  const raw = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
  return raw.replace(/\s+/g, ' ').slice(0, MESSAGE_MAX)
}
