// Netzwerk-Helfer (laufen über den Main-Prozess) + Twitch/IVR-APIs

export async function getJson<T>(url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }): Promise<T | null> {
  try {
    const r = await window.bridge.fetch({ url, ...init })
    if (!r.ok) return null
    return r.body ? (JSON.parse(r.body) as T) : (null as T)
  } catch {
    return null
  }
}

export async function request(url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) {
  return window.bridge.fetch({ url, ...init })
}

// ---------- IVR (öffentliche Twitch-Infos ohne Login) ----------
export interface IvrUser {
  id: string
  login: string
  displayName: string
  logo?: string
  /** Kanalbanner (profile_banner-480) – fehlt, wenn keiner gesetzt ist */
  banner?: string | null
  /** gerade ausgewähltes globales Badge */
  badges?: { setID: string; version: string; title?: string; description?: string }[]
  createdAt?: string
  chatColor?: string | null
  followers?: number
  bio?: string
  banned?: boolean
  roles?: { isAffiliate?: boolean; isPartner?: boolean; isStaff?: boolean | null }
  stream?: {
    title?: string
    viewersCount?: number
    createdAt?: string
    game?: { displayName?: string } | null
  } | null
  lastBroadcast?: { startedAt?: string; title?: string } | null
}

/** null = Anfrage fehlgeschlagen, [] = niemand gefunden */
export async function ivrUsers(logins: string[]): Promise<IvrUser[] | null> {
  if (!logins.length) return []
  const out: IvrUser[] = []
  for (let i = 0; i < logins.length; i += 40) {
    const chunk = logins.slice(i, i + 40).map(encodeURIComponent).join(',')
    const r = await getJson<IvrUser[]>(`https://api.ivr.fi/v2/twitch/user?login=${chunk}`)
    if (!r) return i === 0 ? null : out
    out.push(...r)
  }
  return out
}

export interface IvrSubage {
  followedAt?: string | null
  meta?: { tier?: string; type?: string } | null
  cumulative?: { months?: number } | null
  streak?: { months?: number } | null
}

export function ivrSubage(user: string, channel: string): Promise<IvrSubage | null> {
  return getJson<IvrSubage>(`https://api.ivr.fi/v2/twitch/subage/${encodeURIComponent(user)}/${encodeURIComponent(channel)}`)
}

// ---------- Verlauf (wie Chatterino: recent-messages.robotty.de) ----------
export async function recentMessages(channel: string): Promise<string[]> {
  const r = await getJson<{ messages: string[] }>(
    `https://recent-messages.robotty.de/api/v2/recent-messages/${encodeURIComponent(channel)}?limit=200`
  )
  return r?.messages ?? []
}

// ---------- Twitch Login (Device Code Flow) ----------
export const SCOPES = [
  'chat:read',
  'chat:edit',
  'moderator:read:chatters',
  'moderator:manage:banned_users',
  'moderator:manage:chat_messages',
  'moderator:manage:announcements',
  'user:read:follows'
].join(' ')

export interface DeviceCode {
  device_code: string
  user_code: string
  verification_uri: string
  expires_in: number
  interval: number
}

export interface TokenSet {
  access_token: string
  refresh_token?: string
  expires_in?: number
}

const form = (o: Record<string, string>): string => new URLSearchParams(o).toString()
const FORM = { 'Content-Type': 'application/x-www-form-urlencoded' }

export function startDeviceFlow(clientId: string): Promise<DeviceCode | null> {
  return getJson<DeviceCode>('https://id.twitch.tv/oauth2/device', {
    method: 'POST',
    headers: FORM,
    body: form({ client_id: clientId, scopes: SCOPES })
  })
}

export async function pollDeviceToken(clientId: string, deviceCode: string): Promise<TokenSet | 'pending' | 'failed'> {
  const r = await request('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: FORM,
    body: form({
      client_id: clientId,
      scopes: SCOPES,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
    })
  })
  if (r.ok) return JSON.parse(r.body) as TokenSet
  if (/authorization_pending|slow_down/i.test(r.body)) return 'pending'
  return 'failed'
}

export async function refreshToken(clientId: string, refresh: string): Promise<TokenSet | null> {
  return getJson<TokenSet>('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: FORM,
    body: form({ client_id: clientId, grant_type: 'refresh_token', refresh_token: refresh })
  })
}

export interface Validation {
  client_id: string
  login: string
  user_id: string
  scopes: string[]
  expires_in: number
}

export function validateToken(token: string): Promise<Validation | null> {
  return getJson<Validation>('https://id.twitch.tv/oauth2/validate', { headers: { Authorization: `OAuth ${token}` } })
}

// ---------- Helix ----------
export interface HelixCtx {
  clientId: string
  token: string
  userId: string
}

async function helix<T>(ctx: HelixCtx, method: string, path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
  const r = await request(`https://api.twitch.tv/helix/${path}`, {
    method,
    headers: {
      'Client-Id': ctx.clientId,
      Authorization: `Bearer ${ctx.token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  })
  let data: T | null = null
  let error: string | undefined
  try {
    const j = r.body ? JSON.parse(r.body) : null
    if (r.ok) data = j as T
    else error = j?.message ?? r.body
  } catch {
    if (!r.ok) error = r.body
  }
  return { ok: r.ok, status: r.status, data, error }
}

export async function helixChatters(ctx: HelixCtx, broadcasterId: string): Promise<string[] | null> {
  const all: string[] = []
  let cursor = ''
  for (let page = 0; page < 10; page++) {
    const r = await helix<{ data: { user_login: string }[]; pagination?: { cursor?: string } }>(
      ctx,
      'GET',
      `chat/chatters?broadcaster_id=${broadcasterId}&moderator_id=${ctx.userId}&first=1000${cursor ? `&after=${cursor}` : ''}`
    )
    if (!r.ok || !r.data) return page === 0 ? null : all
    all.push(...r.data.data.map((d) => d.user_login))
    cursor = r.data.pagination?.cursor ?? ''
    if (!cursor) break
  }
  return all
}

export async function helixUserId(ctx: HelixCtx, login: string): Promise<string | null> {
  const r = await helix<{ data: { id: string }[] }>(ctx, 'GET', `users?login=${encodeURIComponent(login)}`)
  return r.data?.data[0]?.id ?? null
}

export function helixBan(ctx: HelixCtx, broadcasterId: string, userId: string, duration?: number, reason?: string) {
  return helix(ctx, 'POST', `moderation/bans?broadcaster_id=${broadcasterId}&moderator_id=${ctx.userId}`, {
    data: { user_id: userId, ...(duration ? { duration } : {}), ...(reason ? { reason } : {}) }
  })
}

export function helixUnban(ctx: HelixCtx, broadcasterId: string, userId: string) {
  return helix(ctx, 'DELETE', `moderation/bans?broadcaster_id=${broadcasterId}&moderator_id=${ctx.userId}&user_id=${userId}`)
}

export function helixDeleteMessage(ctx: HelixCtx, broadcasterId: string, messageId: string) {
  return helix(ctx, 'DELETE', `moderation/chat?broadcaster_id=${broadcasterId}&moderator_id=${ctx.userId}&message_id=${messageId}`)
}

export function helixAnnounce(ctx: HelixCtx, broadcasterId: string, message: string) {
  return helix(ctx, 'POST', `chat/announcements?broadcaster_id=${broadcasterId}&moderator_id=${ctx.userId}`, { message })
}

// ---------- BadgeHQ (vollständige Badge-Sammlung eines Accounts) ----------
export interface OwnedBadge {
  setId: string
  version: string
  title: string
  description?: string
  image: string
}

const bhqCache = new Map<string, Promise<OwnedBadge[] | null>>()

/**
 * Alle globalen Badges, die ein Account besitzt – über badgehq.xyz (Community-Dienst, keine
 * offizielle API). null = Dienst nicht erreichbar oder Account unbekannt.
 */
export function ownedBadges(login: string): Promise<OwnedBadge[] | null> {
  const l = login.toLowerCase()
  let p = bhqCache.get(l)
  if (!p) {
    p = getJson<{ twitchBadges?: OwnedBadge[] }>(`https://www.badgehq.xyz/api/user/${encodeURIComponent(l)}`).then((r) => {
      if (!r?.twitchBadges) {
        bhqCache.delete(l) // beim nächsten Öffnen erneut versuchen
        return null
      }
      return r.twitchBadges.filter((b) => b.setId && b.image)
    })
    bhqCache.set(l, p)
  }
  return p
}

// ---------- Öffentliche Chat-Logs (justlog auf logs.ivr.fi) ----------
export interface LogLine {
  text: string
  timestamp: string
  displayName?: string
  tags?: Record<string, string>
}

export interface BadgeSpan {
  /** "set/version" */
  key: string
  first: number
  last: number
  /** Nachrichten mit diesem Badge */
  count: number
}

/** Log-Abruf mit einer Wiederholung – logs.ivr.fi drosselt bei vielen Anfragen kurz */
async function getLog<T>(url: string): Promise<T | null> {
  const r = await getJson<T>(url)
  if (r) return r
  await new Promise((res) => setTimeout(res, 900))
  return getJson<T>(url)
}

type BadgeHistory = { spans: BadgeSpan[]; months: number; messages: number }
const badgeHistoryCache = new Map<string, BadgeHistory>()
/** genug Stichproben – bei Vielschreibern nicht hunderttausende Nachrichten laden */
const MAX_LOG_MESSAGES = 40_000

/**
 * Welche Badges jemand in einem Kanal getragen hat – aus den IRC-Tags der geloggten Nachrichten
 * (logs.ivr.fi speichert sie mit). Durchsucht bis zu `months` Monate, neueste zuerst.
 * null = Kanal wird nicht geloggt / Fehler
 */
export async function userBadgeHistory(channel: string, user: string, months = 12): Promise<BadgeHistory | null> {
  const cacheKey = `${channel}/${user}/${months}`
  const cached = badgeHistoryCache.get(cacheKey)
  if (cached) return cached
  const c = encodeURIComponent(channel)
  const u = encodeURIComponent(user)
  const list = await getLog<{ availableLogs?: { year: string; month: string }[] }>(`https://logs.ivr.fi/list?channel=${c}&user=${u}`)
  if (!list?.availableLogs) return null
  const todo = list.availableLogs.slice(0, months)
  let scanned = 0
  const spans = new Map<string, BadgeSpan>()
  let messages = 0
  // drei Monate gleichzeitig – schnell genug, ohne den Dienst zu überfahren
  for (let i = 0; i < todo.length && messages < MAX_LOG_MESSAGES; i += 3) {
    scanned = Math.min(todo.length, i + 3)
    const pages = await Promise.all(
      todo.slice(i, i + 3).map(({ year, month }) => getLog<{ messages?: LogLine[] }>(`https://logs.ivr.fi/channel/${c}/user/${u}/${year}/${month}?json=1`))
    )
    for (const page of pages) {
      for (const m of page?.messages ?? []) {
        const raw = m.tags?.badges
        if (!raw) continue
        messages++
        const ts = new Date(m.timestamp).getTime()
        for (const b of raw.split(',')) {
          if (!b) continue
          const s = spans.get(b)
          if (!s) spans.set(b, { key: b, first: ts, last: ts, count: 1 })
          else {
            if (ts < s.first) s.first = ts
            if (ts > s.last) s.last = ts
            s.count++
          }
        }
      }
    }
  }
  const out = { spans: [...spans.values()], months: scanned, messages }
  badgeHistoryCache.set(cacheKey, out)
  return out
}

/** Letzte geloggte Nachrichten einer Person in einem Kanal (neueste zuerst). null = Kanal nicht geloggt / Fehler */
export async function userLogs(channel: string, user: string, max = 150): Promise<LogLine[] | null> {
  const c = encodeURIComponent(channel)
  const u = encodeURIComponent(user)
  const list = await getJson<{ availableLogs?: { year: string; month: string }[] }>(`https://logs.ivr.fi/list?channel=${c}&user=${u}`)
  if (!list?.availableLogs) return null
  const out: LogLine[] = []
  for (const { year, month } of list.availableLogs.slice(0, 3)) {
    const r = await getJson<{ messages?: LogLine[] }>(`https://logs.ivr.fi/channel/${c}/user/${u}/${year}/${month}?json=1&reverse=1`)
    for (const m of r?.messages ?? []) {
      out.push(m)
      if (out.length >= max) return out
    }
  }
  return out
}
