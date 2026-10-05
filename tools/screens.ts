/**
 * Renders terminal captures of a real Claude Code session into PNGs for the
 * README. The captures are what `tmux capture-pane -e -p` printed while
 * Claude Code ran with exo loaded — nothing here is drawn by hand; this tool
 * only turns ANSI colours into pixels.
 *
 *   npm run screens                 # docs/screens/*.ans → docs/*.png
 *
 * Record a capture (see docs/SCREENSHOTS.md for the full session script):
 *
 *   tmux capture-pane -t exo -e -p > docs/screens/<name>.ans
 *
 * Needs Playwright's Chromium (`npx playwright install chromium`).
 */
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { chromium } from 'playwright'

const ROOT = resolve(import.meta.dirname, '..')
const DOCS = join(ROOT, 'docs')
const SRC = join(DOCS, 'screens')
const TMP = join(DOCS, '.render')

/** xterm's 16 colours, GitHub-dark flavoured. */
const BASE16 = ['#0d1117', '#ff7b72', '#3fb950', '#d29922', '#58a6ff', '#bc8cff', '#39c5cf', '#b1bac4', '#6e7681', '#ffa198', '#56d364', '#e3b341', '#79c0ff', '#d2a8ff', '#56d4dd', '#f0f6fc']

export function xterm256(n: number): string {
  if (n < 16) return BASE16[n]!
  if (n >= 232) {
    const v = 8 + (n - 232) * 10
    return `rgb(${v},${v},${v})`
  }
  const i = n - 16
  const c = (x: number) => (x === 0 ? 0 : 55 + x * 40)
  return `rgb(${c(Math.floor(i / 36))},${c(Math.floor(i / 6) % 6)},${c(i % 6)})`
}

interface Style { fg?: string; bg?: string; bold?: boolean; dim?: boolean; italic?: boolean; underline?: boolean; inverse?: boolean; strike?: boolean }

/** Applies one SGR parameter list to a style. */
export function sgr(style: Style, params: number[]): Style {
  const s = { ...style }
  if (!params.length) params = [0]
  for (let i = 0; i < params.length; i++) {
    const p = params[i]!
    if (p === 0) for (const k of Object.keys(s)) delete s[k as keyof Style]
    else if (p === 1) s.bold = true
    else if (p === 2) s.dim = true
    else if (p === 3) s.italic = true
    else if (p === 4) s.underline = true
    else if (p === 7) s.inverse = true
    else if (p === 9) s.strike = true
    else if (p === 22) s.bold = s.dim = false
    else if (p === 23) s.italic = false
    else if (p === 24) s.underline = false
    else if (p === 27) s.inverse = false
    else if (p === 29) s.strike = false
    else if (p >= 30 && p <= 37) s.fg = BASE16[p - 30]
    else if (p >= 90 && p <= 97) s.fg = BASE16[p - 90 + 8]
    else if (p === 39) delete s.fg
    else if (p >= 40 && p <= 47) s.bg = BASE16[p - 40]
    else if (p >= 100 && p <= 107) s.bg = BASE16[p - 100 + 8]
    else if (p === 49) delete s.bg
    else if ((p === 38 || p === 48) && params[i + 1] === 5) {
      s[p === 38 ? 'fg' : 'bg'] = xterm256(params[i + 2] ?? 0)
      i += 2
    } else if ((p === 38 || p === 48) && params[i + 1] === 2) {
      s[p === 38 ? 'fg' : 'bg'] = `rgb(${params[i + 2] ?? 0},${params[i + 3] ?? 0},${params[i + 4] ?? 0})`
      i += 4
    }
  }
  return s
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function css(s: Style): string {
  let fg = s.fg
  let bg = s.bg
  if (s.inverse) [fg, bg] = [bg ?? '#0d1117', fg ?? '#e6edf3']
  const out: string[] = []
  if (fg) out.push(`color:${fg}`)
  if (bg) out.push(`background:${bg}`)
  if (s.bold) out.push('font-weight:700')
  if (s.dim) out.push('opacity:.6')
  if (s.italic) out.push('font-style:italic')
  const deco = [s.underline && 'underline', s.strike && 'line-through'].filter(Boolean)
  if (deco.length) out.push(`text-decoration:${deco.join(' ')}`)
  return out.join(';')
}

/** ANSI text (SGR only, as tmux prints it) → HTML spans. Other escapes are dropped. */
export function ansiToHtml(text: string): string {
  let style: Style = {}
  let out = ''
  const re = /\x1b\[([0-9;:]*)([A-Za-z])|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][A-Za-z0-9]|([^\x1b]+)/g
  for (const m of text.matchAll(re)) {
    if (m[3] !== undefined) {
      const c = css(style)
      out += c ? `<span style="${c}">${esc(m[3])}</span>` : esc(m[3])
    } else if (m[2] === 'm') {
      style = sgr(style, m[1] ? m[1].split(/[;:]/).map(x => Number(x) || 0) : [])
    }
  }
  return out
}

/** Drops trailing blank lines so the frame hugs the content. */
export function trimCapture(text: string): string {
  const lines = text.replace(/\r/g, '').split('\n')
  const visible = (l: string) => l.replace(/\x1b\[[0-9;:]*[A-Za-z]/g, '').trim() !== ''
  while (lines.length && !visible(lines[lines.length - 1]!)) lines.pop()
  return lines.join('\n')
}

function page(title: string, body: string): string {
  return `<!doctype html><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:transparent;padding:24px;display:inline-block}
.term{background:#0d1117;border:1px solid #30363d;border-radius:12px;box-shadow:0 18px 50px rgba(0,0,0,.45);overflow:hidden}
.bar{height:34px;background:#161b22;border-bottom:1px solid #30363d;display:flex;align-items:center;padding:0 14px;gap:8px}
.dot{width:12px;height:12px;border-radius:50%}
.title{flex:1;text-align:center;color:#8b949e;font:13px -apple-system,"Segoe UI",sans-serif;margin-right:52px}
pre{padding:16px 20px;color:#e6edf3;font:14.5px/1.45 "SF Mono",Menlo,"JetBrains Mono",monospace;white-space:pre}
</style><body><div class="term"><div class="bar"><span class="dot" style="background:#ff5f57"></span><span class="dot" style="background:#febc2e"></span><span class="dot" style="background:#28c840"></span><span class="title">${esc(title)}</span></div><pre>${body}</pre></div></body>`
}

async function main() {
  mkdirSync(TMP, { recursive: true })
  const captures = readdirSync(SRC).filter(f => f.endsWith('.ans')).sort()
  const browser = await chromium.launch()
  const pg = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 1400, height: 900 } })
  for (const f of captures) {
    const name = basename(f, '.ans')
    const html = page('claude — shop-api', ansiToHtml(trimCapture(readFileSync(join(SRC, f), 'utf8'))))
    const file = join(TMP, `${name}.html`)
    writeFileSync(file, html)
    await pg.goto(`file://${file}`)
    await pg.locator('body').screenshot({ path: join(DOCS, `${name}.png`), omitBackground: true })
    console.log(`docs/${name}.png`)
  }
  await browser.close()
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) await main()
