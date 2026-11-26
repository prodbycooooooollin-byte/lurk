import type { RadarReason } from './modradar'

export interface BadgeRef {
  set: string
  version: string
}

export interface TwitchEmoteRef {
  id: string
  start: number
  end: number
}

export type HighlightKind = 'mention' | 'first' | 'keyword' | 'watch' | 'returning' | 'self' | null

export interface ChatMessage {
  id: string
  kind: 'chat' | 'action' | 'usernotice' | 'notice' | 'system' | 'joins'
  channel: string
  ts: number
  login?: string
  displayName?: string
  color?: string
  badges: BadgeRef[]
  text: string
  twitchEmotes: TwitchEmoteRef[]
  roomId?: string
  userId?: string
  deleted?: boolean
  timeoutInfo?: string
  historical?: boolean
  highlight?: HighlightKind
  highlightColor?: string
  reply?: { id: string; login: string; displayName: string; text: string }
  /** Systemtext (Sub, Raid, Notice …) */
  systemText?: string
  noticeType?: string
  /** Bild neben einer Systemzeile (z. B. 7TV-Emote hinzugefügt) */
  emoteUrl?: string
  joins?: { login: string; part?: boolean }[]
  bits?: number
  self?: boolean
  /** Raid: so viele Zuschauer kamen mit */
  raidViewers?: number
  /** vom Mod-Radar markiert: warum */
  radar?: RadarReason[]
}

export interface PresenceUser {
  login: string
  displayName?: string
  color?: string
  /** null = war schon beim Verbinden da (NAMES-Liste) */
  joinedAt: number | null
  leftAt?: number
  present: boolean
  msgCount: number
  firstMsgAt?: number
  lastMsgAt?: number
  badges?: BadgeRef[]
}

export interface ActivityEntry {
  id: number
  type: 'join' | 'part'
  login: string
  at: number
}

export interface RoomState {
  roomId?: string
  slow?: number
  subsOnly?: boolean
  emoteOnly?: boolean
  followersOnly?: number // -1 = aus
  r9k?: boolean
}

export interface StreamInfo {
  displayName?: string
  avatar?: string
  live: boolean
  title?: string
  game?: string
  viewers?: number
  startedAt?: string
  followers?: number
  /** Leute im Chat laut Twitch – sofort da, auch für Lurker, die Twitch einem Gast nicht meldet */
  chatters?: number
}

export interface ChannelStats {
  /** Nachrichten pro Minute, Ring der letzten 30 Minuten */
  buckets: number[]
  bucketStart: number
  total: number
  chatters: Record<string, number>
  emotes: Record<string, number>
  firstTimers: number
}

export interface MeInChannel {
  mod: boolean
  broadcaster: boolean
  vip: boolean
  color?: string
  badges: BadgeRef[]
  displayName?: string
}
