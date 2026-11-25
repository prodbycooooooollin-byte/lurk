import { useEffect, useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Search, X } from 'lucide-react'
import { useUi } from '@/store/ui'
import { useChat } from '@/store/chat'
import { globalBadgeList, onEmotesChanged, type Badge } from '@/lib/emotes'
import { allSightings, isCollectible, isDexLoaded, shareOf, trackedPeople, useDexVersion } from '@/lib/badgedex'
import { useT } from '@/lib/i18n'
import { cn, formatNumber, relTime } from '@/lib/util'
import { openUserCard } from './MessageRow'
import { IconButton } from './ui'

type Filter = 'all' | 'seen' | 'unseen'
type Sort = 'least' | 'most' | 'recent' | 'name'

interface Entry {
  key: string
  set: string
  badge: Badge
  n: number
  f?: number
  l?: number
}

/** Katalog aller globalen Badges (ohne kanalgebundene wie Sub/Bits/Mod); lädt nach, sobald IVR antwortet */
function useCatalog(): [string, Badge][] {
  const [v, setV] = useState(0)
  useEffect(() => onEmotesChanged(() => setV((x) => x + 1)), [])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => globalBadgeList().filter(([k]) => isCollectible(k.split('/')[0])), [v])
}

const pct = (x: number): string => (x < 0.001 ? `< ${(0.1).toLocaleString()} %` : `${(x * 100).toLocaleString(undefined, { maximumFractionDigits: x < 0.1 ? 1 : 0 })} %`)

/**
 * Badge-Index: Nachschlagewerk aller globalen Twitch-Badges, ergänzt um das, was Lurk in deinen
 * Chats beobachtet hat – wie verbreitet ein Badge ist, wer es trägt, seit wann es auftaucht.
 */
export function BadgeDex() {
  const t = useT()
  const open = useUi((u) => u.dexOpen)
  const focus = useUi((u) => u.dexFocus)
  const set = useUi((u) => u.set)
  const dexV = useDexVersion()
  const catalog = useCatalog()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('most')
  const [sel, setSel] = useState<string | null>(null)

  useEffect(() => {
    if (open && focus) setSel(focus)
  }, [open, focus])

  const entries = useMemo<Entry[]>(() => {
    const seen = allSightings()
    return catalog.map(([key, badge]) => {
      const s = seen[key]
      return { key, set: key.split('/')[0], badge, n: s?.n ?? 0, f: s?.f, l: s?.l }
    })
    // dexV: neu berechnen, wenn neue Beobachtungen dazukommen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, dexV])

  const seenCount = entries.filter((e) => e.n > 0).length
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const list = entries.filter(
      (e) =>
        (filter === 'all' || (filter === 'seen' ? e.n > 0 : e.n === 0)) &&
        (!needle || e.badge.title.toLowerCase().includes(needle) || e.set.includes(needle) || e.badge.description?.toLowerCase().includes(needle))
    )
    return list.sort((a, b) => {
      if (sort === 'name') return a.badge.title.localeCompare(b.badge.title)
      if (!!a.n !== !!b.n) return a.n ? -1 : 1
      if (sort === 'recent') return (b.l ?? 0) - (a.l ?? 0)
      if (sort === 'least') return a.n - b.n || a.badge.title.localeCompare(b.badge.title)
      return b.n - a.n || a.badge.title.localeCompare(b.badge.title)
    })
  }, [entries, q, filter, sort])

  const selected = entries.find((e) => e.key === sel) ?? null
  const close = (): void => set({ dexOpen: false, dexFocus: null })

  return (
    <Dialog.Root open={open} onOpenChange={(o) => (o ? set({ dexOpen: true }) : close())}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay z-[60]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[61] flex h-[min(640px,88vh)] w-[min(880px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-window border border-line bg-ground shadow-2xl">
          <div className="flex shrink-0 items-start gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-[16px] font-semibold tracking-[-0.015em]">{t('badgeDex')}</Dialog.Title>
              <Dialog.Description className="mt-1 max-w-[600px] text-[12.5px] leading-snug text-faint">{t('dexIntro')}</Dialog.Description>
              <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-muted">
                <span>
                  <b className="font-semibold tabular-nums text-ink">{formatNumber(entries.length)}</b> {t('dexStatTotal')}
                </span>
                <span>
                  <b className="font-semibold tabular-nums text-ink">{formatNumber(seenCount)}</b> {t('dexStatSeen')}
                </span>
                <span>
                  <b className="font-semibold tabular-nums text-ink">{formatNumber(trackedPeople())}</b> {t('dexStatPeople')}
                </span>
              </div>
            </div>
            <IconButton onClick={close}>
              <X size={16} strokeWidth={1.75} />
            </IconButton>
          </div>

          <div className="flex min-h-0 flex-1">
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex shrink-0 flex-wrap items-center gap-2 px-4 py-2.5">
                <div className="flex h-7 min-w-[160px] flex-1 items-center gap-2 rounded-md border border-line px-2 focus-within:border-muted">
                  <Search size={13} className="text-faint" />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('dexSearch')} className="w-full bg-transparent text-[12.5px] placeholder:text-faint" />
                </div>
                <Pills value={filter} onChange={setFilter} items={[['all', t('dexAll')], ['seen', t('dexFound')], ['unseen', t('dexMissing')]]} />
                <Pills value={sort} onChange={setSort} items={[['most', t('dexSortMost')], ['least', t('dexSortLeast')], ['recent', t('dexSortRecent')], ['name', t('dexSortName')]]} />
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
                {!entries.length ? (
                  <div className="py-16 text-center text-[12.5px] text-faint">{t('dexLoading')}</div>
                ) : !shown.length ? (
                  <div className="py-16 text-center text-[12.5px] text-faint">{t('dexEmpty')}</div>
                ) : (
                  shown.map((e) => (
                    <button
                      key={e.key}
                      onClick={() => setSel(e.key)}
                      className={cn('flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors', sel === e.key ? 'bg-raised' : 'hover:bg-raised/50')}
                    >
                      <img src={e.badge.url4x} alt="" loading="lazy" draggable={false} className={cn('h-7 w-7 shrink-0', !e.n && 'opacity-50')} />
                      <span className="min-w-0 flex-1">
                        <span className={cn('block truncate text-[12.5px]', e.n ? 'text-ink' : 'text-muted')}>{e.badge.title}</span>
                        {e.badge.description && <span className="block truncate text-[11px] text-faint">{e.badge.description}</span>}
                      </span>
                      <span className="w-[88px] shrink-0 text-right text-[11.5px] tabular-nums text-muted">{e.n ? t('dexPeopleShort', { n: formatNumber(e.n) }) : <span className="text-faint">–</span>}</span>
                      <span className="hidden w-[52px] shrink-0 text-right text-[11px] tabular-nums text-faint sm:block">{e.n ? pct(shareOf(e.n)) : ''}</span>
                    </button>
                  ))
                )}
              </div>
            </div>

            <aside className="flex w-[280px] shrink-0 flex-col border-l border-line">
              {selected ? <Detail e={selected} onClose={close} /> : <div className="m-auto px-6 text-center text-[12.5px] text-faint">{isDexLoaded() ? t('dexPick') : t('dexLoading')}</div>}
            </aside>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function Detail({ e, onClose }: { e: Entry; onClose: () => void }) {
  const t = useT()
  const s = allSightings()[e.key]
  // Wer trägt das Badge gerade in einem offenen Chat?
  const wearing = useChat((st) => {
    const out: string[] = []
    const [set, version] = e.key.split('/')
    for (const [c, ch] of Object.entries(st.channels)) {
      for (const p of Object.values(ch.presence)) {
        if (p.badges?.some((b) => b.set === set && b.version === version)) out.push(`${c}|${p.login}|${p.displayName ?? p.login}`)
        if (out.length >= 30) break
      }
    }
    return out.join(',')
  })
  const people = wearing ? wearing.split(',').map((x) => x.split('|') as [string, string, string]) : []
  const date = (ms: number): string => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
  const show = (login: string, channel: string, ev: React.MouseEvent): void => {
    onClose()
    openUserCard(login, channel, ev)
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-5">
      <div className="flex items-center gap-3">
        <img src={e.badge.url4x} alt="" className="h-12 w-12 shrink-0" draggable={false} />
        <div className="min-w-0">
          <div className="text-[14px] font-semibold leading-snug tracking-[-0.01em]">{e.badge.title}</div>
          <div className="mt-0.5 truncate font-mono text-[10.5px] text-faint">{e.key}</div>
        </div>
      </div>
      {e.badge.description && <p className="mt-3 text-[12px] leading-relaxed text-muted">{e.badge.description}</p>}

      <dl className="mt-4 divide-y divide-line/70 rounded-[10px] border border-line text-[12px]">
        <Fact label={t('dexFactPeople')}>{s ? `${formatNumber(s.n)} · ${pct(shareOf(s.n))}` : '–'}</Fact>
        <Fact label={t('dexFactFirst')}>{s ? date(s.f) : '–'}</Fact>
        <Fact label={t('dexFactLast')}>{s ? relTime(s.l) : '–'}</Fact>
        {s && (
          <Fact label={t('dexFactFirstOn')}>
            <button className="text-ink hover:underline" onClick={(ev) => show(s.by, s.c, ev)}>
              @{s.by} <span className="text-faint">#{s.c}</span>
            </button>
          </Fact>
        )}
      </dl>
      {!s && <p className="mt-3 text-[12px] leading-relaxed text-faint">{t('dexNotYet')}</p>}

      {people.length > 0 && (
        <div className="mt-4">
          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.05em] text-faint">{t('dexWearingNow')}</div>
          <div className="flex flex-wrap gap-1">
            {people.map(([c, login, name]) => (
              <button key={c + login} onClick={(ev) => show(login, c, ev)} className="rounded-full bg-raised px-2 py-[2px] text-[11.5px] text-muted hover:text-ink">
                {name} <span className="text-faint">#{c}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <dt className="text-faint">{label}</dt>
      <dd className="m-0 min-w-0 truncate text-right font-medium text-ink">{children}</dd>
    </div>
  )
}

function Pills<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: [T, string][] }) {
  return (
    <div className="flex rounded-md border border-line p-0.5">
      {items.map(([v, l]) => (
        <button key={v} onClick={() => onChange(v)} className={cn('rounded-[4px] px-2 py-[3px] text-[11.5px] transition-colors', value === v ? 'bg-ink font-medium text-ground' : 'text-muted hover:text-ink')}>
          {l}
        </button>
      ))}
    </div>
  )
}
