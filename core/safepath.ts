/**
 * Writes exo does on its own (not through a tool call) must stay where they
 * belong: a symlink named CLAUDE.md or .exo could otherwise point exo's
 * write at ~/.bashrc or the settings.
 */
import type { Host } from './adapter/host'

/**
 * Whether a file system error says "not there". Only then is a path treated
 * as missing; every other or unknown failure makes a guard refuse.
 */
export function isMissingError(err: unknown): boolean {
  const text = String((err as { code?: unknown })?.code ?? '') + ' ' + String((err as Error)?.message ?? err)
  return /\bENOENT\b|\bENOTDIR\b|no such file or directory/i.test(text)
}

/**
 * Whether `path`, every symlink resolved, lies under `root` (also resolved).
 * A path that does not exist yet is judged by its nearest existing parent;
 * a dangling symlink on the way, or `.`/`..` in the path, is refused.
 * Not closed: the moment between this check and the write ($.fs has no
 * atomic rename to write through).
 */
export async function insideRoot(host: Host, path: string, root: string): Promise<boolean> {
  // `.` and `..` are spelled out by nobody who means well here
  if (/(^|\/)\.\.?(\/|$)/.test(path)) return false
  let rootReal: string
  try {
    rootReal = (await host.realPath(root)).replace(/\/+$/, '')
  } catch {
    return false
  }
  let cur = path
  let tail = ''
  for (;;) {
    try {
      const real = (await host.realPath(cur)).replace(/\/+$/, '') + tail
      return real === rootReal || real.startsWith(rootReal + '/')
    } catch {
      // does not resolve: a missing part is fine, a symlink whose target is
      // gone is not (the write would follow it, wherever it points)
      if (await host.isLink(cur).catch(() => true)) return false
      const cut = cur.lastIndexOf('/')
      if (cut <= 0) return false
      tail = cur.slice(cut) + tail
      cur = cur.slice(0, cut)
    }
  }
}
