import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { X, ExternalLink, Star, EyeOff, AtSign, Copy } from 'lucide-react'
import { useUi } from '@/store/ui'
import { useChat } from '@/store/chat'
import { useSettings } from '@/store/settings'
import { ivrSubage, ivrUsers, type IvrSubage, type IvrUser } from '@/lib/api'
import { banUser, timeoutUser, unbanUser } from '@/lib/client'
import { findBadge } from '@/lib/emotes'
import { useT, type TKey } from '@/lib/i18n'
import { Avatar, Button, IconButton } from './ui'
import { cn, formatAge, formatNumber, readableColor, timeShort } from '@/lib/util'
import { tokenize } from '@/lib/tokenize'

const TIMEOUTS: [number, TKey][] = [
  [60, 't1m'],
  [600, 't10m'],
  [3600, 't1h'],
  [86400, 't1d'],
  [604800, 't1w']
]

export function UserCard() {
  const t = useT()
  const card = useUi((u) => u.userCard)
  const set = useUi((u) => u.set)
  const s = useSettings()
  const ch = useChat((st) => (card ? st.channels[card.channel] : undefined))
  useChat((st) => st.emoteVersion)
  const [user, setUser] = useState<IvrUser | null | undefined>(undefined)
  const [failed, setFailed] = useState(false)
  const [sub, setSub] = useState<IvrSubage | null | undefined>(undefined)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const drag = useRef<{ dx: number; dy: number } | null>(null)
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!card) return
    setPos({ x: card.x, y: card.y })
    setUser(undefined)
    setFailed(false)
    setSub(undefined)
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
      setPos({ x: Math.min(Math.max(0, e.clientX - drag.current.dx), window.innerWidth - 340), y: Math.min(Math.max(40, e.clientY - drag.current.dy), window.innerHeight - 80) })
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

  const msgs = useMemo(() => (card && ch ? ch.messages.filter((m) => m.login === card.login && (m.kind === 'chat' || m.kind === 'action')).slice(-60) : []), [card, ch])

  if (!card) return null
  const p = ch?.presence[card.login]
  const lastMsg = msgs[msgs.length - 1]
  const canMod = !!ch && (ch.me.mod || ch.me.broadcaster)
  const color = readableColor(lastMsg?.color ?? p?.color ?? user?.chatColor ?? undefined, card.login, s.theme === 'dark')
  const watched = s.watchUsers.includes(card.login)
  const ignored = s.ignoredUsers.includes(card.login)
  const badges = lastMsg?.badges ?? p?.badges ?? []
  const loading = '…'

  const subText = sub
    ? sub.meta
      ? t('tier', { t: (sub.meta.tier ?? '1000').replace('000', ''), m: sub.cumulative?.months ?? 0 })
      : sub.cumulative?.months
        ? t('formerly', { m: sub.cumulative.months })
        : t('none')
    : sub === undefined
      ? loading
      : '–'

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.14, ease: 'easeOut' }}
      className="fixed z-50 flex max-h-[min(620px,calc(100vh-60px))] w-[340px] flex-col overflow-hidden rounded-window border border-line bg-ground shadow-[0_24px_64px_-16px_rgba(0,0,0,0.7)]"
      style={{ left: pos.x, top: pos.y }}
    >
      <div
        className="flex cursor-grab items-center gap-3 px-4 pb-3 pt-4 active:cursor-grabbing"
        onMouseDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return
          drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }
        }}
      >
        <Avatar src={user?.logo} name={card.login} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[15px] font-semibold" style={{ color }}>
              {user?.displayName ?? lastMsg?.displayName ?? card.login}
            </span>
            {badges.map((b) => {
              const bd = findBadge(card.channel, b.set, b.version)
              return bd ? <img key={b.set} src={bd.url} title={bd.title} alt="" className="h-4 w-4" /> : null
            })}
          </div>
          <div className="text-[12px] text-faint">
            {user === null ? <span className="text-live">{failed ? t('loadFailed') : t('notFound')}</span> : user?.banned ? <span className="text-live">{t('suspended')}</span> : `@${card.login}`}
          </div>
        </div>
        <div className="flex self-start">
          <IconButton title={t('openOnTwitch')} onClick={() => void window.bridge.open(`https://www.twitch.tv/${card.login}`)}>
            <ExternalLink size={14} strokeWidth={1.75} />
          </IconButton>
          <IconButton title={t('copyName')} onClick={() => void navigator.clipboard.writeText(card.login)}>
            <Copy size={14} strokeWidth={1.75} />
          </IconButton>
          <IconButton onClick={() => set({ userCard: null })}>
            <X size={15} strokeWidth={1.75} />
          </IconButton>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-y border-line px-4 py-3 text-[12.5px]">
        <Fact label={t('created')} value={user?.createdAt ? t('ago', { t: formatAge(user.createdAt) }) : user === undefined ? loading : '–'} />
        <Fact label={t('followers')} value={user ? formatNumber(user.followers) : user === undefined ? loading : '–'} />
        <Fact label={t('follows', { c: card.channel })} value={sub ? (sub.followedAt ? t('followsFor', { t: formatAge(sub.followedAt) }) : t('no')) : sub === undefined ? loading : '–'} />
        <Fact label={t('subscription')} value={subText} />
        <Fact
          label={t('inChatLabel')}
          value={p ? (p.present ? (p.joinedAt ? t('since', { t: timeShort(p.joinedAt) }) : t('forAWhile')) : t('notAnymore')) : t('unknown')}
          dot={p?.present}
        />
        <Fact label={t('msgsToday')} value={String(p?.msgCount ?? msgs.length)} />
      </dl>

      <div className="flex flex-wrap items-center gap-1.5 px-4 py-3">
        <Button
          size="sm"
          variant="primary"
          onClick={() => {
            window.dispatchEvent(new CustomEvent('lurk:insert', { detail: { channel: card.channel, text: `@${user?.displayName ?? card.login}` } }))
            set({ userCard: null })
          }}
        >
          <AtSign size={13} /> {t('mention')}
        </Button>
        <Button size="sm" onClick={() => s.toggleList('watchUsers', card.login)}>
          <Star size={13} className={cn(watched && 'fill-current')} /> {watched ? t('watching') : t('watch')}
        </Button>
        <Button size="sm" onClick={() => s.toggleList('ignoredUsers', card.login)} className={cn(ignored && 'text-live')}>
          <EyeOff size={13} /> {ignored ? t('ignored') : t('ignore')}
        </Button>
      </div>

      {canMod && (
        <div className="border-t border-line px-4 py-3">
          <div className="mb-2 text-[11.5px] text-faint">{t('moderation')}</div>
          <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-[12.5px]">
            {TIMEOUTS.map(([sec, key]) => (
              <button key={sec} onClick={() => void timeoutUser(card.channel, card.login, sec)} className="text-muted hover:text-ink">
                {t(key)}
              </button>
            ))}
            <button onClick={() => void banUser(card.channel, card.login)} className="text-live hover:underline">
              {t('ban')}
            </button>
            <button onClick={() => void unbanUser(card.channel, card.login)} className="text-faint hover:text-ink">
              {t('unban')}
            </button>
          </div>
        </div>
      )}

      <div className="border-t border-line px-4 py-3">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => s.setNote(card.login, note)}
          placeholder={t('notePlaceholder')}
          rows={2}
          className="w-full resize-none bg-transparent text-[12.5px] leading-relaxed placeholder:text-faint"
        />
      </div>

      <div className="min-h-[80px] flex-1 overflow-y-auto border-t border-line px-4 py-3">
        <div className="mb-1.5 text-[11.5px] text-faint">{t('recentIn', { c: card.channel })}</div>
        {msgs.length === 0 && <div className="py-4 text-center text-[12px] text-faint">{t('nothingSince')}</div>}
        {msgs
          .slice()
          .reverse()
          .map((m) => (
            <div key={m.id} className={cn('chat-line selectable py-1 text-[13px]', m.deleted && 'line-through opacity-40')}>
              <span className="mr-2 text-[11px] tabular-nums text-faint">{timeShort(m.ts)}</span>
              {tokenize(m.text, m.twitchEmotes, m.roomId, s.thirdPartyEmotes).map((tk, i) =>
                tk.t === 'emote' ? <img key={i} className="emote" src={tk.e.url} alt={tk.e.name} title={tk.e.name} /> : <span key={i}>{tk.v}</span>
              )}
            </div>
          ))}
      </div>
    </motion.div>
  )
}

function Fact({ label, value, dot }: { label: string; value: string; dot?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[11.5px] text-faint">{label}</dt>
      <dd className="m-0 flex items-center gap-1.5 truncate font-medium text-ink">
        {dot && <span className="h-1.5 w-1.5 rounded-full bg-join" />}
        {value}
      </dd>
    </div>
  )
}
