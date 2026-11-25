import { useEffect, useState } from 'react'
import { Minus, Square, X, Copy, Pin, PanelRight, PanelLeft, Search, ArrowDownToLine, Loader2 } from 'lucide-react'
import type { UpdateState } from '../../../preload/index.d'
import { useUi } from '@/store/ui'
import { useChat } from '@/store/chat'
import { useAuth } from '@/store/auth'
import { reconnect } from '@/lib/client'
import { useT } from '@/lib/i18n'
import { IconButton, Tip } from './ui'
import { cn } from '@/lib/util'
import { LurkLogo } from './LurkLogo'

/** Statisches Zeichen (für Stellen ohne Animation) */
export function LurkMark({ size = 16 }: { size?: number }) {
  return <LurkLogo size={size} />
}

export function TitleBar() {
  const ui = useUi()
  const t = useT()
  const conn = useChat((s) => s.conn)
  const login = useAuth((a) => a.login)
  const [max, setMax] = useState(false)
  const [upd, setUpd] = useState<UpdateState>({ state: 'idle' })
  const mac = window.bridge.platform === 'darwin'

  useEffect(() => window.bridge.onWindowState((s) => setMax(s.maximized)), [])
  useEffect(() => window.bridge.onUpdate(setUpd), [])

  return (
    <header className="drag flex h-10 shrink-0 items-center gap-3 border-b border-line pr-1" style={{ paddingLeft: mac ? 84 : 14 }}>
      <div className="no-drag flex items-center gap-2 text-ink">
        <LurkLogo size={20} live peek />
        <span className="text-[13px] font-semibold tracking-[-0.01em]">lurk</span>
      </div>
      <Tip label={conn === 'connected' ? (login ? t('connectedAs', { name: login }) : t('connectedGuest')) : conn === 'connecting' ? t('connecting') : t('disconnectedClick')}>
        <button onClick={() => conn !== 'connected' && reconnect()} className="no-drag flex items-center gap-1.5 text-[12px] text-faint hover:text-muted">
          <span className={cn('h-1.5 w-1.5 rounded-full', conn === 'connected' ? 'bg-join' : conn === 'connecting' ? 'animate-pulseDot bg-muted' : 'bg-live')} />
          {conn === 'connected' ? login || t('guest') : conn === 'connecting' ? t('statusConnecting') : t('statusOffline')}
        </button>
      </Tip>

      <div className="flex flex-1 justify-center">
        <button
          onClick={() => ui.set({ paletteOpen: true })}
          className="no-drag flex h-[26px] w-[min(380px,36vw)] items-center gap-2 rounded-md bg-raised px-2.5 text-[12px] text-faint transition-colors hover:text-muted"
        >
          <Search size={13} />
          <span className="flex-1 truncate text-left">{t('paletteHint')}</span>
          <span className="text-[11px]">{mac ? '⌘K' : 'Ctrl K'}</span>
        </button>
      </div>

      {(upd.state === 'ready' || upd.state === 'downloading') && (
        <button
          onClick={() => upd.state === 'ready' && window.bridge.installUpdate()}
          className="no-drag flex items-center gap-1.5 rounded-md bg-ink px-2.5 py-1 text-[12px] font-medium text-ground hover:bg-ink/85"
        >
          {upd.state === 'ready' ? <ArrowDownToLine size={13} /> : <Loader2 size={13} className="animate-spin" />}
          {upd.state === 'ready' ? t('installVersion', { v: upd.version ?? '' }) : t('updateLoading', { p: upd.percent ?? 0 })}
        </button>
      )}

      <div className="flex items-center">
        <Tip label={t('tipChannels')} shortcut="Ctrl B">
          <IconButton active={!ui.railCollapsed} onClick={() => ui.set({ railCollapsed: !ui.railCollapsed })}>
            <PanelLeft size={15} strokeWidth={1.75} />
          </IconButton>
        </Tip>
        <Tip label={t('tipPresence')} shortcut="Ctrl J">
          <IconButton active={ui.panelOpen} onClick={() => ui.set({ panelOpen: !ui.panelOpen })}>
            <PanelRight size={15} strokeWidth={1.75} />
          </IconButton>
        </Tip>
        <Tip label={ui.pinned ? t('tipUnpin') : t('tipPin')}>
          <IconButton
            active={ui.pinned}
            onClick={() => {
              window.bridge.pin(!ui.pinned)
              ui.set({ pinned: !ui.pinned })
            }}
          >
            <Pin size={15} strokeWidth={1.75} className={cn(ui.pinned && 'fill-current')} />
          </IconButton>
        </Tip>
      </div>

      {!mac && (
        <div className="no-drag flex">
          <button onClick={() => window.bridge.minimize()} className="flex h-8 w-10 items-center justify-center text-faint hover:text-ink" aria-label={t('minimize')}>
            <Minus size={15} strokeWidth={1.5} />
          </button>
          <button onClick={() => window.bridge.maximize()} className="flex h-8 w-10 items-center justify-center text-faint hover:text-ink" aria-label={t('maximize')}>
            {max ? <Copy size={12} strokeWidth={1.5} className="-scale-x-100" /> : <Square size={12} strokeWidth={1.5} />}
          </button>
          <button onClick={() => window.bridge.close()} className="flex h-8 w-10 items-center justify-center rounded-md text-faint hover:bg-live hover:text-white" aria-label={t('close')}>
            <X size={15} strokeWidth={1.5} />
          </button>
        </div>
      )}
    </header>
  )
}
