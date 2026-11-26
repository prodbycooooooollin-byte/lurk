// Emotes (7TV, BTTV, FFZ) und Badges (IVR) – einmal laden, global nachschlagen
import { getJson } from './api'

export type EmoteSource = 'twitch' | '7tv' | 'bttv' | 'ffz'

export interface Emote {
  name: string
  url: string
  url4x?: string
  source: EmoteSource
  zeroWidth?: boolean
  animated?: boolean
  scope: 'global' | 'channel'
}

export const twitchEmoteUrl = (id: string, size: '1.0' | '2.0' | '3.0' = '2.0'): string =>
  `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/${size}`

const globalEmotes = new Map<string, Emote>()
const channelEmotes = new Map<string, Map<string, Emote>>() // roomId -> name -> emote
const loadedChannels = new Set<string>()
let globalsLoaded = false

const listeners = new Set<() => void>()
export const onEmotesChanged = (fn: () => void): (() => void) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
const emit = (): void => listeners.forEach((l) => l())

const https = (u: string): string => (u.startsWith('//') ? 'https:' + u : u)

interface SevenTvEmote {
  id: string
  name: string
  flags?: number
  data?: { animated?: boolean; flags?: number; host?: { url: string } }
}

function from7tv(list: SevenTvEmote[] | undefined, scope: Emote['scope']): Emote[] {
  return (list ?? [])
    .filter((e) => e.data?.host?.url)
    .map((e) => {
      const base = https(e.data!.host!.url)
      return {
        name: e.name,
        url: `${base}/2x.webp`,
        url4x: `${base}/4x.webp`,
        source: '7tv' as const,
        animated: !!e.data?.animated,
        zeroWidth: (((e.flags ?? 0) | (e.data?.flags ?? 0)) & 256) !== 0,
        scope
      }
    })
}

interface BttvEmote {
  id: string
  code: string
  animated?: boolean
}
const BTTV_ZW = new Set(['SoSnowy', 'IceCold', 'SantaHat', 'TopHat', 'ReinDeer', 'CandyCane', 'cvMask', 'cvHazmat'])
function fromBttv(list: BttvEmote[] | undefined, scope: Emote['scope']): Emote[] {
  return (list ?? []).map((e) => ({
    name: e.code,
    url: `https://cdn.betterttv.net/emote/${e.id}/2x.webp`,
    url4x: `https://cdn.betterttv.net/emote/${e.id}/3x.webp`,
    source: 'bttv' as const,
    animated: !!e.animated,
    zeroWidth: BTTV_ZW.has(e.code),
    scope
  }))
}

interface FfzSet {
  emoticons: { name: string; urls: Record<string, string>; animated?: Record<string, string> | null }[]
}
function fromFfz(sets: Record<string, FfzSet> | undefined, ids: (string | number)[] | null, scope: Emote['scope']): Emote[] {
  if (!sets) return []
  const keys = ids ? ids.map(String) : Object.keys(sets)
  return keys.flatMap((k) =>
    (sets[k]?.emoticons ?? []).map((e) => {
      const urls = e.animated ?? e.urls
      return {
        name: e.name,
        url: https(urls['2'] ?? urls['1']),
        url4x: https(urls['4'] ?? urls['2'] ?? urls['1']),
        source: 'ffz' as const,
        animated: !!e.animated,
        scope
      }
    })
  )
}

export async function loadGlobalEmotes(): Promise<void> {
  if (globalsLoaded) return
  globalsLoaded = true
  const [stv, bttv, ffz] = await Promise.all([
    getJson<{ emotes: SevenTvEmote[] }>('https://7tv.io/v3/emote-sets/global'),
    getJson<BttvEmote[]>('https://api.betterttv.net/3/cached/emotes/global'),
    getJson<{ default_sets: number[]; sets: Record<string, FfzSet> }>('https://api.frankerfacez.com/v1/set/global')
  ])
  // Reihenfolge = Priorität (später überschreibt früher): FFZ < BTTV < 7TV
  for (const e of [...fromFfz(ffz?.sets, ffz?.default_sets ?? null, 'global'), ...fromBttv(bttv ?? [], 'global'), ...from7tv(stv?.emotes, 'global')]) {
    globalEmotes.set(e.name, e)
  }
  emit()
}

export async function loadChannelEmotes(roomId: string): Promise<void> {
  if (!roomId || loadedChannels.has(roomId)) return
  loadedChannels.add(roomId)
  const [stv, bttv, ffz] = await Promise.all([
    getJson<{ emote_set?: { id?: string; emotes?: SevenTvEmote[] } }>(`https://7tv.io/v3/users/twitch/${roomId}`),
    getJson<{ channelEmotes: BttvEmote[]; sharedEmotes: BttvEmote[] }>(`https://api.betterttv.net/3/cached/users/twitch/${roomId}`),
    getJson<{ room: { set: number }; sets: Record<string, FfzSet> }>(`https://api.frankerfacez.com/v1/room/id/${roomId}`)
  ])
  const map = new Map<string, Emote>()
  for (const e of [
    ...fromFfz(ffz?.sets, null, 'channel'),
    ...fromBttv([...(bttv?.channelEmotes ?? []), ...(bttv?.sharedEmotes ?? [])], 'channel'),
    ...from7tv(stv?.emote_set?.emotes, 'channel')
  ]) {
    map.set(e.name, e)
  }
  channelEmotes.set(roomId, map)
  const setId = stv?.emote_set?.id
  if (setId) {
    stvSets.set(roomId, setId)
    stvSetRoom.set(setId, roomId)
  }
  emit()
}

// ---------- 7TV-Emote-Set live ändern ----------
const stvSets = new Map<string, string>() // roomId -> 7TV-Set
const stvSetRoom = new Map<string, string>() // 7TV-Set -> roomId

export const sevenTvSetId = (roomId: string): string | undefined => stvSets.get(roomId)

/** Änderung aus der 7TV EventAPI einspielen und melden */
export function applySevenTvChange(
  setId: string,
  action: 'added' | 'removed' | 'renamed',
  emote: { id: string; name: string; data?: { animated?: boolean; flags?: number } },
  oldName: string | undefined,
  actor: string | undefined,
  report: ((c: { channelRoomId: string; action: 'added' | 'removed' | 'renamed'; name: string; oldName?: string; url: string; actor?: string }) => void) | null
): void {
  const roomId = stvSetRoom.get(setId)
  const map = roomId ? channelEmotes.get(roomId) : undefined
  if (!roomId || !map) return
  const base = `https://cdn.7tv.app/emote/${emote.id}`
  if (action === 'removed') map.delete(emote.name)
  else {
    if (oldName) map.delete(oldName)
    map.set(emote.name, {
      name: emote.name,
      url: `${base}/2x.webp`,
      url4x: `${base}/4x.webp`,
      source: '7tv',
      animated: !!emote.data?.animated,
      zeroWidth: ((emote.data?.flags ?? 0) & 256) !== 0,
      scope: 'channel'
    })
  }
  emit()
  report?.({ channelRoomId: roomId, action, name: emote.name, oldName, url: `${base}/2x.webp`, actor })
}

export function reloadChannelEmotes(roomId: string): Promise<void> {
  loadedChannels.delete(roomId)
  return loadChannelEmotes(roomId)
}

export function findEmote(roomId: string | undefined, name: string): Emote | undefined {
  return (roomId ? channelEmotes.get(roomId)?.get(name) : undefined) ?? globalEmotes.get(name)
}

export function emoteList(roomId: string | undefined): { channel: Emote[]; global: Emote[] } {
  return {
    channel: roomId ? [...(channelEmotes.get(roomId)?.values() ?? [])] : [],
    global: [...globalEmotes.values()]
  }
}

// ---------- Badges ----------
export interface Badge {
  title: string
  url: string
  url4x: string
  description?: string
}
interface IvrBadgeSet {
  set_id: string
  versions: { id: string; title: string; description?: string; image_url_1x: string; image_url_2x: string; image_url_4x: string }[]
}

const globalBadges = new Map<string, Badge>()
const channelBadges = new Map<string, Map<string, Badge>>()

function toMap(sets: IvrBadgeSet[] | null): Map<string, Badge> {
  const m = new Map<string, Badge>()
  for (const s of sets ?? []) for (const v of s.versions) m.set(`${s.set_id}/${v.id}`, { title: v.title, url: v.image_url_2x, url4x: v.image_url_4x, description: v.description })
  return m
}

export async function loadGlobalBadges(): Promise<void> {
  if (globalBadges.size) return
  const m = toMap(await getJson<IvrBadgeSet[]>('https://api.ivr.fi/v2/twitch/badges/global'))
  m.forEach((v, k) => globalBadges.set(k, v))
  emit()
}

export async function loadChannelBadges(channel: string): Promise<void> {
  if (channelBadges.has(channel)) return
  channelBadges.set(channel, new Map())
  channelBadges.set(channel, toMap(await getJson<IvrBadgeSet[]>(`https://api.ivr.fi/v2/twitch/badges/channel?login=${encodeURIComponent(channel)}`)))
  emit()
}

/** alle globalen Badges ("set/version" -> Badge) – für den Badge-Dex */
export const globalBadgeList = (): [string, Badge][] => [...globalBadges.entries()]

export function findBadge(channel: string, set: string, version: string): Badge | undefined {
  const key = `${set}/${version}`
  return channelBadges.get(channel)?.get(key) ?? globalBadges.get(key)
}
