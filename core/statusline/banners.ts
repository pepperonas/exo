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
