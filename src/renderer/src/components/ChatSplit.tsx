import { useEffect, useMemo, useState } from 'react'
import * as DM from '@radix-ui/react-dropdown-menu'
import { Search, MoreHorizontal, X, ExternalLink, Download, RefreshCw, Columns2, Eraser, MonitorPlay } from 'lucide-react'
import { MessageList } from './MessageList'
import { Composer } from './Composer'
import { Avatar, IconButton, Tip } from './ui'
import { useChat } from '@/store/chat'
import { useUi } from '@/store/ui'
import { markRead } from '@/lib/client'
import { reloadChannelEmotes } from '@/lib/emotes'
import { useT } from '@/lib/i18n'
import { cn, durationSince, formatNumber } from '@/lib/util'
import { toast } from 'sonner'

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(4, ...values)
  const w = 64
  const h = 18
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - 1 - (v / max) * (h - 2)}`).join(' ')
  return (
    <svg width={w} height={h} className="overflow-visible text-muted">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function Stat({ value, label, dot }: { value: string; label: string; dot?: string }) {
  return (
    <div className="flex items-baseline gap-1.5 whitespace-nowrap">
      {dot && <span className={cn('h-1.5 w-1.5 translate-y-[-1px] rounded-full', dot)} />}
      <span className="text-[13px] font-medium tabular-nums text-ink">{value}</span>
      <span className="text-[12px] text-faint">{label}</span>
    </div>
  )
}

export function ChatSplit({ channel, index, focused, multi }: { channel: string; index: number; focused: boolean; multi: boolean }) {
  const ch = useChat((s) => s.channels[channel])
  const ui = useUi()
  const t = useT()
  const [query, setQuery] = useState('')
  const searchOpen = !!ui.searchOpen[channel]

  useEffect(() => {
    if (focused) markRead(channel)
  }, [focused, channel, ch?.unread])

  const messages = useMemo(() => {
    if (!ch) return []
    if (!searchOpen || !query.trim()) return ch.messages
    const q = query.toLowerCase()
    const userQ = q.startsWith('from:') ? q.slice(5).trim() : null
    return ch.messages.filter((m) => (userQ ? m.login?.startsWith(userQ) : m.text.toLowerCase().includes(q) || m.login?.includes(q)))
  }, [ch, searchOpen, query])

  if (!ch) return null
  const present = ch.presentCount
  const perMin = ch.stats.buckets.slice(-5).reduce((a, b) => a + b, 0) / 5
  const canMod = ch.me.mod || ch.me.broadcaster
  const info = ch.info
  const closeSearch = (): void => {
    ui.set({ searchOpen: { ...ui.searchOpen, [channel]: false } })
    setQuery('')
  }

  const exportLog = async (): Promise<void> => {
    const lines = ch.messages
      .filter((m) => m.kind === 'chat' || m.kind === 'action' || m.kind === 'usernotice')
      .map((m) => `[${new Date(m.ts).toISOString()}] ${m.kind === 'usernotice' ? '* ' + m.systemText + ' ' : ''}${m.displayName ?? ''}: ${m.text}`)
    const ok = await window.bridge.saveText(`${channel}-${new Date().toISOString().slice(0, 10)}.txt`, lines.join('\n'))
    if (ok) toast.success(t('logSaved'))
  }

  return (
    <section
      onMouseDown={() => index !== ui.focused && ui.setFocused(index)}
      className={cn('relative flex min-w-[280px] flex-1 flex-col overflow-hidden', multi && index > 0 && 'border-l border-line')}
    >
      {multi && focused && <span className="absolute inset-x-0 top-0 z-10 h-px bg-ink/60" />}
      <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-line px-4">
        <Avatar src={info.avatar} name={channel} size={28} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13.5px] font-semibold">{info.displayName ?? channel}</span>
            {info.live ? (
              <span className="flex items-center gap-1.5 whitespace-nowrap text-[12px] text-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-live" />
                {t('live')}
                {info.startedAt && <span className="text-faint">{durationSince(info.startedAt)}</span>}
              </span>
            ) : (
              <span className="text-[12px] text-faint">{t('offline')}</span>
            )}
            {!ch.joined && <span className="text-[12px] text-faint">· {t('connectingShort')}</span>}
          </div>
          <div className="truncate text-[12px] text-faint">
            {info.live ? [info.game, info.title].filter(Boolean).join(' · ') : info.title ?? t('notLive')}
          </div>
        </div>
        <div className="hidden items-center gap-5 xl:flex">
          {info.live && (
            <Tip label={t('tipViewers')}>
              <div>
                <Stat value={formatNumber(info.viewers)} label={t('viewers')} />
              </div>
            </Tip>
          )}
          <Tip label={ch.helixPresence ? t('tipPresHelix') : ch.namesReceived ? t('tipPresNames') : t('tipPresNone')}>
            <button onClick={() => ui.set({ panelOpen: true, panelTab: 'presence' })}>
              <Stat value={formatNumber(present)} label={t('inChat')} dot="bg-join" />
            </button>
          </Tip>
          <Tip label={t('tipSpeed')}>
            <div className="flex items-center gap-2">
              <Sparkline values={ch.stats.buckets} />
              <Stat value={perMin.toFixed(perMin < 10 ? 1 : 0)} label={t('perMin')} />
            </div>
          </Tip>
        </div>
        <div className="flex items-center">
          <Tip label={t('watchStream')}>
            <IconButton onClick={() => window.bridge.openPlayer(channel)} className={cn(info.live && 'text-muted')}>
              <MonitorPlay size={15} strokeWidth={1.75} />
            </IconButton>
          </Tip>
          <Tip label={t('searchChat')} shortcut="Ctrl F">
            <IconButton active={searchOpen} onClick={() => (searchOpen ? closeSearch() : ui.set({ searchOpen: { ...ui.searchOpen, [channel]: true } }))}>
              <Search size={15} strokeWidth={1.75} />
            </IconButton>
          </Tip>
          <DM.Root>
            <DM.Trigger asChild>
              <IconButton title={t('more')}>
                <MoreHorizontal size={16} strokeWidth={1.75} />
              </IconButton>
            </DM.Trigger>
            <DM.Portal>
              <DM.Content align="end" sideOffset={6} className="menu">
                <DM.Item className="menu-item" onSelect={() => window.bridge.openPlayer(channel)}>
                  <MonitorPlay size={14} /> {t('watchStream')}
                </DM.Item>
                <DM.Item className="menu-item" onSelect={() => void window.bridge.open(`https://www.twitch.tv/${channel}`)}>
                  <ExternalLink size={14} /> {t('openOnTwitch')}
                </DM.Item>
                <DM.Item className="menu-item" onSelect={() => void exportLog()}>
                  <Download size={14} /> {t('saveLog')}
                </DM.Item>
                <DM.Item
                  className="menu-item"
                  onSelect={() => {
                    if (ch.room.roomId) void reloadChannelEmotes(ch.room.roomId).then(() => toast.success(t('emotesReloaded')))
                  }}
                >
                  <RefreshCw size={14} /> {t('reloadEmotes')}
                </DM.Item>
                <DM.Item className="menu-item" onSelect={() => useChat.setState((s) => ({ channels: { ...s.channels, [channel]: { ...s.channels[channel], messages: [] } } }))}>
                  <Eraser size={14} /> {t('clearWindow')}
                </DM.Item>
                {!multi && ui.channels.length > 1 && (
                  <DM.Item className="menu-item" onSelect={() => ui.openSplit(ui.channels.find((c) => c !== channel)!)}>
                    <Columns2 size={14} /> {t('secondColumn')}
                  </DM.Item>
                )}
                {multi && (
                  <>
                    <DM.Separator className="menu-sep" />
                    <DM.Item className="menu-item" onSelect={() => ui.closeSplit(index)}>
                      <X size={14} /> {t('closeColumn')}
                    </DM.Item>
                  </>
                )}
              </DM.Content>
            </DM.Portal>
          </DM.Root>
          {multi && (
            <IconButton onClick={() => ui.closeSplit(index)} title={t('closeColumn')}>
              <X size={15} strokeWidth={1.75} />
            </IconButton>
          )}
        </div>
      </header>
      {searchOpen && (
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-4">
          <Search size={13} className="text-faint" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && closeSearch()}
            placeholder={t('searchPlaceholder')}
            className="flex-1 bg-transparent text-[13px] placeholder:text-faint"
          />
          {query && <span className="text-[12px] text-faint">{t('results', { n: messages.length })}</span>}
        </div>
      )}
      <MessageList messages={messages} canMod={canMod} emptyText={searchOpen && query ? t('noResults') : ch.joined ? t('quiet') : t('connectingTo', { c: channel })} />
      <Composer channel={channel} />
    </section>
  )
}
