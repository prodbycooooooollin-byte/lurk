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
}

export function MessageList({ messages, canMod, emptyText }: Props) {
  const parentRef = useRef<HTMLDivElement>(null)
  const t = useT()
  const emoteVersion = useChat((s) => s.emoteVersion)
  const dark = useSettings((s) => s.theme) === 'dark'
  const pauseOnHover = useSettings((s) => s.pauseOnHover)
  const density = useSettings((s) => s.density)
  const fontSize = useSettings((s) => s.fontSize)
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
    estimateSize: () => (density === 'compact' ? 22 : 28) * (fontSize / 14),
    overscan: 14,
    getItemKey: (i) => list[i]?.id ?? i
  })

  const stick = useRef(true)
  const prevLen = useRef(0)
  useLayoutEffect(() => {
    // Erstes Laden (z. B. Verlauf) springt immer nach unten, auch wenn die Maus darüber ist
    const firstFill = prevLen.current === 0 && list.length > 0
    prevLen.current = list.length
    if (list.length && (firstFill || (stick.current && !paused))) {
      if (firstFill) stick.current = true
      virt.scrollToIndex(list.length - 1, { align: 'end' })
    }
  }, [list.length, list, virt, paused])

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
      <div ref={parentRef} onScroll={onScroll} className="h-full overflow-y-auto overflow-x-hidden pb-2">
        {list.length === 0 && emptyText && <div className="flex h-full items-center justify-center px-8 text-center text-[13px] text-faint">{emptyText}</div>}
        <div style={{ height: virt.getTotalSize(), position: 'relative' }}>
          {virt.getVirtualItems().map((item) => (
            <div key={item.key} data-index={item.index} ref={virt.measureElement} style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${item.start}px)` }}>
              <MessageRow msg={list[item.index]} index={item.index} dark={dark} emoteVersion={emoteVersion} canMod={canMod} />
            </div>
          ))}
        </div>
      </div>
      {((paused && newWhilePaused > 0) || !atBottom) && (
        <button
          onClick={jump}
          className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-ink px-3 py-1.5 text-[12px] font-medium text-ground shadow-lg transition hover:bg-ink/85"
        >
          {paused ? <Pause size={12} /> : <ArrowDown size={12} />}
          {paused ? t('paused') : t('jumpDown')}
          {unseen > 0 && <span className="tabular-nums opacity-60">{t('newCount', { n: unseen > 999 ? '999+' : unseen })}</span>}
        </button>
      )}
    </div>
  )
}
