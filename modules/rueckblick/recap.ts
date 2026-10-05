/**
 * #10 Recap + #16 Lehren as one report.
 *
 * At session end the facts are stored, fast and without a model. At the next
 * start in the same project a "Letzte Sitzung …" band appears once (dismiss
 * button, not when older than seven days). `/recap` shows the card for the
 * running session, asks the small model for open points, and offers up to
 * three lessons for the project's CLAUDE.md: nothing is written unless ticked.
 */
import type { ModuleEnv, Step } from '../../core/dispatcher/dispatcher'
import { insideRoot } from '../../core/safepath'
import { jsonBytes } from '../../core/store/store'
import { dayKey } from './hours-logic'
import { OPEN_POINTS_SYSTEM, appendLessons, card, facts, isDuplicate, label, lessonCandidates, openPointsPrompt, parsePoints, shortLine } from './recap-logic'
import type { SessionFacts } from './recap-logic'

export const BANNER = 'exo-last'
export const WEEK_MS = 7 * 86_400_000
const SESSIONS_KEEP = 20

type Last = Record<string, { facts: SessionFacts; shown: boolean }>
type Lessons = { sessionId: string; items: string[] }

async function readLessons(env: ModuleEnv): Promise<string[]> {
  const v = (await env.store?.get('lessons').catch(() => null)) as Lessons | null
  return v && v.sessionId === env.sessionId && Array.isArray(v.items) ? v.items.filter(x => typeof x === 'string') : []
}

export function recapStep(): Step {
  return {
    id: 'recap',
    async start(env) {
      const last = ((await env.store?.get('lastSession').catch(() => null)) ?? {}) as Last
      const entry = last[env.project]
      const now = await env.host.now()
      if (!entry || entry.shown || entry.facts.sessionId === env.sessionId || now - entry.facts.endedAt > WEEK_MS) return
      await env.host.setBanner(BANNER, { id: BANNER, text: shortLine(entry.facts, now), buttons: [] })
      // once: marked shown as soon as it is up
      await env.store?.set('lastSession', { ...last, [env.project]: { ...entry, shown: true } })
    },
    async end(env) {
      const f = facts(env.journal.all(), env.sessionId, env.project, null)
      if (!f.turns && !f.files.length) return // nothing happened: nothing worth recalling
      const sessions = ((await env.store?.get('sessions').catch(() => null)) ?? []) as SessionFacts[]
      const list = [f, ...sessions.filter(s => s.sessionId !== f.sessionId)].slice(0, SESSIONS_KEEP)
      await env.store?.set('sessions', list, v => (v.length > 1 ? v.slice(0, -1) : null))
      const last = ((await env.store?.get('lastSession').catch(() => null)) ?? {}) as Last
      const next: Last = { ...last, [env.project]: { facts: f, shown: false } }
      // keep the newest projects when the budget gets tight
      await env.store?.set('lastSession', next, v => {
        const keys = Object.keys(v).sort((a, b) => v[a]!.facts.endedAt - v[b]!.facts.endedAt)
        if (keys.length <= 1) return null
        const copy = { ...v }
        delete copy[keys[0]!]
        return copy
      })
    },
  }
}

export function lessonsStep(): Step {
  return {
    id: 'lessons',
    async turnComplete(env, t) {
      if (t.reason !== 'answer') return
      const found = lessonCandidates(t.answer)
      if (!found.length) return
      const items = [...new Set([...(await readLessons(env)), ...found])].slice(-30)
      let v: Lessons = { sessionId: env.sessionId, items }
      while (jsonBytes(v) > 60_000 && v.items.length > 1) v = { ...v, items: v.items.slice(1) }
      await env.store?.set('lessons', v)
      return undefined
    },
  }
}

/** `/recap`, `/recap md`, `/recap copy`. */
export async function recapCommand(env: ModuleEnv, args: string, lessonsOn: boolean): Promise<string> {
  const sub = args.trim().toLowerCase()
  const now = await env.host.now()
  const f = facts(env.journal.all(), env.sessionId, env.project, await env.host.sessionCost().catch(() => null))
  const answers = (await env.host.messages().catch(() => []))
    .filter(m => m.role === 'assistant' && m.text.trim())
    .slice(-12)
    .map(m => m.text)
  const points = answers.length ? parsePoints(await env.host.complete(openPointsPrompt(answers), OPEN_POINTS_SYSTEM).catch(() => null)) : []
  const text = card(f, points, dayKey(now)) + (points === null ? '\n(Offene Punkte: das Modell hat nicht rechtzeitig geantwortet.)\n' : '')
  const out: string[] = [text]

  if (sub === 'md') {
    const path = `${env.project}/.exo/recap-${dayKey(now)}.md`
    if (await insideRoot(env.host, path, env.project)) {
      await env.host.writeFile(path, text)
      out.push(`Gespeichert: ${path}`)
    } else out.push(`Nicht gespeichert: ${path} liegt über einen Symlink nicht im Projekt.`)
  } else if (sub === 'copy') {
    out.push((await env.host.copy(text).catch(() => false)) ? 'In die Zwischenablage kopiert.' : 'Kopieren hat nicht geklappt.')
  }

  if (lessonsOn) out.push(await offerLessons(env, now))
  return out.filter(Boolean).join('\n')
}

async function offerLessons(env: ModuleEnv, now: number): Promise<string> {
  const target = `${env.project}/CLAUDE.md`
  const existing = (await env.host.exists(target).catch(() => false)) ? await env.host.readFile(target).catch(() => '') : null
  const fresh = (await readLessons(env)).filter(l => !isDuplicate(l, existing ?? ''))
  const offer = fresh.slice(-3)
  if (!offer.length) return ''
  if (!(await insideRoot(env.host, target, env.project))) return `Lehren: ${target} liegt über einen Symlink nicht im Projekt – nichts geschrieben.`
  const labels = offer.map(label)
  const listed = offer.map((l, i) => `${labels[i]}. ${l}`).join('\n')
  let chosen: string[] = []
  try {
    chosen = await env.host.askMany(`Welche Lehren sollen wörtlich in ${target} unter „Lehren (exo)“?\n${listed}\nNichts wird ohne Häkchen geschrieben.`, labels)
  } catch {
    return 'Lehren: nichts übernommen.'
  }
  const picked = offer.filter((_, i) => chosen.includes(labels[i]!))
  if (!picked.length) return 'Lehren: nichts übernommen.'
  await env.host.writeFile(target, appendLessons(existing, picked, dayKey(now)))
  // what is in the file now is not offered again
  const rest = (await readLessons(env)).filter(l => !picked.includes(l))
  await env.store?.set('lessons', { sessionId: env.sessionId, items: rest })
  return `Lehren: ${picked.length} in ${target} übernommen.`
}
