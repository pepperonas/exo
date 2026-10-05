import { expect, mock, test } from 'claude-code/testing'

const HINT = {
  plugin: 'exo',
  component: 'PromptHint',
  props: { isDraft: false, isWorking: false, hint: '? for shortcuts' },
} as const

/** The engine beneath exo: files in memory, a store, env, session facts. */
function engine(on: any, files: Record<string, string> = {}, env: Record<string, string> = { HOME: '/home/u' }) {
  const fs = new Map(Object.entries(files))
  const clock = mock.clock(on, { now: 1_000_000 })
  const store = new Map<string, unknown>()
  on('store.get', (_$: any, e: any) => ({ value: store.get(e.key) }))
  on('store.set', (_$: any, e: any) => {
    store.set(e.key, JSON.parse(JSON.stringify(e.value)))
    return { value: undefined }
  })
  on('store.delete', (_$: any, e: any) => {
    store.delete(e.key)
    return { value: undefined }
  })
  on('store.keys', () => ({ value: [...store.keys()] }))
  mock.env(on, env)
  const toasts: string[] = []
  const ran: string[] = []
  const filled: string[] = []
  /** Paths whose stat fails with a permission error. */
  const locked = new Set<string>()
  on('fs.exists', (_$: any, e: any) => ({ value: fs.has(e.path) }))
  on('fs.read', (_$: any, e: any) => {
    if (!fs.has(e.path)) throw new Error('ENOENT')
    return { value: fs.get(e.path) }
  })
  on('fs.write', (_$: any, e: any) => {
    fs.set(e.path, e.text)
    return { value: undefined }
  })
  on('fs.stat', (_$: any, e: any) => {
    if ([...locked].some(l => String(e.path) === l || String(e.path).startsWith(l + '/'))) throw new Error('EACCES: permission denied')
    if (e.path !== '/' && !fs.has(e.path) && ![...fs.keys()].some(k => k.startsWith(e.path + '/'))) throw new Error('ENOENT')
    return { value: { kind: fs.has(e.path) ? 'file' : 'dir', size: fs.get(e.path)?.length ?? 0, mtimeMs: 0, isLink: false, realPath: e.path } }
  })
  on('fs.list', () => ({ value: [] }))
  on('command.list', () => ({ value: [] }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  on('prompt.fill', (_$: any, e: any) => {
    filled.push(String(e.text))
    return { isFilled: true }
  })
  on('config.list', () => ({ value: [] }))
  on('audio.play', () => ({ value: undefined }))
  on('session.messages', () => ({ value: [{ role: 'assistant', text: 'Erledigt bis auf die README.', toolUses: [] }] }))
  on('session.usage', () => ({ value: { startedAt: 0, context: {}, rateLimits: [], cost: { usd: 0.42 } } }))
  on('model.complete', () => ({ value: { isAnswered: true, text: '- README ergänzen', usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } }))
  on('turn.start', (_$: any, e: any) => ({ turnId: e.turnId }))
  on('turn.complete', (_$: any, e: any) => ({ text: e.answer }))
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: '' } }))
  on('session.cwd', () => ({ value: '/work/proj' }))
  on('session.id', () => ({ value: 'sess-test' }))
  on('session.repo', () => ({ value: { root: '/work/proj', remote: null, internal: false, name: null } }))
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: undefined }))
  on('ui.toast', (_$: any, e: any) => {
    toasts.push(String(e.text ?? e))
    return { value: undefined }
  })
  on('ui.render', ($: any, e: any) => {
    const { Text } = $.ui.resolve(e)
    return <Text dimColor>{e.props.hint ?? e.props.message ?? e.props.word ?? ''}</Text>
  })
  on('tool.call', (_$: any, e: any) => {
    if (e.tool === 'Write') fs.set(String(e.file_path), String(e.content))
    ran.push(String(e.command ?? e.file_path))
    return { result: { stdout: 'ok', stderr: '', interrupted: false }, text: 'ok' }
  })
  return { fs, toasts, ran, store, filled, clock, locked }
}

const start = ($: any) => $.session.start({ cwd: '/work/proj', surface: 'terminal', isInteractive: true })
const all = async (ui: any) => (await ui.findAll({ type: 'Text' })).map((t: any) => t.text).join('|')

test('/exo answers with the status of every module', async ($, on) => {
  engine(on)
  await start($)
  const r = await $.command.run({ command: 'exo', args: '' } as any)
  expect(r.text).toContain('exo ist an.')
  expect(r.text).toContain('Secret-Wächter (secrets)')
  expect(r.text).toContain('Notausschalter')
})

test('default rules.json is written on first start', async ($, on) => {
  const { fs } = engine(on)
  await start($)
  expect(fs.get('/home/u/.claude/exo/rules.json')).toContain('nginx-certbot')
})

test('a tool call passes through to the tool', async ($, on) => {
  const { ran } = engine(on)
  await start($)
  const r = await $.tool.call({ tool: 'Bash', command: 'ls -la' } as any)
  expect(ran).toEqual(['ls -la'])
  expect((r as any).deny).toBeUndefined()
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`status line: engine hint kept, exo marker under it (${surface})`, async ($, on) => {
    engine(on)
    await start($)
    const ui = await $.ui.mount({ ...HINT, surface, viewport: { columns: 120, rows: 40 } } as any)
    const t = await all(ui)
    expect(t).toContain('? for shortcuts')
    expect(t).toContain('⛨ exo')
  })

  test(`kill switch file: everything passes and the line says so (${surface})`, async ($, on) => {
    const { ran } = engine(on, { '/home/u/.claude/exo/DISABLED': '' })
    await start($)
    await $.tool.call({ tool: 'Bash', command: 'echo hi' } as any)
    expect(ran).toEqual(['echo hi'])
    const ui = await $.ui.mount({ ...HINT, surface, viewport: { columns: 120, rows: 40 } } as any)
    expect(await all(ui)).toContain('exo aus')
    const r = await $.command.run({ command: 'exo', args: '' } as any)
    expect(r.text).toContain('exo ist AUS')
  })
}

test('EXO_DISABLE=1 switches exo off', async ($, on) => {
  engine(on, {}, { HOME: '/home/u', EXO_DISABLE: '1' })
  await start($)
  const r = await $.command.run({ command: 'exo', args: '' } as any)
  expect(r.text).toContain('EXO_DISABLE')
})

test('broken rules.json: defaults stay, a toast and /exo say why', async ($, on) => {
  const { toasts, fs } = engine(on, { '/home/u/.claude/exo/rules.json': '{ kaputt' })
  await start($)
  expect(toasts.join('|')).toContain('rules.json fehlerhaft')
  const r = await $.command.run({ command: 'exo', args: 'rules' } as any)
  expect(r.text).toContain('nginx-certbot')
  expect(fs.get('/home/u/.claude/exo/rules.json')).toBe('{ kaputt')
})

test('/exo off is remembered in the store and lets calls through', async ($, on) => {
  const { ran, store } = engine(on)
  await start($)
  const r = await $.command.run({ command: 'exo', args: 'off' } as any)
  expect(r.text).toContain('alle Module aus')
  await $.tool.call({ tool: 'Bash', command: 'pwd' } as any)
  expect(ran).toEqual(['pwd'])
  expect(store.get('prefs')).toEqual({ allOff: true, modules: {} })
})

// Assembled at run time: no literal key in this file.
const KEY = ['sk-', 'ant-', 'api03-Zk3q9XvT2mLw8RbN4cYp7Hd1Fs6Gj5Ke0Ua2', 'a1b2'].join('') // exo-allow-secret: test fixture

test('the secret guard denies a Write with a key, masked', async ($, on) => {
  const { ran } = engine(on)
  await start($)
  const r: any = await $.tool.call({ tool: 'Write', file_path: '/work/proj/src/k.ts', content: `export const k = "${KEY}"` } as any)
  const text = String(r.deny ?? r.text ?? '')
  expect(text).toContain('Secret-Wächter')
  expect(text).toContain('sk-ant-…a1b2')
  expect(text.includes(KEY)).toBe(false)
  expect(ran).toEqual([])
})

test('/undo-list answers, without snapshots', async ($, on) => {
  engine(on)
  await start($)
  const r = await $.command.run({ command: 'undo-list', args: '' } as any)
  expect(r.text).toContain('Keine Schnappschüsse')
})

test('done check: a claim after a change without a test shows a line beneath the answer', async ($, on) => {
  engine(on)
  await start($)
  await $.turn.start({ text: 'mach', turnId: 't1' } as any)
  await $.tool.call({ tool: 'Write', file_path: '/work/proj/src/a.ts', content: 'export const a = 1\n', tool_use_id: 'u1' } as any)
  const r: any = await $.turn.complete({ answer: 'Fertig, funktioniert.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' } as any)
  expect(r.text).toContain('In diesem Turn lief kein Test')
})

test('done check: no claim, no line', async ($, on) => {
  engine(on)
  await start($)
  await $.turn.start({ text: 'mach', turnId: 't2' } as any)
  await $.tool.call({ tool: 'Write', file_path: '/work/proj/src/b.ts', content: 'x\n', tool_use_id: 'u2' } as any)
  const r: any = await $.turn.complete({ answer: 'Ich habe b.ts angelegt.', durationMs: 5, isAborted: false, turnId: 't2', reason: 'answer' } as any)
  expect(r.text).toBe('Ich habe b.ts angelegt.')
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`/changes opens the pane; empty it says so (${surface})`, async ($, on) => {
    engine(on)
    await start($)
    const r = await $.command.run({ command: 'changes', args: '' } as any)
    expect(r.text).toContain('Änderungen geöffnet')
    const ui = await $.ui.mount({ plugin: 'exo', component: 'Pane', requestId: 'exo-changes', surface, props: { title: 'Änderungen', isFocused: false, bodyColumns: 60, placement: 'dock' }, viewport: { columns: 120, rows: 40 } } as any)
    expect(await all(ui)).toContain('noch keine Datei')
  })
}

test('/recap shows the card with open points from the small model', async ($, on) => {
  engine(on)
  await start($)
  await $.turn.start({ text: 'mach', turnId: 't9' } as any)
  await $.tool.call({ tool: 'Write', file_path: '/work/proj/src/r.ts', content: 'x\n', tool_use_id: 'u9' } as any)
  await $.turn.complete({ answer: 'Ich habe r.ts angelegt.', durationMs: 5, isAborted: false, turnId: 't9', reason: 'answer' } as any)
  const r = await $.command.run({ command: 'recap', args: '' } as any)
  expect(r.text).toContain('## Rückblick')
  expect(r.text).toContain('README ergänzen')
  expect(r.text).toContain('Kosten 0,42 $')
})

test('/hours answers with the week', async ($, on) => {
  engine(on)
  await start($)
  const r = await $.command.run({ command: 'hours', args: '' } as any)
  expect(r.text).toContain('Woche')
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`the duck asks five questions, skips work, and fills the prompt (${surface})`, async ($, on) => {
    const { filled } = engine(on)
    await start($)
    const r = await $.command.run({ command: 'duck', args: '' } as any)
    expect(r.text).toContain('Ente')
    const ui: any = await $.ui.mount({ plugin: 'exo', component: 'Pane', requestId: 'exo-duck', surface, props: { title: 'Gummi-Ente', isFocused: true, bodyColumns: 70, placement: 'dock' }, viewport: { columns: 120, rows: 40 } } as any)
    expect(await all(ui)).toContain('Frage 1/5')
    await ui.input({ key: 'in0', text: 'Drei Einträge' })
    await ui.press({ key: 'skip' })
    await ui.input({ key: 'in2', text: 'TypeError: boom' })
    await ui.press({ key: 'skip' })
    await ui.input({ key: 'in4', text: 'Ja, immer' })
    expect(await all(ui)).toContain('Daraus wird dieser Prompt')
    await ui.press({ key: 'take' })
    expect(filled[0]).toContain('Erwartet: Drei Einträge')
    expect(filled[0]).toContain('TypeError: boom')
    expect(String(filled[0]).includes('Stattdessen')).toBe(false)
  })
}

test('/achievements draws the card', async ($, on) => {
  engine(on)
  await start($)
  const r = await $.command.run({ command: 'achievements', args: '' } as any)
  expect(r.text).toContain('exo · Erfolge')
  expect(r.text).toContain('Erster Schritt')
})

test('a long turn turns the spinner into coffee, with the real seconds', async ($, on) => {
  const { clock } = engine(on)
  await start($)
  await $.turn.start({ text: 'denk nach', turnId: 'tc' } as any)
  await clock.advance(61_000)
  const ui = await $.ui.mount({ plugin: 'exo', component: 'Spinner', surface: 'terminal', props: { word: 'Thinking', message: null, suffix: '…', mode: 'thinking' }, viewport: { columns: 120, rows: 40 } } as any)
  const t = await all(ui)
  expect(t).toContain('denkt nach')
})

