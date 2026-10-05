/**
 * `/exo`: status of every module, switches, kill switch, rules.
 *
 *   /exo                 status table
 *   /exo on | off        everything on / off
 *   /exo on|off <modul>  one module
 *   /exo reset <modul>   clear the broken mark
 *   /exo rules           house rules in force
 *   /exo help
 */
import type { Host } from './adapter/host'
import { MODULES, isModuleId } from './config/config'
import type { ModuleId } from './config/config'
import type { HealthKey } from './health/health'
import { L } from './i18n'
import { KILL_HINT, exoDir } from './killswitch'
import { killReason, refreshLiveness, rulesPath, setPrefs } from './runtime'
import type { Runtime } from './runtime'

const pad = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length))
const ms = (n: number) => (n < 10 ? n.toFixed(1) : String(Math.round(n)))

function clock(at: number): string {
  const d = new Date(at)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export async function statusText(rt: Runtime, host: Host): Promise<string> {
  const killed = await killReason(rt, host)
  const snap = rt.health.snapshot()
  const lines: string[] = []
  lines.push(killed ? `exo ist AUS (${killed}).` : 'exo ist an.')
  lines.push('')
  lines.push(`${pad('Modul', 24)}${pad('Zustand', 10)}${pad('Aufrufe', 9)}${pad('Ø ms', 7)}${pad('max ms', 8)}letzter Fehler`)
  for (const m of MODULES) {
    const h = snap[m.id]
    const state = h?.broken ? L.brokenState : rt.config.enabled[m.id] && !killed ? L.on : L.off
    const avg = h && h.calls ? ms(h.totalMs / h.calls) : '–'
    const err = h?.lastError ? `${clock(h.lastError.at)} ${h.lastError.message}` : ''
    lines.push(`${pad(`${m.label} (${m.id})`, 24)}${pad(state, 10)}${pad(String(h?.calls ?? 0), 9)}${pad(avg, 7)}${pad(h ? ms(h.maxMs) : '–', 8)}${err}`)
  }
  const core = snap.core
  if (core?.budgetHits) lines.push(`Zeitbudget (50 ms) überschritten: ${core.budgetHits}×`)
  lines.push('')
  lines.push(`Journal: ${rt.journal.size()} Ereignisse · Sitzung ${rt.journal.sessionId || '–'}`)
  lines.push(`Konfiguration: ${rt.home ? exoDir(rt.home) : '~/.claude/exo'} · Optionen in /config (exo)`)
  lines.push(`Prod-Hosts: ${rt.config.prodHosts.length ? rt.config.prodHosts.map(h => h.name).join(', ') : 'keine (Schild nur für SQL und Force-Push)'}`)
  lines.push(`Hausregeln: ${rt.rules.rules.length} aktiv (${rt.rules.source === 'file' ? 'rules.json' : rt.rules.source === 'default' ? 'eingebaut' : 'eingebaut, rules.json fehlerhaft'})`)
  const warnings = [...rt.rules.errors, ...rt.config.errors, ...rt.store.warnings]
  if (warnings.length) {
    lines.push('')
    lines.push('Warnungen:')
    for (const w of warnings) lines.push(`  ⚠ ${w}`)
  }
  lines.push('')
  lines.push(KILL_HINT)
  return lines.join('\n')
}

export function helpText(): string {
  return [
    'Befehle:',
    '  /exo                  Zustand aller Module',
    '  /exo on | off         alles an / aus',
    '  /exo on|off <modul>   ein Modul schalten',
    '  /exo reset <modul>    Störungsmarke löschen',
    '  /exo rules            geladene Hausregeln',
    `Module: ${MODULES.map(m => m.id).join(', ')}`,
    KILL_HINT,
  ].join('\n')
}

export async function exoCommand(rt: Runtime, host: Host, args: string): Promise<string> {
  const [cmd = '', arg = ''] = args.trim().split(/\s+/)
  const sub = cmd.toLowerCase()

  if (sub === '' || sub === 'status') return statusText(rt, host)
  if (sub === 'help' || sub === 'hilfe') return helpText()

  if (sub === 'on' || sub === 'off' || sub === 'an' || sub === 'aus') {
    const value = sub === 'on' || sub === 'an'
    if (!arg) {
      await setPrefs(rt, { allOff: !value, modules: value ? {} : rt.prefs.modules })
      await refreshLiveness(rt, host)
      return value ? 'exo: alle Module an.' : `exo: alle Module aus. Wieder an mit /exo on.`
    }
    if (!isModuleId(arg)) return L.unknownModule(arg)
    await setPrefs(rt, { ...rt.prefs, modules: { ...rt.prefs.modules, [arg]: value } })
    await refreshLiveness(rt, host)
    const info = MODULES.find(m => m.id === arg)!
    return `exo: ${info.label} ${value ? L.on : L.off}.${rt.prefs.allOff && value ? ' (Achtung: /exo off ist aktiv – erst /exo on)' : ''}`
  }

  if (sub === 'reset') {
    if (!isModuleId(arg) && arg !== 'core') return L.unknownModule(arg)
    rt.health.reset(arg as HealthKey)
    await refreshLiveness(rt, host)
    return `exo: Störungsmarke von ${arg} gelöscht.`
  }

  if (sub === 'rules' || sub === 'regeln') {
    const lines = [`Hausregeln (${rt.home ? rulesPath(rt.home) : 'rules.json'}):`]
    for (const r of rt.rules.rules) lines.push(`  ${r.id}: ${r.match.source} auf ${r.hosts.join(', ')} → prüft „${r.check.join(' ')}“ · ${r.text}`)
    if (!rt.rules.rules.length) lines.push('  keine')
    for (const e of rt.rules.errors) lines.push(`  ⚠ ${e}`)
    return lines.join('\n')
  }

  return helpText()
}

export type { ModuleId }
