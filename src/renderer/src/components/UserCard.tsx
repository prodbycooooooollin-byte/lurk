import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { X, ExternalLink, Star, EyeOff, AtSign, Copy, Heart, Gem, Radio, CalendarDays, Users, MessageSquare, Shield, StickyNote, Check, Pin } from 'lucide-react'
import { useUi } from '@/store/ui'
import { useChat } from '@/store/chat'
import { useSettings } from '@/store/settings'
import { ivrSubage, ivrUsers, type IvrSubage, type IvrUser } from '@/lib/api'
import { banUser, timeoutUser, unbanUser } from '@/lib/client'
import { findBadge } from '@/lib/emotes'
import { t, useT, type TKey } from '@/lib/i18n'
import { Avatar, IconButton, Tip } from './ui'
import { cn, formatAge, formatNumber, readableColor, timeShort } from '@/lib/util'
import { tokenize } from '@/lib/tokenize'
import type { ChatMessage } from '@/lib/types'

const TIMEOUTS: [number, TKey][] = [
  [60, 't1m'],
  [600, 't10m'],
  [3600, 't1h'],
  [86400, 't1d'],
  [604800, 't1w']
]

const CARD_W = 360
type Tab = 'messages' | 'note' | 'mod'

/** Kurz für die Kachel: ab einem Jahr nur Jahre ("3 years"), sonst wie formatAge */
const compactAge = (iso: string): string => {
  const days = (Date.now() - new Date(iso).getTime()) / 86400000
  const y = Math.floor(days / 365.25)
  return y >= 1 ? t(y === 1 ? 'year1' : 'years', { n: y }) : formatAge(iso)
}

const fullDate = (iso?: string | null): string | undefined => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : undefined)

export function UserCard() {
  const t = useT()
  const card = useUi((u) => u.userCard)
  const set = useUi((u) => u.set)
  const theme = useSettings((s) => s.theme)
  const watchUsers = useSettings((s) => s.watchUsers)
  const ignoredUsers = useSettings((s) => s.ignoredUsers)
  const toggleList = useSettings((s) => s.toggleList)
  const setNoteStore = useSettings((s) => s.setNote)
  const messages = useChat((st) => (card ? st.channels[card.channel]?.messages : undefined))
  const p = useChat((st) => (card ? st.channels[card.channel]?.presence[card.login] : undefined))
  const me = useChat((st) => (card ? st.channels[card.channel]?.me : undefined))
  const [user, setUser] = useState<IvrUser | null | undefined>(undefined)
  const [failed, setFailed] = useState(false)
  const [sub, setSub] = useState<IvrSubage | null | undefined>(undefined)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const drag = useRef<{ dx: number; dy: number } | null>(null)
  const [note, setNote] = useState('')
  const [tab, setTab] = useState<Tab>('messages')
  const [copied, setCopied] = useState(false)
  // angepinnt: bleibt offen, auch wenn man daneben klickt
  const [pinned, setPinned] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!card) return
    setPos({ x: card.x, y: card.y })
    setUser(undefined)
    setFailed(false)
    setSub(undefined)
    setTab('messages')
    setPinned(false)
    setNote(useSettings.getState().notes[card.login] ?? '')
    let alive = true
    void ivrUsers([card.login]).then((r) => {
      if (!alive) return
      if (r === null) {
        setFailed(true)
        setUser(null)
      } else setUser(r[0] ?? null)
    })
    void ivrSubage(card.login, card.channel).then((r) => alive && setSub(r))
    return () => {
      alive = false
    }
  }, [card])

  useEffect(() => {
    const move = (e: MouseEvent): void => {
      if (!drag.current) return
      setPos({ x: Math.min(Math.max(0, e.clientX - drag.current.dx), window.innerWidth - CARD_W), y: Math.min(Math.max(40, e.clientY - drag.current.dy), window.innerHeight - 80) })
    }
    const up = (): void => {
      drag.current = null
    }
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !(e.target as HTMLElement)?.closest('textarea')) set({ userCard: null })
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      window.removeEventListener('keydown', esc)
    }
  }, [set])

  // Klick außerhalb schließt die Karte (außer angepinnt). Klicks auf Namen öffnen ohnehin eine neue.
  useEffect(() => {
    if (!card || pinned) return
    const down = (e: MouseEvent): void => {
      const el = e.target as HTMLElement | null
      if (!el || cardRef.current?.contains(el)) return
      // Menüs, Tooltips und Dialoge (Portale) nicht als "daneben" werten
      if (el.closest('[data-radix-popper-content-wrapper],[role="menu"],[role="dialog"],[data-sonner-toast]')) return
      set({ userCard: null })
    }
    // erst nach dem öffnenden Klick scharf schalten
    const t = window.setTimeout(() => window.addEventListener('mousedown', down, true), 0)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('mousedown', down, true)
    }
  }, [card, pinned, set])

  const msgs = useMemo(() => {
    if (!card || !messages) return []
    const out: ChatMessage[] = []
    for (let i = messages.length - 1; i >= 0 && out.length < 60; i--) {
      const m = messages[i]
      if (m.login === card.login && (m.kind === 'chat' || m.kind === 'action')) out.push(m)
    }
    return out
  }, [card, messages])

  if (!card) return null
  const lastMsg = msgs[0]
  const canMod = !!me && (me.mod || me.broadcaster)
  const dark = theme === 'dark'
  const color = readableColor(lastMsg?.color ?? p?.color ?? user?.chatColor ?? undefined, card.login, dark)
  const watched = watchUsers.includes(card.login)
  const ignored = ignoredUsers.includes(card.login)
  const badges = lastMsg?.badges ?? p?.badges ?? []
  const name = user?.displayName ?? lastMsg?.displayName ?? card.login
  const loadingUser = user === undefined
  const loadingSub = sub === undefined
  const present = !!p?.present
  const roles: string[] = []
  if (user?.roles?.isStaff) roles.push('Staff')
  if (user?.roles?.isPartner) roles.push('Partner')
  else if (user?.roles?.isAffiliate) roles.push('Affiliate')

  const subMonths = sub?.cumulative?.months ?? 0
  const subActive = !!sub?.meta
  const subTier = (sub?.meta?.tier ?? '1000').replace('000', '')
  const close = (): void => set({ userCard: null })

  const tabs: [Tab, string, ReactNode][] = [
    ['messages', `${t('msgsToday')}${msgs.length ? ` · ${msgs.length}` : ''}`, <MessageSquare key="m" size={12} />],
    ['note', t('noteTab'), <StickyNote key="n" size={12} />]
  ]
  if (canMod) tabs.push(['mod', t('moderation'), <Shield key="s" size={12} />])

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
      className="fixed z-50 flex max-h-[min(640px,calc(100vh-56px))] flex-col overflow-hidden rounded-[14px] border border-line bg-ground shadow-[0_28px_80px_-20px_rgba(0,0,0,0.75),0_0_0_1px_rgba(255,255,255,0.02)]"
      style={{ left: pos.x, top: pos.y, width: CARD_W, ['--uc' as string]: color }}
    >
      {/* Banner in der Namensfarbe */}
      <div
        className="relative h-[68px] shrink-0 cursor-grab active:cursor-grabbing"
        style={{
          background: `radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, var(--uc) 38%, transparent) 0%, transparent 60%), radial-gradient(90% 120% at 100% 0%, color-mix(in srgb, var(--uc) 16%, transparent) 0%, transparent 70%), rgb(var(--raised))`
        }}
        onMouseDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return
          drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }
        }}
      >
        <div className="absolute inset-x-0 bottom-0 h-px bg-line/70" />
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
          <Tip label={t('copyName')}>
            <IconButton
              className="text-muted"
              onClick={() => {
                void navigator.clipboard.writeText(card.login)
                setCopied(true)
                window.setTimeout(() => setCopied(false), 1200)
              }}
            >
              {copied ? <Check size={14} strokeWidth={2} className="text-join" /> : <Copy size={14} strokeWidth={1.75} />}
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
          <div className="rounded-full p-[3px]" style={{ background: 'rgb(var(--ground))', boxShadow: `0 0 0 1.5px color-mix(in srgb, var(--uc) 55%, transparent)` }}>
            {loadingUser ? <div className="h-[58px] w-[58px] animate-pulse rounded-full bg-raised" /> : <Avatar src={user?.logo} name={card.login} size={58} />}
          </div>
          {present && (
            <Tip label={t('inChatLabel')}>
              <span className="absolute bottom-[3px] right-[3px] h-3.5 w-3.5 rounded-full border-[2.5px] border-ground bg-join" />
            </Tip>
          )}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-1 pb-1">
          {roles.map((r) => (
            <span key={r} className="rounded-full border border-line bg-raised px-2 py-[1px] text-[10.5px] font-medium text-muted">
              {r}
            </span>
          ))}
          {user?.banned && <span className="rounded-full border border-live/40 bg-live/10 px-2 py-[1px] text-[10.5px] font-medium text-live">{t('suspended')}</span>}
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
        <div className="mt-0.5 text-[12.5px] text-faint">
          {user === null ? <span className="text-live">{failed ? t('loadFailed') : t('notFound')}</span> : <span className="selectable">@{card.login}</span>}
        </div>
        {user?.bio && <p className="selectable mt-2 line-clamp-2 text-[12.5px] leading-relaxed text-muted">{user.bio}</p>}
      </div>

      {/* Kennzahlen */}
      <div className="grid grid-cols-3 gap-2 px-4">
        <StatTile icon={<CalendarDays size={13} />} label={t('created')} value={user?.createdAt ? compactAge(user.createdAt) : '–'} hint={fullDate(user?.createdAt)} loading={loadingUser} />
        <StatTile icon={<Users size={13} />} label={t('followers')} value={user ? formatNumber(user.followers) : '–'} loading={loadingUser} />
        <StatTile icon={<MessageSquare size={13} />} label={t('msgsToday')} value={formatNumber(p?.msgCount ?? msgs.length)} />
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
              <span className="rounded-full px-1.5 py-[1px] text-[10.5px] font-semibold text-ground" style={{ background: 'var(--uc)' }}>
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
              {present ? (p.joinedAt ? t('since', { t: timeShort(p.joinedAt) }) : t('forAWhile')) : t('notAnymore')}
            </span>
          ) : (
            <span className="text-faint">{t('unknown')}</span>
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
            {id === 'note' && note.trim() && <span className="h-1 w-1 rounded-full bg-ink" />}
          </button>
        ))}
      </div>

      <div className="min-h-[96px] flex-1 overflow-y-auto px-4 pb-3 pt-2">
        {tab === 'messages' && (
          <>
            {msgs.length === 0 && <div className="py-6 text-center text-[12px] text-faint">{t('nothingSince')}</div>}
            {msgs.map((m) => (
              <MiniMessage key={m.id} msg={m} />
            ))}
          </>
        )}
        {tab === 'note' && (
          <textarea
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => setNoteStore(card.login, note)}
            placeholder={t('notePlaceholder')}
            rows={4}
            className="w-full resize-none rounded-lg border border-line bg-raised/40 p-2.5 text-[12.5px] leading-relaxed placeholder:text-faint focus:border-muted"
          />
        )}
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
    </motion.div>
  )
}

const MiniMessage = memo(function MiniMessage({ msg }: { msg: ChatMessage }) {
  const thirdParty = useSettings((s) => s.thirdPartyEmotes)
  const emoteVersion = useChat((s) => s.emoteVersion)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const tokens = useMemo(() => tokenize(msg.text, msg.twitchEmotes, msg.roomId, thirdParty), [msg.text, msg.twitchEmotes, msg.roomId, thirdParty, emoteVersion])
  return (
    <div className={cn('chat-line selectable flex gap-2 border-b border-line/40 py-1.5 text-[13px] last:border-0', msg.deleted && 'line-through opacity-40')}>
      <span className="w-9 shrink-0 pt-[3px] text-[10.5px] tabular-nums text-faint">{timeShort(msg.ts)}</span>
      <span className="min-w-0 flex-1 break-words">
        {tokens.map((tk, i) => (tk.t === 'emote' ? <img key={i} className="emote" src={tk.e.url} alt={tk.e.name} data-emote={tk.e.name} data-big={tk.e.url4x ?? tk.e.url} data-src={tk.e.source} data-scope={tk.e.scope} /> : <span key={i}>{tk.v}</span>))}
      </span>
    </div>
  )
})

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
