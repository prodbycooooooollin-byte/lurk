import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, Hash, LogIn, RefreshCw } from 'lucide-react'
import { useLive, refreshLive, openLive, type LiveStream } from '@/lib/live'
import { useAuth } from '@/store/auth'
import { useUi } from '@/store/ui'
import { useSettings } from '@/store/settings'
import { useT } from '@/lib/i18n'
import { accentVars, useAccent } from '@/lib/accent'
import { cn, durationSince, formatNumber } from '@/lib/util'
import { LurkLogo } from './LurkLogo'
import { Avatar, IconButton, Tip } from './ui'
import { addAndJoin } from './CommandPalette'

/** Startseite: wer von deinen Follows gerade live ist – ein Klick öffnet den Chat */
export function Home() {
  const t = useT()
  const live = useLive()
  const login = useAuth((a) => a.login)
  const hasChannels = useUi((u) => u.channels.length > 0)
  const [v, setV] = useState('')
  const valid = /^[a-z0-9_]{2,25}$/i.test(v.trim().replace(/^#/, ''))
  useEffect(() => {
    // beim Öffnen frisch laden, wenn die letzte Abfrage älter ist
    if (!live.loading) void refreshLive()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const streams = live.streams ?? []
  // Ganz neu: noch kein Kanal und niemand live -> große, ruhige Begrüßung statt leerem Raster
  if (!hasChannels && live.streams !== null && !streams.length) return <EmptyHome signedIn={!!login} />
  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-[1100px] px-8 pb-12 pt-10">
        <div className="flex items-end gap-4">
          <div className="text-ink">
            <LurkLogo size={40} live peek />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-[24px] font-semibold leading-tight tracking-[-0.025em]">{live.followed ? t('homeTitleFollowed') : t('homeTitle')}</h1>
            <p className="mt-1 text-[13px] text-faint">
              {live.streams === null ? t('homeLoading') : streams.length ? t('homeLiveCount', { n: streams.length }) : t('homeNoneLive')}
            </p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (valid) {
                addAndJoin(v)
                setV('')
              }
            }}
            className="flex h-9 w-[260px] items-center gap-2 rounded-lg border border-line bg-raised/30 px-3 transition-[border-color,box-shadow] focus-within:border-ink/30 focus-within:shadow-[0_0_0_3px_rgb(var(--ink)/0.06)]"
          >
            <Hash size={14} className="text-faint" />
            <input value={v} onChange={(e) => setV(e.target.value)} placeholder={t('channelName')} className="w-full bg-transparent text-[13px] placeholder:text-faint focus-visible:outline-none" />
          </form>
          <Tip label={t('reload')}>
            <IconButton onClick={() => void refreshLive()} className={cn(live.loading && 'animate-spin')}>
              <RefreshCw size={14} strokeWidth={1.75} />
            </IconButton>
          </Tip>
        </div>

        {!login && (
          <button
            onClick={() => useUi.getState().set({ settingsOpen: true, settingsTab: 'account' })}
            className="mt-6 flex w-full items-center gap-3 rounded-[10px] border border-line px-4 py-3 text-left text-[12.5px] text-muted transition-colors hover:bg-raised/50"
          >
            <LogIn size={15} className="shrink-0 text-ink" />
            <span className="flex-1">{hasChannels ? t('homeSignInHint') : t('homeSignInHintEmpty')}</span>
            <span className="font-medium text-ink">{t('accountSignIn')}</span>
          </button>
        )}

        {live.streams === null ? (
          <div className="mt-8 grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-4">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="aspect-[16/12] animate-pulse rounded-[12px] bg-raised/60" />
            ))}
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-4">
            {streams.map((s, i) => (
              <Tile key={s.login} s={s} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/** Erste Seite ohne Kanäle: großes Eingabefeld in der Mitte, darunter, was Lurk kann */
function EmptyHome({ signedIn }: { signedIn: boolean }) {
  const t = useT()
  const [v, setV] = useState('')
  const name = v.trim().replace(/^#/, '').replace(/^https?:\/\/(www\.)?twitch\.tv\//, '').split(/[/?#]/)[0]
  const valid = /^[a-z0-9_]{2,25}$/i.test(name)
  return (
    <div className="flex min-w-0 flex-1 items-center justify-center overflow-y-auto px-8 py-12">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }} className="w-full max-w-[520px] text-center">
        <div className="mx-auto mb-7 flex justify-center text-ink">
          <LurkLogo size={64} live peek />
        </div>
        <h1 className="text-[30px] font-semibold leading-[1.12] tracking-[-0.03em] [text-wrap:balance]">{t('welcomeTitle')}</h1>
        <p className="mx-auto mt-3 max-w-[420px] text-[14px] leading-relaxed text-muted">{t('welcomeText')}</p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (valid) addAndJoin(name)
          }}
          className="group mx-auto mt-8 flex h-12 items-center gap-2 rounded-xl border border-line bg-raised/40 pl-4 pr-1.5 text-left transition-[border-color,box-shadow,background-color] focus-within:border-ink/30 focus-within:bg-raised/60 focus-within:shadow-[0_0_0_4px_rgb(var(--ink)/0.06)]"
        >
          <Hash size={16} className="shrink-0 text-faint transition-colors group-focus-within:text-muted" />
          <input
            autoFocus
            value={v}
            onChange={(e) => setV(e.target.value)}
            placeholder={t('channelName')}
            spellCheck={false}
            className="h-full w-full bg-transparent text-[15px] text-ink placeholder:text-faint focus-visible:outline-none"
          />
          <button
            disabled={!valid}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-ink px-3.5 text-[13px] font-medium text-ground transition hover:bg-ink/85 disabled:bg-line disabled:text-faint"
          >
            {t('join')}
            <ArrowRight size={14} />
          </button>
        </form>
        <p className="mt-3 text-[12px] text-faint">{t('emptyHint')}</p>
        {!signedIn && (
          <button onClick={() => useUi.getState().set({ settingsOpen: true, settingsTab: 'account' })} className="mt-1 text-[12px] text-muted underline decoration-line underline-offset-4 hover:text-ink hover:decoration-ink">
            {t('emptySignIn')}
          </button>
        )}
        <dl className="mt-12 grid gap-6 border-t border-line pt-7 text-left sm:grid-cols-3">
          {(
            [
              ['feat1T', 'feat1D'],
              ['feat2T', 'feat2D'],
              ['feat3T', 'feat3D']
            ] as const
          ).map(([a, b]) => (
            <div key={a}>
              <dt className="text-[13px] font-medium text-ink">{t(a)}</dt>
              <dd className="m-0 mt-1 text-[12.5px] leading-snug text-faint">{t(b)}</dd>
            </div>
          ))}
        </dl>
      </motion.div>
    </div>
  )
}

function Tile({ s, index }: { s: LiveStream; index: number }) {
  const t = useT()
  const dark = useSettings((st) => st.theme) === 'dark'
  const accent = useAccent(s.avatar)
  // Vorschaubild mit Zeitstempel, damit nicht ein altes aus dem Cache kommt (alle 5 Min. neu)
  const bust = Math.floor(Date.now() / 300_000)
  const [loaded, setLoaded] = useState(false)
  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index, 12) * 0.03, ease: [0.2, 0.8, 0.2, 1] }}
      onClick={(e) => (e.ctrlKey || e.metaKey ? openLiveSplit(s.login) : openLive(s.login))}
      style={accentVars(accent, dark)}
      className="group flex flex-col overflow-hidden rounded-[12px] border border-line bg-raised/30 text-left transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-[hsl(var(--ch)/0.35)]"
    >
      <div className="relative aspect-video w-full overflow-hidden bg-raised">
        {s.thumb && (
          <img
            src={`${s.thumb}?t=${bust}`}
            alt=""
            draggable={false}
            onLoad={() => setLoaded(true)}
            className={cn('h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]', loaded ? 'opacity-100' : 'opacity-0')}
          />
        )}
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent" />
        <span className="absolute left-2 top-2 flex items-center gap-1 rounded-[5px] bg-live px-1.5 py-[1px] text-[10.5px] font-bold uppercase tracking-[0.04em] text-white">{t('live')}</span>
        <span className="absolute bottom-2 left-2 text-[11.5px] font-medium tabular-nums text-white/90">
          {formatNumber(s.viewers)} {t('viewers')}
        </span>
        {s.startedAt && <span className="absolute bottom-2 right-2 text-[11px] tabular-nums text-white/70">{durationSince(s.startedAt)}</span>}
      </div>
      <div className="flex min-w-0 gap-2.5 p-3">
        <Avatar src={s.avatar} name={s.login} size={30} className="shrink-0 self-start" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-ink">{s.displayName}</div>
          <div className="truncate text-[12px] text-muted" title={s.title}>
            {s.title}
          </div>
          {s.game && <div className="truncate text-[11.5px] text-faint">{s.game}</div>}
        </div>
      </div>
    </motion.button>
  )
}

function openLiveSplit(login: string): void {
  openLive(login)
  useUi.getState().openSplit(login)
}
