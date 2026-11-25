import { create } from 'zustand'
import type { ActivityEntry, ChannelStats, ChatMessage, MeInChannel, PresenceUser, RoomState, StreamInfo } from '@/lib/types'
import type { ConnState } from '@/lib/irc'

export interface ChannelState {
  name: string
  joined: boolean
  messages: ChatMessage[]
  /** Wird aus Performance-Gründen direkt verändert – auf presenceVersion hören, nicht auf das Objekt */
  presence: Record<string, PresenceUser>
  presenceVersion: number
  presentCount: number
  /** true, sobald Twitch die NAMES-Liste geschickt hat */
  namesReceived: boolean
  activity: ActivityEntry[]
  room: RoomState
  info: StreamInfo
  /** Wird direkt verändert – auf statsVersion hören */
  stats: ChannelStats
  statsVersion: number
  me: MeInChannel
  unread: number
  mentions: number
  helixPresence: boolean
}

export const emptyStats = (): ChannelStats => ({
  buckets: new Array(30).fill(0),
  bucketStart: Math.floor(Date.now() / 60000) - 29,
  total: 0,
  chatters: {},
  emotes: {},
  firstTimers: 0
})

export const emptyChannel = (name: string): ChannelState => ({
  name,
  joined: false,
  messages: [],
  presence: {},
  presenceVersion: 0,
  presentCount: 0,
  namesReceived: false,
  activity: [],
  room: {},
  info: { live: false },
  stats: emptyStats(),
  statsVersion: 0,
  me: { mod: false, broadcaster: false, vip: false, badges: [] },
  unread: 0,
  mentions: 0,
  helixPresence: false
})

interface ChatStore {
  conn: ConnState
  connInfo?: string
  channels: Record<string, ChannelState>
  mentions: ChatMessage[]
  emoteVersion: number
  windowFocused: boolean
  myColor?: string
  myDisplayName?: string
}

export const useChat = create<ChatStore>()(() => ({
  conn: 'disconnected',
  channels: {},
  mentions: [],
  emoteVersion: 0,
  windowFocused: true
}))

export const getChannel = (c: string): ChannelState | undefined => useChat.getState().channels[c]
