import { memo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { ShieldAlert, Check, Trash2, Clock, Ban } from 'lucide-react'
import { useRadar, radarActive, type RadarItem, type RadarReason } from '@/lib/modradar'
import { useChat } from '@/store/chat'
import { useSettings } from '@/store/settings'
import { banUser, deleteMessage, timeoutUser } from '@/lib/client'
import { useT, type TKey } from '@/lib/i18n'
import { cn, formatAge, relTime } from '@/lib/util'
import { openUserCard } from './MessageRow'
import { UserAvatar } from './UserAvatar'
import { Tip } from './ui'

const EMPTY: RadarItem[] = []

/** Ein Signal als kurzer, lesbarer Text */
export function useReasonText(): (r: RadarReason) => string {
  const t = useT()
  return (r) => {
    switch (r.k) {
      case 'firstMsg':
        return t('rFirstMsg')
      case 'newAccount':
        return r.days < 1 ? t('rNewAccountToday') : t('rNewAccount', { n: r.days })
      case 'link':
        return t('rLink')
      case 'crossChannel':
        return t('rCrossChannel', { c: r.channels.map((c) => `#${c}`).join(', ') })
      case 'wave':
        return t('rWave', { n: r.users })
      case 'massMention':
        return t('rMassMention', { n: r.n })
      case 'lookalike':
        return t('rLookalike', { c: r.of })
      case 'bannedElsewhere':
        return r.dur ? t('rTimedOutElsewhere', { c: r.channel, t: relTime(r.ts) }) : t('rBannedElsewhere', { c: r.channel, t: relTime(r.ts) })
    }
  }
}

const STRONG = new Set(['crossChannel', 'wave', 'lookalike', 'bannedElsewhere'])

/** Kanäle, in denen du Mod oder Broadcaster bist */
export function useModChannels(): string[] {
  return useChat(useShallow((st) => Object.keys(st.channels).filter((c) => st.channels[c].me.mod || st.channels[c].me.broadcaster)))
}

export function RadarFeed({ channel }: { channel: string }) {
  const t = useT()
  const items = useRadar((r) => r.items[channel] ?? EMPTY)
  const clear = useRadar((r) => r.clear)
  const mode = useSettings((s) => s.modRadar)
  const canMod = useChat((st) => !!st.channels[channel]?.me && (st.channels[channel].me.mod || st.channels[channel].me.broadcaster))
  const open = items.filter((i) => !i.handled)

  if (!radarActive(channel)) {
    return <div className="p-6 text-center text-[12.5px] leading-relaxed text-faint">{mode === 'off' ? t('radarOff') : t('radarNotMod')}</div>
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-2 text-[11.5px] text-faint">
        <ShieldAlert size={12} />
        <span className="flex-1">{open.length ? t('radarOpen', { n: open.length }) : t('radarQuiet')}</span>
        {items.length > 0 && (
          <button className="hover:text-ink" onClick={() => clear(channel)}>
            {t('radarClear')}
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!items.length ? (
          <div className="px-6 py-10 text-center text-[12px] leading-relaxed text-faint">{t('radarExplain')}</div>
        ) : (
          items.map((i) => <RadarRow key={i.id} item={i} canMod={canMod} />)
        )}
      </div>
    </div>
  )
}

const RadarRow = memo(function RadarRow({ item, canMod }: { item: RadarItem; canMod: boolean }) {
  const t = useT()
  const reason = useReasonText()
  const mark = useRadar((r) => r.mark)
  const modChannels = useModChannels()
  const others = modChannels.filter((c) => c !== item.channel)
  const act = (handled: RadarItem['handled'], fn: () => Promise<unknown>) => () => {
    void fn().then((ok) => ok !== false && mark(item.channel, item.id, handled))
  }
  const done = item.handled
  return (
    <div className={cn('border-b border-line/70 px-4 py-2.5', done && 'opacity-45')}>
      <div className="flex items-center gap-2">
        <UserAvatar login={item.login} name={item.displayName} size={20} />
        <button className="max-w-[60%] shrink-0 truncate text-[12.5px] font-semibold text-ink hover:underline" onClick={(e) => openUserCard(item.login, item.channel, e)}>
          {item.displayName}
        </button>
        {item.createdAt && <span className="min-w-0 truncate text-[11px] text-faint">{t('radarAccount', { a: formatAge(item.createdAt) })}</span>}
        <span className="ml-auto shrink-0 text-[11px] tabular-nums text-faint">{relTime(item.ts)}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {item.reasons.map((r, n) => (
          <span key={n} className={cn('rounded-full border px-1.5 py-[1px] text-[10.5px]', STRONG.has(r.k) ? 'border-warn/45 bg-warn/10 text-warn' : 'border-line text-muted')}>
            {reason(r)}
          </span>
        ))}
      </div>
      <p className="selectable mt-1.5 line-clamp-3 break-words text-[12.5px] leading-snug text-ink/90">{item.text}</p>
      {done ? (
        <div className="mt-1.5 flex items-center gap-1 text-[11px] text-faint">
          <Check size={11} /> {t(`radarDone_${done}` as TKey)}
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {canMod && (
            <>
              <RadarBtn icon={<Trash2 size={12} />} label={t('deleteMsg')} onClick={act('deleted', () => deleteMessage(item.channel, item.id))} />
              <RadarBtn icon={<Clock size={12} />} label="10 min" onClick={act('timeout', () => timeoutUser(item.channel, item.login, 600))} />
              <RadarBtn icon={<Ban size={12} />} label={t('ban')} danger onClick={act('ban', () => banUser(item.channel, item.login, t('radarBanReason')))} />
              {others.length > 0 && (
                <Tip label={others.map((c) => `#${c}`).join(', ')}>
                  <span>
                    <RadarBtn
                      icon={<Ban size={12} />}
                      label={t('banEverywhere', { n: others.length + 1 })}
                      danger
                      onClick={act('ban', async () => {
                        const r = await Promise.all([item.channel, ...others].map((c) => banUser(c, item.login, t('radarBanReason'))))
                        return r.some(Boolean)
                      })}
                    />
                  </span>
                </Tip>
              )}
            </>
          )}
          <RadarBtn icon={<Check size={12} />} label={t('radarFine')} onClick={() => mark(item.channel, item.id, 'ok')} />
        </div>
      )}
    </div>
  )
})

function RadarBtn({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded-md border px-1.5 text-[11px] font-medium transition-colors',
        danger ? 'border-live/40 text-live hover:bg-live/10' : 'border-line text-muted hover:bg-raised hover:text-ink'
      )}
    >
      {icon}
      {label}
    </button>
  )
}
