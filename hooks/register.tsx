/**
 * exo – the one registration. Every hook checks the kill switch first and
 * hands the work to the core; nothing here decides anything itself.
 */
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Banner, Slot } from '../types'
import type { Host, Timer } from '../core/adapter/host'
import { exoCommand } from '../core/exo-command'
import { errorText } from '../core/health/health'
import { L } from '../core/i18n'
import { catchDecision, createRuntime, killReason, log, refreshLiveness, saveJournalLater, toolCall } from '../core/runtime'
import type { Runtime } from '../core/runtime'
import { KillSwitch } from '../core/killswitch'
import { DISMISS, pressBanner } from '../core/statusline/banners'
import { layout } from '../core/statusline/statusline'

const COMMAND = 'exo'
const TICK_MS = 2_000

// exo's `$.state` values; the engine reads their refs from this file.
const slotsA = atom({ plugin: 'exo', key: 'slots' } as const, {} as Record<string, Slot>)
const bannersA = atom({ plugin: 'exo', key: 'banners' } as const, [] as Banner[])
const killedA = atom({ plugin: 'exo', key: 'killed' } as const, null as string | null)

/**
 * The adapter: the one place that speaks to `$`. Everything else works
 * against `Host`; a change in the engine API is fixed here alone.
 */
function hostOf($: EngineInterface): Host {
  return {
    now: () => $.clock.now(),
    env: name => (name === 'HOME' ? $.env.get('HOME') : name === 'EXO_DISABLE' ? $.env.get('EXO_DISABLE') : $.env.get('NO_COLOR')),
    readFile: path => $.fs.read(path),
    writeFile: (path, text) => $.fs.write(path, text),
    exists: path => $.fs.exists(path),
    stat: async path => {
      const s = await $.fs.stat(path)
      return { kind: s.kind, size: s.size, mtimeMs: s.mtimeMs }
    },
    run: async (argv, o) => {
      const r = await $.process.run(argv, o)
      return { exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr }
    },
    storeGet: key => $.store.get(key),
    storeSet: (key, value) => $.store.set(key, value),
    storeDelete: key => $.store.delete(key),
    storeKeys: () => $.store.keys(),
    after: (ms, fn) => $.clock.after(ms, fn),
    every: (ms, fn) => $.clock.every(ms, fn),
    toast: (text, timeoutMs) => $.ui.toast(text, timeoutMs ? { timeoutMs } : undefined),
    log: text => $.ui.log(text),
    ask: (question, options) => $.ui.ask(question, options),
    sessionId: () => $.session.id(),
    cwd: () => $.session.cwd(),
    repoRoot: async () => (await $.session.repo())?.root ?? null,
    setSlot: async (id, slot) => {
      await update($, slotsA, all => {
        const next = { ...all }
        if (slot) next[id] = slot
        else delete next[id]
        return next
      })
    },
    setBanner: async (id, banner) => {
      await update($, bannersA, list => {
        const rest = list.filter(b => b.id !== id)
        return banner ? [...rest, banner] : rest
      })
    },
    setKilled: async reason => {
      await update($, killedA, () => reason)
    },
  }
}

let runtime: Promise<Runtime> | undefined
let interactive = true
let tick: Timer | undefined
let opts: Readonly<Record<string, unknown>> = {}

/** The runtime; a failed build is forgotten, so the next call tries again. */
function ensure($: EngineInterface): Promise<Runtime> {
  runtime ??= createRuntime(hostOf($), opts, interactive).catch(err => {
    runtime = undefined
    throw err
  })
  return runtime
}

/**
 * The kill switch without the runtime: the DISABLED file and EXO_DISABLE
 * work even when exo's own state cannot be built.
 */
const rawKill = new KillSwitch()
async function killedWithoutRuntime($: EngineInterface): Promise<boolean> {
  try {
    const home = await $.env.get('HOME')
    return (await rawKill.reason(hostOf($), home, false)) !== null
  } catch {
    return false
  }
}

/** The runtime, or null when exo is switched off by its kill switch. */
async function live($: EngineInterface): Promise<{ rt: Runtime; host: Host } | null> {
  const rt = await ensure($)
  const host = hostOf($)
  return (await killReason(rt, host)) ? null : { rt, host }
}

export const register: Register = (on, options) => {
  opts = options
  runtime = undefined

  on('session.start', async ($, e, next) => {
    interactive = e.isInteractive
    const rt = await ensure($)
    rt.interactive = e.isInteractive
    const host = hostOf($)
    await $.command.register({
      name: COMMAND,
      description: 'exo: Zustand der Module, Schalter, Notausschalter (/exo help)',
      argumentHint: '[on|off [modul]|reset <modul>|rules|help]',
      immediate: true,
    })
    if (rt.journal.size() === 0 || rt.journal.last('session.start')?.sessionId !== rt.journal.sessionId)
      await log(rt, host, { type: 'session.start', sessionId: rt.journal.sessionId, project: (await host.repoRoot().catch(() => null)) ?? e.cwd })
    if (rt.rules.errors.length && !rt.rulesWarned) {
      rt.rulesWarned = true
      host.toast(L.rulesWarning, 8000)
    }
    rt.shownLiveness = undefined
    await refreshLiveness(rt, host)
    tick?.cancel()
    tick = $.clock.every(TICK_MS, () => {
      void refreshLiveness(rt, host).catch(() => undefined)
    })
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (await killedWithoutRuntime($)) return next(e)
    const rt = await ensure($)
    const host = hostOf($)
    const call = { tool: String(e.tool), input: e as unknown as Record<string, unknown>, id: e.tool_use_id }
    const result = await toolCall(rt, host, call, input => next({ ...e, ...input } as typeof e) as Promise<never>)
    return result as Awaited<ReturnType<typeof next>>
  }).catch(async ($, e, next) => {
    let killed = await killedWithoutRuntime($)
    if (!killed) {
      try {
        const rt = await ensure($)
        killed = (await killReason(rt, hostOf($))) !== null
      } catch {
        // no runtime: only the raw kill switch counts
      }
    }
    const d = catchDecision(String(e.tool), killed, next.called, errorText(next.error))
    if (d === 'leave') return undefined
    if (d === 'pass') return next(e)
    return d
  })

  on('prompt.submit', async ($, e, next) => {
    const l = await live($).catch(() => null)
    if (l) await log(l.rt, l.host, { type: 'prompt.submit', chars: e.text.length }).catch(() => undefined)
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    const l = await live($).catch(() => null)
    if (l) {
      l.rt.journal.turnId = e.turnId
      await log(l.rt, l.host, { type: 'turn.start', turnId: e.turnId }).catch(() => undefined)
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const l = await live($).catch(() => null)
    if (l && !e.agentId) {
      await log(l.rt, l.host, { type: 'turn.complete', turnId: e.turnId, ms: e.durationMs, claims: [], reason: e.reason }).catch(() => undefined)
      l.rt.journal.turnId = undefined
    }
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    try {
      const rt = await ensure($)
      rt.journal.push({ type: 'session.end', reason: e.reason }, await $.clock.now())
      saveJournalLater(rt)
      await rt.store.flush()
    } catch {
      // ending fast matters more than the last journal line
    }
    tick?.cancel()
    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const rt = await ensure($)
    return { text: await exoCommand(rt, hostOf($), e.args) }
  })

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const slots = Object.values(await read($, slotsA))
    if (!slots.length) return next(e)
    const columns = Math.max(10, (e.viewport?.columns ?? 100) - 2)
    const shown = layout(slots, columns)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {await next(e)}
        <Box key="exo" flexDirection="row">
          {shown.map((s, i) => (
            <Text key={s.id} color={s.color} dimColor={s.dim} bold={s.bold} wrap="truncate-end">
              {i > 0 ? ' · ' : ''}
              {s.text}
            </Text>
          ))}
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const banners = await read($, bannersA)
    const killed = await read($, killedA)
    if (!banners.length || killed) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {banners.map(b => (
          <Box key={b.id} flexDirection="row">
            <Text color={b.tone === 'warn' ? '#d29922' : undefined} wrap="truncate-end">
              {b.text}{' '}
            </Text>
            {b.buttons.map(btn => (
              <Button key={`${b.id}:${btn.key}`} label={btn.label} onPress={() => void pressBanner(hostOf($), b.id, btn.key)} />
            ))}
            <Button key={`${b.id}:${DISMISS}`} label={L.dismiss} role="dismiss" onPress={() => void pressBanner(hostOf($), b.id, DISMISS)} />
          </Box>
        ))}
      </Box>
    )
  })
}
