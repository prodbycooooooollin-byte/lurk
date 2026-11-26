import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { AnimatePresence, motion } from 'framer-motion'
import { Search, Star, Pin, PanelRightClose, PanelRightOpen, X, Bot } from 'lucide-react'
import { useChat } from '@/store/chat'
import { useUi, type PanelTab } from '@/store/ui'
import { useSettings } from '@/store/settings'
import { openUserCard } from './MessageRow'
import { findEmote } from '@/lib/emotes'
import { useT } from '@/lib/i18n'
import { IconButton, Tabs, Tip } from './ui'
import { useHoverIntent } from '@/lib/useHoverIntent'
import { cn, readableColor, relTime, timeShort, formatNumber, useThrottled } from '@/lib/util'
import type { PresenceUser } from '@/lib/types'
import { UserAvatar } from './UserAvatar'
import { RadarFeed } from './RadarFeed'
import { Audience } from './Audience'
import { useRadar } from '@/lib/modradar'
import { isNewAccount, useUserMeta } from '@/lib/avatars'
import { getHistory, isRegular } from '@/lib/history'
import { isBot } from '@/lib/bots'

type Filter = 'all' | 'new' | 'lurker' | 'regular' | 'active' | 'left'

function useTick(ms: number): void {
  const [, set] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => set((x) => x + 1), ms)
    return () => window.clearInterval(id)
  }, [ms])
}

function BigStat({ value, label }: { value: number | string; label: string }) {
  return (
    <div>
      <div className="text-[20px] font-semibold leading-none tabular-nums tracking-[-0.02em] text-ink">{value}</div>
      <div className="mt-1 text-[11.5px] text-faint">{label}</div>
    </div>
  )
}

/** Anwesende eines Kanals (gedrosselt neu berechnet) – Bots fliegen optional raus, damit die Lurker-Zahl stimmt */
function usePresenceView(channel: string, throttle: number) {
  const version = useThrottled(useChat((s) => s.channels[channel]?.presenceVersion ?? 0), throttle)
  const hideBots = useSettings((s) => s.hideBots)
  return useMemo(() => {
    const all = Object.values(useChat.getState().channels[channel]?.presence ?? {}).filter((p) => !hideBots || !isBot(p.login))
    return { now: Date.now(), all, present: all.filter((p) => p.present) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, channel, hideBots])
}

const isNewcomer = (p: PresenceUser, now: number): boolean => p.joinedAt !== null && now - p.joinedAt < 10 * 60_000
const isActiveNow = (p: PresenceUser, now: number): boolean => !!p.lastMsgAt && now - p.lastMsgAt < 10 * 60_000

function PresenceList({ channel }: { channel: string }) {
  const t = useT()
  const namesReceived = useChat((s) => s.channels[channel]?.namesReceived)
  const helix = useChat((s) => s.channels[channel]?.helixPresence)
  const watch = useSettings((s) => s.watchUsers)
  const hideBots = useSettings((s) => s.hideBots)
  const setSettings = useSettings((s) => s.set)
  const dark = useSettings((s) => s.theme) === 'dark'
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const parentRef = useRef<HTMLDivElement>(null)
  useTick(30_000)
  const { now, all, present } = usePresenceView(channel, 1000)
  const chatters = useChat((s) => s.channels[channel]?.info.chatters ?? 0)

  const { list, counts } = useMemo(() => {
    const regular = (p: PresenceUser): boolean => isRegular(getHistory(channel, p.login))
    const counts = {
      all: present.length,
      new: present.filter((p) => isNewcomer(p, now)).length,
      lurker: present.filter((p) => p.msgCount === 0).length,
      regular: present.filter(regular).length,
      active: present.filter((p) => isActiveNow(p, now)).length,
      left: all.length - present.length
    }
    let base = filter === 'left' ? all.filter((p) => !p.present) : present.slice()
    if (filter === 'new') base = base.filter((p) => isNewcomer(p, now))
    if (filter === 'lurker') base = base.filter((p) => p.msgCount === 0)
    if (filter === 'regular') base = base.filter(regular)
    if (filter === 'active') base = base.filter((p) => isActiveNow(p, now))
    const ql = q.toLowerCase()
    if (ql) base = base.filter((p) => p.login.includes(ql) || !!p.displayName?.toLowerCase().includes(ql))
    const score = (p: PresenceUser): number =>
      (watch.includes(p.login) ? 4e13 : 0) +
      (filter === 'regular' ? (getHistory(channel, p.login)?.v ?? 0) * 1e10 : 0) +
      (filter === 'left' ? p.leftAt ?? 0 : Math.max(p.joinedAt ?? 0, p.lastMsgAt ?? 0))
    base.sort((a, b) => score(b) - score(a) || a.login.localeCompare(b.login))
    return { list: base, counts }
  }, [all, present, now, channel, filter, q, watch])

  const virt = useVirtualizer({ count: list.length, getScrollElement: () => parentRef.current, estimateSize: () => 46, overscan: 10 })
  const filters: [Filter, string][] = [
    ['all', t('filterAll')],
    ['new', t('filterNew')],
    ['lurker', t('filterQuiet')],
    ['regular', t('filterRegular')],
    ['active', t('filterActive')],
    ['left', t('filterLeft')]
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid grid-cols-3 gap-3 px-4 pb-4 pt-4">
        <BigStat value={formatNumber(Math.max(counts.all, chatters))} label={t('statInChat')} />
        <BigStat value={formatNumber(lurkersEstimate(counts.lurker, counts.all, chatters))} label={t('statQuiet')} />
        <BigStat value={formatNumber(counts.regular)} label={t('statRegulars')} />
      </div>
      {!namesReceived && !helix && <p className="mx-4 mb-3 border-l border-line pl-3 text-[11.5px] leading-relaxed text-faint">{t('noNamesWarn')}</p>}
      <div className="px-4">
        <div className="flex h-8 items-center gap-2 rounded-md bg-raised px-2.5">
          <Search size={13} className="text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchName')} className="w-full bg-transparent text-[12.5px] placeholder:text-faint" />
          {q && (
            <button onClick={() => setQ('')} className="text-faint hover:text-ink">
              <X size={12} />
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pb-2 pt-3">
        {filters.map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)} className={cn('text-[12px] transition-colors', filter === id ? 'font-medium text-ink' : 'text-faint hover:text-muted')}>
            {label} <span className="tabular-nums opacity-60">{counts[id]}</span>
          </button>
        ))}
        <Tip label={hideBots ? t('botsHidden') : t('botsShown')}>
          <button onClick={() => setSettings({ hideBots: !hideBots })} className={cn('ml-auto flex items-center gap-1 text-[11.5px]', hideBots ? 'text-faint hover:text-muted' : 'text-ink')}>
            <Bot size={12} /> {hideBots ? t('botsOff') : t('botsOn')}
          </button>
        </Tip>
      </div>
      <div ref={parentRef} className="min-h-0 flex-1 overflow-y-auto [contain:strict]">
        {list.length === 0 && <div className="px-6 py-10 text-center text-[12.5px] text-faint">{q ? t('nobodyName') : t('nobodyHere')}</div>}
        <div style={{ height: virt.getTotalSize(), position: 'relative' }}>
          {virt.getVirtualItems().map((it) => {
            const p = list[it.index]
            return <PresenceRow key={p.login} p={p} channel={channel} watched={watch.includes(p.login)} dark={dark} now={now} top={it.start} height={it.size} />
          })}
        </div>
      </div>
    </div>
  )
}

const PresenceRow = memo(function PresenceRow({ p, channel, watched, dark, now, top, height }: { p: PresenceUser; channel: string; watched: boolean; dark: boolean; now: number; top: number; height: number }) {
  const t = useT()
  const meta = useUserMeta(p.login)
  const hist = getHistory(channel, p.login)
  const stay = p.present && p.joinedAt ? Math.round((now - p.joinedAt) / 60_000) : 0
  return (
    <button
      onClick={(e) => openUserCard(p.login, channel, e)}
      className={cn('absolute left-0 top-0 flex w-full items-center gap-2.5 px-4 text-left hover:bg-hover', p.present && p.joinedAt && Date.now() - p.joinedAt < 4000 && 'join-flash')}
      style={{ height, transform: `translateY(${top}px)` }}
    >
      <span className="relative">
        <UserAvatar login={p.login} name={p.displayName} color={p.color} dark={dark} size={28} className={cn(!p.present && 'opacity-50 grayscale')} />
        {p.present && <span className={cn('absolute -bottom-px -right-px h-2.5 w-2.5 rounded-full border-2 border-ground', p.msgCount ? 'bg-join' : 'bg-faint')} />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-medium" style={{ color: p.color ? readableColor(p.color, p.login, dark) : undefined }}>
            {p.displayName ?? p.login}
          </span>
          {watched && <Star size={11} className="shrink-0 fill-ink text-ink" />}
          {isRegular(hist) && <span className="shrink-0 rounded-full bg-join/15 px-1.5 text-[9.5px] font-semibold uppercase text-join">{t('regularShort')}</span>}
          {isNewAccount(meta?.createdAt) && <span className="shrink-0 rounded-full bg-warn/15 px-1.5 text-[9.5px] font-semibold uppercase text-warn">{t('newShort')}</span>}
        </div>
        <div className="truncate text-[11.5px] text-faint">
          {!p.present && p.leftAt ? t('leftAgo', { t: relTime(p.leftAt) }) : p.joinedAt ? t('joinedAt', { t: timeShort(p.joinedAt) }) : t('wasHere')}
          {stay >= 5 && ` · ${stay < 60 ? `${stay} min` : `${(stay / 60).toFixed(1)} h`}`}
          {' · '}
          {p.msgCount > 0 ? t('msgs', { n: p.msgCount }) : t('noMsgsYet')}
          {hist && hist.v > 1 && ` · ${t('visitsShort', { v: hist.v })}`}
        </div>
      </div>
    </button>
  )
})

function ActivityFeed({ channel }: { channel: string }) {
  const t = useT()
  const activity = useChat((s) => s.channels[channel]?.activity)
  const watch = useSettings((s) => s.watchUsers)
  const [joinsOnly, setJoinsOnly] = useState(false)
  useTick(30_000)
  const items = useMemo(() => {
    const a = (activity ?? []).slice().reverse()
    return (joinsOnly ? a.filter((x) => x.type === 'join') : a).slice(0, 300)
  }, [activity, joinsOnly])
  const lastHour = useMemo(() => (activity ?? []).filter((a) => a.type === 'join' && Date.now() - a.at < 3600_000).length, [activity])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-end justify-between px-4 pb-3 pt-4">
        <BigStat value={lastHour} label={t('joinsLastHour')} />
        <div className="flex gap-3 text-[12px]">
          {([[false, t('all')], [true, t('joinsOnly')]] as const).map(([v, l]) => (
            <button key={String(v)} onClick={() => setJoinsOnly(v)} className={cn(joinsOnly === v ? 'font-medium text-ink' : 'text-faint hover:text-muted')}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        {items.length === 0 && <div className="px-6 py-10 text-center text-[12.5px] leading-relaxed text-faint">{t('activityEmpty')}</div>}
        <AnimatePresence initial={false}>
          {items.map((a, i) => (
            <motion.button
              key={a.id}
              initial={i < 30 ? { opacity: 0, y: -6 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              onClick={(e) => openUserCard(a.login, channel, e)}
              className="flex w-full items-center gap-3 px-4 py-[7px] text-left hover:bg-hover"
            >
              <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', a.type === 'join' ? 'bg-join' : 'border border-faint')} />
              <span className="min-w-0 flex-1 truncate text-[12.5px]">
                <span className={cn('font-medium', a.type === 'join' ? 'text-ink' : 'text-muted')}>{a.login}</span>
                <span className="text-faint"> {a.type === 'join' ? t('joinedVerb') : t('leftVerb')}</span>
              </span>
              {watch.includes(a.login) && <Star size={11} className="fill-ink text-ink" />}
              <span className="text-[11px] tabular-nums text-faint">{timeShort(a.at)}</span>
            </motion.button>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}

function Stats({ channel }: { channel: string }) {
  const t = useT()
  useThrottled(useChat((s) => s.channels[channel]?.statsVersion ?? 0), 1000)
  const stats = useChat.getState().channels[channel]?.stats
  const roomId = useChat((s) => s.channels[channel]?.room.roomId)
  useChat((s) => s.emoteVersion)
  if (!stats) return null
  const topChatters = Object.entries(stats.chatters).sort((a, b) => b[1] - a[1]).slice(0, 8)
  const topEmotes = Object.entries(stats.emotes).sort((a, b) => b[1] - a[1]).slice(0, 10)
  const maxBucket = Math.max(1, ...stats.buckets)
  return (
    <div className="min-h-0 flex-1 space-y-7 overflow-y-auto px-4 py-4">
      <div className="grid grid-cols-3 gap-3">
        <BigStat value={formatNumber(stats.total)} label={t('statMessages')} />
        <BigStat value={formatNumber(Object.keys(stats.chatters).length)} label={t('statChatters')} />
        <BigStat value={formatNumber(stats.firstTimers)} label={t('statFirst')} />
      </div>
      <section>
        <div className="mb-3 flex items-baseline justify-between text-[12px]">
          <span className="font-medium text-ink">{t('msgsPerMin')}</span>
          <span className="tabular-nums text-faint">{t('peak', { n: Math.max(...stats.buckets) })}</span>
        </div>
        <div className="flex h-16 items-end gap-[2px]">
          {stats.buckets.map((b, i) => (
            <div key={i} title={String(b)} className={cn('flex-1 rounded-[1px]', i === stats.buckets.length - 1 ? 'bg-ink' : 'bg-ink/30')} style={{ height: `${Math.max(3, (b / maxBucket) * 100)}%` }} />
          ))}
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] text-faint">
          <span>{t('ago30')}</span>
          <span>{t('now')}</span>
        </div>
      </section>
      <section>
        <div className="mb-2 text-[12px] font-medium text-ink">{t('mostActive')}</div>
        {topChatters.length === 0 && <div className="text-[12px] text-faint">{t('noMessagesSession')}</div>}
        {topChatters.map(([login, n]) => (
          <button key={login} onClick={(e) => openUserCard(login, channel, e)} className="group flex w-full items-center gap-3 py-1 text-left text-[12.5px]">
            <span className="w-24 truncate text-muted group-hover:text-ink">{login}</span>
            <span className="h-[3px] flex-1 overflow-hidden rounded-full bg-line">
              <span className="block h-full rounded-full bg-ink/70" style={{ width: `${(n / topChatters[0][1]) * 100}%` }} />
            </span>
            <span className="w-8 text-right tabular-nums text-faint">{n}</span>
          </button>
        ))}
      </section>
      <section>
        <div className="mb-2 text-[12px] font-medium text-ink">{t('topEmotes')}</div>
        {topEmotes.length === 0 && <div className="text-[12px] text-faint">{t('noEmotesCounted')}</div>}
        <div className="grid grid-cols-5 gap-y-3">
          {topEmotes.map(([name, n]) => {
            const e = findEmote(roomId, name)
            return (
              <div key={name} title={name} className="flex flex-col items-center gap-1">
                {e ? <img src={e.url} alt={name} className="h-7 max-w-[40px] object-contain" /> : <span className="max-w-full truncate px-1 text-[11px]">{name}</span>}
                <span className="text-[11px] tabular-nums text-faint">{n}</span>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

/** Rechte Seite: eingeklappt eine Mini-Leiste mit den wichtigsten Zahlen, beim Hovern das volle Panel als Overlay, gepinnt fest daneben. */
export function SidePanel({ channel }: { channel: string }) {
  const pinned = useUi((u) => u.panelOpen)
  const cardOpen = useUi((u) => !!u.userCard)
  const hover = useHoverIntent(120, 220)
  const inside = useRef(false)
  // Solange eine Infocard offen ist (z. B. aus der Liste geöffnet), bleibt das Overlay stehen
  const { leave } = hover
  useEffect(() => {
    if (!cardOpen && !inside.current) leave()
  }, [cardOpen, leave])
  if (pinned) return <PresencePanel channel={channel} />
  return (
    <div
      className="relative w-[60px] shrink-0"
      onMouseEnter={() => {
        inside.current = true
        hover.enter()
      }}
      onMouseLeave={() => {
        inside.current = false
        if (!useUi.getState().userCard) hover.leave()
      }}
    >
      <MiniPanel channel={channel} />
      <AnimatePresence>
        {hover.hover && (
          <motion.div
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
            className="absolute inset-y-0 right-0 z-40 flex bg-ground shadow-[-16px_0_48px_-16px_rgba(0,0,0,0.6)]"
          >
            <PresencePanel channel={channel} overlay onPinned={hover.reset} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function MiniStat({ value, label, dot }: { value: string; label: string; dot?: string }) {
  return (
    <Tip label={label} side="left">
      <div className="flex flex-col items-center gap-0.5 py-1.5">
        <div className="flex items-center gap-1">
          {dot && <span className={cn('h-1.5 w-1.5 rounded-full', dot)} />}
          <span className="text-[13px] font-semibold tabular-nums tracking-[-0.01em] text-ink">{value}</span>
        </div>
        <span className="max-w-[54px] truncate text-[9.5px] uppercase tracking-[0.05em] text-faint">{label}</span>
      </div>
    </Tip>
  )
}

const compact = (n: number): string => (n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))

/**
 * Lurker: wen Lurk selbst als still kennt – oder, wenn Twitch mehr Leute im Chat meldet als Lurk
 * kennt, Twitchs Zahl minus die, die geschrieben haben.
 */
function lurkersEstimate(knownLurkers: number, known: number, chatters: number): number {
  if (chatters <= known) return knownLurkers
  return Math.max(knownLurkers, chatters - (known - knownLurkers))
}

function MiniPanel({ channel }: { channel: string }) {
  const t = useT()
  const set = useUi((u) => u.set)
  const dark = useSettings((s) => s.theme) === 'dark'
  const hideBots = useSettings((s) => s.hideBots)
  const activity = useChat((s) => s.channels[channel]?.activity)
  const buckets = useChat((s) => s.channels[channel]?.stats.buckets)
  useChat((s) => s.channels[channel]?.statsVersion)
  useTick(30_000)
  const { now, present } = usePresenceView(channel, 2000)
  const chatters = useChat((s) => s.channels[channel]?.info.chatters ?? 0)
  const presentCount = Math.max(present.length, chatters)
  const lurking = lurkersEstimate(present.filter((p) => p.msgCount === 0).length, present.length, chatters)
  const fresh = present.filter((p) => isNewcomer(p, now)).length
  const perMin = (buckets ?? []).slice(-5).reduce((a, b) => a + b, 0) / 5
  const joins = useMemo(() => {
    const out: string[] = []
    const seen = new Set<string>()
    const a = activity ?? []
    for (let i = a.length - 1; i >= 0 && out.length < 9; i--) {
      const l = a[i].login
      if (a[i].type !== 'join' || seen.has(l) || (hideBots && isBot(l))) continue
      seen.add(l)
      out.push(l)
    }
    return out
  }, [activity, hideBots])
  const presence = useChat.getState().channels[channel]?.presence

  return (
    <aside className="flex h-full w-[60px] flex-col items-center border-l border-line pt-3">
      <MiniStat value={compact(presentCount)} label={t('statInChat')} dot="bg-join" />
      <MiniStat value={compact(lurking)} label={t('statQuiet')} />
      <MiniStat value={compact(fresh)} label={t('filterNew')} />
      <MiniStat value={perMin.toFixed(perMin < 10 ? 1 : 0)} label={t('perMin')} />
      <div className="my-2 h-px w-7 bg-line" />
      <div className="flex min-h-0 flex-col items-center gap-1.5 overflow-hidden">
        <AnimatePresence initial={false}>
          {joins.map((login) => {
            const p = presence?.[login]
            return (
              <motion.button
                key={login}
                data-join
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={{ duration: 0.18 }}
                onClick={(e) => openUserCard(login, channel, e)}
                title={`${p?.displayName ?? login} · ${t('recentJoins')}`}
                className="relative shrink-0 rounded-full transition-transform hover:scale-110"
              >
                <UserAvatar login={login} name={p?.displayName} color={p?.color} dark={dark} size={30} />
                {p?.present && <span className="absolute -bottom-px -right-px h-2.5 w-2.5 rounded-full border-2 border-ground bg-join" />}
              </motion.button>
            )
          })}
        </AnimatePresence>
      </div>
      <div className="mt-auto pb-2.5">
        <Tip label={t('keepOpen')} side="left" shortcut="Ctrl J">
          <IconButton onClick={() => set({ panelOpen: true })}>
            <PanelRightOpen size={15} strokeWidth={1.75} />
          </IconButton>
        </Tip>
      </div>
    </aside>
  )
}

export function PresencePanel({ channel, overlay, onPinned }: { channel?: string; overlay?: boolean; onPinned?: () => void }) {
  const t = useT()
  const tab = useUi((u) => u.panelTab)
  const set = useUi((u) => u.set)
  // Radar-Tab nur, wo das Radar auch arbeitet (als Mod oder auf "Überall" gestellt)
  const radarMode = useSettings((s) => s.modRadar)
  const isMod = useChat((s) => !!channel && !!s.channels[channel] && (s.channels[channel].me.mod || s.channels[channel].me.broadcaster))
  const radarOn = radarMode === 'all' || (radarMode === 'mod' && isMod)
  const radarOpen = useRadar((r) => (channel ? (r.items[channel] ?? []).filter((i) => !i.handled).length : 0))
  // "Publikum" ist eine Ansicht innerhalb von Stats
  const shownTab: PanelTab = tab === 'audience' ? 'stats' : tab === 'radar' && !radarOn ? 'presence' : tab
  return (
    <aside className="flex w-[300px] shrink-0 flex-col overflow-hidden border-l border-line bg-ground">
      <div className="flex h-[52px] shrink-0 items-end justify-between border-b border-line pl-4 pr-2">
        <Tabs<PanelTab>
          value={shownTab}
          onChange={(v) => set({ panelTab: v === 'stats' && tab === 'audience' ? 'audience' : v })}
          items={[
            ['presence', t('tabPresence')],
            ['activity', t('tabActivity')],
            ['stats', t('tabStats')],
            ...(radarOn ? ([['radar', radarOpen ? `${t('tabRadar')} · ${radarOpen}` : t('tabRadar')]] as [PanelTab, string][]) : [])
          ]}
          className="min-w-0 gap-5 [&>button]:pb-3.5"
        />
        {overlay ? (
          <Tip label={t('keepOpen')}>
            <IconButton
              onClick={() => {
                onPinned?.()
                set({ panelOpen: true })
              }}
              className="mb-2.5"
            >
              <Pin size={14} strokeWidth={1.75} />
            </IconButton>
          </Tip>
        ) : (
          <Tip label={t('collapseSidebar')}>
            <IconButton onClick={() => set({ panelOpen: false })} className="mb-2.5">
              <PanelRightClose size={15} strokeWidth={1.75} />
            </IconButton>
          </Tip>
        )}
      </div>
      {!channel ? (
        <div className="p-6 text-center text-[12.5px] text-faint">{t('pickChannel')}</div>
      ) : shownTab === 'presence' ? (
        <PresenceList key={channel} channel={channel} />
      ) : shownTab === 'activity' ? (
        <ActivityFeed key={channel} channel={channel} />
      ) : shownTab === 'radar' ? (
        <RadarFeed key={channel} channel={channel} />
      ) : (
        <>
          <div className="flex shrink-0 gap-1 px-4 pt-3">
            {(
              [
                ['stats', t('statsChat')],
                ['audience', t('tabAudience')]
              ] as [PanelTab, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => set({ panelTab: id })}
                className={cn('rounded-full px-2.5 py-[3px] text-[11.5px] font-medium transition-colors', tab === id ? 'bg-raised text-ink' : 'text-faint hover:text-muted')}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === 'audience' ? <Audience key={channel} channel={channel} /> : <Stats key={channel} channel={channel} />}
        </>
      )}
    </aside>
  )
}
