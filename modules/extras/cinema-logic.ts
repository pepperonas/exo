/**
 * #19 Spinner-Kino, the pure part: which activity is running, and the frame
 * of its little film. Frames are data (style packs), a frame changes every
 * FRAME_MS whatever the redraw rate.
 */

export type Activity = 'install' | 'build' | 'deploy' | 'search' | 'test' | 'coffee'

export const FRAME_MS = 140
export const COFFEE_AFTER_MS = 60_000

export interface Running {
  tool: string
  summary: string
  since: number
}

const RULES: [Activity, RegExp][] = [
  ['test', /\b(npm|pnpm|yarn|bun) (test|run test)|\b(vitest|jest|pytest|mocha)\b|\bcargo test|\bgo test|\bnode\b.*--test|\bgradlew? test/],
  ['install', /\b(npm|pnpm|yarn|bun) (install|i|add|ci)\b|\bpip3? install|\bbrew install|\bcargo install|\bpoetry install|\buv (sync|pip)|\bapt(-get)? install|\bgem install|\bbundle install/],
  ['build', /\b(npm|pnpm|yarn|bun) (run )?build|\btsc\b|\bcargo build|\bgo build|\bmake\b|\bgradlew? (build|assemble)|\bdocker build|\bvite build/],
  ['deploy', /\b(rsync|scp|sftp)\b|\bssh:|\bssh\b|\bgit push|\bdocker push|\bdeploy|\bkubectl apply|\bfly deploy|\bvercel\b/],
  ['search', /\b(grep|rg|ag|ack|find|fd|locate)\b/],
]

export function classify(running: Running | null, turnMs: number | null): Activity | null {
  if (running) {
    if (running.tool === 'Grep' || running.tool === 'Glob' || running.tool === 'WebSearch' || running.tool === 'WebFetch') return 'search'
    if (running.tool === 'Bash') for (const [a, re] of RULES) if (re.test(running.summary)) return a
  }
  if (turnMs !== null && turnMs >= COFFEE_AFTER_MS) return 'coffee'
  return null
}

export type Pack = Record<Activity, readonly string[]>

export const PACKS: Record<'klassisch' | 'ascii', Pack> = {
  klassisch: {
    install: ['🚜 ▁▁▁', '🚜 ▂▁▁', '🚜 ▃▂▁', '🚜 ▅▃▂', '🚜 ▇▅▃', '🚜 ▅▇▅', '🚜 ▃▅▇'],
    build: ['🔨 ▖', '🔨 ▘', '🔨 ▝', '🔨 ▗'],
    deploy: ['🚀     ', ' 🚀    ', '  🚀   ', '   🚀  ', '    🚀 ', '     🚀'],
    search: ['🕵 🔍·  ', '🕵  🔍· ', '🕵   🔍·', '🕵  🔍· '],
    test: ['🧪 ●○○', '🧪 ○●○', '🧪 ○○●', '🧪 ○●○'],
    coffee: ['☕ ~  ', '☕ ~~ ', '☕ ~~~', '☕  ~~', '☕   ~'],
  },
  ascii: {
    install: ['[=   ]', '[==  ]', '[=== ]', '[====]', '[ ===]', '[  ==]', '[   =]'],
    build: ['[|]', '[/]', '[-]', '[\\]'],
    deploy: ['>    ', ' >   ', '  >  ', '   > ', '    >'],
    search: ['(o)  ', ' (o) ', '  (o)', ' (o) '],
    test: ['[*..]', '[.*.]', '[..*]', '[.*.]'],
    coffee: ['c[_] ~', 'c[_]~ ', 'c[_]  '],
  },
}

export const LABEL: Record<Activity, string> = { install: 'baut ein', build: 'baut', deploy: 'liefert aus', search: 'sucht', test: 'testet', coffee: 'denkt nach' }

export function frame(pack: Pack, a: Activity, elapsedMs: number, still: boolean): string {
  const f = pack[a]
  return still ? f[0]! : f[Math.floor(elapsedMs / FRAME_MS) % f.length]!
}

const secs = (ms: number) => `${Math.max(0, Math.floor(ms / 1000))}s`

/** The spinner message: film + real facts, cut to `columns`. */
export function message(a: Activity, running: Running | null, now: number, turnStart: number | null, opts: { ascii: boolean; still: boolean; columns: number }): string {
  const pack = opts.ascii ? PACKS.ascii : PACKS.klassisch
  const since = running ? running.since : (turnStart ?? now)
  const what = running ? (running.tool === 'Bash' ? running.summary : running.tool) : 'Turn'
  const text = `${frame(pack, a, now - since, opts.still)} ${LABEL[a]}: ${what} · ${secs(now - since)}`
  const room = Math.max(10, opts.columns - 30)
  return text.length > room ? text.slice(0, room - 1) + '…' : text
}
