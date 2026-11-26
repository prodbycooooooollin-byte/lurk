// Twitch EventSub (WebSocket) für den eigenen Kanal: Hype-Train, Umfragen und Vorhersagen live.
// Twitch gibt diese Ereignisse nur mit der Erlaubnis des Broadcasters heraus – darum nur dort,
// wo du selbst streamst (und nach einer Anmeldung mit den passenden Berechtigungen).
import { create } from 'zustand'
import { helixCtx, useAuth } from '@/store/auth'

export interface HypeTrain {
  level: number
  progress: number
  goal: number
  total: number
  endsAt: number
  ended?: boolean
}
export interface Poll {
  title: string
  choices: { title: string; votes: number }[]
  endsAt?: number
  ended?: boolean
}
export interface Prediction {
  title: string
  outcomes: { id: string; title: string; color: string; users: number; points: number }[]
  locksAt?: number
  locked?: boolean
  winner?: string
  ended?: boolean
}

interface EventsState {
  hype: Record<string, HypeTrain | undefined>
  poll: Record<string, Poll | undefined>
  prediction: Record<string, Prediction | undefined>
}

export const useChannelEvents = create<EventsState>()(() => ({ hype: {}, poll: {}, prediction: {} }))

export const EVENT_SCOPES = ['channel:read:hype_train', 'channel:read:polls', 'channel:read:predictions']

const TYPES: [string, string][] = [
  ['channel.hype_train.begin', '2'],
  ['channel.hype_train.progress', '2'],
  ['channel.hype_train.end', '2'],
  ['channel.poll.begin', '1'],
  ['channel.poll.progress', '1'],
  ['channel.poll.end', '1'],
  ['channel.prediction.begin', '1'],
  ['channel.prediction.progress', '1'],
  ['channel.prediction.lock', '1'],
  ['channel.prediction.end', '1']
]

let ws: WebSocket | null = null
let started = false
const ms = (iso?: string): number | undefined => (iso ? new Date(iso).getTime() : undefined)

/** Ergebnis nach dem Ende noch kurz stehen lassen, dann ausblenden */
function clearLater(kind: keyof EventsState, login: string): void {
  window.setTimeout(() => useChannelEvents.setState((s) => ({ [kind]: { ...s[kind], [login]: s[kind][login]?.ended ? undefined : s[kind][login] } })), 25_000)
}

type Ev = Record<string, unknown> & { broadcaster_user_login: string }

function handle(type: string, e: Ev): void {
  const login = e.broadcaster_user_login.toLowerCase()
  const set = (kind: keyof EventsState, v: unknown): void => useChannelEvents.setState((s) => ({ [kind]: { ...s[kind], [login]: v } }))
  if (type.startsWith('channel.hype_train')) {
    const ended = type.endsWith('.end')
    set('hype', { level: Number(e.level ?? 1), progress: Number(e.progress ?? 0), goal: Number(e.goal ?? 1), total: Number(e.total ?? 0), endsAt: ms((e.expires_at ?? e.ended_at) as string) ?? Date.now(), ended })
    if (ended) clearLater('hype', login)
  } else if (type.startsWith('channel.poll')) {
    const ended = type.endsWith('.end')
    const choices = ((e.choices as { title: string; votes?: number }[]) ?? []).map((c) => ({ title: c.title, votes: Number(c.votes ?? 0) }))
    set('poll', { title: String(e.title ?? ''), choices, endsAt: ms(e.ends_at as string), ended })
    if (ended) clearLater('poll', login)
  } else if (type.startsWith('channel.prediction')) {
    const ended = type.endsWith('.end')
    const outcomes = ((e.outcomes as { id: string; title: string; color: string; users?: number; channel_points?: number }[]) ?? []).map((o) => ({
      id: o.id,
      title: o.title,
      color: o.color,
      users: Number(o.users ?? 0),
      points: Number(o.channel_points ?? 0)
    }))
    set('prediction', { title: String(e.title ?? ''), outcomes, locksAt: ms(e.locks_at as string), locked: type.endsWith('.lock') || ended, winner: (e.winning_outcome_id as string) || undefined, ended })
    if (ended) clearLater('prediction', login)
  }
}

async function subscribeAll(sessionId: string): Promise<void> {
  const ctx = helixCtx()
  if (!ctx) return
  for (const [type, version] of TYPES) {
    const body = JSON.stringify({ type, version, condition: { broadcaster_user_id: ctx.userId }, transport: { method: 'websocket', session_id: sessionId } })
    const r = await window.bridge.fetch({
      url: 'https://api.twitch.tv/helix/eventsub/subscriptions',
      method: 'POST',
      headers: { 'Client-Id': ctx.clientId, Authorization: `Bearer ${ctx.token}`, 'Content-Type': 'application/json' },
      body
    })
    // Hype-Train v2 noch nicht freigeschaltet? Dann v1 versuchen
    if (!r.ok && version === '2') {
      await window.bridge.fetch({
        url: 'https://api.twitch.tv/helix/eventsub/subscriptions',
        method: 'POST',
        headers: { 'Client-Id': ctx.clientId, Authorization: `Bearer ${ctx.token}`, 'Content-Type': 'application/json' },
        body: body.replace('"version":"2"', '"version":"1"')
      })
    }
  }
}

function connect(url = 'wss://eventsub.wss.twitch.tv/ws'): void {
  const sock = new WebSocket(url)
  ws = sock
  sock.onmessage = (ev) => {
    let m: { metadata?: { message_type?: string; subscription_type?: string }; payload?: { session?: { id: string; reconnect_url?: string }; event?: Ev } }
    try {
      m = JSON.parse(String(ev.data))
    } catch {
      return
    }
    const kind = m.metadata?.message_type
    if (kind === 'session_welcome' && m.payload?.session) {
      // nach einem Reconnect bleiben die Abos bestehen – nur beim ersten Mal anlegen
      if (url.endsWith('/ws')) void subscribeAll(m.payload.session.id)
    } else if (kind === 'session_reconnect' && m.payload?.session?.reconnect_url) {
      connect(m.payload.session.reconnect_url)
      window.setTimeout(() => sock.close(), 2000)
    } else if (kind === 'notification' && m.metadata?.subscription_type && m.payload?.event) {
      handle(m.metadata.subscription_type, m.payload.event)
    }
  }
  sock.onclose = () => {
    if (ws !== sock) return
    ws = null
    window.setTimeout(() => connect(), 15_000)
  }
}

/** Startet, sobald jemand mit den nötigen Berechtigungen angemeldet ist */
export function startEventSub(): void {
  const tryStart = (): void => {
    const a = useAuth.getState()
    if (started || !helixCtx() || !EVENT_SCOPES.some((s) => a.scopes.includes(s))) return
    started = true
    connect()
  }
  tryStart()
  useAuth.subscribe(tryStart)
}
