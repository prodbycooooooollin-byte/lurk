import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Flame, BarChart3, Trophy, Lock } from 'lucide-react'
import { useChannelEvents, type HypeTrain, type Poll, type Prediction } from '@/lib/eventsub'
import { useT } from '@/lib/i18n'
import { cn, formatNumber } from '@/lib/util'

function useNow(active: boolean): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [active])
  return now
}

const clock = (msLeft: number): string => {
  const s = Math.max(0, Math.round(msLeft / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Hype-Train, Umfrage und Vorhersage des Kanals als schmale Leisten über dem Chat */
export function ChannelEvents({ channel }: { channel: string }) {
  const hype = useChannelEvents((s) => s.hype[channel])
  const poll = useChannelEvents((s) => s.poll[channel])
  const prediction = useChannelEvents((s) => s.prediction[channel])
  const now = useNow(!!(hype || poll || prediction))
  return (
    <AnimatePresence initial={false}>
      {hype && <Shell key="hype"><HypeBar h={hype} now={now} /></Shell>}
      {poll && <Shell key="poll"><PollBox p={poll} now={now} /></Shell>}
      {prediction && <Shell key="pred"><PredictionBox p={prediction} now={now} /></Shell>}
    </AnimatePresence>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
      className="shrink-0 overflow-hidden border-b border-line"
    >
      <div className="px-4 py-2">{children}</div>
    </motion.div>
  )
}

function HypeBar({ h, now }: { h: HypeTrain; now: number }) {
  const t = useT()
  const pct = Math.min(100, (h.progress / Math.max(1, h.goal)) * 100)
  return (
    <div>
      <div className="flex items-center gap-2 text-[12px]">
        <Flame size={13} className="text-[hsl(var(--ch))]" />
        <span className="font-semibold text-ink">{h.ended ? t('hypeEnded', { l: h.level }) : t('hypeLevel', { l: h.level })}</span>
        <span className="tabular-nums text-faint">{Math.round(pct)} %</span>
        {!h.ended && <span className="ml-auto tabular-nums text-muted">{clock(h.endsAt - now)}</span>}
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-[hsl(var(--ch))] transition-[width] duration-700" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function PollBox({ p, now }: { p: Poll; now: number }) {
  const t = useT()
  const total = p.choices.reduce((a, c) => a + c.votes, 0)
  const top = Math.max(0, ...p.choices.map((c) => c.votes))
  return (
    <div>
      <div className="flex items-center gap-2 text-[12px]">
        <BarChart3 size={13} className="text-muted" />
        <span className="min-w-0 flex-1 truncate font-semibold text-ink">{p.title}</span>
        <span className="shrink-0 tabular-nums text-faint">{p.ended ? t('pollEnded') : p.endsAt ? clock(p.endsAt - now) : ''}</span>
      </div>
      <div className="mt-1.5 space-y-1">
        {p.choices.map((c) => {
          const pct = total ? (c.votes / total) * 100 : 0
          return (
            <div key={c.title} className="relative overflow-hidden rounded-[5px] bg-raised/60 px-2 py-[3px] text-[11.5px]">
              <div className={cn('absolute inset-y-0 left-0 transition-[width] duration-700', p.ended && c.votes === top && top > 0 ? 'bg-[hsl(var(--ch)/0.35)]' : 'bg-ink/10')} style={{ width: `${pct}%` }} />
              <div className="relative flex gap-2">
                <span className="min-w-0 flex-1 truncate text-ink">{c.title}</span>
                <span className="tabular-nums text-muted">{Math.round(pct)} %</span>
                <span className="w-10 text-right tabular-nums text-faint">{formatNumber(c.votes)}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PredictionBox({ p, now }: { p: Prediction; now: number }) {
  const t = useT()
  const totalPts = p.outcomes.reduce((a, o) => a + o.points, 0)
  return (
    <div>
      <div className="flex items-center gap-2 text-[12px]">
        {p.ended ? <Trophy size={13} className="text-warn" /> : p.locked ? <Lock size={12} className="text-muted" /> : <BarChart3 size={13} className="text-muted" />}
        <span className="min-w-0 flex-1 truncate font-semibold text-ink">{p.title}</span>
        <span className="shrink-0 tabular-nums text-faint">{p.ended ? t('predEnded') : p.locked ? t('predLocked') : p.locksAt ? clock(p.locksAt - now) : ''}</span>
      </div>
      <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-line">
        {p.outcomes.map((o) => (
          <div key={o.id} className={cn('h-full transition-[width] duration-700', o.color === 'pink' ? 'bg-[#f5009b]' : 'bg-[#387aff]')} style={{ width: `${totalPts ? (o.points / totalPts) * 100 : 100 / p.outcomes.length}%` }} />
        ))}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px]">
        {p.outcomes.map((o) => (
          <span key={o.id} className={cn('flex items-center gap-1', p.winner && p.winner !== o.id ? 'text-faint' : 'text-muted')}>
            <span className={cn('h-1.5 w-1.5 rounded-full', o.color === 'pink' ? 'bg-[#f5009b]' : 'bg-[#387aff]')} />
            <span className={cn('truncate', p.winner === o.id && 'font-semibold text-ink')}>{o.title}</span>
            <span className="tabular-nums text-faint">
              {totalPts ? `${Math.round((o.points / totalPts) * 100)} %` : '–'} · {t('predUsers', { n: formatNumber(o.users) })}
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}
