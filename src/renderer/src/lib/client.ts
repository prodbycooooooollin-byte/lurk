// Lurk engine: connects IRC, APIs and the store. Incoming events are collected
// and written to the store in batches every 100 ms, so the UI stays smooth even in very fast chats.
import { toast } from 'sonner'
import { TwitchIrc, parseIrc, type IrcMessage } from './irc'
import { parseEmoteTag } from './tokenize'
import { findEmote, loadChannelBadges, loadChannelEmotes, loadGlobalBadges, loadGlobalEmotes, onEmotesChanged } from './emotes'
import { helixBan, helixChatters, helixDeleteMessage, helixUnban, helixUserId, helixAnnounce, ivrUsers, recentMessages, refreshToken, validateToken } from './api'
import type { BadgeRef, ChatMessage, HighlightKind, PresenceUser } from './types'
import { useChat, emptyChannel, type ChannelState } from '@/store/chat'
import { useSettings } from '@/store/settings'
import { useUi } from '@/store/ui'
import { useAuth, helixCtx } from '@/store/auth'
import { formatDuration, parseDurationArg } from './util'
import { playSound } from './sounds'
import { t, type TKey } from './i18n'
import { startleLogo } from '@/components/LurkLogo'
import { countMessage, ensureHistory, startHistory } from './history'

type Op = (get: (c: string) => ChannelState, ctx: FlushCtx) => void
interface FlushCtx {
  mentions: ChatMessage[]
}

let ops: Op[] = []
let flushTimer: number | undefined
let activityId = 0
let localId = 0

function queue(op: Op): void {
  ops.push(op)
  if (flushTimer === undefined) flushTimer = window.setTimeout(flush, 100)
}

function flush(): void {
  flushTimer = undefined
  const pending = ops
  ops = []
  if (!pending.length) return
  const state = useChat.getState()
  const channels = { ...state.channels }
  const touched = new Set<string>()
  const presenceTouched = new Set<string>()
  const statsTouched = new Set<string>()
  // Nachrichten und Aktivität werden kopiert (klein, die Liste braucht neue Arrays).
  // presence und stats können in großen Kanälen zehntausende Einträge haben: die werden
  // direkt verändert und nur über eine Versionsnummer gemeldet, statt 10× pro Sekunde kopiert.
  const get = (c: string): ChannelState => {
    if (!touched.has(c)) {
      const cur = channels[c] ?? emptyChannel(c)
      const draft = { ...cur, messages: cur.messages.slice(), activity: cur.activity.slice() } as ChannelState
      const presence = cur.presence
      const stats = cur.stats
      Object.defineProperty(draft, 'presence', { get: () => (presenceTouched.add(c), presence), enumerable: true, configurable: true })
      Object.defineProperty(draft, 'stats', { get: () => (statsTouched.add(c), stats), enumerable: true, configurable: true })
      channels[c] = draft
      touched.add(c)
    }
    return channels[c]
  }
  const ctx: FlushCtx = { mentions: [] }
  for (const op of pending) op(get, ctx)
  const max = useSettings.getState().maxMessages
  for (const c of touched) {
    const ch = channels[c]
    const presence = ch.presence
    const stats = ch.stats
    Object.defineProperty(ch, 'presence', { value: presence, writable: true, enumerable: true, configurable: true })
    Object.defineProperty(ch, 'stats', { value: stats, writable: true, enumerable: true, configurable: true })
    if (presenceTouched.has(c)) ch.presenceVersion++
    if (statsTouched.has(c)) ch.statsVersion++
    if (ch.messages.length > max) ch.messages = ch.messages.slice(ch.messages.length - max)
    if (ch.activity.length > 600) ch.activity = ch.activity.slice(ch.activity.length - 600)
  }
  useChat.setState({
    channels,
    ...(ctx.mentions.length ? { mentions: [...state.mentions, ...ctx.mentions].slice(-500) } : {})
  })
}

// ---------- Hilfsfunktionen ----------
const parseBadges = (tag: string | undefined): BadgeRef[] =>
  (tag ?? '')
    .split(',')
    .filter(Boolean)
    .map((b) => {
      const [set, version] = b.split('/')
      return { set, version: version ?? '1' }
    })

const myLogin = (): string => useAuth.getState().login.toLowerCase()

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const keywordCache = new Map<string, RegExp | null>()
function keywordRe(pattern: string): RegExp | null {
  if (!keywordCache.has(pattern)) {
    let re: RegExp | null = null
    try {
      re = pattern.startsWith('/') && pattern.lastIndexOf('/') > 0
        ? new RegExp(pattern.slice(1, pattern.lastIndexOf('/')), pattern.slice(pattern.lastIndexOf('/') + 1) || 'i')
        : new RegExp(`(^|\\W)${escapeRe(pattern)}($|\\W)`, 'i')
    } catch {
      re = null
    }
    keywordCache.set(pattern, re)
  }
  return keywordCache.get(pattern) ?? null
}

function isIgnored(login: string | undefined, text: string): boolean {
  const s = useSettings.getState()
  if (login && s.ignoredUsers.includes(login)) return true
  const low = text.toLowerCase()
  return s.ignoredPhrases.some((p) => p && low.includes(p))
}

function classify(msg: ChatMessage, tags: Record<string, string>): { kind: HighlightKind; color?: string; sound: boolean } {
  const s = useSettings.getState()
  const me = myLogin()
  if (msg.self) return { kind: null, sound: false }
  if (me && s.highlightMentions) {
    const mentioned = new RegExp(`(^|[^a-z0-9_])@?${escapeRe(me)}([^a-z0-9_]|$)`, 'i').test(msg.text) || tags['reply-parent-user-login'] === me
    if (mentioned) return { kind: 'mention', sound: s.mentionSound }
  }
  for (const k of s.keywords) {
    const re = keywordRe(k.pattern)
    if (re && re.test(msg.text)) return { kind: 'keyword', color: k.color, sound: k.sound }
  }
  if (msg.login && s.watchUsers.includes(msg.login)) return { kind: 'watch', sound: false }
  if (s.highlightFirst && tags['first-msg'] === '1') return { kind: 'first', sound: false }
  if (tags['returning-chatter'] === '1') return { kind: 'returning', sound: false }
  return { kind: null, sound: false }
}

function notifyDesktop(title: string, body: string): void {
  const s = useSettings.getState()
  if (!s.desktopNotify || useChat.getState().windowFocused) return
  try {
    new Notification(title, { body, silent: true })
  } catch {
    /* ignorieren */
  }
  window.bridge.flash()
}

function bumpStats(ch: ChannelState, msg: ChatMessage, firstMsg: boolean): void {
  const minute = Math.floor(msg.ts / 60000)
  const st = ch.stats
  const lastMinute = st.bucketStart + st.buckets.length - 1
  if (minute > lastMinute) {
    const shift = Math.min(st.buckets.length, minute - lastMinute)
    st.buckets.splice(0, shift)
    for (let i = 0; i < shift; i++) st.buckets.push(0)
    st.bucketStart = minute - st.buckets.length + 1
  }
  const idx = minute - st.bucketStart
  if (idx >= 0 && idx < st.buckets.length) st.buckets[idx]++
  st.total++
  if (msg.login) st.chatters[msg.login] = (st.chatters[msg.login] ?? 0) + 1
  if (firstMsg) st.firstTimers++
  // Emotes zählen
  const twitchNames = new Set<string>()
  const cps = Array.from(msg.text)
  for (const e of msg.twitchEmotes) {
    const name = cps.slice(e.start, e.end + 1).join('')
    twitchNames.add(name)
    st.emotes[name] = (st.emotes[name] ?? 0) + 1
  }
  for (const w of msg.text.split(/\s+/)) {
    if (!w || twitchNames.has(w)) continue
    if (findEmote(msg.roomId, w)) st.emotes[w] = (st.emotes[w] ?? 0) + 1
  }
}

/** Schreibt einen Eintrag und hält presentCount aktuell, ohne die Liste zu zählen */
function putPresence(ch: ChannelState, user: PresenceUser): void {
  const prev = ch.presence[user.login]
  ch.presentCount += (user.present ? 1 : 0) - (prev?.present ? 1 : 0)
  ch.presence[user.login] = user
}

function touchPresence(ch: ChannelState, login: string, patch: { displayName?: string; color?: string; badges?: BadgeRef[]; ts: number; message: boolean }): void {
  const prev = ch.presence[login]
  putPresence(ch, {
    login,
    joinedAt: prev ? prev.joinedAt : patch.message ? patch.ts : null,
    present: true,
    msgCount: (prev?.msgCount ?? 0) + (patch.message ? 1 : 0),
    firstMsgAt: prev?.firstMsgAt ?? (patch.message ? patch.ts : undefined),
    lastMsgAt: patch.message ? patch.ts : prev?.lastMsgAt,
    displayName: patch.displayName ?? prev?.displayName,
    color: patch.color || prev?.color,
    badges: patch.badges ?? prev?.badges,
    leftAt: undefined
  })
}

function addJoinLine(ch: ChannelState, login: string, part: boolean, ts: number): void {
  const last = ch.messages[ch.messages.length - 1]
  if (last && last.kind === 'joins' && ts - last.ts < 4000 && (last.joins?.length ?? 0) < 40) {
    ch.messages[ch.messages.length - 1] = { ...last, joins: [...(last.joins ?? []), { login, part }] }
    return
  }
  ch.messages.push({ id: `j${++localId}`, kind: 'joins', channel: ch.name, ts, badges: [], text: '', twitchEmotes: [], joins: [{ login, part }] })
}

export function systemLine(channel: string, text: string, noticeType = 'info'): void {
  queue((get) => {
    get(channel).messages.push({ id: `s${++localId}`, kind: 'system', channel, ts: Date.now(), badges: [], text: '', twitchEmotes: [], systemText: text, noticeType })
  })
}

// ---------- IRC-Ereignisse ----------
function buildChat(m: IrcMessage, historical: boolean): ChatMessage {
  let text = m.trailing
  let kind: ChatMessage['kind'] = 'chat'
  if (text.startsWith('\u0001ACTION ') && text.endsWith('\u0001')) {
    text = text.slice(8, -1)
    kind = 'action'
  }
  const t = m.tags
  let emotes = parseEmoteTag(t['emotes'])
  // Bei Antworten stellt Twitch "@name " voran – Emote-Indizes verschieben sich nicht, aber wir blenden das Präfix aus
  let reply: ChatMessage['reply']
  if (t['reply-parent-msg-id']) {
    reply = {
      id: t['reply-parent-msg-id'],
      login: t['reply-parent-user-login'] ?? '',
      displayName: t['reply-parent-display-name'] ?? t['reply-parent-user-login'] ?? '',
      text: t['reply-parent-msg-body'] ?? ''
    }
    const prefix = `@${reply.displayName} `
    if (text.toLowerCase().startsWith(prefix.toLowerCase())) {
      const shift = Array.from(prefix).length
      text = text.slice(prefix.length)
      emotes = emotes.map((e) => ({ ...e, start: e.start - shift, end: e.end - shift })).filter((e) => e.start >= 0)
    }
  }
  return {
    id: t['id'] || `h${++localId}`,
    kind,
    channel: m.channel,
    ts: Number(t['tmi-sent-ts'] || t['rm-received-ts']) || Date.now(),
    login: m.nick || t['login'],
    displayName: t['display-name'] || m.nick,
    color: t['color'] || undefined,
    badges: parseBadges(t['badges']),
    text,
    twitchEmotes: emotes,
    roomId: t['room-id'],
    userId: t['user-id'],
    historical,
    reply,
    bits: t['bits'] ? Number(t['bits']) : undefined,
    self: !!myLogin() && m.nick === myLogin()
  }
}

function handle(m: IrcMessage, historical = false): void {
  const c = m.channel
  switch (m.command) {
    case 'PRIVMSG': {
      const msg = buildChat(m, historical)
      if (isIgnored(msg.login, msg.text)) return
      const hl = classify(msg, m.tags)
      msg.highlight = hl.kind
      msg.highlightColor = hl.color
      const first = m.tags['first-msg'] === '1'
      queue((get, ctx) => {
        const ch = get(c)
        ch.messages.push(msg)
        if (!historical) {
          countMessage(c, msg.login!)
          touchPresence(ch, msg.login!, { displayName: msg.displayName, color: msg.color, badges: msg.badges, ts: msg.ts, message: true })
          bumpStats(ch, msg, first)
          if (hl.kind === 'mention' || hl.kind === 'keyword') {
            ctx.mentions.push(msg)
            ch.mentions++
          }
          ch.unread++
        }
      })
      if (!historical && (hl.kind === 'mention' || hl.kind === 'keyword')) {
        startleLogo()
        if (hl.sound) void playSound(useSettings.getState().mentionSoundId)
        notifyDesktop(t('inChannel', { u: msg.displayName ?? '', c }), msg.text)
      }
      break
    }
    case 'USERNOTICE': {
      const t = m.tags
      const msg: ChatMessage = {
        ...buildChat(m, historical),
        kind: 'usernotice',
        systemText: t['system-msg'] || '',
        noticeType: t['msg-id'],
        text: m.params.length > 1 ? m.trailing : ''
      }
      if (msg.noticeType === 'announcement') msg.highlightColor = (t['msg-param-color'] || 'PRIMARY').toLowerCase()
      queue((get) => {
        const ch = get(c)
        ch.messages.push(msg)
        if (!historical && msg.login) touchPresence(ch, msg.login, { displayName: msg.displayName, color: msg.color, ts: msg.ts, message: !!msg.text })
      })
      break
    }
    case 'CLEARCHAT': {
      const target = m.params.length > 1 ? m.trailing.toLowerCase() : ''
      const dur = m.tags['ban-duration']
      queue((get) => {
        const ch = get(c)
        if (!target) {
          ch.messages.push({ id: `s${++localId}`, kind: 'system', channel: c, ts: Date.now(), badges: [], text: '', twitchEmotes: [], systemText: t('chatCleared'), noticeType: 'clear', historical })
          return
        }
        const info = dur ? t('timeoutInfo', { d: formatDuration(Number(dur)) }) : t('bannedInfo')
        for (let i = ch.messages.length - 1, n = 0; i >= 0 && n < 400; i--, n++) {
          const x = ch.messages[i]
          if (x.login === target && !x.deleted && (x.kind === 'chat' || x.kind === 'action')) ch.messages[i] = { ...x, deleted: true, timeoutInfo: info }
        }
        ch.messages.push({
          id: `s${++localId}`, kind: 'system', channel: c, ts: Number(m.tags['tmi-sent-ts']) || Date.now(), badges: [], text: '', twitchEmotes: [],
          systemText: dur ? t('timedOutLine', { u: target, d: formatDuration(Number(dur)) }) : t('bannedLine', { u: target }),
          noticeType: dur ? 'timeout' : 'ban', login: target, historical
        })
      })
      break
    }
    case 'CLEARMSG': {
      const id = m.tags['target-msg-id']
      queue((get) => {
        const ch = get(c)
        for (let i = ch.messages.length - 1, n = 0; i >= 0 && n < 1500; i--, n++) {
          if (ch.messages[i].id === id) {
            ch.messages[i] = { ...ch.messages[i], deleted: true, timeoutInfo: t('deletedInfo') }
            break
          }
        }
      })
      break
    }
    case 'ROOMSTATE': {
      const t = m.tags
      queue((get) => {
        const ch = get(c)
        const r = { ...ch.room }
        if (t['room-id']) r.roomId = t['room-id']
        if ('slow' in t) r.slow = Number(t['slow'])
        if ('subs-only' in t) r.subsOnly = t['subs-only'] === '1'
        if ('emote-only' in t) r.emoteOnly = t['emote-only'] === '1'
        if ('followers-only' in t) r.followersOnly = Number(t['followers-only'])
        if ('r9k' in t) r.r9k = t['r9k'] === '1'
        ch.room = r
      })
      if (t['room-id']) void loadChannelEmotes(t['room-id'])
      break
    }
    case 'USERSTATE': {
      const t = m.tags
      const badges = parseBadges(t['badges'])
      queue((get) => {
        const ch = get(c)
        ch.me = {
          badges,
          color: t['color'] || undefined,
          displayName: t['display-name'],
          mod: t['mod'] === '1' || badges.some((b) => b.set === 'moderator'),
          broadcaster: badges.some((b) => b.set === 'broadcaster'),
          vip: badges.some((b) => b.set === 'vip')
        }
      })
      break
    }
    case 'GLOBALUSERSTATE':
      useChat.setState({ myColor: m.tags['color'] || undefined, myDisplayName: m.tags['display-name'] })
      break
    case 'NOTICE': {
      if (!c) {
        if (/login authentication failed/i.test(m.trailing)) toast.error(t('authFailed'))
        return
      }
      const text = m.trailing
      queue((get) => {
        get(c).messages.push({ id: `n${++localId}`, kind: 'notice', channel: c, ts: Date.now(), badges: [], text: '', twitchEmotes: [], systemText: text, noticeType: m.tags['msg-id'], historical })
      })
      break
    }
    case 'JOIN': {
      const login = m.nick.toLowerCase()
      const self = login === myLogin() || login.startsWith('justinfan')
      const now = Date.now()
      if (self) {
        queue((get) => {
          const ch = get(c)
          ch.joined = true
          ch.messages.push({ id: `s${++localId}`, kind: 'system', channel: c, ts: now, badges: [], text: '', twitchEmotes: [], systemText: t('connectedTo', { c }), noticeType: 'connected' })
        })
        return
      }
      const s = useSettings.getState()
      queue((get) => {
        const ch = get(c)
        const prev = ch.presence[login]
        if (prev?.present) return
        putPresence(ch, { ...(prev ?? { login, msgCount: 0 }), login, joinedAt: now, present: true, leftAt: undefined })
        ch.activity.push({ id: ++activityId, type: 'join', login, at: now })
        if (s.inlineJoins) addJoinLine(ch, login, false, now)
      })
      if (s.watchUsers.includes(login)) {
        startleLogo()
        toast(t('watchJoined', { u: login, c }), {
          description: t('fromWatchlist'),
          action: {
            label: t('showUser'),
            onClick: () => {
              const ui = useUi.getState()
              ui.showChannel(c)
              ui.set({ userCard: { login, channel: c, x: Math.max(12, window.innerWidth / 2 - 180), y: 110 } })
            }
          }
        })
        if (s.joinSound) void playSound(s.joinSoundId)
        notifyDesktop(t('watchedHere'), t('watchJoined', { u: login, c }))
      }
      break
    }
    case 'PART': {
      const login = m.nick.toLowerCase()
      if (login === myLogin() || login.startsWith('justinfan')) return
      const now = Date.now()
      const inline = useSettings.getState().inlineJoins
      queue((get) => {
        const ch = get(c)
        const prev = ch.presence[login]
        putPresence(ch, { ...(prev ?? { login, msgCount: 0, joinedAt: null }), present: false, leftAt: now })
        ch.activity.push({ id: ++activityId, type: 'part', login, at: now })
        if (inline) addJoinLine(ch, login, true, now)
      })
      break
    }
    case '353': {
      const names = m.trailing.split(' ').filter(Boolean).map((n) => n.toLowerCase())
      queue((get) => {
        const ch = get(c)
        for (const login of names) {
          if (login === myLogin() || login.startsWith('justinfan')) continue
          const prev = ch.presence[login]
          if (!prev?.present) putPresence(ch, { ...(prev ?? { login, msgCount: 0 }), login, joinedAt: prev?.joinedAt ?? null, present: true })
        }
      })
      break
    }
    case '366':
      queue((get) => {
        get(c).namesReceived = true
      })
      break
  }
}

// ---------- Öffentliche API ----------
let irc: TwitchIrc | null = null

// ---------- Unsichtbar lurken ----------
// Die lesende Verbindung bleibt anonym (justinfan) – so taucht man in keiner Zuschauerliste auf.
// Zum Schreiben gibt es eine zweite, angemeldete Verbindung, die einem Kanal erst beitritt,
// wenn man dort tatsächlich etwas sendet.
let writer: TwitchIrc | null = null
let writerReady: Promise<void> | null = null
let writerResolve: (() => void) | null = null

const authPair = (): { login: string; token: string } | null => {
  const a = useAuth.getState()
  return a.token && a.login ? { login: a.login, token: a.token } : null
}
const readerAuth = (ok: boolean): { login: string; token: string } | null => (ok && !useSettings.getState().invisible ? authPair() : null)

/** Vom Schreib-Kanal nur das übernehmen, was die lesende Verbindung im Unsichtbar-Modus nicht bekommt */
function handleWriter(m: IrcMessage): void {
  if (m.command === 'USERSTATE' || m.command === 'GLOBALUSERSTATE' || (m.command === 'NOTICE' && m.channel)) handle(m)
}

async function ensureWriter(c: string): Promise<TwitchIrc | null> {
  const auth = authPair()
  if (!auth) return null
  if (!writer) {
    writerReady = new Promise((r) => (writerResolve = r))
    writer = new TwitchIrc(handleWriter, (s) => {
      if (s === 'connected') writerResolve?.()
    })
    writer.setAuth(auth)
    writer.connect()
  }
  writer.join(c)
  await Promise.race([writerReady, new Promise((r) => setTimeout(r, 6000))])
  return writer
}

function stopWriter(): void {
  writer?.disconnect()
  writer = null
  writerReady = null
}

/** Unsichtbar-Modus umgeschaltet: lesende Verbindung neu anmelden */
export function applyInvisible(): void {
  if (!irc) return
  irc.setAuth(readerAuth(!!authPair()))
  if (!useSettings.getState().invisible) stopWriter()
}
let infoTimer: number | undefined
let helixTimer: number | undefined
const historyLoaded = new Set<string>()

async function loadHistory(c: string): Promise<void> {
  if (historyLoaded.has(c) || !useSettings.getState().showHistory) return
  historyLoaded.add(c)
  const lines = await recentMessages(c)
  if (!lines.length) return
  const before = ops.length
  for (const raw of lines) {
    const m = parseIrc(raw)
    if (!m || !['PRIVMSG', 'USERNOTICE', 'CLEARCHAT', 'CLEARMSG'].includes(m.command)) continue
    handle(m, true)
  }
  // Verlauf vor die Live-Nachrichten sortieren
  const added = ops.splice(before)
  queue((get, ctx) => {
    const ch = get(c)
    const live = ch.messages
    ch.messages = []
    for (const op of added) op(get, ctx)
    const ids = new Set(ch.messages.map((x) => x.id))
    ch.messages.push({ id: `s${++localId}`, kind: 'system', channel: c, ts: Date.now(), badges: [], text: '', twitchEmotes: [], systemText: t('endHistory'), noticeType: 'history' })
    ch.messages.push(...live.filter((x) => !ids.has(x.id)))
  })
}

export async function refreshInfo(): Promise<void> {
  const list = useUi.getState().channels
  if (!list.length) return
  const users = await ivrUsers(list)
  if (!users?.length) return
  queue((get) => {
    for (const u of users) {
      const c = u.login.toLowerCase()
      if (!list.includes(c)) continue
      const ch = get(c)
      ch.info = {
        displayName: u.displayName,
        avatar: u.logo,
        live: !!u.stream,
        title: u.stream?.title ?? u.lastBroadcast?.title,
        game: u.stream?.game?.displayName,
        viewers: u.stream?.viewersCount,
        startedAt: u.stream?.createdAt,
        followers: u.followers
      }
      if (!ch.room.roomId && u.id) ch.room = { ...ch.room, roomId: u.id }
    }
  })
}

/** Für Mods/Broadcaster: komplette Zuschauerliste über Helix – funktioniert auch bei großen Kanälen */
async function refreshHelixPresence(): Promise<void> {
  const ctx = helixCtx()
  if (!ctx || !useAuth.getState().scopes.includes('moderator:read:chatters')) return
  const chans = useChat.getState().channels
  for (const c of useUi.getState().channels) {
    const ch = chans[c]
    if (!ch?.room.roomId || !(ch.me.mod || ch.me.broadcaster)) continue
    const list = await helixChatters(ctx, ch.room.roomId)
    if (!list) continue
    const now = Date.now()
    const set = new Set(list.map((x) => x.toLowerCase()))
    queue((get) => {
      const st = get(c)
      const firstSnapshot = !st.helixPresence
      for (const login of set) {
        if (login === myLogin()) continue
        const prev = st.presence[login]
        if (prev?.present) continue
        putPresence(st, { ...(prev ?? { login, msgCount: 0 }), login, joinedAt: firstSnapshot ? prev?.joinedAt ?? null : now, present: true, leftAt: undefined })
        if (!firstSnapshot) st.activity.push({ id: ++activityId, type: 'join', login, at: now })
      }
      if (!firstSnapshot) {
        for (const p of Object.values(st.presence)) {
          if (p.present && !set.has(p.login) && !(p.lastMsgAt && now - p.lastMsgAt < 120_000)) {
            putPresence(st, { ...p, present: false, leftAt: now })
            st.activity.push({ id: ++activityId, type: 'part', login: p.login, at: now })
          }
        }
      }
      st.helixPresence = true
      st.namesReceived = true
    })
  }
}

export function joinChannel(c: string): void {
  useChat.setState((s) => (s.channels[c] ? s : { channels: { ...s.channels, [c]: emptyChannel(c) } }))
  irc?.join(c)
  ensureHistory(c)
  void loadChannelBadges(c)
  void loadHistory(c)
  void refreshInfo()
}

export function partChannel(c: string): void {
  irc?.part(c)
  historyLoaded.delete(c)
  useChat.setState((s) => {
    const channels = { ...s.channels }
    delete channels[c]
    return { channels }
  })
}

export function markRead(c: string): void {
  const ch = useChat.getState().channels[c]
  if (ch && (ch.unread || ch.mentions)) {
    useChat.setState((s) => ({ channels: { ...s.channels, [c]: { ...s.channels[c], unread: 0, mentions: 0 } } }))
  }
}

async function ensureToken(): Promise<boolean> {
  const a = useAuth.getState()
  if (!a.token) return false
  const v = await validateToken(a.token)
  if (v) {
    useAuth.getState().set({ login: v.login, userId: v.user_id, scopes: v.scopes, clientId: a.clientId || v.client_id })
    return true
  }
  if (a.refresh && a.clientId) {
    const t = await refreshToken(a.clientId, a.refresh)
    if (t?.access_token) {
      useAuth.getState().set({ token: t.access_token, refresh: t.refresh_token ?? a.refresh })
      const v2 = await validateToken(t.access_token)
      if (v2) {
        useAuth.getState().set({ login: v2.login, userId: v2.user_id, scopes: v2.scopes })
        return true
      }
    }
  }
  toast.error(t('sessionExpired'))
  useAuth.getState().logout()
  return false
}

export async function applyAuth(): Promise<void> {
  const ok = await ensureToken()
  const a = useAuth.getState()
  irc?.setAuth(readerAuth(ok))
  if (!ok) stopWriter()
  else writer?.setAuth({ login: a.login, token: a.token })
}

export async function startClient(): Promise<void> {
  if (irc) return
  irc = new TwitchIrc(
    (m) => handle(m),
    (s, info) => {
      useChat.setState({ conn: s, connInfo: info })
      if (s === 'disconnected') {
        useChat.setState((st) => {
          const channels: typeof st.channels = {}
          for (const [k, v] of Object.entries(st.channels)) channels[k] = { ...v, joined: false, namesReceived: false }
          return { channels }
        })
      }
    }
  )
  startHistory()
  onEmotesChanged(() => useChat.setState((s) => ({ emoteVersion: s.emoteVersion + 1 })))
  void loadGlobalEmotes()
  void loadGlobalBadges()
  const ok = await ensureToken()
  if (ok) irc.setAuth(readerAuth(ok))
  useSettings.subscribe((s, prev) => {
    if (s.invisible !== prev.invisible) applyInvisible()
  })
  for (const c of useUi.getState().channels) joinChannel(c)
  irc.connect()
  infoTimer = window.setInterval(() => void refreshInfo(), 60_000)
  helixTimer = window.setInterval(() => void refreshHelixPresence(), 45_000)
  window.setTimeout(() => void refreshHelixPresence(), 6000)
  // Token stündlich prüfen (Twitch verlangt das)
  window.setInterval(() => void applyAuthSilently(), 60 * 60 * 1000)
}

async function applyAuthSilently(): Promise<void> {
  const before = useAuth.getState().token
  if (!before) return
  await ensureToken()
  const a = useAuth.getState()
  if (a.token !== before) {
    irc?.setAuth(readerAuth(!!a.token))
    writer?.setAuth(authPair())
  }
}

export function stopClient(): void {
  window.clearInterval(infoTimer)
  window.clearInterval(helixTimer)
  irc?.disconnect()
  irc = null
  stopWriter()
}

export function reconnect(): void {
  irc?.reconnect()
}

// ---------- Senden & Befehle ----------
export const COMMANDS: { name: string; args: TKey | ''; help: TKey; mod?: boolean }[] = [
  { name: '/me', args: 'argText', help: 'cmdMe' },
  { name: '/timeout', args: 'argTimeout', help: 'cmdTimeout', mod: true },
  { name: '/ban', args: 'argBan', help: 'cmdBan', mod: true },
  { name: '/unban', args: 'argUser', help: 'cmdUnban', mod: true },
  { name: '/announce', args: 'argText', help: 'cmdAnnounce', mod: true },
  { name: '/user', args: 'argUser', help: 'cmdUser' },
  { name: '/w', args: 'argUser', help: 'cmdW' },
  { name: '/clearlocal', args: '', help: 'cmdClear' },
  { name: '/watch', args: 'argUser', help: 'cmdWatch' },
  { name: '/ignore', args: 'argUser', help: 'cmdIgnore' }
]

async function modAction(c: string, action: 'ban' | 'unban' | 'timeout', login: string, duration?: number, reason?: string): Promise<boolean> {
  const ctx = helixCtx()
  const ch = useChat.getState().channels[c]
  if (!ctx || !ch?.room.roomId) {
    toast.error(t('mustSignIn'))
    return false
  }
  const uid = await helixUserId(ctx, login)
  if (!uid) {
    toast.error(t('userNotFound', { u: login }))
    return false
  }
  const r = action === 'unban' ? await helixUnban(ctx, ch.room.roomId, uid) : await helixBan(ctx, ch.room.roomId, uid, action === 'timeout' ? duration ?? 600 : undefined, reason)
  if (!r.ok) {
    toast.error(r.error || t('actionFailed'))
    return false
  }
  toast.success(action === 'unban' ? t('unbannedToast', { u: login }) : action === 'ban' ? t('bannedToast', { u: login }) : t('timedOutToast', { u: login, d: formatDuration(duration ?? 600) }))
  return true
}

export const timeoutUser = (c: string, login: string, seconds: number): Promise<boolean> => modAction(c, 'timeout', login, seconds)
export const banUser = (c: string, login: string, reason?: string): Promise<boolean> => modAction(c, 'ban', login, undefined, reason)
export const unbanUser = (c: string, login: string): Promise<boolean> => modAction(c, 'unban', login)

export async function deleteMessage(c: string, id: string): Promise<void> {
  const ctx = helixCtx()
  const ch = useChat.getState().channels[c]
  if (!ctx || !ch?.room.roomId) return
  const r = await helixDeleteMessage(ctx, ch.room.roomId, id)
  if (!r.ok) toast.error(r.error || t('deleteFailed'))
}

/** Gibt true zurück, wenn der Text verarbeitet wurde (Eingabe leeren) */
export async function send(c: string, input: string, replyTo?: string): Promise<boolean> {
  const text = input.trim()
  if (!text) return false
  if (text.startsWith('/') && !text.startsWith('//')) {
    const [cmd, ...args] = text.split(' ')
    const arg0 = (args[0] ?? '').replace(/^@/, '').toLowerCase()
    switch (cmd.toLowerCase()) {
      case '/me':
        return sendRaw(c, `\u0001ACTION ${args.join(' ')}\u0001`, undefined)
      case '/timeout':
      case '/to':
        if (!arg0) return false
        return modAction(c, 'timeout', arg0, parseDurationArg(args[1]) ?? 600, args.slice(2).join(' ') || undefined)
      case '/ban':
        if (!arg0) return false
        return modAction(c, 'ban', arg0, undefined, args.slice(1).join(' ') || undefined)
      case '/unban':
      case '/untimeout':
        if (!arg0) return false
        return modAction(c, 'unban', arg0)
      case '/announce': {
        const ctx = helixCtx()
        const ch = useChat.getState().channels[c]
        if (!ctx || !ch?.room.roomId) return false
        const r = await helixAnnounce(ctx, ch.room.roomId, args.join(' '))
        if (!r.ok) toast.error(r.error || t('announceFailed'))
        return r.ok
      }
      case '/user':
        if (arg0) useUi.getState().set({ userCard: { login: arg0, channel: c, x: window.innerWidth / 2 - 180, y: 120 } })
        return true
      case '/w':
        if (arg0) void window.bridge.open(`https://www.twitch.tv/popout/moderator/${arg0}`)
        return true
      case '/clearlocal':
        useChat.setState((s) => ({ channels: { ...s.channels, [c]: { ...s.channels[c], messages: [] } } }))
        return true
      case '/watch':
        if (arg0) {
          useSettings.getState().toggleList('watchUsers', arg0)
          systemLine(c, t(useSettings.getState().watchUsers.includes(arg0) ? 'nowWatched' : 'notWatched', { u: arg0 }))
        }
        return true
      case '/ignore':
        if (arg0) {
          useSettings.getState().toggleList('ignoredUsers', arg0)
          systemLine(c, t(useSettings.getState().ignoredUsers.includes(arg0) ? 'nowIgnored' : 'notIgnored', { u: arg0 }))
        }
        return true
      default:
        // Unbekannte Befehle gehen als normale Nachricht raus (z. B. für Bots: !befehle sind ohnehin kein /)
        systemLine(c, t('unknownCmd', { c: cmd }), 'error')
        return false
    }
  }
  return sendRaw(c, text, replyTo)
}

async function sendRaw(c: string, text: string, replyTo?: string): Promise<boolean> {
  if (!authPair()) {
    toast.error(t('signInToChat'))
    return false
  }
  const out = useSettings.getState().invisible ? await ensureWriter(c) : irc
  if (!out?.loggedIn) {
    toast.error(t('signInToChat'))
    return false
  }
  if (!out.say(c, text, replyTo)) {
    toast.error(t('tooMany'))
    return false
  }
  // Twitch schickt eigene Nachrichten nicht zurück: lokal anzeigen
  const a = useAuth.getState()
  const ch = useChat.getState().channels[c]
  let body = text
  let kind: ChatMessage['kind'] = 'chat'
  if (body.startsWith('\u0001ACTION ')) {
    body = body.slice(8, -1)
    kind = 'action'
  }
  let reply: ChatMessage['reply']
  if (replyTo) {
    const parent = ch?.messages.find((x) => x.id === replyTo)
    if (parent) reply = { id: parent.id, login: parent.login ?? '', displayName: parent.displayName ?? '', text: parent.text }
  }
  const msg: ChatMessage = {
    id: `me${++localId}`,
    kind,
    channel: c,
    ts: Date.now(),
    login: a.login,
    displayName: ch?.me.displayName ?? useChat.getState().myDisplayName ?? a.login,
    color: ch?.me.color ?? useChat.getState().myColor,
    badges: ch?.me.badges ?? [],
    text: body,
    twitchEmotes: [],
    roomId: ch?.room.roomId,
    self: true,
    reply
  }
  queue((get) => {
    const st = get(c)
    st.messages.push(msg)
    bumpStats(st, msg, false)
  })
  return true
}

export function setWindowFocused(f: boolean): void {
  useChat.setState({ windowFocused: f })
}
