/**
 * The kill switch. Checked first in every hook, so it works even when a
 * guard misbehaves:
 *
 * - `~/.claude/exo/DISABLED` exists: live, no restart, can be set from a
 *   second terminal while exo blocks Bash in this one.
 * - `EXO_DISABLE=1` in the environment the session started with.
 * - `/exo off` (stored prefs).
 *
 * If the module does not load at all, the engine already lets everything
 * through: there is nothing left to switch off.
 */
import type { Host } from './adapter/host'

export const EXO_DIR = '.claude/exo'
export const DISABLED_FILE = 'DISABLED'
export const CACHE_MS = 1_000

export const exoDir = (home: string) => `${home.replace(/\/+$/, '')}/${EXO_DIR}`
export const disabledPath = (home: string) => `${exoDir(home)}/${DISABLED_FILE}`

/** Pure decision from the three sources; the reason, or null when on. */
export function killReason(s: { env: string | undefined; fileExists: boolean; allOff: boolean }): string | null {
  if (s.fileExists) return 'Datei ~/.claude/exo/DISABLED'
  if (s.env !== undefined && s.env !== '' && s.env !== '0' && s.env.toLowerCase() !== 'false') return 'EXO_DISABLE'
  if (s.allOff) return '/exo off'
  return null
}

export const KILL_HINT = 'Notausschalter: touch ~/.claude/exo/DISABLED (oder /exo off)'

/** Cached checks of the environment and the file; `allOff` is read live. */
export class KillSwitch {
  private cached: { at: number; env: string | undefined; file: boolean } | undefined

  constructor(
    private readonly clock: () => number = Date.now,
    private readonly cacheMs = CACHE_MS,
  ) {}

  invalidate(): void {
    this.cached = undefined
  }

  async reason(host: Host, home: string | undefined, allOff: boolean): Promise<string | null> {
    const t = this.clock()
    if (!this.cached || t - this.cached.at >= this.cacheMs) {
      let env: string | undefined
      let file = false
      try {
        env = await host.env('EXO_DISABLE')
      } catch {
        env = undefined
      }
      if (home) {
        try {
          file = await host.exists(disabledPath(home))
        } catch {
          file = false
        }
      }
      this.cached = { at: t, env, file }
    }
    return killReason({ env: this.cached.env, fileExists: this.cached.file, allOff })
  }
}
