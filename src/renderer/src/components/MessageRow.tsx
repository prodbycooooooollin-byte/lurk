import { memo, useEffect, useMemo, useState, type MouseEvent } from 'react'
import * as CM from '@radix-ui/react-context-menu'
import { Reply, Copy, UserRound, Trash2, Clock, Ban, Eye, CornerDownRight, ShieldAlert } from 'lucide-react'
import type { ChatMessage } from '@/lib/types'
import { tokenize, type Token } from '@/lib/tokenize'
import { findBadge } from '@/lib/emotes'
import { cn, readableColor, timeShort } from '@/lib/util'
import { imageUrl, isCardLink, isVideo, pageToResolve, resolveCard, resolveMedia, type LinkCard } from '@/lib/linkPreview'
import { helixCtx } from '@/store/auth'
import { Play, Clapperboard } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { UserAvatar } from './UserAvatar'
import { paintStyle, useStvCosmetics } from '@/lib/seventv'
import { useSettings } from '@/store/settings'
import { useShallow } from 'zustand/react/shallow'
import { useUi } from '@/store/ui'
import { deleteMessage, timeoutUser, banUser } from '@/lib/client'

export function openUserCard(login: string, channel: string, e?: { clientX: number; clientY: number }): void {
  const x = Math.min(Math.max(12, (e?.clientX ?? window.innerWidth / 2) + 12), window.innerWidth - 372)
  const y = Math.min(Math.max(48, (e?.clientY ?? 140) - 40), window.innerHeight - 600)
  useUi.getState().set({ userCard: { login: login.toLowerCase(), channel, x, y } })
}

// Kein eigener Tooltip pro Emote mehr: die Daten hängen als data-Attribute am Bild,
// ein einziger <EmotePreview /> in App zeigt die große Vorschau beim Hovern.
const EmoteImg = memo(function EmoteImg({ tk }: { tk: Extract<Token, { t: 'emote' }> }) {
  const data = {
    'data-emote': [tk.e.name, ...tk.overlays.map((o) => o.name)].join(' + '),
    'data-big': tk.e.url4x ?? tk.e.url,
    'data-src': tk.e.source,
    'data-scope': tk.e.scope
  }
  if (!tk.overlays.length) return <img className="emote" src={tk.e.url} alt={tk.e.name} loading="lazy" draggable={false} {...data} />
  return (
    <span className="emote-stack">
      <img className="emote" src={tk.e.url} alt={tk.e.name} loading="lazy" draggable={false} {...data} />
      {tk.overlays.map((o, i) => (
        <img key={i} className="emote zw" src={o.url} alt={o.name} loading="lazy" draggable={false} {...data} />
      ))}
    </span>
  )
})

function Tokens({ msg, emoteVersion }: { msg: ChatMessage; emoteVersion: number }) {
  const thirdParty = useSettings((s) => s.thirdPartyEmotes)
  const previewMode = useSettings((s) => s.imagePreviews)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const tokens = useMemo(() => tokenize(msg.text, msg.twitchEmotes, msg.roomId, thirdParty), [msg.text, msg.twitchEmotes, msg.roomId, thirdParty, emoteVersion])
  return (
    <>
      {tokens.map((tk, i) => {
        switch (tk.t) {
          case 'text':
            return <span key={i}>{tk.v}</span>
          case 'emote':
            return <EmoteImg key={i} tk={tk} />
          case 'mention':
            return (
              <button key={i} className="font-semibold text-ink hover:underline" onClick={(e) => openUserCard(tk.login, msg.channel, e)}>
                {tk.v}
              </button>
            )
          case 'link':
            return (
              <a
                key={i}
                href={tk.href}
                data-image={previewMode === 'hover' ? imageUrl(tk.href) ?? undefined : undefined}
                data-resolve={previewMode === 'hover' && !imageUrl(tk.href) && pageToResolve(tk.href) ? tk.href : undefined}
                className="text-ink underline decoration-faint underline-offset-2 hover:decoration-ink"
                onClick={(e) => {
                  e.preventDefault()
                  void window.bridge.open(tk.href)
                }}
              >
                {tk.v}
              </a>
            )
        }
      })}
    </>
  )
}

/** Links im Text, hinter denen ein Bild/Video stecken kann (max. 3) */
function mediaLinks(text: string): string[] {
  if (!text.includes('.')) return []
  const out: string[] = []
  for (const w of text.split(/\s+/)) {
    if (!/^(https?:\/\/|www\.)/i.test(w)) continue
    const href = w.startsWith('http') ? w : `https://${w}`
    if ((imageUrl(href) || pageToResolve(href) || isCardLink(href)) && !out.includes(href)) out.push(href)
    if (out.length >= 3) break
  }
  return out
}

/** Bilder hinter Links direkt im Chat (feste Höhe, damit die Liste beim Laden nicht springt) */
const ImagePreviews = memo(function ImagePreviews({ text }: { text: string }) {
  const mode = useSettings((s) => s.imagePreviews)
  const links = useMemo(() => (mode === 'inline' ? mediaLinks(text) : []), [text, mode])
  if (!links.length) return null
  return (
    <div className="mb-1 mt-1 flex gap-2">
      {links.map((href) => (isCardLink(href) ? <InlineCard key={href} href={href} /> : <InlineMedia key={href} href={href} />))}
    </div>
  )
})

/** Kompakte Karte für YouTube-Videos und Twitch-Clips: Vorschaubild, Titel, Kanal */
function InlineCard({ href }: { href: string }) {
  const t = useT()
  const [card, setCard] = useState<LinkCard | null | undefined>(undefined)
  useEffect(() => {
    let alive = true
    void resolveCard(href, helixCtx()).then((c) => alive && setCard(c))
    return () => {
      alive = false
    }
  }, [href])
  if (card === null) return null
  const open = (e: MouseEvent): void => {
    e.preventDefault()
    void window.bridge.open(href)
  }
  const dur = card?.duration ? `${Math.floor(card.duration / 60)}:${String(Math.round(card.duration % 60)).padStart(2, '0')}` : undefined
  return (
    <a
      href={href}
      onClick={open}
      data-image={card?.thumb}
      className="group/card flex h-[68px] w-[340px] max-w-full overflow-hidden rounded-md border border-line bg-raised/40 transition-colors hover:border-muted"
    >
      <span className="relative h-full w-[120px] shrink-0 overflow-hidden bg-raised">
        {card?.thumb && <img src={card.thumb} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover transition duration-300 group-hover/card:scale-105" />}
        <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover/card:opacity-100">
          <span className="rounded-full bg-black/60 p-1.5 text-white">
            <Play size={12} className="fill-current" />
          </span>
        </span>
        {dur && <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[10px] tabular-nums text-white">{dur}</span>}
      </span>
      <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-2.5">
        {card === undefined ? (
          <>
            <span className="h-3 w-4/5 animate-pulse rounded bg-line" />
            <span className="h-2.5 w-1/2 animate-pulse rounded bg-line/70" />
          </>
        ) : (
          <>
            <span className="line-clamp-2 text-[12px] font-medium leading-snug text-ink">{card.title}</span>
            <span className="flex items-center gap-1 truncate text-[11px] text-faint">
              {card.kind === 'clip' ? <Clapperboard size={11} className="shrink-0" /> : <Play size={10} className="shrink-0 fill-current" />}
              {card.kind === 'clip'
                ? [card.channel, card.views !== undefined ? t('clipViews', { n: card.views.toLocaleString() }) : undefined].filter(Boolean).join(' · ')
                : ['YouTube', card.author].filter(Boolean).join(' · ')}
            </span>
          </>
        )}
      </span>
    </a>
  )
}

function InlineMedia({ href }: { href: string }) {
  const [src, setSrc] = useState<string | null | undefined>(() => imageUrl(href) ?? undefined)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (src !== undefined) return
    let alive = true
    void resolveMedia(href).then((r) => alive && setSrc(r))
    return () => {
      alive = false
    }
  }, [href, src])
  if (src === null || failed) return null
  const open = (e: MouseEvent): void => {
    e.preventDefault()
    void window.bridge.open(href)
  }
  return (
    <a href={href} onClick={open} data-image={src && !isVideo(src) ? src : undefined} className="group/img relative block h-28 min-w-[60px] overflow-hidden rounded-md border border-line bg-raised">
      {src === undefined ? (
        <span className="block h-full w-40 animate-pulse bg-line/40" />
      ) : isVideo(src) ? (
        <video src={src} autoPlay muted loop playsInline preload="metadata" onError={() => setFailed(true)} className="h-full w-auto max-w-[280px] object-cover" />
      ) : (
        <img
          src={src}
          alt=""
          loading="lazy"
          draggable={false}
          referrerPolicy="no-referrer"
          onLoad={(e) => {
            // Imgur liefert für gelöschte Bilder einen 161×81-Platzhalter statt eines Fehlers
            const im = e.currentTarget
            if (/imgur\.com/.test(src) && im.naturalWidth === 161 && im.naturalHeight === 81) setFailed(true)
          }}
          onError={() => setFailed(true)}
          className="h-full w-auto max-w-[280px] object-cover transition group-hover/img:brightness-110"
        />
      )}
    </a>
  )
}

/** Raid: eigenes Banner mit Avatar des Raiders und der Zahl der Mitgebrachten */
function RaidBanner({ msg }: { msg: ChatMessage }) {
  const t = useT()
  const count = msg.raidViewers
  return (
    <div className={cn('raid-sweep relative my-1.5 overflow-hidden border-y border-[hsl(var(--ch)/0.35)] bg-[hsl(var(--ch)/0.07)] px-4 py-2', msg.historical && 'opacity-60')}>
      <div className="relative flex items-center gap-2.5">
        <UserAvatar login={msg.login!} name={msg.displayName} color={msg.color} size={26} />
        <div className="min-w-0 flex-1 text-[12.5px] leading-snug">
          <button onClick={(e) => openUserCard(msg.login!, msg.channel, e)} className="font-semibold text-ink hover:underline">
            {msg.displayName}
          </button>{' '}
          <span className="text-muted">{count ? t('raidLine', { n: count.toLocaleString() }) : t('raidLineNoCount')}</span>
        </div>
        <span className="shrink-0 text-[11px] tabular-nums text-faint">{timeShort(msg.ts)}</span>
      </div>
    </div>
  )
}

function SystemLine({ msg }: { msg: ChatMessage }) {
  const t = useT()
  if (msg.noticeType === 'history') {
    return (
      <div className="flex items-center gap-3 px-4 py-2 text-[11.5px] text-faint">
        <span className="h-px flex-1 bg-line" />
        {t('endHistory')}
        <span className="h-px flex-1 bg-line" />
      </div>
    )
  }
  return (
    <div className={cn('flex items-baseline gap-2 px-4 py-[3px] text-[12.5px] text-faint', msg.historical && 'opacity-60', msg.noticeType === 'error' && 'text-live')}>
      {msg.emoteUrl && <img src={msg.emoteUrl} alt="" className="h-5 w-auto translate-y-[5px] self-start" draggable={false} />}
      <span className="selectable">{msg.systemText}</span>
      <span className="ml-auto text-[11px] tabular-nums">{timeShort(msg.ts)}</span>
    </div>
  )
}

function JoinLine({ msg }: { msg: ChatMessage }) {
  const t = useT()
  const joins = msg.joins?.filter((j) => !j.part) ?? []
  const parts = msg.joins?.filter((j) => j.part) ?? []
  const names = (list: typeof joins) =>
    list.map((j, i) => (
      <span key={j.login}>
        {i > 0 && ', '}
        <button className="text-muted hover:text-ink hover:underline" onClick={(e) => openUserCard(j.login, msg.channel, e)}>
          {j.login}
        </button>
      </span>
    ))
  return (
    <div className="flex flex-col px-4 py-[3px] text-[12.5px] text-faint">
      {joins.length > 0 && (
        <div className="flex items-baseline gap-2">
          <span className="h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full bg-join" />
          <span>
            {names(joins)} {joins.length === 1 ? t('joinedOne') : t('joinedMany')}
          </span>
        </div>
      )}
      {parts.length > 0 && (
        <div className="flex items-baseline gap-2">
          <span className="h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full border border-faint" />
          <span>
            {names(parts)} {parts.length === 1 ? t('leftOne') : t('leftMany')}
          </span>
        </div>
      )}
    </div>
  )
}

interface RowProps {
  msg: ChatMessage
  /** nur bei "Zeilen abwechselnd einfärben" – kein Index, sonst rendert beim Kürzen jede Zeile neu */
  alt: boolean
  dark: boolean
  emoteVersion: number
  canMod: boolean
}

export const MessageRow = memo(function MessageRow({ msg, alt, dark, emoteVersion, canMod }: RowProps) {
  const s = useSettings(useShallow((st) => ({
    deletedMode: st.deletedMode,
    density: st.density,
    timestamps: st.timestamps,
    timestampSeconds: st.timestampSeconds,
    showBadges: st.showBadges,
    toggleList: st.toggleList
  })))
  const watched = useSettings((st) => !!msg.login && st.watchUsers.includes(msg.login))
  const showStv = useSettings((st) => st.stvCosmetics)
  const stvAll = useStvCosmetics(showStv ? msg.userId : undefined)
  const stv = showStv ? stvAll : {}
  const t = useT()
  const set = useUi((u) => u.set)

  if (msg.kind === 'system' || msg.kind === 'notice') return <SystemLine msg={msg} />
  if (msg.kind === 'joins') return <JoinLine msg={msg} />
  if (msg.deleted && s.deletedMode === 'hide') {
    return <div className="px-4 py-0.5 text-[12px] text-faint">{t('removedMsg', { name: msg.displayName ?? '', info: msg.timeoutInfo ?? '' })}</div>
  }

  const login = msg.login ?? ''
  const nameColor = readableColor(msg.color, login, dark)
  const onName = (e: MouseEvent) => openUserCard(login, msg.channel, e)
  const reply = () => set({ replyTo: { channel: msg.channel, id: msg.id, login, text: msg.text } })

  const hl = msg.highlight
  const hlStyle =
    hl === 'keyword' && msg.highlightColor
      ? { background: `color-mix(in srgb, ${msg.highlightColor} 10%, transparent)`, boxShadow: `inset 2px 0 0 ${msg.highlightColor}` }
      : undefined

  const body = (
    <div
      className={cn(
        'chat-line group relative selectable',
        s.density === 'compact' ? 'px-3 py-0' : 'px-4 py-[3px]',
        alt && 'bg-ink/[0.025]',
        'hover:bg-ink/[0.035]',
        hl === 'mention' && 'bg-ink/[0.07] shadow-[inset_2px_0_0_rgb(var(--ink))]',
        hl === 'first' && 'shadow-[inset_2px_0_0_rgb(var(--join))]',
        hl === 'watch' && 'shadow-[inset_2px_0_0_rgb(var(--warn))]',
        msg.radar && !hl && 'bg-warn/[0.045] shadow-[inset_2px_0_0_rgb(var(--warn))]',
        msg.historical && 'opacity-50',
        msg.deleted && 'opacity-40'
      )}
      style={hlStyle}
    >
      {hl === 'first' && <div className="text-[11px] font-medium text-join">{t('firstMsg')}</div>}
      {msg.reply && (
        <div className="flex items-center gap-1.5 truncate text-[12px] text-faint">
          <CornerDownRight size={12} className="shrink-0" />
          <span>{t('replyingTo')}</span>
          <button className="text-muted hover:underline" onClick={(e) => openUserCard(msg.reply!.login, msg.channel, e)}>
            @{msg.reply.displayName}
          </button>
          <span className="truncate">{msg.reply.text}</span>
        </div>
      )}
      <div className={cn(msg.deleted && 'line-through decoration-faint')}>
        {s.timestamps && <span className="mr-2 text-[11px] tabular-nums text-faint">{timeShort(msg.ts, s.timestampSeconds)}</span>}
        {s.showBadges &&
          msg.badges.map((b) => {
            const badge = findBadge(msg.channel, b.set, b.version)
            return badge ? <img key={b.set} className="badge" src={badge.url} alt="" title={badge.title} draggable={false} /> : null
          })}
        {msg.radar && (
          <button
            title={t('radarFlagged')}
            onClick={() => set({ panelOpen: true, panelTab: 'radar' })}
            className="mr-1 inline-flex translate-y-[2px] text-warn hover:brightness-125"
          >
            <ShieldAlert size={14} />
          </button>
        )}
        {stv.badge && <img className="badge" src={stv.badge.url} alt="" title={stv.badge.title} draggable={false} />}
        <button className="font-semibold hover:underline" style={stv.paint ? { color: nameColor, ...paintStyle(stv.paint) } : { color: nameColor }} onClick={onName}>
          {msg.displayName}
          {msg.displayName && msg.displayName.toLowerCase() !== login && <span className="font-normal opacity-70"> ({login})</span>}
        </button>
        {msg.kind === 'action' ? ' ' : <span className="text-faint">: </span>}
        <span className="text-ink/90" style={msg.kind === 'action' ? { color: nameColor } : undefined}>
          <Tokens msg={msg} emoteVersion={emoteVersion} />
        </span>
        {msg.bits ? <span className="ml-1.5 text-[11.5px] font-medium text-muted">{t('bits', { n: msg.bits })}</span> : null}
        {msg.deleted && <span className="ml-2 text-[11px] text-faint">({msg.timeoutInfo})</span>}
      </div>
      {!msg.deleted && <ImagePreviews text={msg.text} />}
      {!msg.historical && !msg.deleted && (
        <div className="absolute right-2 top-0 hidden items-center rounded-md border border-line bg-ground shadow-sm group-hover:flex">
          <button title={t('reply')} className="p-1.5 text-faint hover:text-ink" onClick={reply}>
            <Reply size={13} />
          </button>
          <button title={t('userCard')} className="p-1.5 text-faint hover:text-ink" onClick={onName}>
            <UserRound size={13} />
          </button>
          {canMod && !msg.self && (
            <button title={t('timeout10')} className="p-1.5 text-faint hover:text-ink" onClick={() => void timeoutUser(msg.channel, login, 600)}>
              <Clock size={13} />
            </button>
          )}
        </div>
      )}
    </div>
  )

  if (msg.kind === 'usernotice' && msg.noticeType === 'raid' && msg.login) {
    return <RaidBanner msg={msg} />
  }
  if (msg.kind === 'usernotice') {
    return (
      <div className={cn('my-1 border-y border-line/70 bg-ink/[0.03] py-1.5', msg.historical && 'opacity-50')}>
        <div className="px-4 text-[12.5px] font-medium text-ink">
          <span className="selectable">{msg.noticeType === 'announcement' ? t('announcement') : msg.systemText}</span>
        </div>
        {msg.text && body}
      </div>
    )
  }

  return (
    <CM.Root>
      <CM.Trigger asChild>{body}</CM.Trigger>
      <CM.Portal>
        <CM.Content className="menu">
          <CM.Item className="menu-item" onSelect={reply}>
            <Reply size={14} /> {t('reply')}
          </CM.Item>
          <CM.Item className="menu-item" onSelect={() => void navigator.clipboard.writeText(msg.text)}>
            <Copy size={14} /> {t('copyText')}
          </CM.Item>
          <CM.Item className="menu-item" onSelect={() => openUserCard(login, msg.channel)}>
            <UserRound size={14} /> {t('openUserCard')}
          </CM.Item>
          <CM.Item className="menu-item" onSelect={() => s.toggleList('watchUsers', login)}>
            <Eye size={14} /> {watched ? t('unwatch') : t('watchJoin')}
          </CM.Item>
          {canMod && !msg.self && (
            <>
              <CM.Separator className="menu-sep" />
              <CM.Item className="menu-item" onSelect={() => void deleteMessage(msg.channel, msg.id)}>
                <Trash2 size={14} /> {t('deleteMsg')}
              </CM.Item>
              <CM.Item className="menu-item" onSelect={() => void timeoutUser(msg.channel, login, 600)}>
                <Clock size={14} /> {t('timeout10')}
              </CM.Item>
              <CM.Item className="menu-item danger" onSelect={() => void banUser(msg.channel, login)}>
                <Ban size={14} /> {t('ban')}
              </CM.Item>
            </>
          )}
        </CM.Content>
      </CM.Portal>
    </CM.Root>
  )
})
