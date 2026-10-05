/**
 * The status line under the prompt and the band above it.
 *
 * Modules announce slots; `layout` orders them and, when the line is too
 * narrow, drops whole slots of the lowest priority first (never cuts one in
 * the middle, except a single slot left alone).
 */

import type { Banner, BannerButton, Slot } from '../../types'

export type { Banner, BannerButton, Slot }

/** Slot ids reserved for other display parts. */
export const RESERVED = {
  liveness: 'exo',
  usage: 'usage',
  context: 'context',
} as const

export const SEP = ' · '

/** Terminal cells of a string: wide characters and most emoji take two. */
export function cellWidth(s: string): number {
  let w = 0
  for (const ch of s) {
    const cp = ch.codePointAt(0)!
    if (cp === 0x200d || (cp >= 0xfe00 && cp <= 0xfe0f) || (cp >= 0x300 && cp <= 0x36f)) continue
    const wide =
      (cp >= 0x1100 && cp <= 0x115f) ||
      (cp >= 0x2e80 && cp <= 0xa4cf) ||
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe30 && cp <= 0xfe4f) ||
      (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6) ||
      (cp >= 0x1f300 && cp <= 0x1faff) ||
      (cp >= 0x20000 && cp <= 0x3fffd)
    w += wide ? 2 : 1
  }
  return w
}

/** Cuts `s` to `cells` terminal cells, ending in `…` when cut. */
export function truncate(s: string, cells: number): string {
  if (cellWidth(s) <= cells) return s
  if (cells <= 0) return ''
  let out = ''
  for (const ch of s) {
    if (cellWidth(out + ch) > cells - 1) break
    out += ch
  }
  return out + '…'
}

const widthOf = (slots: readonly Slot[]) => slots.reduce((a, s) => a + cellWidth(s.text), 0) + Math.max(0, slots.length - 1) * SEP.length

/** The slots to draw in `columns` cells, in display order. */
export function layout(slots: readonly Slot[], columns: number): Slot[] {
  let shown = [...slots].filter(s => s.text).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
  while (shown.length > 1 && widthOf(shown) > columns) {
    let victim = shown[0]!
    for (const s of shown) if (s.priority < victim.priority || (s.priority === victim.priority && s.order > victim.order)) victim = s
    shown = shown.filter(s => s !== victim)
  }
  if (shown.length === 1 && cellWidth(shown[0]!.text) > columns) shown = [{ ...shown[0]!, text: truncate(shown[0]!.text, columns) }]
  return shown
}
