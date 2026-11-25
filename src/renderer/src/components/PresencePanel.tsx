import { useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { AnimatePresence, motion } from 'framer-motion'
import { Search, Star, X } from 'lucide-react'
import { useChat } from '@/store/chat'
import { useUi, type PanelTab } from '@/store/ui'
import { useSettings } from '@/store/settings'
import { openUserCard } from './MessageRow'
import { findEmote } from '@/lib/emotes'
import { useT } from '@/lib/i18n'
import { IconButton, Tabs } from './ui'
import { cn, readableColor, relTime, timeShort, formatNumber } from '@/lib/util'
import type { PresenceUser } from '@/lib/types'

type Filter = 'all' | 'new' | 'lurker' | 'active' | 'left'

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

function PresenceList({ channel }: { channel: string }) {
  const t = useT()
  const presence = useChat((s) => s.channels[channel]?.presence)
  const namesReceived = useChat((s) => s.channels[channel]?.namesReceived)
  const helix = useChat((s) => s.channels[channel]?.helixPresence)
  const watch = useSettings((s) => s.watchUsers)
  const dark = useSettings((s) => s.theme) === 'dark'
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const parentRef = useRef<HTMLDivElement>(null)
  useTick(30_000)

  const { list, counts } = useMemo(() => {
    const now = Date.now()
    const all = Object.values(presence ?? {})
    const present = all.filter((p) => p.present)
    const isNew = (p: PresenceUser) => p.joinedAt !== null && now - p.joinedAt < 10 * 60_000
    const isActive = (p: PresenceUser) => !!p.lastMsgAt && now - p.lastMsgAt < 10 * 60_000
    const counts = {
      all: present.length,
      new: present.filter(isNew).length,
      lurker: present.filter((p) => p.msgCount === 0).length,
      active: present.filter(isActive).length,
      left: all.filter((p) => !p.present).length
    }
    let base = filter === 'left' ? all.filter((p) => !p.present) : present
    if (filter === 'new') base = base.filter(isNew)
    if (filter === 'lurker') base = base.filter((p) => p.msgCount === 0)
    if (filter === 'active') base = base.filter(isActive)
    if (q) base = base.filter((p) => p.login.includes(q.toLowerCase()))
    const score = (p: PresenceUser) => (watch.includes(p.login) ? 4e13 : 0) + (filter === 'left' ? p.leftAt ?? 0 : Math.max(p.joinedAt ?? 0, p.lastMsgAt ?? 0))
    base.sort((a, b) => score(b) - score(a) || a.login.localeCompare(b.login))
    return { list: base, counts }
  }, [presence, filter, q, watch])

  const virt = useVirtualizer({ count: list.length, getScrollElement: () => parentRef.current, estimateSize: () => 44, overscan: 12 })
  const filters: [Filter, string][] = [
    ['all', t('filterAll')],
    ['new', t('filterNew')],
    ['lurker', t('filterQuiet')],
    ['active', t('filterActive')],
    ['left', t('filterLeft')]
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid grid-cols-3 gap-3 px-4 pb-4 pt-4">
        <BigStat value={formatNumber(counts.all)} label={t('statInChat')} />
        <BigStat value={formatNumber(counts.lurker)} label={t('statQuiet')} />
        <BigStat value={formatNumber(counts.new)} label={t('statNew')} />
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
      <div className="flex flex-wrap gap-x-3 gap-y-1 px-4 pb-2 pt-3">
        {filters.map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)} className={cn('text-[12px] transition-colors', filter === id ? 'font-medium text-ink' : 'text-faint hover:text-muted')}>
            {label} <span className="tabular-nums opacity-60">{counts[id]}</span>
          </button>
        ))}
      </div>
      <div ref={parentRef} className="min-h-0 flex-1 overflow-y-auto">
        {list.length === 0 && <div className="px-6 py-10 text-center text-[12.5px] text-faint">{q ? t('nobodyName') : t('nobodyHere')}</div>}
        <div style={{ height: virt.getTotalSize(), position: 'relative' }}>
          {virt.getVirtualItems().map((it) => {
            const p = list[it.index]
            const watched = watch.includes(p.login)
            return (
              <button
                key={p.login}
                onClick={(e) => openUserCard(p.login, channel, e)}
                className="absolute left-0 top-0 flex w-full items-center gap-3 px-4 text-left hover:bg-hover"
                style={{ height: it.size, transform: `translateY(${it.start}px)` }}
              >
                <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', p.present ? (p.msgCount ? 'bg-join' : 'border border-join bg-transparent') : 'border border-faint')} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[13px] font-medium" style={{ color: p.color ? readableColor(p.color, p.login, dark) : undefined }}>
                      {p.displayName ?? p.login}
                    </span>
                    {watched && <Star size={11} className="shrink-0 fill-ink text-ink" />}
                  </div>
                  <div className="truncate text-[11.5px] text-faint">
                    {!p.present && p.leftAt ? t('leftAgo', { t: relTime(p.leftAt) }) : p.joinedAt ? t('joinedAt', { t: timeShort(p.joinedAt) }) : t('wasHere')}
                    {' · '}
                    {p.msgCount > 0 ? t('msgs', { n: p.msgCount }) : t('noMsgsYet')}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

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
              layout={i < 30 ? 'position' : false}
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
  const stats = useChat((s) => s.channels[channel]?.stats)
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

export function PresencePanel({ channel }: { channel?: string }) {
  const t = useT()
  const tab = useUi((u) => u.panelTab)
  const set = useUi((u) => u.set)
  return (
    <aside className="flex w-[300px] shrink-0 flex-col overflow-hidden border-l border-line">
      <div className="flex h-[52px] shrink-0 items-end justify-between border-b border-line pl-4 pr-2">
        <Tabs<PanelTab>
          value={tab}
          onChange={(v) => set({ panelTab: v })}
          items={[
            ['presence', t('tabPresence')],
            ['activity', t('tabActivity')],
            ['stats', t('tabStats')]
          ]}
          className="gap-5 [&>button]:pb-3.5"
        />
        <IconButton onClick={() => set({ panelOpen: false })} title={t('closePanel')} className="mb-2.5">
          <X size={14} strokeWidth={1.75} />
        </IconButton>
      </div>
      {!channel ? (
        <div className="p-6 text-center text-[12.5px] text-faint">{t('pickChannel')}</div>
      ) : tab === 'presence' ? (
        <PresenceList key={channel} channel={channel} />
      ) : tab === 'activity' ? (
        <ActivityFeed key={channel} channel={channel} />
      ) : (
        <Stats key={channel} channel={channel} />
      )}
    </aside>
  )
}
