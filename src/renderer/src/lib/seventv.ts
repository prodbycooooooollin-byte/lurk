// 7TV live: eine WebSocket-Verbindung zur 7TV EventAPI für alle offenen Kanäle.
//  - Paints (Namen mit Farbverlauf) und 7TV-Badges der Leute im Chat
//  - Emote-Änderungen im Kanal-Set (hinzugefügt / entfernt / umbenannt) – sofort im Chat sichtbar
import { useSyncExternalStore } from 'react'
import { applySevenTvChange, sevenTvSetId } from './emotes'

const URL_WS = 'wss://events.7tv.io/v3'

export interface Paint {
  fn: 'LINEAR_GRADIENT' | 'RADIAL_GRADIENT' | 'URL' | string
  angle: number
  repeat: boolean
  shape?: string
  image?: string
  stops: { at: number; color: number }[]
  shadows: { x_offset: number; y_offset: number; radius: number; color: number }[]
  name: string
}

export interface StvBadge {
  title: string
  url: string
}

export interface EmoteChange {
  channelRoomId: string
  action: 'added' | 'removed' | 'renamed'
  name: string
  oldName?: string
  url: string
  actor?: string
}

const paints = new Map<string, Paint>()
const badges = new Map<string, StvBadge>()
/** Twitch-ID -> ausgewählte Kosmetik */
const users = new Map<string, { paint?: string; badge?: string }>()
const userListeners = new Map<string, Set<() => void>>()
const userVersion = new Map<string, number>()

let ws: WebSocket | null = null
let retry = 0
const rooms = new Set<string>()
const watchedSets = new Set<string>()
let onChange: ((c: EmoteChange) => void) | null = null

// ---------- Kosmetik pro Person ----------
function touch(twitchId: string): void {
  userVersion.set(twitchId, (userVersion.get(twitchId) ?? 0) + 1)
  userListeners.get(twitchId)?.forEach((l) => l())
}

/** Paint/Badge einer Person; rendert neu, wenn 7TV etwas dazu schickt */
export function useStvCosmetics(twitchId: string | undefined): { paint?: Paint; badge?: StvBadge } {
  useSyncExternalStore(
    (fn) => {
      if (!twitchId) return () => {}
      let set = userListeners.get(twitchId)
      if (!set) userListeners.set(twitchId, (set = new Set()))
      set.add(fn)
      return () => set!.delete(fn)
    },
    () => (twitchId ? userVersion.get(twitchId) ?? 0 : 0)
  )
  const u = twitchId ? users.get(twitchId) : undefined
  return { paint: u?.paint ? paints.get(u.paint) : undefined, badge: u?.badge ? badges.get(u.badge) : undefined }
}

const rgba = (c: number): string => {
  const n = c >>> 0
  return `rgba(${(n >>> 24) & 255}, ${(n >>> 16) & 255}, ${(n >>> 8) & 255}, ${((n & 255) / 255).toFixed(3)})`
}

/** CSS für einen Namen mit Paint (Verlauf als Textfüllung, Schatten als Filter) */
export function paintStyle(p: Paint): React.CSSProperties {
  let bg: string
  const stops = p.stops.map((s) => `${rgba(s.color)} ${(s.at * 100).toFixed(1)}%`).join(', ')
  if (p.fn === 'URL' && p.image) bg = `url("${p.image}")`
  else if (p.fn === 'RADIAL_GRADIENT') bg = `${p.repeat ? 'repeating-' : ''}radial-gradient(${p.shape || 'circle'}, ${stops})`
  else bg = `${p.repeat ? 'repeating-' : ''}linear-gradient(${p.angle}deg, ${stops})`
  const filter = p.shadows.length ? p.shadows.map((s) => `drop-shadow(${s.x_offset}px ${s.y_offset}px ${s.radius}px ${rgba(s.color)})`).join(' ') : undefined
  return {
    backgroundImage: bg,
    backgroundSize: p.fn === 'URL' ? 'cover' : '100% 100%',
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    color: 'transparent',
    filter
  }
}

// ---------- Verbindung ----------
function send(type: string, condition: Record<string, string>): void {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ op: 35, d: { type, condition } }))
}

function subscribeRoom(roomId: string): void {
  const cond = { ctx: 'channel', platform: 'TWITCH', id: roomId }
  send('cosmetic.create', cond)
  send('entitlement.create', cond)
  const setId = sevenTvSetId(roomId)
  if (setId && !watchedSets.has(setId)) {
    watchedSets.add(setId)
    send('emote_set.update', { object_id: setId })
  } else if (setId) send('emote_set.update', { object_id: setId })
}

interface Ent {
  kind: string
  ref_id: string
  user?: { style?: { paint_id?: string | null; badge_id?: string | null }; connections?: { platform: string; id: string }[] }
}

function handleDispatch(type: string, body: Record<string, unknown>): void {
  if (type === 'cosmetic.create') {
    const o = body.object as { id: string; kind: string; data: Record<string, unknown> } | undefined
    if (!o) return
    if (o.kind === 'PAINT') {
      const d = o.data as Record<string, unknown>
      paints.set(o.id, {
        fn: String(d.function ?? 'LINEAR_GRADIENT'),
        angle: Number(d.angle ?? 0),
        repeat: !!d.repeat,
        shape: (d.shape as string) || undefined,
        image: (d.image_url as string) || undefined,
        stops: (d.stops as Paint['stops']) ?? [],
        shadows: (d.shadows as Paint['shadows']) ?? [],
        name: String(d.name ?? '')
      })
    } else if (o.kind === 'BADGE') {
      const d = o.data as { tooltip?: string; name?: string; host?: { url: string } }
      if (d.host?.url) badges.set(o.id, { title: d.tooltip || d.name || '7TV', url: `https:${d.host.url}/2x.webp` })
    }
    // wer diese Kosmetik schon zugeordnet hat, neu zeichnen
    for (const [tid, u] of users) if (u.paint === o.id || u.badge === o.id) touch(tid)
    return
  }
  if (type === 'entitlement.create') {
    const e = body.object as Ent | undefined
    const tid = e?.user?.connections?.find((c) => c.platform === 'TWITCH')?.id
    if (!e || !tid || (e.kind !== 'PAINT' && e.kind !== 'BADGE')) return
    // style enthält die gerade ausgewählten Stücke – nur die zeigen
    const style = e.user?.style ?? {}
    const prev = users.get(tid) ?? {}
    const next = { paint: style.paint_id ?? (e.kind === 'PAINT' && !prev.paint ? e.ref_id : prev.paint), badge: style.badge_id ?? (e.kind === 'BADGE' && !prev.badge ? e.ref_id : prev.badge) }
    if (next.paint !== prev.paint || next.badge !== prev.badge) {
      users.set(tid, next)
      touch(tid)
    }
    return
  }
  if (type === 'emote_set.update') {
    const setId = String(body.id ?? '')
    const actor = (body.actor as { display_name?: string } | undefined)?.display_name
    type Item = { key: string; value?: { id: string; name: string; data?: { animated?: boolean; flags?: number } }; old_value?: { id: string; name: string } }
    const list = (k: string): Item[] => ((body[k] as Item[]) ?? []).filter((x) => x.key === 'emotes')
    for (const it of list('pushed')) if (it.value) applySevenTvChange(setId, 'added', it.value, undefined, actor, onChange)
    for (const it of list('pulled')) if (it.old_value) applySevenTvChange(setId, 'removed', it.old_value, undefined, actor, onChange)
    for (const it of list('updated')) if (it.value) applySevenTvChange(setId, 'renamed', it.value, it.old_value?.name, actor, onChange)
  }
}

function connect(): void {
  ws = new WebSocket(URL_WS)
  ws.onmessage = (ev) => {
    let m: { op: number; d?: { type?: string; body?: Record<string, unknown> } }
    try {
      m = JSON.parse(String(ev.data))
    } catch {
      return
    }
    if (m.op === 1) {
      retry = 0
      watchedSets.clear()
      for (const r of rooms) subscribeRoom(r)
    } else if (m.op === 0 && m.d?.type && m.d.body) handleDispatch(m.d.type, m.d.body)
    else if (m.op === 4) ws?.close() // Server bittet um Neuverbindung
  }
  ws.onclose = () => {
    ws = null
    // mit wachsender Pause neu verbinden (max. 30 s)
    const wait = Math.min(30_000, 1000 * 2 ** retry++)
    window.setTimeout(connect, wait)
  }
}

/** Einmal starten; onEmoteChange meldet Änderungen am Emote-Set eines Kanals */
export function startSevenTv(onEmoteChange: (c: EmoteChange) => void): void {
  onChange = onEmoteChange
  if (!ws) connect()
}

/** Kanal beobachten (Room-ID nötig; Emote-Set wird mitgenommen, sobald bekannt) */
export function watchSevenTvRoom(roomId: string): void {
  if (!roomId) return
  rooms.add(roomId)
  subscribeRoom(roomId)
}

/** Für die Fehlersuche: wie viel 7TV bisher geliefert hat */
export const sevenTvStats = (): { connected: boolean; rooms: number; users: number; paints: number; badges: number } => ({
  connected: ws?.readyState === WebSocket.OPEN,
  rooms: rooms.size,
  users: users.size,
  paints: paints.size,
  badges: badges.size
})
