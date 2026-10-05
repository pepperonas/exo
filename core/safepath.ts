/**
 * Writes exo does on its own (not through a tool call) must stay where they
 * belong: a symlink named CLAUDE.md or .exo could otherwise point exo's
 * write at ~/.bashrc or the settings.
 */
import type { Host } from './adapter/host'

/**
 * Whether `path`, every symlink resolved, lies under `root` (also resolved).
 * A path that does not exist yet is judged by its nearest existing parent.
 */
export async function insideRoot(host: Host, path: string, root: string): Promise<boolean> {
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
      const cut = cur.lastIndexOf('/')
      if (cut <= 0) return false
      tail = cur.slice(cut) + tail
      cur = cur.slice(0, cut)
    }
  }
}
