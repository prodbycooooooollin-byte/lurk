import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowDown, Pause } from 'lucide-react'
import type { ChatMessage } from '@/lib/types'
import { MessageRow } from './MessageRow'
import { useChat } from '@/store/chat'
import { useSettings } from '@/store/settings'
import { useT } from '@/lib/i18n'

interface Props {
  messages: ChatMessage[]
  canMod: boolean
  emptyText?: string
  /** Zu dieser Nachricht springen (n ändert sich bei jedem Sprung) */
  jumpTo?: { id: string; n: number } | null
  /** "Neue Nachrichten"-Linie nach dieser Nachricht */
  markerId?: string | null
  onMarkerClear?: () => void
}

const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export function MessageList({ messages, canMod, emptyText, markerId, onMarkerClear, jumpTo }: Props) {
  const parentRef = useRef<HTMLDivElement>(null)
  const t = useT()
  const emoteVersion = useChat((s) => s.emoteVersion)
  const dark = useSettings((s) => s.theme) === 'dark'
  const pauseOnHover = useSettings((s) => s.pauseOnHover)
  const density = useSettings((s) => s.density)
  const fontSize = useSettings((s) => s.fontSize)
  const emoteScale = useSettings((s) => s.emoteScale)
  const alternate = useSettings((s) => s.alternateRows)
  const [atBottom, setAtBottom] = useState(true)
  const [hovered, setHovered] = useState(false)
  // Pause: solange die Maus über dem Chat ist, scrollt er nicht mit – nichts rutscht weg
  const paused = pauseOnHover && hovered && atBottom
  const pauseLen = useRef(0)
  const lastId = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (paused) {
      pauseLen.current = messages.length
      lastId.current = messages[messages.length - 1]?.id
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused])
  const list = messages
  let newWhilePaused = 0
  if (paused && lastId.current) {
    let i = messages.length - 1
    while (i >= 0 && messages[i].id !== lastId.current) i--
    newWhilePaused = i >= 0 ? messages.length - 1 - i : messages.length - pauseLen.current
  }

  const virt = useVirtualizer({
    count: list.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => (density === 'compact' ? 22 : 28) * (fontSize / 14) * (emoteScale > 1 ? 1.25 : 1),
    overscan: 14,
    getItemKey: (i) => list[i]?.id ?? i
  })

  const stick = useRef(true)
  const prevLen = useRef(0)
  const innerRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    // Erstes Laden (z. B. Verlauf) springt immer nach unten, auch wenn die Maus darüber ist
    const firstFill = prevLen.current === 0 && list.length > 0
    prevLen.current = list.length
    if (list.length && (firstFill || (stick.current && !paused))) {
      if (firstFill) stick.current = true
      const el = parentRef.current
      const before = el?.scrollTop ?? 0
      virt.scrollToIndex(list.length - 1, { align: 'end' })
      // Flüssig nachrutschen: der Sprung wird sofort als Versatz zurückgenommen und dann weich
      // auf 0 animiert (nur Transform, läuft auf der GPU). Statt 10 Rucken pro Sekunde gleitet der Chat.
      const delta = (el?.scrollTop ?? 0) - before
      const inner = innerRef.current
      if (!firstFill && inner && delta > 0 && el && delta < el.clientHeight && !reduceMotion) {
        // noch laufenden Rest der vorigen Animation mitnehmen, sonst springt es bei schnellem Chat
        const rest = inner.style.transform ? new DOMMatrixReadOnly(getComputedStyle(inner).transform).m42 : 0
        inner.style.transition = 'none'
        inner.style.transform = `translateY(${Math.min(el.clientHeight, delta + rest)}px)`
        void inner.offsetHeight
        inner.style.transition = 'transform 160ms cubic-bezier(.25,.8,.25,1)'
        inner.style.transform = 'translateY(0px)'
      }
    }
  }, [list.length, list, virt, paused])

  // Sprung aus der Zeitleiste: Nachricht in die Mitte holen und kurz hervorheben
  const [flashId, setFlashId] = useState<string | null>(null)
  useEffect(() => {
    if (!jumpTo) return
    const i = list.findIndex((m) => m.id === jumpTo.id)
    if (i < 0) return
    stick.current = false
    setAtBottom(false)
    virt.scrollToIndex(i, { align: 'center' })
    setFlashId(jumpTo.id)
    const tm = window.setTimeout(() => setFlashId(null), 1800)
    return () => window.clearTimeout(tm)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpTo])

  const onScroll = (): void => {
    const el = parentRef.current
    if (!el) return
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    if (!paused) stick.current = bottom
    if (bottom !== atBottom) setAtBottom(bottom)
  }

  const jump = (): void => {
    stick.current = true
    setAtBottom(true)
    setHovered(false)
    virt.scrollToIndex(messages.length - 1, { align: 'end' })
  }

  const unseen = !atBottom ? messages.length - 1 - (virt.getVirtualItems().at(-1)?.index ?? messages.length - 1) : newWhilePaused

  return (
    <div className="relative min-h-0 flex-1" onMouseMove={() => !hovered && setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <div ref={parentRef} onScroll={onScroll} className="h-full overflow-y-auto overflow-x-hidden pb-2 [contain:strict]">
        {list.length === 0 && emptyText && <div className="flex h-full items-center justify-center px-8 text-center text-[13px] text-faint">{emptyText}</div>}
        <div ref={innerRef} style={{ height: virt.getTotalSize(), position: 'relative', willChange: 'transform' }}>
          {virt.getVirtualItems().map((item) => (
            <div key={item.key} data-index={item.index} ref={virt.measureElement} className={flashId === list[item.index]?.id ? 'jump-flash' : undefined} style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${item.start}px)`, contain: 'layout paint style' }}>
              {markerId && item.index > 0 && list[item.index - 1]?.id === markerId && (
                <button onClick={onMarkerClear} className="group flex w-full items-center gap-3 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-live">
                  <span className="h-px flex-1 bg-live/50" />
                  {t('newMessages')}
                  <span className="h-px flex-1 bg-live/50" />
                </button>
              )}
              <MessageRow msg={list[item.index]} alt={alternate && item.index % 2 === 1} dark={dark} emoteVersion={emoteVersion} canMod={canMod} />
            </div>
          ))}
        </div>
      </div>
      {((paused && newWhilePaused > 0) || !atBottom) && (
        <button
          onClick={jump}
          className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-[hsl(var(--ch))] px-3 py-1.5 text-[12px] font-medium text-ground shadow-lg transition hover:brightness-110"
        >
          {paused ? <Pause size={12} /> : <ArrowDown size={12} />}
          {paused ? t('paused') : t('jumpDown')}
          {unseen > 0 && <span className="tabular-nums opacity-60">{t('newCount', { n: unseen > 999 ? '999+' : unseen })}</span>}
        </button>
      )}
    </div>
  )
}
