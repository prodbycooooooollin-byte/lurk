import { useState } from 'react'
import * as CM from '@radix-ui/react-context-menu'
import { Plus, AtSign, Settings, Columns2, ExternalLink, Trash2, ChevronUp, ChevronDown, Pin, PinOff } from 'lucide-react'
import { useUi } from '@/store/ui'
import { useChat } from '@/store/chat'
import { partChannel } from '@/lib/client'
import { useT } from '@/lib/i18n'
import { Avatar, Tip } from './ui'
import { cn, formatNumber } from '@/lib/util'
import { useHoverIntent } from '@/lib/useHoverIntent'

export function ChannelRail() {
  const ui = useUi()
  const t = useT()
  const channels = useChat((s) => s.channels)
  const mentionsCount = useChat((s) => s.mentions.length)
  const [seenMentions, setSeenMentions] = useState(0)
  const active = ui.view === 'chat' ? ui.splits[ui.focused] : undefined
  const pinned = !ui.railCollapsed
  const hover = useHoverIntent()
  // eingeklappt: 52 px breit, beim Hovern fährt die volle Liste als Overlay über den Chat
  const expanded = pinned || hover.hover
  const floating = !pinned && hover.hover
  const unseenMentions = ui.view !== 'mentions' ? mentionsCount - seenMentions : 0

  return (
    <div className={cn('relative shrink-0 transition-[width] duration-200 ease-out', pinned ? 'w-[208px]' : 'w-[52px]')}>
    <nav
      onMouseEnter={pinned ? undefined : hover.enter}
      onMouseLeave={pinned ? undefined : hover.leave}
      className={cn(
        'absolute inset-y-0 left-0 z-40 flex flex-col overflow-hidden border-r border-line bg-ground py-2 transition-[width,box-shadow] duration-200 ease-out',
        expanded ? 'w-[208px]' : 'w-[52px]',
        floating && 'shadow-[16px_0_48px_-16px_rgba(0,0,0,0.6)]'
      )}
    >
      <Row
        expanded={expanded}
        active={ui.view === 'mentions'}
        onClick={() => {
          ui.set({ view: 'mentions' })
          setSeenMentions(mentionsCount)
        }}
        icon={<AtSign size={15} strokeWidth={1.75} />}
        label={t('mentions')}
        count={unseenMentions}
      />
      <div className="mx-3 my-2 h-px bg-line" />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
        {ui.channels.map((c, i) => {
          const ch = channels[c]
          const inSplit = ui.splits.includes(c)
          return (
            <CM.Root key={c}>
              <CM.Trigger asChild>
                <div>
                  <Row
                    expanded={expanded}
                    active={active === c}
                    onClick={(e) => (e.ctrlKey || e.metaKey ? ui.openSplit(c) : ui.showChannel(c))}
                    icon={
                      <span className="relative">
                        <Avatar src={ch?.info.avatar} name={c} size={22} className={cn(!ch?.info.live && 'opacity-60 grayscale')} />
                        {ch?.info.live && <span className="absolute -bottom-px -right-px h-2 w-2 rounded-full border-[1.5px] border-ground bg-live" />}
                      </span>
                    }
                    label={ch?.info.displayName ?? c}
                    meta={ch?.info.live ? formatNumber(ch.info.viewers) : undefined}
                    count={ch?.mentions || 0}
                    unread={!!ch?.unread && !inSplit}
                  />
                </div>
              </CM.Trigger>
              <CM.Portal>
                <CM.Content className="menu">
                  <CM.Item className="menu-item" onSelect={() => ui.openSplit(c)}>
                    <Columns2 size={14} /> {t('openInSplit')}
                  </CM.Item>
                  <CM.Item className="menu-item" onSelect={() => void window.bridge.open(`https://www.twitch.tv/${c}`)}>
                    <ExternalLink size={14} /> {t('openOnTwitch')}
                  </CM.Item>
                  <CM.Item className="menu-item" disabled={i === 0} onSelect={() => ui.moveChannel(i, i - 1)}>
                    <ChevronUp size={14} /> {t('moveUp')}
                  </CM.Item>
                  <CM.Item className="menu-item" disabled={i === ui.channels.length - 1} onSelect={() => ui.moveChannel(i, i + 1)}>
                    <ChevronDown size={14} /> {t('moveDown')}
                  </CM.Item>
                  <CM.Separator className="menu-sep" />
                  <CM.Item
                    className="menu-item danger"
                    onSelect={() => {
                      ui.removeChannel(c)
                      partChannel(c)
                    }}
                  >
                    <Trash2 size={14} /> {t('removeChannel')}
                  </CM.Item>
                </CM.Content>
              </CM.Portal>
            </CM.Root>
          )
        })}
        <Row expanded={expanded} onClick={() => ui.set({ joinOpen: true })} icon={<Plus size={15} strokeWidth={1.75} />} label={t('addChannel')} quiet />
      </div>
      <Row expanded={expanded} onClick={() => ui.set({ settingsOpen: true })} icon={<Settings size={15} strokeWidth={1.75} />} label={t('settings')} quiet />
      {expanded && (
        <Row
          expanded
          onClick={() => {
            hover.reset()
            ui.set({ railCollapsed: pinned })
          }}
          icon={pinned ? <PinOff size={14} strokeWidth={1.75} /> : <Pin size={14} strokeWidth={1.75} />}
          label={pinned ? t('collapseSidebar') : t('keepOpen')}
          quiet
        />
      )}
    </nav>
    </div>
  )
}

interface RowProps {
  expanded: boolean
  active?: boolean
  quiet?: boolean
  icon: React.ReactNode
  label: string
  meta?: string
  count?: number
  unread?: boolean
  onClick: (e: React.MouseEvent) => void
}

function Row({ expanded, active, quiet, icon, label, meta, count, unread, onClick }: RowProps) {
  const btn = (
    <button
      onClick={onClick}
      className={cn(
        'relative mx-2 flex h-8 shrink-0 items-center gap-2.5 whitespace-nowrap rounded-md px-1.5 text-left transition-colors',
        active ? 'bg-raised text-ink' : quiet ? 'text-faint hover:text-ink' : 'text-muted hover:bg-hover hover:text-ink'
      )}
    >
      <span className="flex w-[22px] shrink-0 justify-center">{icon}</span>
      {expanded && <span className={cn('min-w-0 flex-1 truncate text-[13px]', (active || unread) && 'font-medium text-ink')}>{label}</span>}
      {expanded && meta && !count && <span className="text-[11px] tabular-nums text-faint">{meta}</span>}
      {!!count && (
        <span className={cn('flex h-4 min-w-4 items-center justify-center rounded-full bg-ink px-1 text-[10px] font-semibold text-ground', !expanded && 'absolute right-0.5 top-0')}>
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  )
  return expanded ? btn : <Tip label={label} side="right">{btn}</Tip>
}
