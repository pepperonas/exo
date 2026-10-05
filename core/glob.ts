/**
 * Path globs for configuration (test fixtures, `*.example`):
 * `**` any number of directories, `*` within one segment, `?` one character.
 */
export function globToRegex(glob: string): RegExp {
  let re = ''
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i]!
    if (ch === '*' && glob[i + 1] === '*') {
      const slash = glob[i + 2] === '/'
      re += slash ? '(?:.*/)?' : '.*'
      i += slash ? 2 : 1
    } else if (ch === '*') re += '[^/]*'
    else if (ch === '?') re += '[^/]'
    else re += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${re}$`)
}

/** True when `path` (absolute or relative) matches one of the globs. */
export function matchesAny(path: string, globs: readonly string[]): boolean {
  const p = path.replace(/^\.\//, '')
  return globs.some(g => {
    try {
      const rx = globToRegex(g)
      if (rx.test(p)) return true
      // `**/x` should also match an absolute path: try every suffix
      const parts = p.split('/')
      for (let i = 1; i < parts.length; i++) if (rx.test(parts.slice(i).join('/'))) return true
      return false
    } catch {
      return false
    }
  })
}
