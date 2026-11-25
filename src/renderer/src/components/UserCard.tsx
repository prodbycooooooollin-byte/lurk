import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { useShallow } from 'zustand/react/shallow'
import {
  X, ExternalLink, Star, EyeOff, AtSign, Heart, Gem, Radio, CalendarDays, Users, MessageSquare, Shield, StickyNote,
  Check, Pin, ScrollText, History, Hash, MonitorPlay, Loader2, Clock, Award
} from 'lucide-react'
import { useUi, type UserCardState } from '@/store/ui'
import { useChat } from '@/store/chat'
import { useSettings } from '@/store/settings'
import { ivrSubage, ivrUsers, ownedBadges, userBadgeHistory, userLogs, type BadgeSpan, type IvrSubage, type IvrUser, type LogLine, type OwnedBadge } from '@/lib/api'
import { banUser, timeoutUser, unbanUser } from '@/lib/client'
import { findBadge } from '@/lib/emotes'
import { t, useT, type TKey } from '@/lib/i18n'
import { primeMeta, isNewAccount } from '@/lib/avatars'
import { getHistory, isRegular } from '@/lib/history'
import { isBot } from '@/lib/bots'
import { isCollectible, recordHistoric, useDexVersion, userBadges } from '@/lib/badgedex'
import { useModChannels } from './RadarFeed'
import { requestLoyalty, useLoyaltyVersion } from '@/lib/loyalty'
import { Avatar, IconButton, Tip } from './ui'
import { cn, durationSince, formatAge, formatNumber, readableColor, relTime, timeShort } from '@/lib/util'
import { tokenize } from '@/lib/tokenize'
import type { ChatMessage } from '@/lib/types'

const TIMEOUTS: [number, TKey][] = [
  [60, 't1m'],
  [600, 't10m'],
  [3600, 't1h'],
  [86400, 't1d'],
  [604800, 't1w']
]

const CARD_W = 372
type Tab = 'messages' | 'logs' | 'badges' | 'note' | 'mod'
/** gilt als "gerade auch dort", wenn anwesend oder in den letzten 30 Min. geschrieben */
const RECENT_MS = 30 * 60_000

/** Kurz für die Kachel: ab einem Jahr nur Jahre ("3 years"), sonst wie formatAge */
const compactAge = (iso: string): string => {
  const days = (Date.now() - new Date(iso).getTime()) / 86400000
  const y = Math.floor(days / 365.25)
  return y >= 1 ? t(y === 1 ? 'year1' : 'years', { n: y }) : formatAge(iso)
}

const fullDate = (iso?: string | null | number): string | undefined =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : undefined

const hours = (min: number): string => (min < 60 ? `${min} min` : `${(min / 60).toFixed(min < 600 ? 1 : 0)} h`)

/**
 * Rahmen der Infocard. Verschieben läuft komplett ohne React: während des Ziehens wird nur
 * die GPU-Transformation des Rahmens gesetzt (rAF), erst beim Loslassen die Position übernommen.
 * Vorher löste jede Mausbewegung ein Neu-Rendern der ganzen Karte aus – daher das Ruckeln.
 */
export function UserCard() {
  const card = useUi((u) => u.userCard)
  if (!card) return null
  return <CardFrame key={`${card.channel}/${card.login}/${card.x}/${card.y}`} card={card} />
}

function CardFrame({ card }: { card: UserCardState }) {
  const set = useUi((u) => u.set)
  const frame = useRef<HTMLDivElement>(null)
  const [pinned, setPinned] = useState(false)

  // Ziehen
  const startDrag = (e: React.MouseEvent): void => {
    if ((e.target as HTMLElement).closest('button,a,input,textarea')) return
    const el = frame.current
    if (!el) return
    e.preventDefault()
    // In CSS-Pixeln rechnen (offsetLeft/Top), Mauswege über den Zoomfaktor umrechnen –
    // sonst springt die Karte bei Seitenzoom ≠ 100 % beim Loslassen zurück.
    const zoom = el.getBoundingClientRect().width / el.offsetWidth || 1
    const left0 = el.offsetLeft
    const top0 = el.offsetTop
    const vw = window.innerWidth / zoom
    const vh = window.innerHeight / zoom
    const w = el.offsetWidth
    const sx = e.clientX
    const sy = e.clientY
    let dx = 0
    let dy = 0
    let raf = 0
    el.style.willChange = 'transform'
    document.body.style.cursor = 'grabbing'
    const apply = (): void => {
      raf = 0
      el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`
    }
    const move = (ev: MouseEvent): void => {
      dx = Math.min(Math.max((ev.clientX - sx) / zoom, -left0), vw - w - left0)
      dy = Math.min(Math.max((ev.clientY - sy) / zoom, 40 - top0), vh - 80 - top0)
      if (!raf) raf = requestAnimationFrame(apply)
    }
    const up = (): void => {
      cancelAnimationFrame(raf)
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      document.body.style.cursor = ''
      el.style.left = `${left0 + dx}px`
      el.style.top = `${top0 + dy}px`
      el.style.transform = ''
      el.style.willChange = ''
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  // Esc und Klick daneben schließen (außer angepinnt)
  useEffect(() => {
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !(e.target as HTMLElement)?.closest('textarea')) set({ userCard: null })
    }
    window.addEventListener('keydown', esc)
    if (pinned) return () => window.removeEventListener('keydown', esc)
    const down = (e: MouseEvent): void => {
      const el = e.target as HTMLElement | null
      if (!el || frame.current?.contains(el)) return
      if (el.closest('[data-radix-popper-content-wrapper],[role="menu"],[role="dialog"],[data-sonner-toast]')) return
      set({ userCard: null })
    }
    const tm = window.setTimeout(() => window.addEventListener('mousedown', down, true), 0)
    return () => {
      window.removeEventListener('keydown', esc)
      window.clearTimeout(tm)
      window.removeEventListener('mousedown', down, true)
    }
  }, [pinned, set])

  return (
    <div ref={frame} className="fixed z-50" style={{ left: card.x, top: card.y, width: CARD_W }}>
      <motion.div
        initial={{ opacity: 0, y: 6, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
        className="flex max-h-[min(680px,calc(100vh-56px))] flex-col overflow-hidden rounded-[14px] border border-line bg-ground shadow-[0_28px_80px_-20px_rgba(0,0,0,0.75),0_0_0_1px_rgba(255,255,255,0.02)]"
      >
        <CardBody card={card} pinned={pinned} setPinned={setPinned} startDrag={startDrag} />
      </motion.div>
    </div>
  )
}

function CardBody({ card, pinned, setPinned, startDrag }: { card: UserCardState; pinned: boolean; setPinned: (f: (v: boolean) => boolean) => void; startDrag: (e: React.MouseEvent) => void }) {
  const t = useT()
  const set = useUi((u) => u.set)
  const dark = useSettings((s) => s.theme) === 'dark'
  const watched = useSettings((s) => s.watchUsers.includes(card.login))
  const ignored = useSettings((s) => s.ignoredUsers.includes(card.login))
  const toggleList = useSettings((s) => s.toggleList)
  const hasNote = useSettings((s) => !!s.notes[card.login]?.trim())
  // nur die eine letzte Nachricht abonnieren statt der ganzen Liste
  const lastMsg = useChat((st) => {
    const ms = st.channels[card.channel]?.messages
    if (!ms) return undefined
    for (let i = ms.length - 1; i >= 0; i--) {
      const m = ms[i]
      if (m.login === card.login && (m.kind === 'chat' || m.kind === 'action')) return m
    }
    return undefined
  })
  const p = useChat((st) => st.channels[card.channel]?.presence[card.login])
  const canMod = useChat((st) => {
    const me = st.channels[card.channel]?.me
    return !!me && (me.mod || me.broadcaster)
  })
  // Twitch schickt in großen Chats keine JOINs – darum zählt auch, wer dort kürzlich geschrieben hat
  const alsoIn = useChat(
    useShallow((st) =>
      Object.keys(st.channels).filter((c) => {
        if (c === card.channel) return false
        const q = st.channels[c].presence[card.login]
        return !!q && (q.present || (!!q.lastMsgAt && Date.now() - q.lastMsgAt < RECENT_MS))
      })
    )
  )
  useDexVersion()
  const dexBadges = userBadges(card.login)
  const [user, setUser] = useState<IvrUser | null | undefined>(undefined)
  const [failed, setFailed] = useState(false)
  const [sub, setSub] = useState<IvrSubage | null | undefined>(undefined)
  const [tab, setTab] = useState<Tab>('messages')
  const [copied, setCopied] = useState<string | null>(null)
  const [bannerLoaded, setBannerLoaded] = useState(false)
  const [bannerFailed, setBannerFailed] = useState(false)

  useEffect(() => {
    let alive = true
    void ivrUsers([card.login]).then((r) => {
      if (!alive) return
      if (r === null) {
        setFailed(true)
        setUser(null)
      } else {
        const u = r[0] ?? null
        setUser(u)
        if (u) primeMeta(card.login, { logo: u.logo, createdAt: u.createdAt, displayName: u.displayName })
      }
    })
    void ivrSubage(card.login, card.channel).then((r) => alive && setSub(r))
    return () => {
      alive = false
    }
  }, [card.login, card.channel])

  const color = readableColor(lastMsg?.color ?? p?.color ?? user?.chatColor ?? undefined, card.login, dark)
  const badges = lastMsg?.badges ?? p?.badges ?? []
  const name = user?.displayName ?? lastMsg?.displayName ?? p?.displayName ?? card.login
  const loadingUser = user === undefined
  const loadingSub = sub === undefined
  const present = !!p?.present
  const hist = getHistory(card.channel, card.login)
  const bot = isBot(card.login)
  const freshAccount = isNewAccount(user?.createdAt)
  const live = user?.stream
  const roles: string[] = []
  if (user?.roles?.isStaff) roles.push('Staff')
  if (user?.roles?.isPartner) roles.push('Partner')
  else if (user?.roles?.isAffiliate) roles.push('Affiliate')

  const subMonths = sub?.cumulative?.months ?? 0
  const subActive = !!sub?.meta
  const subTier = (sub?.meta?.tier ?? '1000').replace('000', '')
  const close = (): void => set({ userCard: null })
  const copy = (what: string, value: string): void => {
    void navigator.clipboard.writeText(value)
    setCopied(what)
    window.setTimeout(() => setCopied(null), 1200)
  }

  const tabs: [Tab, string, ReactNode][] = [
    ['messages', t('msgsToday'), <MessageSquare key="m" size={12} />],
    ['logs', t('logsTab'), <ScrollText key="l" size={12} />],
    ['badges', t('badgesTab'), <Award key="b" size={12} />],
    ['note', t('noteTab'), <StickyNote key="n" size={12} />]
  ]
  if (canMod) tabs.push(['mod', t('moderation'), <Shield key="s" size={12} />])

  return (
    <>
      {/* Twitch-Banner (sonst Verlauf in der Namensfarbe) – zugleich Griff zum Verschieben */}
      <div
        className="relative h-[96px] shrink-0 cursor-grab overflow-hidden active:cursor-grabbing"
        style={{
          background: `radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, ${color} 38%, transparent) 0%, transparent 60%), radial-gradient(90% 120% at 100% 0%, color-mix(in srgb, ${color} 16%, transparent) 0%, transparent 70%), rgb(var(--raised))`
        }}
        onMouseDown={startDrag}
      >
        {user?.banner && !bannerFailed && (
          <img
            src={user.banner}
            alt=""
            draggable={false}
            onLoad={() => setBannerLoaded(true)}
            onError={() => setBannerFailed(true)}
            className={cn('pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-300', bannerLoaded ? 'opacity-100' : 'opacity-0')}
          />
        )}
        {/* weicher Übergang nach unten, damit Avatar und Buttons lesbar bleiben */}
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgb(var(--ground)/0.25)_0%,transparent_35%,transparent_55%,rgb(var(--ground)/0.85)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-px bg-line/70" />
        {live && (
          <button
            onClick={() => window.bridge.openPlayer(card.login)}
            className="absolute left-3 top-2.5 flex items-center gap-1.5 rounded-full bg-live px-2 py-[3px] text-[10.5px] font-bold uppercase tracking-[0.04em] text-white shadow-md transition hover:brightness-110"
          >
            <span className="h-1.5 w-1.5 animate-pulseDot rounded-full bg-white" />
            Live · {formatNumber(live.viewersCount)}
          </button>
        )}
        <div className="absolute right-2 top-2 flex items-center gap-0.5 rounded-lg bg-ground/55 p-0.5 backdrop-blur-md">
          <Tip label={pinned ? t('unpinCard') : t('pinCard')}>
            <IconButton className={cn(pinned ? 'text-ink' : 'text-muted')} onClick={() => setPinned((v) => !v)}>
              <Pin size={14} strokeWidth={1.75} className={cn(pinned && 'fill-current')} />
            </IconButton>
          </Tip>
          <Tip label={t('openOnTwitch')}>
            <IconButton className="text-muted" onClick={() => void window.bridge.open(`https://www.twitch.tv/${card.login}`)}>
              <ExternalLink size={14} strokeWidth={1.75} />
            </IconButton>
          </Tip>
          <IconButton className="text-muted" onClick={close}>
            <X size={15} strokeWidth={1.75} />
          </IconButton>
        </div>
      </div>

      {/* Identität */}
      <div className="relative -mt-8 flex items-end gap-3 px-4">
        <div className="relative shrink-0">
          {/* flex statt Block: sonst hängt die Inline-Grundlinie ein paar Pixel an und der Ring wird oval */}
          <div className="flex h-[64px] w-[64px] items-center justify-center rounded-full" style={{ background: 'rgb(var(--ground))', boxShadow: `0 0 0 1.5px color-mix(in srgb, ${color} 55%, transparent)` }}>
            {loadingUser ? <div className="h-[58px] w-[58px] animate-pulse rounded-full bg-raised" /> : <Avatar src={user?.logo} name={card.login} size={58} className="flex" />}
          </div>
          {present && <span className="absolute bottom-[3px] right-[3px] h-3.5 w-3.5 rounded-full border-[2.5px] border-ground bg-join" />}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-1 pb-1">
          {roles.map((r) => (
            <Chip key={r}>{r}</Chip>
          ))}
          {isRegular(hist) && <Chip tone="join">{t('regular')}</Chip>}
          {freshAccount && <Chip tone="warn">{t('newAccount')}</Chip>}
          {bot && <Chip>Bot</Chip>}

          {user?.banned && <Chip tone="live">{t('suspended')}</Chip>}
        </div>
      </div>

      <div className="px-4 pb-3 pt-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="selectable truncate text-[17px] font-semibold tracking-[-0.015em]" style={{ color }}>
            {name}
          </span>
          {badges.map((b) => {
            const bd = findBadge(card.channel, b.set, b.version)
            return bd ? <img key={b.set} src={bd.url} title={bd.title} alt="" className="h-[18px] w-[18px] rounded-[3px]" /> : null
          })}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-faint">
          {user === null ? (
            <span className="text-live">{failed ? t('loadFailed') : t('notFound')}</span>
          ) : (
            <>
              <button className="selectable hover:text-ink" onClick={() => copy('login', card.login)} title={t('copyName')}>
                @{card.login}
              </button>
              {copied === 'login' && <Check size={12} className="text-join" />}
              {user?.id && (
                <>
                  <span>·</span>
                  <button className="tabular-nums hover:text-ink" onClick={() => copy('id', user.id)} title="ID">
                    ID {user.id}
                  </button>
                  {copied === 'id' && <Check size={12} className="text-join" />}
                </>
              )}
            </>
          )}
        </div>
        {live?.title && (
          <button onClick={() => window.bridge.openPlayer(card.login)} className="mt-2 flex w-full items-center gap-2 rounded-lg border border-live/30 bg-live/[0.06] px-2.5 py-1.5 text-left text-[12px] text-muted transition hover:bg-live/10">
            <MonitorPlay size={13} className="shrink-0 text-live" />
            <span className="truncate">
              {live.game?.displayName && <b className="font-medium text-ink">{live.game.displayName} · </b>}
              {live.title}
            </span>
          </button>
        )}
        {user?.bio && <p className="selectable mt-2 line-clamp-2 text-[12.5px] leading-relaxed text-muted">{user.bio}</p>}
        {alsoIn.length > 0 && <AlsoInStrip login={card.login} channels={alsoIn} onMessages={() => setTab('messages')} />}
      </div>

      {/* Kennzahlen */}
      <div className="grid grid-cols-3 gap-2 px-4">
        <StatTile icon={<CalendarDays size={13} />} label={t('created')} value={user?.createdAt ? compactAge(user.createdAt) : '–'} hint={fullDate(user?.createdAt)} loading={loadingUser} />
        <StatTile icon={<Users size={13} />} label={t('followers')} value={user ? formatNumber(user.followers) : '–'} loading={loadingUser} />
        <StatTile icon={<MessageSquare size={13} />} label={t('msgsToday')} value={formatNumber(p?.msgCount ?? 0)} hint={hist ? t('msgsTotal', { n: formatNumber(hist.c) }) : undefined} />
      </div>

      {/* Beziehung zum Kanal */}
      <div className="mx-4 mt-3 divide-y divide-line/70 rounded-[10px] border border-line">
        <InfoRow icon={<Heart size={13} />} label={t('follows', { c: card.channel })} loading={loadingSub}>
          {sub?.followedAt ? (
            <Tip label={fullDate(sub.followedAt)}>
              <span>{t('followsFor', { t: formatAge(sub.followedAt) })}</span>
            </Tip>
          ) : (
            <span className="text-faint">{sub === null ? '–' : t('no')}</span>
          )}
        </InfoRow>
        <InfoRow icon={<Gem size={13} />} label={t('subscription')} loading={loadingSub}>
          {subActive ? (
            <span className="flex items-center gap-1.5">
              <span className="rounded-full px-1.5 py-[1px] text-[10.5px] font-semibold text-ground" style={{ background: color }}>
                T{subTier}
              </span>
              <span>{t('monthsShort', { m: subMonths })}</span>
            </span>
          ) : subMonths ? (
            <span className="text-muted">{t('formerly', { m: subMonths })}</span>
          ) : (
            <span className="text-faint">{sub === null ? '–' : t('none')}</span>
          )}
        </InfoRow>
        <InfoRow icon={<Radio size={13} />} label={t('inChatLabel')}>
          {p ? (
            <span className={cn('flex items-center gap-1.5', present ? 'text-ink' : 'text-faint')}>
              <span className={cn('h-1.5 w-1.5 rounded-full', present ? 'bg-join shadow-[0_0_0_3px_rgb(var(--join)/0.18)]' : 'border border-faint')} />
              {present
                ? p.joinedAt
                  ? t('sinceFor', { t: timeShort(p.joinedAt), d: durationSince(new Date(p.joinedAt).toISOString()) })
                  : t('forAWhile')
                : p.leftAt
                  ? t('leftAgo', { t: relTime(p.leftAt) })
                  : t('notAnymore')}
            </span>
          ) : (
            <span className="text-faint">{t('unknown')}</span>
          )}
        </InfoRow>
        {p?.lastMsgAt && (
          <InfoRow icon={<Clock size={13} />} label={t('lastMessage')}>
            <span>{relTime(p.lastMsgAt)}</span>
          </InfoRow>
        )}
        <ChatHistoryRow channel={card.channel} login={card.login} />
        <InfoRow icon={<History size={13} />} label={t('lurkHistory')}>
          {hist ? (
            <Tip label={t('firstSeen', { d: fullDate(hist.f) ?? '' })}>
              <span>{t('visitsLine', { v: hist.v, h: hours(hist.m) })}</span>
            </Tip>
          ) : (
            <span className="text-faint">{t('firstVisit')}</span>
          )}
        </InfoRow>
      </div>

      {/* Aktionen */}
      <div className="grid grid-cols-3 gap-1.5 px-4 pb-3 pt-3">
        <ActionButton
          primary
          onClick={() => {
            window.dispatchEvent(new CustomEvent('lurk:insert', { detail: { channel: card.channel, text: `@${name}` } }))
            close()
          }}
        >
          <AtSign size={13} /> {t('mention')}
        </ActionButton>
        <ActionButton active={watched} onClick={() => toggleList('watchUsers', card.login)}>
          <Star size={13} className={cn(watched && 'fill-current')} /> {watched ? t('watching') : t('watch')}
        </ActionButton>
        <ActionButton danger={ignored} onClick={() => toggleList('ignoredUsers', card.login)}>
          <EyeOff size={13} /> {ignored ? t('ignored') : t('ignore')}
        </ActionButton>
      </div>

      {/* Tabs */}
      <div className="flex shrink-0 gap-1 border-t border-line px-3 pt-2">
        {tabs.map(([id, label, icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn('flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] font-medium transition-colors', tab === id ? 'bg-raised text-ink' : 'text-faint hover:text-muted')}
          >
            {icon}
            {label}
            {id === 'note' && hasNote && <span className="h-1 w-1 rounded-full bg-ink" />}
          </button>
        ))}
      </div>

      <div className="min-h-[110px] flex-1 overflow-y-auto px-4 pb-3 pt-2">
        {tab === 'messages' && <SessionMessages card={card} others={alsoIn} />}
        {tab === 'badges' && <BadgesTab card={card} current={user?.badges} keys={dexBadges} />}
        {tab === 'logs' && <Logs card={card} />}
        {tab === 'note' && <NoteEditor login={card.login} />}
        {tab === 'mod' && canMod && (
          <div className="space-y-3 pt-1">
            <div>
              <div className="mb-1.5 text-[11.5px] text-faint">Timeout</div>
              <div className="grid grid-cols-5 gap-1">
                {TIMEOUTS.map(([sec, key]) => (
                  <button key={sec} onClick={() => void timeoutUser(card.channel, card.login, sec)} className="h-7 rounded-md border border-line text-[12px] font-medium text-muted transition-colors hover:bg-raised hover:text-ink">
                    {t(key)}
                  </button>
                ))}
              </div>
            </div>
            <BanEverywhere card={card} />
            <div className="grid grid-cols-2 gap-1.5">
              <button onClick={() => void banUser(card.channel, card.login)} className="h-8 rounded-md border border-live/40 text-[12.5px] font-medium text-live transition-colors hover:bg-live/10">
                {t('ban')}
              </button>
              <button onClick={() => void unbanUser(card.channel, card.login)} className="h-8 rounded-md border border-line text-[12.5px] font-medium text-muted transition-colors hover:bg-raised hover:text-ink">
                {t('unban')}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

/** Nachrichten dieser Sitzung – hier oder aus allen offenen Chats, neueste zuerst */
function SessionMessages({ card, others }: { card: UserCardState; others: string[] }) {
  const t = useT()
  const [scope, setScope] = useState<'here' | 'all'>('here')
  const all = scope === 'all' && others.length > 0
  const watch = all ? [card.channel, ...others] : [card.channel]
  // nur die betroffenen Listen abonnieren
  const lists = useChat(useShallow((st) => watch.map((c) => st.channels[c]?.messages)))
  const msgs = useMemo(() => {
    const out: ChatMessage[] = []
    for (const messages of lists) {
      if (!messages) continue
      let n = 0
      for (let i = messages.length - 1; i >= 0 && n < 80; i--) {
        const m = messages[i]
        if (m.login === card.login && (m.kind === 'chat' || m.kind === 'action')) {
          out.push(m)
          n++
        }
      }
    }
    return out.sort((a, b) => b.ts - a.ts).slice(0, 120)
  }, [lists, card.login])
  const otherCount = useChat((st) => {
    let n = 0
    for (const c of others) n += st.channels[c]?.presence[card.login]?.msgCount ?? 0
    return n
  })
  return (
    <>
      {others.length > 0 && (
        <div className="sticky top-0 z-[1] -mx-4 mb-1 flex items-center gap-1 bg-ground/95 px-4 pb-1.5 pt-0.5 backdrop-blur">
          {(['here', 'all'] as const).map((k) => (
            <button
              key={k}
              onClick={() => setScope(k)}
              className={cn('rounded-full px-2 py-[2px] text-[11px] font-medium transition-colors', scope === k ? 'bg-ink text-ground' : 'text-faint hover:text-muted')}
            >
              {k === 'here' ? `#${card.channel}` : t('allChats', { n: otherCount })}
            </button>
          ))}
        </div>
      )}
      {!msgs.length ? (
        <div className="py-6 text-center text-[12px] text-faint">{t('nothingSince')}</div>
      ) : (
        msgs.map((m) => <MiniMessage key={m.id} msg={m} channelTag={all && m.channel !== card.channel ? m.channel : undefined} />)
      )}
    </>
  )
}

/** "Gerade auch in": Kanäle als Chips mit Avatar. Klick zeigt die Nachrichten von dort, Strg+Klick öffnet den Kanal daneben */
function AlsoInStrip({ login, channels, onMessages }: { login: string; channels: string[]; onMessages: () => void }) {
  const t = useT()
  const infos = useChat(
    useShallow((st) =>
      channels.map((c) => {
        const ch = st.channels[c]
        const q = ch?.presence[login]
        return { c, avatar: ch?.info.avatar, name: ch?.info.displayName ?? c, live: !!ch?.info.live, msgs: q?.msgCount ?? 0, here: !!q?.present }
      })
    )
  )
  return (
    <div className="mt-2.5 rounded-[10px] border border-line bg-raised/30 px-2.5 py-2">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-faint">
        <Hash size={11} />
        {t('alsoInNow')}
        <span className="ml-auto font-normal">{t('alsoInHint')}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {infos.map((i) => (
          <Tip key={i.c} label={i.msgs ? t('alsoInMsgs', { n: i.msgs }) : i.here ? t('alsoInLurking') : t('alsoInRecent')}>
            <button
              onClick={(e) => (e.ctrlKey || e.metaKey ? useUi.getState().openSplit(i.c) : i.msgs ? onMessages() : useUi.getState().showChannel(i.c))}
              className="flex items-center gap-1.5 rounded-full border border-line bg-ground py-[2px] pl-[2px] pr-2 text-[11.5px] text-muted transition-colors hover:border-muted hover:text-ink"
            >
              <span className="relative flex">
                <Avatar src={i.avatar} name={i.c} size={18} className="flex" />
                {i.live && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border-[1.5px] border-ground bg-live" />}
              </span>
              {i.name}
              {i.msgs > 0 && <span className="rounded-full bg-raised px-1 text-[10px] tabular-nums text-faint">{i.msgs}</span>}
            </button>
          </Tip>
        ))}
      </div>
    </div>
  )
}

/**
 * Alle Badges einer Person. Twitch zeigt anderen immer nur das ausgewählte, darum:
 *  1. BadgeHQ – die vollständige Sammlung des Accounts
 *  2. öffentliche Chat-Logs dieses Kanals – wann welches Badge getragen wurde
 *  3. was Lurk selbst in deinen Chats gesehen hat (Rückfall, falls 1 und 2 nicht antworten)
 */
function BadgesTab({ card, current, keys }: { card: UserCardState; current?: { setID: string; version: string }[]; keys: string[] }) {
  const t = useT()
  const [owned, setOwned] = useState<OwnedBadge[] | null | undefined>(undefined)
  const [hist, setHist] = useState<{ spans: BadgeSpan[]; months: number; messages: number } | null | undefined>(undefined)
  useEffect(() => {
    let alive = true
    setOwned(undefined)
    setHist(undefined)
    void ownedBadges(card.login).then((r) => {
      if (!alive) return
      setOwned(r)
      if (r) {
        const now = Date.now()
        recordHistoric(card.login, r.map((b) => ({ key: `${b.setId}/${b.version}`, first: now, last: now })), card.channel)
      }
    })
    void userBadgeHistory(card.channel, card.login).then((r) => {
      if (!alive) return
      setHist(r)
      if (r) recordHistoric(card.login, r.spans, card.channel)
    })
    return () => {
      alive = false
    }
  }, [card.channel, card.login])

  const rows = useMemo(() => {
    type Row = { key: string; title?: string; description?: string; image?: string; first?: number; last?: number; count?: number; worn: boolean; owned: boolean; live: boolean }
    const m = new Map<string, Row>()
    const row = (key: string): Row => {
      let r = m.get(key)
      if (!r) m.set(key, (r = { key, worn: false, owned: false, live: false }))
      return r
    }
    for (const b of owned ?? []) Object.assign(row(`${b.setId}/${b.version}`), { owned: true, title: b.title, description: b.description, image: b.image })
    for (const b of current ?? []) row(`${b.setID}/${b.version}`).worn = true
    for (const k of keys) row(k).live = true
    for (const s of hist?.spans ?? []) {
      // Kanal-Badges (Sub, Bits …) gehören zum Kanal, nicht zur Sammlung
      if (!isCollectible(s.key.split('/')[0])) continue
      Object.assign(row(s.key), { first: s.first, last: s.last, count: s.count })
    }
    return [...m.values()]
      .map((r) => {
        const [set, version] = r.key.split('/')
        const b = findBadge(card.channel, set, version)
        return { ...r, title: r.title ?? b?.title, description: r.description ?? b?.description, image: b?.url4x ?? r.image }
      })
      .filter((r) => r.title && r.image)
      .sort((a, b) => Number(b.worn) - Number(a.worn) || (b.last ?? 0) - (a.last ?? 0) || a.title!.localeCompare(b.title!))
  }, [owned, current, keys, hist, card.channel])

  const loading = owned === undefined
  const month = (ms: number): string => new Date(ms).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
  return (
    <>
      <div className="mb-2 flex items-start gap-2 text-[11.5px] leading-snug text-faint">
        {(loading || hist === undefined) && <Loader2 size={12} className="mt-[1px] shrink-0 animate-spin" />}
        <span>
          {loading
            ? t('badgesLoading')
            : owned
              ? t('badgesOwned', { n: rows.length })
              : t('badgesFallback', { n: rows.length })}
          {hist && rows.some((r) => r.count) && <> · {t('badgesLogNote', { c: card.channel, m: hist.months })}</>}
        </span>
      </div>
      {!rows.length && !loading ? (
        <div className="py-5 text-center text-[12px] leading-relaxed text-faint">{t('badgesNone')}</div>
      ) : (
        <div className="divide-y divide-line/60">
          {rows.map((r) => (
            <Tip key={r.key} label={r.description ?? r.title!} side="left">
              <button
                onClick={() => useUi.getState().set({ dexOpen: true, dexFocus: r.key })}
                className="flex w-full items-center gap-2.5 py-1.5 text-left transition-colors hover:bg-raised/40"
              >
                <img src={r.image} alt="" className="h-6 w-6 shrink-0" draggable={false} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] text-ink">{r.title}</span>
                  {(r.first || r.count) && (
                    <span className="block truncate text-[11px] text-faint">
                      {r.first && r.last ? t('badgeWornIn', { d: month(r.first) === month(r.last) ? month(r.last) : `${month(r.first)} – ${month(r.last)}`, c: card.channel }) : ''}
                      {r.count ? ` · ${t('badgeMsgs', { n: formatNumber(r.count) })}` : ''}
                    </span>
                  )}
                </span>
                {r.worn && <span className="shrink-0 rounded-full border border-line px-1.5 py-[1px] text-[10.5px] text-muted">{t('badgeWorn')}</span>}
              </button>
            </Tip>
          ))}
        </div>
      )}
      {owned && (
        <button onClick={() => void window.bridge.open(`https://www.badgehq.xyz/u/${card.login}`)} className="mt-2 w-full text-center text-[11px] text-faint hover:text-ink">
          {t('badgesViaBhq')}
        </button>
      )}
    </>
  )
}

/** Ältere Nachrichten aus den öffentlichen Logs (logs.ivr.fi) */
function Logs({ card }: { card: UserCardState }) {
  const t = useT()
  const [lines, setLines] = useState<LogLine[] | null | undefined>(undefined)
  useEffect(() => {
    let alive = true
    void userLogs(card.channel, card.login).then((r) => alive && setLines(r))
    return () => {
      alive = false
    }
  }, [card.channel, card.login])
  if (lines === undefined)
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-[12px] text-faint">
        <Loader2 size={13} className="animate-spin" /> {t('logsLoading')}
      </div>
    )
  if (lines === null || !lines.length) return <div className="py-6 text-center text-[12px] leading-relaxed text-faint">{lines === null ? t('logsNone') : t('logsEmpty')}</div>
  let lastDay = ''
  return (
    <>
      {lines.map((l, i) => {
        const d = new Date(l.timestamp)
        const day = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
        const head = day !== lastDay
        lastDay = day
        return (
          <div key={i}>
            {head && <div className="sticky top-0 -mx-4 bg-ground/95 px-4 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-faint backdrop-blur">{day}</div>}
            <div className="chat-line selectable flex gap-2 border-b border-line/40 py-1.5 text-[13px] last:border-0">
              <span className="w-9 shrink-0 pt-[3px] text-[10.5px] tabular-nums text-faint">{timeShort(d.getTime())}</span>
              <span className="min-w-0 flex-1 break-words">{l.text}</span>
            </div>
          </div>
        )
      })}
      <button onClick={() => void window.bridge.open(`https://logs.ivr.fi/?channel=${card.channel}&username=${card.login}`)} className="mt-2 w-full text-center text-[11.5px] text-faint hover:text-ink">
        {t('logsMore')}
      </button>
    </>
  )
}

/** Seit wann und wie regelmäßig jemand in diesem Kanal schreibt (öffentliche Chat-Logs) */
function ChatHistoryRow({ channel, login }: { channel: string; login: string }) {
  const t = useT()
  useLoyaltyVersion()
  const l = requestLoyalty(channel, login)
  if (l && !l.logMonths) return null
  return (
    <InfoRow icon={<ScrollText size={13} />} label={t('chatsHere')} loading={!l}>
      {l?.firstLog && (
        <Tip label={t('chatsHereHint', { n: l.logMonths ?? 0 })}>
          <span>{t('chatsHereSince', { d: new Date(l.firstLog).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }), n: l.logMonths ?? 0 })}</span>
        </Tip>
      )}
    </InfoRow>
  )
}

function BanEverywhere({ card }: { card: UserCardState }) {
  const t = useT()
  const mods = useModChannels()
  if (mods.length < 2) return null
  return (
    <button
      onClick={() => void Promise.all(mods.map((c) => banUser(c, card.login)))}
      title={mods.map((c) => `#${c}`).join(', ')}
      className="h-8 w-full rounded-md border border-live/40 text-[12.5px] font-medium text-live transition-colors hover:bg-live/10"
    >
      {t('banEverywhere', { n: mods.length })}
    </button>
  )
}

function NoteEditor({ login }: { login: string }) {
  const t = useT()
  const setNoteStore = useSettings((s) => s.setNote)
  const [note, setNote] = useState(() => useSettings.getState().notes[login] ?? '')
  return (
    <textarea
      autoFocus
      value={note}
      onChange={(e) => setNote(e.target.value)}
      onBlur={() => setNoteStore(login, note)}
      placeholder={t('notePlaceholder')}
      rows={4}
      className="w-full resize-none rounded-lg border border-line bg-raised/40 p-2.5 text-[12.5px] leading-relaxed placeholder:text-faint focus:border-muted"
    />
  )
}

const MiniMessage = memo(function MiniMessage({ msg, channelTag }: { msg: ChatMessage; channelTag?: string }) {
  const thirdParty = useSettings((s) => s.thirdPartyEmotes)
  const emoteVersion = useChat((s) => s.emoteVersion)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const tokens = useMemo(() => tokenize(msg.text, msg.twitchEmotes, msg.roomId, thirdParty), [msg.text, msg.twitchEmotes, msg.roomId, thirdParty, emoteVersion])
  return (
    <div className={cn('chat-line selectable flex gap-2 border-b border-line/40 py-1.5 text-[13px] last:border-0', msg.deleted && 'line-through opacity-40')}>
      <span className="w-9 shrink-0 pt-[3px] text-[10.5px] tabular-nums text-faint">{timeShort(msg.ts)}</span>
      <span className="min-w-0 flex-1 break-words">
        {channelTag && (
          <button onClick={() => useUi.getState().showChannel(channelTag)} className="mr-1.5 rounded-full bg-raised px-1.5 py-[1px] align-[1px] text-[10.5px] font-medium text-muted hover:text-ink">
            #{channelTag}
          </button>
        )}
        {tokens.map((tk, i) => (tk.t === 'emote' ? <img key={i} className="emote" src={tk.e.url} alt={tk.e.name} data-emote={tk.e.name} data-big={tk.e.url4x ?? tk.e.url} data-src={tk.e.source} data-scope={tk.e.scope} /> : <span key={i}>{tk.v}</span>))}
      </span>
    </div>
  )
})

function Chip({ children, tone }: { children: ReactNode; tone?: 'join' | 'warn' | 'live' }) {
  return (
    <span
      className={cn(
        'rounded-full border px-2 py-[1px] text-[10.5px] font-medium',
        !tone && 'border-line bg-raised text-muted',
        tone === 'join' && 'border-join/40 bg-join/10 text-join',
        tone === 'warn' && 'border-warn/40 bg-warn/10 text-warn',
        tone === 'live' && 'border-live/40 bg-live/10 text-live'
      )}
    >
      {children}
    </span>
  )
}

function StatTile({ icon, label, value, hint, loading }: { icon: ReactNode; label: string; value: string; hint?: string; loading?: boolean }) {
  const inner = (
    <div className="relative min-w-0 rounded-[10px] border border-line bg-raised/40 px-2.5 pb-2 pt-2.5">
      <span className="absolute right-2 top-2 text-faint/70">{icon}</span>
      {loading ? <div className="mb-1 mt-0.5 h-4 w-12 animate-pulse rounded bg-line" /> : <div className="truncate pr-4 text-[15px] font-semibold leading-tight tabular-nums tracking-[-0.015em] text-ink">{value}</div>}
      <div className="mt-0.5 truncate text-[11px] text-faint">{label}</div>
    </div>
  )
  return hint ? <Tip label={hint}>{inner}</Tip> : inner
}

function InfoRow({ icon, label, loading, children }: { icon: ReactNode; label: string; loading?: boolean; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2 text-[12.5px]">
      <span className="text-faint">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-muted">{label}</span>
      {loading ? <span className="h-3.5 w-16 animate-pulse rounded bg-line" /> : <span className="shrink-0 font-medium text-ink">{children}</span>}
    </div>
  )
}

function ActionButton({ primary, active, danger, className, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean; active?: boolean; danger?: boolean }) {
  return (
    <button
      className={cn(
        'inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg text-[12px] font-medium transition-colors',
        primary ? 'bg-ink text-ground hover:bg-ink/85' : 'border border-line text-ink hover:bg-raised',
        active && 'border-warn/50 bg-warn/10 text-warn hover:bg-warn/15',
        danger && 'border-live/40 bg-live/10 text-live hover:bg-live/15',
        className
      )}
      {...p}
    />
  )
}
