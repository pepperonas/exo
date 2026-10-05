/**
 * #15 Context diet: a whole-file Read of a big or generated file is cut to
 * its head (Read's own `limit`), with the tail and a hint added as context.
 */
import type { CallCtx, Step } from '../../core/dispatcher/dispatcher'
import { HEAD_LINES, TAIL_LINES, capTail, decide, needsCount, note } from './diet-logic'
import type { DietReason } from './diet-logic'

type Memo = { path: string; reason: DietReason; lines: number | null; size: number }

async function countLines(ctx: CallCtx, path: string): Promise<number | null> {
  try {
    const r = await ctx.untimed(ctx.host.run(['wc', '-l', path], { timeoutMs: 10_000 }))
    const n = Number(r.stdout.trim().split(/\s+/)[0])
    return r.exitCode === 0 && Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

export function dietStep(): Step {
  /** The last Read the diet cut; a Read of the same path right after passes. */
  let lastCut: string | null = null

  return {
    id: 'diet',
    async before(ctx) {
      if (ctx.call.tool !== 'Read') return
      const input = ctx.call.input
      const path = String(input.file_path ?? '')
      const hasRange = input.offset !== undefined || input.limit !== undefined || input.pages !== undefined
      const justCut = lastCut === path
      lastCut = null
      if (!path || hasRange || justCut) return
      let size: number
      try {
        const st = await ctx.untimed(ctx.host.stat(path))
        if (st.kind !== 'file') return
        size = st.size
      } catch {
        return // Read will report a missing file itself
      }
      const lines = needsCount(path, size) ? await countLines(ctx, path) : null
      const reason = decide({ path, hasRange, size, lines, maxKb: ctx.config.dietMaxKb, maxLines: ctx.config.dietMaxLines, justCut })
      if (!reason) return
      lastCut = path
      ctx.memo.diet = { path, reason, lines, size } satisfies Memo
      return { input: { ...input, limit: HEAD_LINES } }
    },
    async after(ctx, result) {
      const m = ctx.memo.diet as Memo | undefined
      if (!m || result.deny !== undefined || result.isError) return
      let tail = ''
      if (m.lines === null || m.lines > HEAD_LINES) {
        try {
          const r = await ctx.untimed(ctx.host.run(['tail', '-n', String(TAIL_LINES), m.path], { timeoutMs: 10_000 }))
          if (r.exitCode === 0) tail = capTail(r.stdout)
        } catch {
          tail = ''
        }
      }
      const shown = typeof result.text === 'string' ? result.text.length + tail.length : tail.length
      return { ...result, context: [...(result.context ?? []), note(m.path, m.reason, m.lines, m.size, shown, tail)] }
    },
  }
}
