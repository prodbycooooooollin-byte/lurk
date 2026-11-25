import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { ArrowUp, X, CornerDownRight } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { Button } from './ui'
import { EmotePicker } from './EmotePicker'
import { emoteList } from '@/lib/emotes'
import { COMMANDS, send } from '@/lib/client'
import { useChat } from '@/store/chat'
import { useUi } from '@/store/ui'
import { useAuth } from '@/store/auth'
import { cn } from '@/lib/util'

type Suggestion = { kind: 'emote'; name: string; url: string; source: string } | { kind: 'user'; name: string } | { kind: 'cmd'; name: string; args: string; help: string }

const history: string[] = []

export function Composer({ channel }: { channel: string }) {
  const t = useT()
  const [text, setText] = useState('')
  const [sel, setSel] = useState(0)
  const [caret, setCaret] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const histIdx = useRef(-1)
  const ref = useRef<HTMLTextAreaElement>(null)
  const loggedIn = useAuth((a) => !!a.token)
  const roomId = useChat((s) => s.channels[channel]?.room.roomId)
  const room = useChat((s) => s.channels[channel]?.room)
  const emoteVersion = useChat((s) => s.emoteVersion)
  const presence = useChat((s) => s.channels[channel]?.presence)
  const replyTo = useUi((u) => (u.replyTo?.channel === channel ? u.replyTo : null))
  const setUi = useUi((u) => u.set)

  useEffect(() => {
    const h = (e: Event): void => {
      const d = (e as CustomEvent<{ channel: string; text: string }>).detail
      if (d.channel !== channel) return
      setText((t) => {
        const next = (t && !t.endsWith(' ') ? t + ' ' : t) + d.text + ' '
        setCaret(next.length)
        return next
      })
      requestAnimationFrame(() => ref.current?.focus())
    }
    window.addEventListener('lurk:insert', h)
    return () => window.removeEventListener('lurk:insert', h)
  }, [channel])

  // aktuelles Wort am Cursor
  const wordInfo = useMemo(() => {
    const before = text.slice(0, caret)
    const m = /(\S+)$/.exec(before)
    if (!m) return null
    return { word: m[1], start: caret - m[1].length }
  }, [text, caret])

  const suggestions = useMemo<Suggestion[]>(() => {
    if (!wordInfo || dismissed) return []
    const w = wordInfo.word
    if (w.startsWith('/') && wordInfo.start === 0) {
      return COMMANDS.filter((c) => c.name.startsWith(w.toLowerCase())).map((c) => ({ kind: 'cmd' as const, name: c.name, args: c.args ? t(c.args) : '', help: t(c.help) }))
    }
    const isAt = w.startsWith('@')
    const q = (isAt ? w.slice(1) : w.replace(/^:/, '')).toLowerCase()
    if (!isAt && q.length < 2) return []
    const users = Object.values(presence ?? {})
      .filter((p) => p.login.startsWith(q))
      .sort((a, b) => (b.lastMsgAt ?? 0) - (a.lastMsgAt ?? 0))
      .slice(0, isAt ? 8 : 3)
      .map((p) => ({ kind: 'user' as const, name: p.displayName ?? p.login }))
    if (isAt) return users
    const lists = emoteList(roomId)
    const emotes = [...lists.channel, ...lists.global]
      .filter((e) => e.name.toLowerCase().includes(q))
      .sort((a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q)) || a.name.length - b.name.length)
      .slice(0, 7)
      .map((e) => ({ kind: 'emote' as const, name: e.name, url: e.url, source: e.source }))
    return [...emotes, ...users].slice(0, 8)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wordInfo, dismissed, presence, roomId, emoteVersion, t])

  const insert = (value: string, replaceStart?: number): void => {
    const start = replaceStart ?? caret
    const end = replaceStart !== undefined ? caret : caret
    const next = text.slice(0, start) + value + ' ' + text.slice(end)
    setText(next)
    const pos = start + value.length + 1
    setCaret(pos)
    setSel(0)
    requestAnimationFrame(() => {
      ref.current?.focus()
      ref.current?.setSelectionRange(pos, pos)
    })
  }

  const accept = (s: Suggestion): void => {
    if (!wordInfo) return
    const value = s.kind === 'user' ? (wordInfo.word.startsWith('@') ? '@' + s.name : s.name) : s.name
    insert(value, wordInfo.start)
  }

  const submit = async (): Promise<void> => {
    const t = text
    if (!t.trim()) return
    const ok = await send(channel, t, replyTo?.id)
    if (ok || t.startsWith('/')) {
      history.unshift(t)
      if (history.length > 50) history.pop()
      histIdx.current = -1
      setText('')
      setCaret(0)
      if (replyTo) setUi({ replyTo: null })
    }
  }

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (suggestions.length) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSel((s) => (s + 1) % suggestions.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSel((s) => (s - 1 + suggestions.length) % suggestions.length)
        return
      }
      const explicit = !!wordInfo && /^[@/]/.test(wordInfo.word)
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && explicit && wordInfo!.word.length > 1 && suggestions[sel]?.name.toLowerCase() !== wordInfo!.word.replace(/^@/, '').toLowerCase())) {
        e.preventDefault()
        accept(suggestions[Math.min(sel, suggestions.length - 1)])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setDismissed(true)
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void submit()
      return
    }
    if (e.key === 'Escape' && replyTo) {
      setUi({ replyTo: null })
      return
    }
    if (e.key === 'ArrowUp' && !text.includes('\n') && (text === '' || histIdx.current >= 0)) {
      if (histIdx.current < history.length - 1) {
        e.preventDefault()
        histIdx.current++
        setText(history[histIdx.current])
      }
    }
    if (e.key === 'ArrowDown' && histIdx.current >= 0) {
      e.preventDefault()
      histIdx.current--
      setText(histIdx.current >= 0 ? history[histIdx.current] : '')
    }
  }

  const modes = [
    room?.slow ? t('slowMode', { n: room.slow }) : null,
    room?.subsOnly ? t('subsOnly') : null,
    room?.emoteOnly ? t('emoteOnly') : null,
    room?.followersOnly !== undefined && room.followersOnly >= 0 ? (room.followersOnly === 0 ? t('followersOnly') : t('followersMin', { n: room.followersOnly })) : null,
    room?.r9k ? t('uniqueChat') : null
  ].filter(Boolean)

  if (!loggedIn) {
    return (
      <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-[12.5px] text-faint">
        <span>{t('anonRead')}</span>
        <Button variant="primary" size="sm" onClick={() => setUi({ settingsOpen: true, settingsTab: 'account' })}>
          {t('signIn')}
        </Button>
      </div>
    )
  }

  const over = text.length > 500

  return (
    <div className="relative border-t border-line px-3 pb-2.5 pt-2">
      {suggestions.length > 0 && (
        <div className="absolute bottom-full left-3 right-3 mb-1 overflow-hidden rounded-lg border border-line bg-raised py-1 shadow-2xl">
          {suggestions.map((s, i) => (
            <button
              key={s.kind + s.name}
              onMouseDown={(e) => {
                e.preventDefault()
                accept(s)
              }}
              onMouseEnter={() => setSel(i)}
              className={cn('flex w-full items-center gap-3 px-3 py-1.5 text-left text-[13px]', i === sel && 'bg-ink/[0.07]')}
            >
              <span className="flex h-6 w-7 items-center justify-center text-faint">
                {s.kind === 'emote' ? <img src={s.url} alt="" className="max-h-6 max-w-7 object-contain" /> : s.kind === 'user' ? '@' : '/'}
              </span>
              <span className="font-medium text-ink">{s.name}</span>
              {s.kind === 'cmd' && <span className="text-faint">{s.args}</span>}
              <span className="ml-auto truncate pl-4 text-[11.5px] text-faint">{s.kind === 'emote' ? s.source.toUpperCase() : s.kind === 'cmd' ? s.help : t('user')}</span>
            </button>
          ))}
          <div className="border-t border-line px-3 pb-1 pt-1.5 text-[11px] text-faint">{t('suggestHint')}</div>
        </div>
      )}
      {replyTo && (
        <div className="mb-1.5 flex items-center gap-2 text-[12px] text-faint">
          <CornerDownRight size={12} />
          {t('replyingTo')} <span className="font-medium text-ink">@{replyTo.login}</span>
          <span className="truncate">{replyTo.text}</span>
          <button className="ml-auto p-0.5 hover:text-ink" onClick={() => setUi({ replyTo: null })}>
            <X size={13} />
          </button>
        </div>
      )}
      <div className={cn('flex items-end gap-1 rounded-lg border bg-transparent py-1 pl-2.5 pr-1 transition-colors focus-within:border-muted', over ? 'border-live' : 'border-line')}>
        <textarea
          ref={ref}
          rows={1}
          value={text}
          spellCheck
          onChange={(e) => {
            setText(e.target.value)
            setCaret(e.target.selectionStart)
            setDismissed(false)
            setSel(0)
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
          onKeyDown={onKey}
          placeholder={t('composerPlaceholder', { c: channel })}
          className="max-h-32 min-h-[28px] flex-1 resize-none bg-transparent py-1 text-[13.5px] leading-[20px] text-ink placeholder:text-faint [field-sizing:content]"
        />
        {text.length > 400 && <span className={cn('mb-1.5 text-[11px] tabular-nums', over ? 'text-live' : 'text-faint')}>{500 - text.length}</span>}
        <EmotePicker channel={channel} roomId={roomId} onPick={(n) => insert(n)} />
        <button
          onClick={() => void submit()}
          disabled={!text.trim() || over}
          className="mb-0.5 flex h-6 w-6 items-center justify-center rounded-md bg-ink text-ground transition hover:bg-ink/85 disabled:bg-line disabled:text-faint"
          title={t('sendHint')}
        >
          <ArrowUp size={14} strokeWidth={2.25} />
        </button>
      </div>
      {modes.length > 0 && <div className="mt-1.5 px-0.5 text-[11px] text-faint">{modes.join(' · ')}</div>}
    </div>
  )
}
