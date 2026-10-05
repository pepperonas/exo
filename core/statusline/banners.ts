/**
 * Actions behind the buttons of AbovePrompt banners. A banner is plain data
 * in `$.state`; what a button does lives here, keyed by banner and button.
 * After a hot reload the map is empty until modules register again, so an
 * unknown press just removes its banner.
 */
import type { Host } from '../adapter/host'

export type BannerAction = (host: Host) => Promise<void> | void

const actions = new Map<string, BannerAction>()

export const DISMISS = 'dismiss'

const key = (banner: string, button: string) => `${banner}:${button}`

export function onBanner(banner: string, button: string, action: BannerAction): void {
  actions.set(key(banner, button), action)
}

export async function pressBanner(host: Host, banner: string, button: string): Promise<void> {
  const action = actions.get(key(banner, button))
  if (button === DISMISS || !action) {
    await host.setBanner(banner, null)
    return
  }
  await action(host)
}

/** Buttons in exo's panes, by key prefix (`sel:`, `revert:`): the rest of the key is the argument. */
const paneActions = new Map<string, (host: Host, arg: string) => Promise<void> | void>()

export function onPane(prefix: string, action: (host: Host, arg: string) => Promise<void> | void): void {
  paneActions.set(prefix, action)
}

export async function pressPane(host: Host, key: string): Promise<void> {
  const cut = key.indexOf(':')
  const action = paneActions.get(key.slice(0, cut + 1))
  if (action) await action(host, key.slice(cut + 1))
}
