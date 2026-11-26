// Wer ist gerade live? Angemeldet: alle gefolgten Kanäle (Helix streams/followed).
// Als Gast: die Kanäle in Lurks Liste (IVR). Daraus speisen sich die Startseite und – falls
// eingeschaltet – die kleinen "ist jetzt live"-Hinweise.
import { create } from 'zustand'
import { toast } from 'sonner'
import { getJson, ivrUsers } from './api'
import { helixCtx } from '@/store/auth'
import { useSettings } from '@/store/settings'
import { useUi } from '@/store/ui'
import { t } from './i18n'
import { joinChannel } from './client'

/** Kanal hinzufügen, betreten und anzeigen */
export function openLive(login: string): void {
  const had = useUi.getState().channels.includes(login)
  useUi.getState().addChannel(login)
  if (!had) joinChannel(login)
}

export interface LiveStream {
  login: string
  displayName: string
  title: string
  game?: string
  viewers: number
  startedAt?: string
  /** Vorschaubild (nur für die Startseite) */
  thumb?: string
  avatar?: string
}

interface LiveState {
  /** null = noch nicht geladen */
  streams: LiveStream[] | null
  /** true = Quelle sind deine Follows, false = Lurks Kanalliste */
  followed: boolean
  loading: boolean
}

export const useLive = create<LiveState>()(() => ({ streams: null, followed: false, loading: false }))

const POLL = 90_000
let timer: number | undefined
let known: Set<string> | null = null

interface HelixStream {
  user_login: string
  user_name: string
  title: string
  game_name: string
  viewer_count: number
  started_at: string
  thumbnail_url: string
}

async function followedStreams(): Promise<LiveStream[] | null> {
  const ctx = helixCtx()
  if (!ctx) return null
  const out: LiveStream[] = []
  let cursor = ''
  for (let page = 0; page < 3; page++) {
    const r = await getJson<{ data: HelixStream[]; pagination?: { cursor?: string } }>(
      `https://api.twitch.tv/helix/streams/followed?user_id=${ctx.userId}&first=100${cursor ? `&after=${cursor}` : ''}`,
      { headers: { 'Client-Id': ctx.clientId, Authorization: `Bearer ${ctx.token}` } }
    )
    if (!r) return page === 0 ? null : out
    for (const s of r.data)
      out.push({
        login: s.user_login,
        displayName: s.user_name,
        title: s.title,
        game: s.game_name || undefined,
        viewers: s.viewer_count,
        startedAt: s.started_at,
        thumb: s.thumbnail_url.replace('{width}', '440').replace('{height}', '248')
      })
    cursor = r.pagination?.cursor ?? ''
    if (!cursor) break
  }
  // Profilbilder nachtragen (IVR, gesammelt)
  const users = await ivrUsers(out.map((s) => s.login))
  const logos = new Map((users ?? []).map((u) => [u.login.toLowerCase(), u.logo]))
  for (const s of out) s.avatar = logos.get(s.login)
  return out
}

async function listStreams(): Promise<LiveStream[]> {
  const list = useUi.getState().channels
  if (!list.length) return []
  const users = (await ivrUsers(list)) ?? []
  return users
    .filter((u) => u.stream)
    .map((u) => ({
      login: u.login.toLowerCase(),
      displayName: u.displayName,
      title: u.stream?.title ?? '',
      game: u.stream?.game?.displayName,
      viewers: u.stream?.viewersCount ?? 0,
      startedAt: u.stream?.createdAt,
      thumb: `https://static-cdn.jtvnw.net/previews-ttv/live_user_${u.login.toLowerCase()}-440x248.jpg`,
      avatar: u.logo
    }))
}

export async function refreshLive(): Promise<void> {
  useLive.setState({ loading: true })
  const fromFollows = await followedStreams()
  const streams = (fromFollows ?? (await listStreams())).sort((a, b) => b.viewers - a.viewers)
  useLive.setState({ streams, followed: !!fromFollows, loading: false })

  // Hinweis "ist jetzt live" – nur für Kanäle, die zwischen zwei Abfragen live gegangen sind
  const now = new Set(streams.map((s) => s.login))
  if (known && useSettings.getState().liveNotify) {
    const fresh = streams.filter((s) => !known!.has(s.login)).slice(0, 3)
    for (const s of fresh) {
      toast(t('wentLive', { c: s.displayName }), {
        description: s.game ? `${s.game} · ${s.title}` : s.title,
        duration: 6000,
        action: { label: t('open'), onClick: () => openLive(s.login) }
      })
    }
  }
  known = now
}

export function startLive(): void {
  if (timer !== undefined) return
  void refreshLive()
  timer = window.setInterval(() => void refreshLive(), POLL)
}
