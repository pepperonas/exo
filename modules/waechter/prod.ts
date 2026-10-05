/**
 * #1 Prod shield: commands against production are put to the person before
 * they run, with the house rules checked first. A seatbelt, not a sandbox:
 * a deliberately disguised command is not recognised.
 */
import type { CallCtx, Step } from '../../core/dispatcher/dispatcher'
import { KILL_HINT } from '../../core/killswitch'
import { redact } from './secrets-logic'
import { checkArgv, dryRun, inspect, needsBranch, parseSshConfig, pipedSql, prodIndex, rulesFor } from './prod-logic'
import type { Finding } from './prod-logic'

export const RUN = 'Run'
export const CANCEL = 'Cancel'
export const DRY = 'Dry run'

const SSH_CONFIG_TTL = 60_000
const CHECK_TIMEOUT = 10_000
const SHOWN = 240

type CheckResult = { state: 'blocked' | 'ok' | 'unknown'; text: string }

export function prodStep(): Step {
  let ssh: { at: number; map: Map<string, string> } | undefined

  async function sshMap(ctx: CallCtx): Promise<Map<string, string>> {
    const now = Date.now()
    if (ssh && now - ssh.at < SSH_CONFIG_TTL) return ssh.map
    let map = new Map<string, string>()
    if (ctx.home) {
      try {
        map = parseSshConfig(await ctx.untimed(ctx.host.readFile(`${ctx.home}/.ssh/config`)))
      } catch {
        // no ssh config: names and addresses from prodHosts still count
      }
    }
    ssh = { at: now, map }
    return map
  }

  async function check(ctx: CallCtx, argv: string[], blockWhen: 'exit0' | 'exitNonZero', text: string): Promise<CheckResult> {
    try {
      const r = await ctx.untimed(ctx.host.run(argv, { timeoutMs: CHECK_TIMEOUT }))
      // ssh reports its own failure as 255: then nothing is known about the host
      if (argv[0] === 'ssh' && r.exitCode === 255) return { state: 'unknown', text: `${text} (check not possible: ssh failed)` }
      const blocked = blockWhen === 'exit0' ? r.exitCode === 0 : r.exitCode !== 0
      return { state: blocked ? 'blocked' : 'ok', text }
    } catch (err) {
      return { state: 'unknown', text: `${text} (check not possible: ${(err as Error).message.slice(0, 60)})` }
    }
  }

  return {
    id: 'prodShield',
    async before(ctx) {
      if (ctx.call.tool !== 'Bash') return
      const raw = String(ctx.call.input.command ?? '')
      const index = prodIndex(ctx.config.prodHosts, await sshMap(ctx))

      if (!ctx.parsed?.ok) {
        // unreadable, but names a prod host: ask instead of waving it through
        const named = [...index.keys()].find(k => new RegExp(`(^|[^A-Za-z0-9.-])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Za-z0-9.-]|$)`, 'i').test(raw))
        if (!named) return
        return decide(ctx, raw, [{ kind: 'remote', host: index.get(named), what: `unreadable command referring to ${index.get(named)!.name}`, subject: raw }], [], null)
      }

      let branch: string | null = null
      if (needsBranch(ctx.cmds)) {
        try {
          const r = await ctx.untimed(ctx.host.run(['git', '-C', ctx.cmdCwd.cwd, 'rev-parse', '--abbrev-ref', 'HEAD'], { timeoutMs: 5000 }))
          branch = r.exitCode === 0 ? r.stdout.trim() : null
        } catch {
          branch = null
        }
        // unknown branch on a bare force push: assume the worst
        if (branch === null) branch = 'main'
      }
      const findings = [...inspect(ctx.cmds, index, branch), ...pipedSql(ctx.cmds)]
      if (!findings.length) return

      const results: CheckResult[] = []
      for (const { rule, host } of rulesFor(findings, ctx.rules, raw)) results.push(await check(ctx, checkArgv(rule, host), rule.blockWhen, rule.text))
      const blocked = results.filter(r => r.state === 'blocked')
      if (blocked.length) return { deny: `exo/prod shield: house rule violated – not run.\n${blocked.map(b => `  ✋ ${b.text}`).join('\n')}` }

      return decide(ctx, raw, findings, results, dryRun(raw, findings))
    },
  }
}

async function decide(ctx: CallCtx, raw: string, findings: Finding[], results: CheckResult[], dry: string | null) {
  const whats = [...new Set(findings.map(f => f.what))]
  if (!ctx.interactive) return { deny: `exo/prod shield: ${whats.join('; ')} – not run without a dialog. ${KILL_HINT}` }
  const shown = redact(raw).replace(/\s+/g, ' ')
  const notes = results.map(r => `${r.state === 'unknown' ? '?' : '✓'} ${r.text}`)
  const question = [`Prod shield: ${whats.join('; ')}`, `Command: ${shown.length > SHOWN ? shown.slice(0, SHOWN) + '…' : shown}`, ...notes, 'Run?'].join('\n')
  const options = dry ? [RUN, CANCEL, DRY] : [RUN, CANCEL]
  let answer = CANCEL
  try {
    answer = await ctx.untimed(ctx.host.ask(question, options))
  } catch {
    answer = CANCEL // Esc
  }
  if (answer === RUN) {
    ctx.notes.push(`exo/prod shield: confirmed by the human (${whats.join('; ')}).`)
    return
  }
  if (answer === DRY && dry) {
    ctx.notes.push('exo/prod shield: run as a dry run on request, not for real.')
    return { input: { ...ctx.call.input, command: dry } }
  }
  return { deny: `exo/prod shield: cancelled by the human (${whats.join('; ')}).` }
}
