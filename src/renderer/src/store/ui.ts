import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface UserCardState {
  login: string
  channel: string
  x: number
  y: number
}

export type PanelTab = 'presence' | 'activity' | 'stats' | 'audience' | 'radar'

interface UiState {
  channels: string[]
  splits: string[]
  focused: number
  panelOpen: boolean
  panelTab: PanelTab
  railCollapsed: boolean
  pinned: boolean
  view: 'chat' | 'mentions'
  userCard: UserCardState | null
  settingsOpen: boolean
  /** Badge-Dex offen, optional mit vorausgewähltem Badge ("set/version") */
  dexOpen: boolean
  dexFocus: string | null
  settingsTab: string
  paletteOpen: boolean
  joinOpen: boolean
  searchOpen: Record<string, boolean>
  replyTo: { channel: string; id: string; login: string; text: string } | null

  addChannel: (c: string, asSplit?: boolean) => void
  removeChannel: (c: string) => void
  moveChannel: (from: number, to: number) => void
  showChannel: (c: string) => void
  openSplit: (c: string) => void
  closeSplit: (i: number) => void
  setFocused: (i: number) => void
  set: (p: Partial<UiState>) => void
}

export const useUi = create<UiState>()(
  persist(
    (set, get) => ({
      channels: [],
      splits: [],
      focused: 0,
      panelOpen: false,
      panelTab: 'presence',
      railCollapsed: true,
      pinned: false,
      view: 'chat',
      userCard: null,
      settingsOpen: false,
      dexOpen: false,
      dexFocus: null,
      settingsTab: 'look',
      paletteOpen: false,
      joinOpen: false,
      searchOpen: {},
      replyTo: null,

      addChannel: (raw, asSplit) => {
        const c = raw.trim().toLowerCase().replace(/^#/, '').replace(/^https?:\/\/(www\.)?twitch\.tv\//, '').split(/[/?]/)[0]
        if (!/^[a-z0-9_]{2,25}$/.test(c)) return
        const s = get()
        const channels = s.channels.includes(c) ? s.channels : [...s.channels, c]
        set({ channels, view: 'chat' })
        if (asSplit) get().openSplit(c)
        else get().showChannel(c)
      },
      removeChannel: (c) => {
        const s = get()
        const channels = s.channels.filter((x) => x !== c)
        let splits = s.splits.filter((x) => x !== c)
        if (!splits.length && channels.length) splits = [channels[0]]
        set({ channels, splits, focused: Math.min(s.focused, Math.max(0, splits.length - 1)) })
      },
      moveChannel: (from, to) => {
        const channels = [...get().channels]
        const [x] = channels.splice(from, 1)
        channels.splice(to, 0, x)
        set({ channels })
      },
      showChannel: (c) => {
        const s = get()
        const existing = s.splits.indexOf(c)
        if (existing >= 0) return set({ focused: existing, view: 'chat' })
        if (!s.splits.length) return set({ splits: [c], focused: 0, view: 'chat' })
        const splits = [...s.splits]
        splits[s.focused] = c
        set({ splits, view: 'chat' })
      },
      openSplit: (c) => {
        const s = get()
        const existing = s.splits.indexOf(c)
        if (existing >= 0) return set({ focused: existing, view: 'chat' })
        if (s.splits.length >= 4) {
          const splits = [...s.splits]
          splits[s.focused] = c
          return set({ splits, view: 'chat' })
        }
        set({ splits: [...s.splits, c], focused: s.splits.length, view: 'chat' })
      },
      closeSplit: (i) => {
        const s = get()
        if (s.splits.length <= 1) return
        const splits = s.splits.filter((_, j) => j !== i)
        set({ splits, focused: Math.min(s.focused, splits.length - 1) })
      },
      setFocused: (i) => set({ focused: i }),
      set: (p) => set(p)
    }),
    {
      name: 'lurk-ui',
      version: 2,
      // v2: Seitenleisten starten eingeklappt (Mini-Ansicht)
      migrate: (state, version) => {
        const s = state as UiState
        if (version < 2) return { ...s, panelOpen: false, railCollapsed: true }
        return s
      },
      partialize: (s) => ({
        channels: s.channels,
        splits: s.splits,
        focused: s.focused,
        panelOpen: s.panelOpen,
        panelTab: s.panelTab,
        railCollapsed: s.railCollapsed
      })
    }
  )
)

export const focusedChannel = (): string | undefined => {
  const s = useUi.getState()
  return s.splits[s.focused]
}
