/**
 * Texts of the interface. German only for now; `T.en` can be added with the
 * same keys later.
 */
export type Lang = 'de'

export const T = {
  de: {
    liveness: '⛨ exo',
    broken: (n: number) => `⚠ ${n} gestört`,
    killed: (why: string) => `⛨ exo aus (${why})`,
    on: 'an',
    off: 'aus',
    brokenState: 'gestört',
    rulesWarning: 'exo: rules.json fehlerhaft – Details mit /exo',
    unknownModule: (m: string) => `Unbekanntes Modul: ${m}. /exo zeigt alle.`,
    dismiss: 'Schließen',
  },
} as const

export const L = T.de
