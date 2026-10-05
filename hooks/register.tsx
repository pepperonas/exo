/**
 * exo – the one registration. Every hook checks the kill switch first and
 * hands the work to the core; nothing here decides anything itself.
 */
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Banner, ChangeRow, DuckState, Slot } from '../types'
import type { Host, Timer } from '../core/adapter/host'
import { complete, isOurs } from '../core/complete'
import { exoCommand } from '../core/exo-command'
import { errorText } from '../core/health/health'
import { L } from '../core/i18n'
import { catchDecision, createRuntime, endModules, killReason, log, moduleEnv, promptContexts, refreshLiveness, saveJournalLater, startModules, toolCall, turnTexts } from '../core/runtime'
import type { Runtime } from '../core/runtime'
import { KillSwitch } from '../core/killswitch'
import { isMissingError } from '../core/safepath'
import { DISMISS, pressBanner, pressPane } from '../core/statusline/banners'
import { refreshChanges } from '../modules/cockpit/sidebar'
import { hoursCommand } from '../modules/rueckblick/hours'
import { recapCommand } from '../modules/rueckblick/recap'
import { achievementsCard } from '../modules/extras/achievements'
import { spinnerMessage } from '../modules/extras/cinema'
import { DUCK, QUESTIONS, answer as answerDuck, buildPrompt, done, freshDuck } from '../modules/extras/duck-logic'
import { pruneSnapshots } from '../modules/waechter/brake'
import { undoLast, undoList } from '../modules/waechter/undo'
import { layout } from '../core/statusline/statusline'

const COMMAND = 'exo'
const CHANGES = 'changes'
const CHANGES_PANE = 'exo-changes'
const DUCK_PANE = 'exo-duck'

function shortPath(p: string, max: number): string {
  return p.length <= max ? p : '…' + p.slice(p.length - Math.max(8, max - 1))
}
/** Commands besides /exo: name, description, argument hint. */
const COMMANDS: [string, string, string][] = [
  ['undo-last', "exo: restore the cleanup brake's last snapshot", '[id]'],
  ['undo-list', "exo: list the cleanup brake's snapshots", ''],
  ['recap', 'exo: recap of this session, open items, lessons', '[md|copy]'],
  ['hours', 'exo: active time per project this week', '[export csv|json]'],
  ['duck', 'exo: rubber duck – debugging with five questions', ''],
  ['achievements', 'exo: badges earned', ''],
]
/** Registered name → command it stands for (exo-undo-last when undo-last is taken). */
const commandNames = new Map<string, string>()
const TICK_MS = 2_000

/** Whether the line under the prompt is listing `/exo` arguments right now. */
let listing = false

/** Redraw for a draft that is `/exo …`, or that just stopped being one. */
function redrawIfOurs($: EngineInterface, text: string): void {
  const ours = isOurs(text)
  if (ours || listing) $.ui.invalidate('ui.render')
  listing = ours
}

// exo's `$.state` values; the engine reads their refs from this file.
const slotsA = atom({ plugin: 'exo', key: 'slots' } as const, {} as Record<string, Slot>)
const bannersA = atom({ plugin: 'exo', key: 'banners' } as const, [] as Banner[])
const killedA = atom({ plugin: 'exo', key: 'killed' } as const, null as string | null)
const changesA = atom({ plugin: 'exo', key: 'changes' } as const, [] as ChangeRow[])
const selectedA = atom({ plugin: 'exo', key: 'selected' } as const, null as string | null)
const diffA = atom({ plugin: 'exo', key: 'diff' } as const, '')
const duckA = atom({ plugin: 'exo', key: 'duck' } as const, { step: 0, answers: [] } as DuckState)

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
    list: async path => (await $.fs.list(path)).map(e => e.name),
    isLink: async path => {
      try {
        return (await $.fs.stat(path)).isLink
      } catch (err) {
        // only "not there" means not a link; any other failure is passed on,
        // so a guard asking this denies instead of guessing
        if (isMissingError(err)) return false
        throw err
      }
    },
    realPath: async path => {
      const s = await $.fs.stat(path, { resolve: true })
      // No answer is no resolution: never fall back to the unresolved path.
      if (!s.realPath) throw new Error('realPath not available')
      return s.realPath
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
    spawn: (argv, o) => {
      const s = $.process.spawn({ argv: [...argv], cwd: o?.cwd })
      return {
        chunks: s,
        stop: () => void s.return({ code: null, signal: 'stop' }).catch(() => undefined),
        done: s.result.then(r => ({ code: r.code })),
      }
    },
    fillPrompt: async text => {
      const r = await $.prompt.fill({ text, mode: 'append' })
      return r.isFilled
    },
    openPane: async (id, title) => (await $.ui.open({ id, title })).isPlaced,
    redraw: () => $.ui.invalidate('ui.render'),
    playSound: async asset => {
      await $.audio.play({ asset }).catch(() => undefined)
    },
    usage: async () => {
      const u = await $.session.usage()
      return { contextPercent: u.context.percent, fiveHour: u.rateLimits.find(l => l.kind === 'five_hour')?.percentUsed }
    },
    usageBars: async () => (await $.config.list()).some(r => r.key.startsWith('usage-bars.')),
    openDialog: async (id, title) => (await $.ui.open({ id, title, focus: true, closeOnEscape: true })).isPlaced,
    closePane: async id => {
      await $.ui.close({ id })
    },
    messages: async () => (await $.session.messages()).map(m => ({ role: m.role, text: m.text })),
    complete: async (prompt, system) => {
      const r = await $.model.complete({ model: 'haiku', prompt, system, maxTokens: 800, timeoutMs: 20_000 })
      return r.isAnswered ? r.text : null
    },
    copy: async text => (await $.ui.copy({ text })).isCopied,
    sessionCost: async () => (await $.session.usage()).cost?.usd ?? null,
    askMany: async (question, options) => {
      const answer = await $.ui.ask(question, { options, multiSelect: true })
      return options.filter(o => answer.split(',').map(x => x.trim()).includes(o))
    },
    setChanges: async (changes, selected, diff) => {
      await update($, changesA, () => changes)
      await update($, selectedA, () => selected)
      await update($, diffA, () => diff)
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

/**
 * Everything that starts a conversation: modules, journal, liveness, the
 * ticker. Runs on `session.start` and again after a `/clear` or a resume,
 * for which the engine fires no `session.start` (the process goes on under a
 * new session id, with fresh `$.state`).
 */
async function begin($: EngineInterface, rt: Runtime, host: Host, cwd: string): Promise<void> {
  if (rt.home) void pruneSnapshots(host, rt.store, rt.home, await $.clock.now()).catch(() => undefined)
  await startModules(rt, host)
  if (rt.journal.size() === 0 || rt.journal.last('session.start')?.sessionId !== rt.journal.sessionId)
    await log(rt, host, { type: 'session.start', sessionId: rt.journal.sessionId, project: (await host.repoRoot().catch(() => null)) ?? cwd })
  if (rt.rules.errors.length && !rt.rulesWarned) {
    rt.rulesWarned = true
    host.toast(L.rulesWarning, 8000)
  }
  rt.shownLiveness = undefined
  await refreshLiveness(rt, host)
  tick?.cancel()
  tick = $.clock.every(TICK_MS, () => {
    void (async () => {
      await afterClear($)
      await refreshLiveness(await ensure($), hostOf($))
    })().catch(() => undefined)
  })
}

/** Set by `session.end` when the conversation ends but the process goes on. */
let cleared = false

/** After a `/clear` or a resume: a fresh runtime for the new session, then `begin`. */
async function afterClear($: EngineInterface): Promise<void> {
  if (!cleared) return
  cleared = false
  runtime = undefined
  const rt = await ensure($)
  await begin($, rt, hostOf($), await $.session.cwd())
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
      description: 'exo: module state, switches, kill switch (/exo help)',
      argumentHint: '[on|off [module]|reset <module>|rules|help]',
      immediate: true,
    })
    const taken = new Set((await $.command.list()).filter(c => c.plugin !== 'exo').map(c => c.name))
    for (const [name, description, argumentHint] of COMMANDS) {
      const final = taken.has(name) ? `exo-${name}` : name
      commandNames.set(final, name)
      await $.command.register({ name: final, description, argumentHint, immediate: true })
    }
    await $.command.register({ name: CHANGES, description: 'exo: files changed in this session, with diff', immediate: true })
    await begin($, rt, host, e.cwd)
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
    await afterClear($).catch(() => undefined)
    const l = await live($).catch(() => null)
    if (!l) {
      const r = await next(e)
      redrawIfOurs($, '')
      return r
    }
    await log(l.rt, l.host, { type: 'prompt.submit', chars: e.text.length }).catch(() => undefined)
    const extra = await promptContexts(l.rt, l.host).catch(() => [])
    const r = await next(extra.length ? { ...e, context: [...(e.context ?? []), ...extra] } : e)
    redrawIfOurs($, '')
    return r
  })

  // Claude Code completes the command's name, not its arguments, so the line
  // under the prompt lists what may follow while the draft is `/exo …`.
  // Only such drafts redraw: typing a normal prompt costs nothing.
  on('prompt.edit', async ($, e, next) => {
    const r = await next(e)
    redrawIfOurs($, r.text)
    return r
  })

  on('turn.start', async ($, e, next) => {
    await afterClear($).catch(() => undefined)
    const l = await live($).catch(() => null)
    if (l) {
      l.rt.journal.turnId = e.turnId
      await log(l.rt, l.host, { type: 'turn.start', turnId: e.turnId }).catch(() => undefined)
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const l = await live($).catch(() => null)
    if (!l || e.agentId) return next(e)
    await log(l.rt, l.host, { type: 'turn.complete', turnId: e.turnId, ms: e.durationMs, claims: [], reason: e.reason }).catch(() => undefined)
    const texts = await turnTexts(l.rt, l.host, { turnId: e.turnId, answer: e.answer, reason: e.reason }).catch(() => [])
    l.rt.journal.turnId = undefined
    const r = await next(e)
    // a text other than the answer is shown beneath it
    return texts.length ? { ...r, text: texts.join('\n') } : r
  })

  on('session.end', async ($, e, next) => {
    try {
      const rt = await ensure($)
      rt.journal.push({ type: 'session.end', reason: e.reason }, await $.clock.now())
      await endModules(rt, hostOf($), e.reason)
      saveJournalLater(rt)
      await rt.store.flush()
    } catch {
      // ending fast matters more than the last journal line
    }
    // after /clear or a resume the process goes on without a session.start
    if (e.reason === 'clear' || e.reason === 'resume') cleared = true
    else tick?.cancel()
    return next(e)
  })

  for (const name of ['recap', 'exo-recap'] as const) {
    on('command.run', { command: name }, async ($, e) => {
      const rt = await ensure($)
      return { text: await recapCommand(moduleEnv(rt, hostOf($)), e.args, rt.config.enabled.lessons) }
    })
  }
  for (const name of ['duck', 'exo-duck'] as const) {
    on('command.run', { command: name }, async $ => {
      const rt = await ensure($)
      if (!rt.config.enabled.duck) return { text: 'The rubber duck is switched off (/exo on duck).' }
      await update($, duckA, () => freshDuck())
      const placed = await $.ui.open({ id: DUCK_PANE, title: 'Rubber duck', focus: true, closeOnEscape: true })
      return { text: placed.isPlaced ? 'The duck is listening.' : `The duck has no room (${placed.reason}).` }
    })
  }
  for (const name of ['achievements', 'exo-achievements'] as const) {
    on('command.run', { command: name }, async $ => {
      const rt = await ensure($)
      const noColor = !!(await $.env.get('NO_COLOR'))
      // plain text: a fenced block loses its line breaks in command output
      return { text: await achievementsCard(moduleEnv(rt, hostOf($)), noColor) }
    })
  }

  on('ui.render', { component: 'Pane', requestId: DUCK_PANE }, async ($, e) => {
    if (e.surface === 'mobile') {
      const { Text } = $.ui.resolve(e)
      return <Text>The rubber duck needs an input field – there is none on the phone.</Text>
    }
    const { Box, Text, Button, Input, Code } = $.ui.resolve(e)
    const s = await read($, duckA)
    const duck = DUCK.map((l, i) => <Text key={`d${i}`} color="#f2cc60">{l}</Text>)
    if (done(s)) {
      const prompt = buildPrompt(s.answers)
      return (
        <Box flexDirection="column">
          {duck}
          <Text key="t">Quack. This becomes the prompt – edit it in the input field and send it yourself:</Text>
          <Code key="p" source={prompt} language="markdown" />
          <Box key="b" flexDirection="row">
            <Button
              key="take"
              variant="primary"
              label="Put into prompt"
              onPress={async () => {
                await $.prompt.fill({ text: prompt, mode: 'replace' })
                const rt = await ensure($)
                rt.journal.push({ type: 'duck' }, await $.clock.now())
                await $.ui.close({ id: DUCK_PANE })
              }}
            />
            <Button key="again" label="Start over" onPress={() => void update($, duckA, () => freshDuck())} />
          </Box>
        </Box>
      )
    }
    const q = QUESTIONS[s.step]!
    return (
      <Box flexDirection="column">
        {duck}
        <Text key="q" bold>{`Question ${s.step + 1}/${QUESTIONS.length}: ${q}`}</Text>
        <Input key={`in${s.step}`} placeholder="Answer, Enter = next" autoFocus onSubmit={(value: string) => void update($, duckA, cur => answerDuck(cur, value))} />
        <Box key="b" flexDirection="row">
          <Button key="skip" label="Skip" onPress={() => void update($, duckA, cur => answerDuck(cur, null))} />
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    try {
      const l = await live($)
      if (!l || !l.rt.config.enabled.cinema) return next(e)
      const msg = spinnerMessage(await $.clock.now(), e.viewport?.columns ?? 80)
      return msg ? next({ ...e, props: { ...e.props, message: msg, suffix: '' } }) : next(e)
    } catch {
      return next(e)
    }
  })

  for (const name of ['hours', 'exo-hours'] as const) {
    on('command.run', { command: name }, async ($, e) => {
      const rt = await ensure($)
      return { text: await hoursCommand(moduleEnv(rt, hostOf($)), e.args) }
    })
  }

  for (const name of ['undo-last', 'undo-list', 'exo-undo-last', 'exo-undo-list'] as const) {
    on('command.run', { command: name }, async ($, e) => {
      const rt = await ensure($)
      const host = hostOf($)
      const base = commandNames.get(name) ?? name.replace(/^exo-/, '')
      if (base === 'undo-list') return { text: await undoList(rt.store, await $.clock.now()) }
      return { text: await undoLast(host, rt.store, e.args.trim() || undefined) }
    })
  }

  on('command.run', { command: CHANGES }, async $ => {
    const rt = await ensure($)
    const placed = await $.ui.open({ id: CHANGES_PANE, title: 'Changes' })
    await refreshChanges(moduleEnv(rt, hostOf($))).catch(() => undefined)
    return { text: placed.isPlaced ? 'Changes opened.' : `Changes: no room (${placed.reason}).` }
  })

  on('ui.render', { component: 'Pane', requestId: CHANGES_PANE }, async ($, e) => {
    const { Box, Text, Button, Code } = $.ui.resolve(e)
    const rows = await read($, changesA)
    const selected = await read($, selectedA)
    const diff = await read($, diffA)
    if (!rows.length) return <Text dimColor>No file has been changed via Write/Edit in this session yet.</Text>
    const width = e.props.bodyColumns ?? 60
    return (
      <Box flexDirection="column">
        {rows.map(r => (
          <Box key={`row:${r.path}`} flexDirection="row">
            <Button key={`sel:${r.path}`} plain label={`${r.path === selected ? '▸' : ' '} +${r.added} −${r.removed} ${shortPath(r.path, width - 14)}${r.isNew ? ' (new)' : ''}`} onPress={() => void pressPane(hostOf($), `sel:${r.path}`)} />
          </Box>
        ))}
        {selected ? (
          <Box key="detail" flexDirection="column" marginTop={1}>
            {diff ? <Code key="diff" source={diff} format="diff" path={selected} /> : <Text dimColor>No differences left from the state before the session.</Text>}
            <Box key="actions" flexDirection="row">
              <Button key="revert" label="Revert" onPress={() => void pressPane(hostOf($), `revert:${selected}`)} />
            </Box>
          </Box>
        ) : (
          <Text dimColor>Select a file for its diff.</Text>
        )}
      </Box>
    )
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const rt = await ensure($)
    return { text: await exoCommand(rt, hostOf($), e.args) }
  })

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    // A surface without a prompt box (or a read that fails) just shows the line.
    const draft = (await $.prompt.read().catch(() => undefined))?.text ?? ''
    const options = complete(draft)
    if (options) {
      const { Box, Text } = $.ui.resolve(e)
      const one = options.length === 1 ? options[0] : undefined
      return (
        <Box flexDirection="column">
          {await next(e)}
          <Box key="exo-complete" flexDirection="row">
            <Text dimColor>{'⌨ '}</Text>
            {options.map((o, i) => (
              <Text key={o.word} wrap="truncate-end">
                {i > 0 ? <Text dimColor>{' · '}</Text> : null}
                <Text bold color="#d2a8ff">{o.word.slice(0, o.typed)}</Text>
                <Text>{o.word.slice(o.typed)}</Text>
              </Text>
            ))}
            {one ? <Text dimColor wrap="truncate-end">{`  — ${one.hint}`}</Text> : null}
          </Box>
        </Box>
      )
    }
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
