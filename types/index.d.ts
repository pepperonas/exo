export type Slot = {
  id: string
  order: number
  priority: number
  text: string
  color?: string
  dim?: boolean
  bold?: boolean
}

export type BannerButton = { key: string; label: string }

export type Banner = {
  id: string
  text: string
  tone?: 'info' | 'warn'
  buttons: BannerButton[]
}

export type ChangeRow = { path: string; added: number; removed: number; isNew: boolean }

declare module 'claude-code' {
  interface PluginState {
    exo: {
      slots: Record<string, Slot>
      banners: Banner[]
      killed: string | null
      changes: ChangeRow[]
      selected: string | null
      diff: string
    }
  }
}
