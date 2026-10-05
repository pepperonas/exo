/**
 * #15 Kontext-Diät, the pure part: when a whole-file Read is too much, and
 * what Claude sees instead (the head through Read itself, the tail as context).
 */

export const HEAD_LINES = 200
export const TAIL_LINES = 80
/** Tail text cap, so the tail itself stays a diet. */
export const TAIL_MAX_BYTES = 8_000

/** Always on a diet, whatever their size: generated or noisy files. */
const NOISY = /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|poetry\.lock|Pipfile\.lock|Gemfile\.lock|composer\.lock|go\.sum|uv\.lock|flake\.lock)$|\.min\.(js|css|mjs)$|\.map$|\.log$/i
/** Read handles these itself (pages, images, notebooks): never touched. */
const SPECIAL = /\.(png|jpe?g|gif|webp|bmp|ico|tiff?|heic|pdf|ipynb|svg)$/i

/** Below this size counting lines is not worth a process. */
export const COUNT_LINES_FROM = 40_000
/** A noisy file shorter than this is read whole anyway. */
export const NOISY_MIN_LINES = HEAD_LINES + TAIL_LINES

export interface DietInput {
  path: string
  hasRange: boolean
  size: number
  /** null when not counted (small file). */
  lines: number | null
  maxKb: number
  maxLines: number
  /** The previous Read of this session was this same path, cut by the diet. */
  justCut: boolean
}

export type DietReason = 'gross' | 'lang' | 'generiert'

export function needsCount(path: string, size: number): boolean {
  return !SPECIAL.test(path) && (size >= COUNT_LINES_FROM || NOISY.test(path))
}

export function decide(i: DietInput): DietReason | null {
  if (i.hasRange || i.justCut || SPECIAL.test(i.path)) return null
  if (NOISY.test(i.path)) return i.lines !== null && i.lines > NOISY_MIN_LINES ? 'generiert' : null
  if (i.size > i.maxKb * 1024) return i.lines !== null && i.lines <= NOISY_MIN_LINES ? null : 'gross'
  if (i.lines !== null && i.lines > i.maxLines) return 'lang'
  return null
}

/** Rough tokens: about four bytes each. */
export const tokens = (bytes: number) => Math.round(bytes / 4)

export function note(path: string, reason: DietReason, lines: number | null, size: number, shownBytes: number, tail: string): string {
  const why = reason === 'generiert' ? 'eine generierte Datei' : reason === 'gross' ? `${Math.round(size / 1024)} KB groß` : `${lines} Zeilen lang`
  const saved = Math.max(0, tokens(size - shownBytes))
  const total = lines !== null ? ` von ${lines}` : ''
  const tailStart = lines !== null ? Math.max(HEAD_LINES + 1, lines - TAIL_LINES + 1) : null
  return [
    `exo/Kontext-Diät: ${path} ist ${why}. Gezeigt: Zeilen 1–${HEAD_LINES}${total}${tailStart ? ` und das Ende ab Zeile ${tailStart} (unten)` : ''}.`,
    `Lies gezielt mit offset/limit oder such mit grep. Gespart: etwa ${saved.toLocaleString('de-DE')} Tokens. Wer die Datei wirklich ganz braucht: gleich noch einmal ohne Bereich lesen.`,
    tail ? `--- Ende der Datei ---\n${tail}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

/** The last `bytes` of a tail, cut at a line start. */
export function capTail(tail: string, bytes = TAIL_MAX_BYTES): string {
  if (tail.length <= bytes) return tail
  const cut = tail.slice(-bytes)
  const nl = cut.indexOf('\n')
  return '…\n' + (nl >= 0 ? cut.slice(nl + 1) : cut)
}
