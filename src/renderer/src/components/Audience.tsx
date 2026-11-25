import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { useChat } from '@/store/chat'
import { useUi } from '@/store/ui'
import { useT } from '@/lib/i18n'
import { cn, formatNumber, useThrottled } from '@/lib/util'
import { getMeta, requestMeta, useMetaVersion } from '@/lib/avatars'
import { allHistories } from '@/lib/history'
import { loyaltyTier, requestLoyalty, useLoyaltyVersion } from '@/lib/loyalty'
import { isBot } from '@/lib/bots'
import { openUserCard } from './MessageRow'
import { UserAvatar } from './UserAvatar'
import type { PresenceUser } from '@/lib/types'

/** höchstens so viele Konten nach dem Alter fragen (IVR, 40 pro Anfrage) */
const AGE_SAMPLE = 800
/** höchstens so viele Leute nach Treue fragen (2 Anfragen pro Person) */
const LOYALTY_SAMPLE = 300

type Group = { id: string; label: string; logins: string[]; tone: string }

const pctOf = (n: number, total: number): string => (total ? `${Math.round((n / total) * 100)} %` : '–')

/**
 * Publikum: wer ist gerade im Chat – lurkt oder schreibt, Stammgast oder neu, wie alt die
 * Accounts sind und aus welchen anderen Communities die Leute kommen. Grundlage sind die
 * Anwesenheitsliste und Lurks Verlauf aus früheren Sitzungen.
 */
export function Audience({ channel }: { channel: string }) {
  const t = useT()
  const version = useThrottled(useChat((s) => s.channels[channel]?.presenceVersion ?? 0), 2000)
  const namesReceived = useChat((s) => !!s.channels[channel]?.namesReceived)
  const helix = useChat((s) => !!s.channels[channel]?.helixPresence)
  const [open, setOpen] = useState<string | null>(null)
  const metaV = useThrottled(useMetaVersion(), 1500)
  const loyaltyV = useThrottled(useLoyaltyVersion(), 1500)

  const present = useMemo(() => {
    const ch = useChat.getState().channels[channel]
    return ch ? Object.values(ch.presence).filter((p) => p.present) : []
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, version])

  const bots = present.filter((p) => isBot(p.login))
  const people = present.filter((p) => !isBot(p.login))
  const total = people.length

  // Kontoalter nachladen (Stichprobe: wer zuletzt kam zuerst)
  const sample = useMemo(() => [...people].sort((a, b) => (b.joinedAt ?? 0) - (a.joinedAt ?? 0)).slice(0, AGE_SAMPLE), [people])
  useEffect(() => {
    for (const p of sample) requestMeta(p.login)
    // Treue: wer geschrieben hat zuerst (für die gibt es Logs), dann der Rest
    const byActivity = [...sample].sort((a, b) => b.msgCount - a.msgCount).slice(0, LOYALTY_SAMPLE)
    for (const p of byActivity) requestLoyalty(channel, p.login)
  }, [sample, channel])

  const groups = useMemo(() => {
    const writing: string[] = []
    const lurking: string[] = []
    const first: string[] = []
    const returning: string[] = []
    const regular: string[] = []
    let loyaltyKnown = 0
    const age = { d30: [] as string[], y1: [] as string[], y5: [] as string[], old: [] as string[] }
    let ageKnown = 0
    const now = Date.now()
    for (const p of people) {
      ;(p.msgCount > 0 ? writing : lurking).push(p.login)
      const tier = loyaltyTier(channel, p.login)
      if (tier) {
        loyaltyKnown++
        ;(tier === 'regular' ? regular : tier === 'returning' ? returning : first).push(p.login)
      }
      const c = getMeta(p.login)?.createdAt
      if (c) {
        ageKnown++
        const days = (now - new Date(c).getTime()) / 86400000
        ;(days < 30 ? age.d30 : days < 365 ? age.y1 : days < 5 * 365 ? age.y5 : age.old).push(p.login)
      }
    }
    return {
      activity: [
        { id: 'lurk', label: t('audLurking'), logins: lurking, tone: 'bg-ink/25' },
        { id: 'write', label: t('audWriting'), logins: writing, tone: 'bg-ink' }
      ] as Group[],
      loyalty: [
        { id: 'regular', label: t('audRegular'), logins: regular, tone: 'bg-join' },
        { id: 'returning', label: t('audReturning'), logins: returning, tone: 'bg-join/45' },
        { id: 'first', label: t('audFirst'), logins: first, tone: 'bg-ink/20' }
      ] as Group[],
      age: [
        { id: 'd30', label: t('audAge30'), logins: age.d30, tone: 'bg-warn' },
        { id: 'y1', label: t('audAgeY1'), logins: age.y1, tone: 'bg-warn/45' },
        { id: 'y5', label: t('audAgeY5'), logins: age.y5, tone: 'bg-ink/35' },
        { id: 'old', label: t('audAgeOld'), logins: age.old, tone: 'bg-ink/70' }
      ] as Group[],
      ageKnown,
      loyaltyKnown
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people, channel, t, metaV, loyaltyV])

  // Lurker unter den Stammgästen – die interessanteste Gruppe für Streamer
  const silentRegulars = groups.loyalty[0].logins.filter((l) => groups.activity[0].logins.includes(l))
  const medianMinutes = median(people.filter((p) => p.joinedAt).map((p) => (Date.now() - p.joinedAt!) / 60000))
  const atConnect = people.filter((p) => p.joinedAt === null).length
  // Twitch schickt in Chats ab ~1.000 Leuten keine JOINs – dann kennt Lurk nur, wer schreibt.
  // Erkennbar daran, dass niemand ohne Nachricht in der Liste steht (als Mod lädt Lurk die volle Liste).
  const limited = !helix && !people.some((p) => p.msgCount === 0)

  if (!namesReceived && !present.length) {
    return (
      <div className="flex items-center justify-center gap-2 p-6 text-[12.5px] text-faint">
        <Loader2 size={13} className="animate-spin" /> {t('audWaiting')}
      </div>
    )
  }
  if (!total) return <div className="p-6 text-center text-[12.5px] leading-relaxed text-faint">{limited ? t('audLimited') : t('audEmpty')}</div>

  const toggle = (id: string): void => setOpen((o) => (o === id ? null : id))
  const all = [...groups.activity, ...groups.loyalty, ...groups.age]
  const selected = all.find((g) => g.id === open)

  return (
    <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-4">
      <div>
        <div className="text-[22px] font-semibold leading-none tabular-nums tracking-[-0.02em]">{formatNumber(total)}</div>
        <div className="mt-1 text-[12px] text-faint">
          {limited ? t('audPeopleLimited') : t('audPeople')}
          {bots.length > 0 && ` · ${t('audBots', { n: bots.length })}`}
        </div>
        {limited ? (
          <p className="mt-2.5 rounded-lg border border-line bg-raised/40 px-2.5 py-2 text-[12px] leading-relaxed text-muted">{t('audLimited')}</p>
        ) : (
        <p className="mt-2.5 text-[12.5px] leading-relaxed text-muted">
          {t('audSummary', {
            l: pctOf(groups.activity[0].logins.length, total),
            r: formatNumber(silentRegulars.length),
            m: medianMinutes ? fmtMinutes(medianMinutes) : '–'
          })}
        </p>
        )}
      </div>

      {!limited && (
        <Section title={t('audActivity')}>
          <Bar groups={groups.activity} total={total} open={open} onToggle={toggle} />
        </Section>
      )}

      <Section title={t('audLoyalty')} hint={t('audAgeHint', { n: formatNumber(groups.loyaltyKnown), t: formatNumber(total) })}>
        <Bar groups={groups.loyalty} total={groups.loyaltyKnown} open={open} onToggle={toggle} />
        <div className="mt-1.5 text-[11px] leading-snug text-faint">{t('audLoyaltyHint')}</div>
        {!limited && silentRegulars.length > 0 && (
          <button onClick={() => toggle('silent')} className={cn('mt-2 text-[11.5px] hover:text-ink', open === 'silent' ? 'text-ink' : 'text-faint')}>
            {t('audSilentRegulars', { n: silentRegulars.length })}
          </button>
        )}
      </Section>

      <Section title={t('audAge')} hint={t('audAgeHint', { n: formatNumber(groups.ageKnown), t: formatNumber(total) })}>
        <Bar groups={groups.age} total={groups.ageKnown} open={open} onToggle={toggle} />
      </Section>

      {(selected || open === 'silent') && (
        <PeopleList
          channel={channel}
          title={selected?.label ?? t('audSilentRegularsTitle')}
          logins={selected?.logins ?? silentRegulars}
          presence={present}
          onClose={() => setOpen(null)}
        />
      )}

      <Overlap channel={channel} people={people} />

      {!limited && (
      <div className="text-[11px] leading-relaxed text-faint">
        {t('audTime', { m: medianMinutes ? fmtMinutes(medianMinutes) : '–', n: formatNumber(atConnect) })}
      </div>
      )}
    </div>
  )
}

/** Aus welchen anderen Communities kommen die Leute? (Lurks Verlauf aller je besuchten Kanäle) */
function Overlap({ channel, people }: { channel: string; people: PresenceUser[] }) {
  const t = useT()
  const openChannels = useChat((s) => s.channels)
  const [rows, setRows] = useState<{ c: string; n: number; now: number }[] | null>(null)
  const key = people.length
  useEffect(() => {
    let alive = true
    void allHistories().then((all) => {
      if (!alive) return
      const out: { c: string; n: number; now: number }[] = []
      for (const [c, h] of all) {
        if (c === channel) continue
        let n = 0
        let now = 0
        const live = openChannels[c]?.presence
        for (const p of people) {
          if (h[p.login]) n++
          if (live?.[p.login]?.present) now++
        }
        if (n) out.push({ c, n, now })
      }
      setRows(out.sort((a, b) => b.n - a.n).slice(0, 8))
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, key])
  if (!rows) return null
  return (
    <Section title={t('audOverlap')} hint={t('audOverlapHint')}>
      {!rows.length ? (
        <div className="text-[12px] text-faint">{t('audOverlapNone')}</div>
      ) : (
        rows.map((r) => (
          <button
            key={r.c}
            onClick={() => openChannels[r.c] && useUi.getState().showChannel(r.c)}
            className={cn('group flex w-full items-center gap-3 py-1 text-left text-[12.5px]', !openChannels[r.c] && 'cursor-default')}
          >
            <span className="w-24 truncate text-muted group-hover:text-ink">#{r.c}</span>
            <span className="h-[3px] flex-1 overflow-hidden rounded-full bg-line">
              <span className="block h-full rounded-full bg-ink/70" style={{ width: `${(r.n / rows[0].n) * 100}%` }} />
            </span>
            <span className="w-16 text-right tabular-nums text-faint">
              {pctOf(r.n, people.length)}
              {r.now > 0 && <span className="ml-1 text-join">· {r.now}</span>}
            </span>
          </button>
        ))
      )}
    </Section>
  )
}

function Bar({ groups, total, open, onToggle }: { groups: Group[]; total: number; open: string | null; onToggle: (id: string) => void }) {
  return (
    <>
      <div className="flex h-2 overflow-hidden rounded-full bg-line">
        {groups.map((g) => (total ? <div key={g.id} className={cn('h-full transition-[width] duration-500', g.tone)} style={{ width: `${(g.logins.length / total) * 100}%` }} /> : null))}
      </div>
      <div className="mt-2 space-y-0.5">
        {groups.map((g) => (
          <button
            key={g.id}
            onClick={() => g.logins.length && onToggle(g.id)}
            className={cn('flex w-full items-center gap-2 rounded px-1 py-[3px] text-left text-[12px] transition-colors', open === g.id ? 'bg-raised text-ink' : 'text-muted hover:bg-raised/50 hover:text-ink')}
          >
            <span className={cn('h-2 w-2 shrink-0 rounded-[2px]', g.tone)} />
            <span className="flex-1 truncate">{g.label}</span>
            <span className="tabular-nums text-faint">{formatNumber(g.logins.length)}</span>
            <span className="w-10 text-right tabular-nums text-faint">{pctOf(g.logins.length, total)}</span>
          </button>
        ))}
      </div>
    </>
  )
}

function PeopleList({ channel, title, logins, presence, onClose }: { channel: string; title: string; logins: string[]; presence: PresenceUser[]; onClose: () => void }) {
  const t = useT()
  const byLogin = useMemo(() => new Map(presence.map((p) => [p.login, p])), [presence])
  const shown = logins.slice(0, 60)
  return (
    <div className="rounded-[10px] border border-line p-2.5">
      <div className="mb-2 flex items-center justify-between text-[11.5px]">
        <span className="font-medium text-ink">{title}</span>
        <button onClick={onClose} className="text-faint hover:text-ink">
          {t('close')}
        </button>
      </div>
      <div className="flex flex-wrap gap-1">
        {shown.map((l) => {
          const p = byLogin.get(l)
          return (
            <button key={l} onClick={(e) => openUserCard(l, channel, e)} className="flex items-center gap-1.5 rounded-full bg-raised py-[2px] pl-[2px] pr-2 text-[11.5px] text-muted hover:text-ink">
              <UserAvatar login={l} name={p?.displayName} color={p?.color} size={16} />
              {p?.displayName ?? l}
            </button>
          )
        })}
      </div>
      {logins.length > shown.length && <div className="mt-1.5 text-[11px] text-faint">{t('audMore', { n: formatNumber(logins.length - shown.length) })}</div>}
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-medium text-ink">{title}</span>
        {hint && <span className="truncate text-[11px] text-faint">{hint}</span>}
      </div>
      {children}
    </section>
  )
}

function median(xs: number[]): number {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

const fmtMinutes = (m: number): string => (m < 1 ? '< 1 min' : m < 60 ? `${Math.round(m)} min` : `${(m / 60).toFixed(m < 600 ? 1 : 0)} h`)
