/**
 * Renders the social card (docs/social.png, 1280×640) and the listing icon
 * (.claude-plugin/icon.png, 512×512, plus docs/icon.svg).
 *
 *   npm run social
 *
 * The terminal lines on the card use the mod's own texts (liveness slot,
 * test light, CI light, spinner cinema), so the card shows what exo draws.
 * Needs Playwright's Chromium (`npx playwright install chromium`).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { chromium } from 'playwright'

import { L } from '../core/i18n'
import { LABEL, PACKS } from '../modules/extras/cinema-logic'
import { hm } from '../modules/rueckblick/hours-logic'

const ROOT = resolve(import.meta.dirname, '..')
const DOCS = join(ROOT, 'docs')
const TMP = join(DOCS, '.render')

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** The exo mark: an exoskeleton plate (shield) around a core. */
export const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<defs>
<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8be9fd"/><stop offset=".55" stop-color="#7b4dff"/><stop offset="1" stop-color="#d97757"/></linearGradient>
<radialGradient id="c" cx=".5" cy=".45" r=".5"><stop offset="0" stop-color="#ffd27a"/><stop offset="1" stop-color="#d97757"/></radialGradient>
</defs>
<rect width="512" height="512" rx="112" fill="#0b0e14"/>
<path d="M256 70 L410 128 V250 C410 352 342 418 256 446 C170 418 102 352 102 250 V128 Z" fill="none" stroke="url(#g)" stroke-width="34" stroke-linejoin="round"/>
<path d="M256 150 L340 182 V252 C340 310 304 348 256 366 C208 348 172 310 172 252 V182 Z" fill="none" stroke="url(#g)" stroke-width="18" stroke-linejoin="round" opacity=".55"/>
<circle cx="256" cy="258" r="44" fill="url(#c)"/>
</svg>`

function card(): string {
  const status = [
    `<span class="acc">${esc(L.liveness)}</span>`,
    `<span class="ok">● 48/48</span>`,
    `<span class="ok">● CI green</span>`,
    `<span class="dim">⏱ ${hm(3 * 3600 + 12 * 60)} today</span>`,
  ].join('<span class="dim"> · </span>')
  const spinner = `${PACKS.classic.install[0]} ${LABEL.install} <span class="dim">npm install</span>`
  return `<!doctype html><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
body{width:1280px;height:640px;overflow:hidden;font-family:-apple-system,"SF Pro Display","Segoe UI",sans-serif;color:#e6edf3;
background:radial-gradient(1100px 600px at 90% -15%,#2b1d4a 0%,transparent 60%),radial-gradient(900px 520px at -10% 115%,#3a1f12 0%,transparent 55%),#0b0e14}
.wrap{position:absolute;inset:0;padding:60px 72px;display:flex;flex-direction:column}
.kicker{font-size:22px;letter-spacing:.18em;text-transform:uppercase;color:#8b949e;font-weight:600}
h1{font-size:104px;line-height:1;margin:12px 0 10px;font-weight:800;letter-spacing:-.03em;display:flex;align-items:center;gap:22px}
h1 img{width:96px;height:96px}
h1 span{background:linear-gradient(90deg,#8be9fd,#7b4dff 55%,#d97757);-webkit-background-clip:text;background-clip:text;color:transparent}
p{font-size:29px;color:#c9d1d9;max-width:1060px;line-height:1.3}
.chips{display:flex;gap:12px;margin-top:22px}
.chip{font-size:20px;padding:8px 16px;border-radius:999px;border:1px solid #30363d;background:#161b22cc;color:#c9d1d9}
.chip b{color:#e6edf3}
.term{margin-top:auto;background:#0d1117ee;border:1px solid #30363d;border-radius:14px;padding:18px 26px;font-family:"SF Mono",Menlo,monospace;font-size:20px;white-space:pre;line-height:1.65;box-shadow:0 20px 60px rgba(0,0,0,.5)}
.dim{color:#8b949e}.ok{color:#3fb950}.acc{color:#d2a8ff}.warn{color:#f0b429}.bad{color:#f85149}
.foot{position:absolute;right:72px;top:66px;font-size:20px;color:#8b949e;text-align:right;line-height:1.5}
.foot b{color:#e6edf3}
</style><body><div class="wrap">
<div class="kicker">Claude Code mod</div>
<h1><img src="icon.svg" alt=""><span>exo</span></h1>
<p>An exoskeleton for Claude Code: guards against costly mistakes, a cockpit while you work, a recap at the end.</p>
<div class="chips"><div class="chip">🛡 <b>Guards</b> secrets · prod · undo</div><div class="chip">🧭 <b>Cockpit</b> tests · CI · diff</div><div class="chip">🔁 <b>Review</b> recap · hours</div><div class="chip">🎉 <b>Extras</b></div></div>
<div class="term"><span class="warn">⛨ Prod shield:</span> systemctl restart nginx on <b>web</b>  <span class="dim">[Run] [Cancel] [Dry run]</span>
<span class="bad">✗ exo/secret guard:</span> possible secret found <span class="dim">(sk-ant-…a1b2)</span> – not run.
${spinner}
${status}</div>
</div><div class="foot"><b>github.com/pepperonas/exo</b><br>MIT · celox.io</div></body>`
}

async function main() {
  mkdirSync(TMP, { recursive: true })
  writeFileSync(join(DOCS, 'icon.svg'), ICON_SVG)
  writeFileSync(join(TMP, 'icon.svg'), ICON_SVG)
  writeFileSync(join(TMP, 'social.html'), card())
  writeFileSync(join(TMP, 'icon.html'), `<!doctype html><style>*{margin:0}body{width:512px;height:512px;background:transparent}</style><img src="icon.svg" width="512" height="512">`)
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 640 }, deviceScaleFactor: 1 })
  await page.goto(`file://${join(TMP, 'social.html')}`)
  await page.screenshot({ path: join(DOCS, 'social.png') })
  const icon = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 })
  await icon.goto(`file://${join(TMP, 'icon.html')}`)
  await icon.screenshot({ path: join(ROOT, '.claude-plugin', 'icon.png'), omitBackground: true })
  await browser.close()
  console.log('docs/social.png docs/icon.svg .claude-plugin/icon.png')
}

await main()
