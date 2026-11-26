import { memo, useMemo } from 'react'
import type { ChatMessage } from '@/lib/types'
import { useT } from '@/lib/i18n'
import { cn, timeShort } from '@/lib/util'
import { Tip } from './ui'

type Kind = 'raid' | 'subs' | 'peak' | 'announce' | 'clear' | 'emote' | 'hype'
interface Mark {
  id: string
  ts: number
  kind: Kind
  label: string
}

const SUB_TYPES = new Set(['sub', 'resub', 'subgift', 'submysterygift', 'giftpaidupgrade', 'primepaidupgrade'])
const DOT: Record<Kind, string> = {
  raid: 'bg-[hsl(var(--ch))]',
  hype: 'bg-[hsl(var(--ch))]',
  subs: 'bg-join',
  peak: 'bg-ink/70',
  announce: 'bg-warn',
  clear: 'bg-live',
  emote: 'bg-muted'
}

/**
 * Dezente Zeitleiste über dem Chat: Punkte für das, was im geladenen Verlauf passiert ist.
 * Erscheint nur, wenn es etwas zu zeigen gibt. Klick springt zur Nachricht.
 */
export const Timeline = memo(function Timeline({ messages, onJump }: { messages: ChatMessage[]; onJump: (id: string) => void }) {
  const t = useT()
  const marks = useMemo<Mark[]>(() => {
    const out: Mark[] = []
    let burst: { id: string; ts: number; n: number; last: number } | null = null
    const flush = (): void => {
      if (burst && burst.n >= 3) out.push({ id: burst.id, ts: burst.ts, kind: 'subs', label: t('tlSubs', { n: burst.n }) })
      burst = null
    }
    const perMin = new Map<number, { n: number; id: string; ts: number }>()
    for (const m of messages) {
      if (m.historical) continue
      if (m.kind === 'chat' || m.kind === 'action') {
        const k = Math.floor(m.ts / 60000)
        const b = perMin.get(k)
        if (b) b.n++
        else perMin.set(k, { n: 1, id: m.id, ts: m.ts })
      } else if (m.kind === 'usernotice') {
        if (m.noticeType === 'raid') out.push({ id: m.id, ts: m.ts, kind: 'raid', label: t('tlRaid', { u: m.displayName ?? '', n: m.raidViewers ?? '?' }) })
        else if (m.noticeType === 'announcement') out.push({ id: m.id, ts: m.ts, kind: 'announce', label: t('tlAnnounce') })
        else if (m.noticeType && SUB_TYPES.has(m.noticeType)) {
          if (burst && m.ts - burst.last < 60_000) {
            burst.n++
            burst.last = m.ts
          } else {
            flush()
            burst = { id: m.id, ts: m.ts, n: 1, last: m.ts }
          }
        }
      } else if (m.kind === 'system') {
        if (m.noticeType === 'clear') out.push({ id: m.id, ts: m.ts, kind: 'clear', label: t('tlClear') })
        else if (m.noticeType === '7tv') out.push({ id: m.id, ts: m.ts, kind: 'emote', label: m.systemText ?? '' })
        else if (m.noticeType === 'hype') out.push({ id: m.id, ts: m.ts, kind: 'hype', label: m.systemText ?? '' })
      }
    }
    flush()
    // Spitzen: Minuten mit deutlich mehr Nachrichten als üblich (höchstens 4)
    const counts = [...perMin.values()].map((b) => b.n).sort((a, b) => a - b)
    if (counts.length >= 5) {
      const median = counts[Math.floor(counts.length / 2)]
      const peaks = [...perMin.values()].filter((b) => b.n >= Math.max(20, median * 2.5)).sort((a, b) => b.n - a.n).slice(0, 4)
      for (const p of peaks) out.push({ id: p.id, ts: p.ts, kind: 'peak', label: t('tlPeak', { n: p.n }) })
    }
    return out.sort((a, b) => a.ts - b.ts)
  }, [messages, t])

  const first = messages.find((m) => !m.historical)?.ts
  const last = messages[messages.length - 1]?.ts
  if (!marks.length || !first || !last || last - first < 60_000) return null
  const span = last - first
  return (
    <div className="group/tl relative h-[9px] shrink-0 border-b border-line/60 px-4">
      <div className="absolute inset-x-4 top-1/2 h-px -translate-y-1/2 bg-line/70" />
      {marks.map((m) => (
        <Tip key={m.id + m.kind} label={`${timeShort(m.ts)} · ${m.label}`}>
          <button
            onClick={() => onJump(m.id)}
            aria-label={m.label}
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 p-1"
            style={{ left: `calc(16px + (100% - 32px) * ${(m.ts - first) / span})` }}
          >
            <span className={cn('block h-[5px] w-[5px] rounded-full opacity-70 transition-transform duration-150 hover:scale-[1.8] hover:opacity-100 group-hover/tl:opacity-100', DOT[m.kind])} />
          </button>
        </Tip>
      ))}
    </div>
  )
})
