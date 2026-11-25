import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Keyword {
  id: string
  pattern: string
  color: string
  sound: boolean
}

export interface Settings {
  language: 'en' | 'de'
  theme: 'dark' | 'light'
  accent: 'periwinkle' | 'mint' | 'rose' | 'amber' | 'sky'
  density: 'compact' | 'cozy'
  fontSize: number
  timestamps: boolean
  timestampSeconds: boolean
  showBadges: boolean
  thirdPartyEmotes: boolean
  inlineJoins: boolean
  alternateRows: boolean
  deletedMode: 'strike' | 'hide'
  highlightFirst: boolean
  highlightMentions: boolean
  mentionSound: boolean
  joinSound: boolean
  soundVolume: number
  desktopNotify: boolean
  pauseOnHover: boolean
  maxMessages: number
  showHistory: boolean
  keywords: Keyword[]
  watchUsers: string[]
  ignoredUsers: string[]
  ignoredPhrases: string[]
  notes: Record<string, string>
  set: (p: Partial<Omit<Settings, 'set' | 'toggleList' | 'setNote'>>) => void
  toggleList: (key: 'watchUsers' | 'ignoredUsers' | 'ignoredPhrases', value: string) => void
  setNote: (login: string, note: string) => void
}

export const useSettings = create<Settings>()(
  persist(
    (set, get) => ({
      language: 'en',
      theme: 'dark',
      accent: 'periwinkle',
      density: 'cozy',
      fontSize: 14,
      timestamps: true,
      timestampSeconds: false,
      showBadges: true,
      thirdPartyEmotes: true,
      inlineJoins: false,
      alternateRows: false,
      deletedMode: 'strike',
      highlightFirst: true,
      highlightMentions: true,
      mentionSound: true,
      joinSound: true,
      soundVolume: 0.6,
      desktopNotify: true,
      pauseOnHover: true,
      maxMessages: 1500,
      showHistory: true,
      keywords: [],
      watchUsers: [],
      ignoredUsers: [],
      ignoredPhrases: [],
      notes: {},
      set: (p) => set(p),
      toggleList: (key, value) => {
        const v = value.trim().toLowerCase()
        if (!v) return
        const list = get()[key]
        set({ [key]: list.includes(v) ? list.filter((x) => x !== v) : [...list, v] } as Partial<Settings>)
      },
      setNote: (login, note) => {
        const notes = { ...get().notes }
        if (note.trim()) notes[login] = note
        else delete notes[login]
        set({ notes })
      }
    }),
    { name: 'lurk-settings', version: 1 }
  )
)
