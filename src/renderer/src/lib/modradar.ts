// Mod-Radar: bewertet jede neue Nachricht in Kanälen, in denen du moderierst, nach Signalen,
// die zusammen auf Spam, Bots oder Ban-Umgehung deuten. Einzelne harmlose Signale (z. B. nur
// "erste Nachricht") reichen nicht – erst Kombinationen oder starke Signale landen im Radar.
// Alles läuft lokal aus dem, was Lurk ohnehin sieht; nichts wird irgendwohin geschickt.
import { create } from 'zustand'
import { getMeta, requestMeta } from './avatars'
import { isBot } from './bots'
import { lookalikeOf } from './lookalike'
import { useChat } from '@/store/chat'
import { useSettings } from '@/store/settings'
import type { ChatMessage } from './types'

export type RadarReason =
  | { k: 'firstMsg' }
  | { k: 'newAccount'; days: number }
  | { k: 'link' }
  | { k: 'crossChannel'; channels: string[] }
  | { k: 'wave'; users: number }
  | { k: 'massMention'; n: number }
  | { k: 'lookalike'; of: string }
  | { k: 'bannedElsewhere'; channel: string; ts: number; dur?: number }

export interface RadarItem {
  id: string
  channel: string
  login: string
  displayName: string
  text: string
  ts: number
  reasons: RadarReason[]
  createdAt?: string
  /** was du damit gemacht hast */
  handled?: 'ok' | 'deleted' | 'timeout' | 'ban'
}

interface RadarState {
  items: Record<string, RadarItem[]>
  add: (item: RadarItem) => void
  mark: (channel: string, id: string, handled: RadarItem['handled']) => void
  clear: (channel: string) => void
}

export const useRadar = create<RadarState>()((set) => ({
  items: {},
  add: (item) =>
    set((s) => ({ items: { ...s.items, [item.channel]: [item, ...(s.items[item.channel] ?? [])].slice(0, 200) } })),
  mark: (channel, id, handled) =>
    set((s) => ({ items: { ...s.items, [channel]: (s.items[channel] ?? []).map((i) => (i.id === id ? { ...i, handled } : i)) } })),
  clear: (channel) => set((s) => ({ items: { ...s.items, [channel]: [] } }))
}))

const STRONG = new Set<RadarReason['k']>(['crossChannel', 'wave', 'lookalike', 'bannedElsewhere'])
const NEW_ACCOUNT_DAYS = 7
const LINK = /(https?:\/\/|www\.)\S+|\b[a-z0-9-]{2,}\.(com|net|org|io|gg|ru|xyz|top|shop|store|live|site|online|click|link|ly|me|tv)(\/\S*)?\b/i

/** Ist das Radar für diesen Kanal aktiv? */
export function radarActive(channel: string): boolean {
  const mode = useSettings.getState().modRadar
  if (mode === 'off') return false
  if (mode === 'all') return true
  const me = useChat.getState().channels[channel]?.me
  return !!me && (me.mod || me.broadcaster)
}

// ---------- Gedächtnis für kanalübergreifende Signale ----------
interface Said {
  login: string
  channel: string
  ts: number
}
const said = new Map<string, Said[]>()
const bans = new Map<string, { channel: string; ts: number; dur?: number }>()
let lastPrune = 0

function prune(now: number): void {
  if (now - lastPrune < 30_000) return
  lastPrune = now
  for (const [k, v] of said) {
    const keep = v.filter((x) => now - x.ts < 10 * 60_000)
    if (keep.length) said.set(k, keep)
    else said.delete(k)
  }
  for (const [k, v] of bans) if (now - v.ts > 24 * 3600_000) bans.delete(k)
}

const norm = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[\u{E0000}-\u{E007F}​-‍﻿]/gu, '') // unsichtbare Zeichen, mit denen Spammer Filter umgehen
    .replace(/\s+/g, ' ')
    .trim()

/** Bans und Timeouts merken (auch aus anderen Kanälen) */
export function noteBan(channel: string, login: string, ts: number, dur?: number): void {
  // kurze Timeouts (< 10 Min.) sind oft nur Spaß oder Spam-Schutz – zählen nicht
  if (dur !== undefined && dur < 600) return
  bans.set(login, { channel, ts, dur })
}

type Flag = (channel: string, id: string, reasons: RadarReason[]) => void

/**
 * Bewertet eine neue Live-Nachricht. Kontoalter wird bei Bedarf nachgeladen,
 * deshalb meldet sich das Ergebnis evtl. erst kurz danach über flag().
 */
export function assessMessage(msg: ChatMessage, tags: Record<string, string>, flag: Flag): void {
  const login = msg.login
  if (!login || msg.self || !radarActive(msg.channel) || isBot(login)) return
  if (msg.badges.some((b) => b.set === 'moderator' || b.set === 'broadcaster' || b.set === 'vip' || b.set === 'staff')) return
  const now = msg.ts
  prune(now)
  const reasons: RadarReason[] = []
  const text = norm(msg.text)
  const hasLink = LINK.test(msg.text)

  if (tags['first-msg'] === '1') reasons.push({ k: 'firstMsg' })
  if (hasLink) reasons.push({ k: 'link' })
  const mentions = (msg.text.match(/@[a-z0-9_]{3,25}/gi) ?? []).length
  if (mentions >= 4) reasons.push({ k: 'massMention', n: mentions })
  const look = lookalikeOf(login, msg.channel)
  if (look) reasons.push({ k: 'lookalike', of: look })
  const ban = bans.get(login)
  if (ban && ban.channel !== msg.channel) reasons.push({ k: 'bannedElsewhere', channel: ban.channel, ts: ban.ts, dur: ban.dur })

  // gleicher Text: derselbe Mensch in mehreren Kanälen, oder viele Leute mit gleichem Link
  if (text.length >= 12) {
    const list = said.get(text) ?? []
    list.push({ login, channel: msg.channel, ts: now })
    said.set(text, list)
    if (said.size > 5000) said.delete(said.keys().next().value!)
    const otherChannels = [...new Set(list.filter((x) => x.login === login && x.channel !== msg.channel).map((x) => x.channel))]
    if (otherChannels.length) reasons.push({ k: 'crossChannel', channels: otherChannels })
    if (hasLink) {
      const users = new Set(list.filter((x) => x.channel === msg.channel && now - x.ts < 90_000).map((x) => x.login))
      if (users.size >= 3) reasons.push({ k: 'wave', users: users.size })
    }
  }

  const finish = (createdAt?: string): void => {
    const all = [...reasons]
    if (createdAt) {
      const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000)
      if (days < NEW_ACCOUNT_DAYS) all.push({ k: 'newAccount', days })
    }
    const strong = all.some((r) => STRONG.has(r.k))
    // "erste Nachricht" allein ist normal – erst zusammen mit einem zweiten Signal auffällig
    if (!strong && all.length < 2) return
    useRadar.getState().add({ id: msg.id, channel: msg.channel, login, displayName: msg.displayName ?? login, text: msg.text, ts: msg.ts, reasons: all, createdAt })
    flag(msg.channel, msg.id, all)
  }

  // Kontoalter nur abfragen, wenn es überhaupt auf etwas ankommt
  if (!reasons.length) return
  const meta = getMeta(login)
  if (meta !== undefined) return finish(meta?.createdAt)
  requestMeta(login)
  window.setTimeout(() => finish(getMeta(login)?.createdAt), 1500)
}
