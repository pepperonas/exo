/**
 * Texts of the interface. English only for now; another language can be
 * added as a second key of `T` with the same entries.
 */
export type Lang = 'en'

export const T = {
  en: {
    liveness: '⛨ exo',
    broken: (n: number) => `⚠ ${n} broken`,
    killed: (why: string) => `⛨ exo off (${why})`,
    on: 'on',
    off: 'off',
    brokenState: 'broken',
    rulesWarning: 'exo: rules.json has errors – details with /exo',
    unknownModule: (m: string) => `Unknown module: ${m}. /exo lists them all.`,
    dismiss: 'Close',
  },
} as const

export const L = T.en
