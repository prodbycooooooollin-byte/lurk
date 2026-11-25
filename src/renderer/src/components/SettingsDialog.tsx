import { useEffect, useRef, useState, type ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import * as Slider from '@radix-ui/react-slider'
import { X, Trash2, Plus, Copy, ExternalLink, Loader2, Volume2 } from 'lucide-react'
import { useUi } from '@/store/ui'
import { useSettings, type Settings } from '@/store/settings'
import { useAuth } from '@/store/auth'
import { startDeviceFlow, pollDeviceToken, validateToken, type DeviceCode } from '@/lib/api'
import { applyAuth } from '@/lib/client'
import { useT, t as tt, LANGS, type TKey } from '@/lib/i18n'
import { Button, IconButton, Input, Switch } from './ui'
import { chime, cn } from '@/lib/util'
import { toast } from 'sonner'
import type { UpdateState } from '../../../preload/index.d'
import { LurkMark } from './TitleBar'

const TABS: { id: string; label: TKey }[] = [
  { id: 'look', label: 'sLook' },
  { id: 'chat', label: 'sChat' },
  { id: 'highlights', label: 'sHighlights' },
  { id: 'notify', label: 'sNotify' },
  { id: 'ignore', label: 'sIgnore' },
  { id: 'account', label: 'sAccount' },
  { id: 'about', label: 'sAbout' }
]

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-8 border-b border-line py-3.5 last:border-0">
      <div className="min-w-0">
        <div className="text-[13px] text-ink">{label}</div>
        {hint && <div className="mt-0.5 text-[12px] leading-snug text-faint">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Toggle({ k, label, hint }: { k: keyof Settings; label: TKey; hint?: TKey }) {
  const t = useT()
  const v = useSettings((s) => s[k]) as boolean
  const set = useSettings((s) => s.set)
  return (
    <Row label={t(label)} hint={hint ? t(hint) : undefined}>
      <Switch checked={v} onChange={(x) => set({ [k]: x } as Partial<Settings>)} />
    </Row>
  )
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-md border border-line p-0.5">
      {options.map(([v, l]) => (
        <button key={v} onClick={() => onChange(v)} className={cn('rounded-[4px] px-2.5 py-1 text-[12px] transition-colors', value === v ? 'bg-ink font-medium text-ground' : 'text-muted hover:text-ink')}>
          {l}
        </button>
      ))}
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="py-4">
      <div className="text-[13px] font-medium text-ink">{title}</div>
      {hint && <div className="mb-3 mt-0.5 text-[12px] leading-relaxed text-faint">{hint}</div>}
      {children}
    </div>
  )
}

function ListEditor({ items, onAdd, onRemove, placeholder, empty }: { items: string[]; onAdd: (v: string) => void; onRemove: (v: string) => void; placeholder: string; empty: string }) {
  const t = useT()
  const [v, setV] = useState('')
  return (
    <div className="space-y-3">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (v.trim()) onAdd(v.trim())
          setV('')
        }}
        className="flex gap-2"
      >
        <Input value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} />
        <Button type="submit" disabled={!v.trim()}>
          <Plus size={13} /> {t('add')}
        </Button>
      </form>
      <div className="flex flex-wrap gap-1.5">
        {items.length === 0 && <span className="text-[12px] text-faint">{empty}</span>}
        {items.map((x) => (
          <span key={x} className="flex items-center gap-1 rounded-md border border-line py-0.5 pl-2 pr-1 text-[12.5px]">
            {x}
            <button onClick={() => onRemove(x)} className="p-0.5 text-faint hover:text-ink">
              <X size={11} />
            </button>
          </span>
        ))}
      </div>
    </div>
  )
}

function SliderRow({ value, min, max, step, onChange, label }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; label: string }) {
  return (
    <Slider.Root className="relative flex h-5 w-40 items-center" min={min} max={max} step={step} value={[value]} onValueChange={([v]) => onChange(v)}>
      <Slider.Track className="relative h-[2px] flex-1 rounded-full bg-line">
        <Slider.Range className="absolute h-full rounded-full bg-ink" />
      </Slider.Track>
      <Slider.Thumb className="block h-3.5 w-3.5 rounded-full bg-ink" aria-label={label} />
    </Slider.Root>
  )
}

function LookTab() {
  const s = useSettings()
  const t = useT()
  return (
    <>
      <Row label={t('language')} hint={t('languageHint')}>
        <Segmented value={s.language} options={LANGS} onChange={(language) => s.set({ language })} />
      </Row>
      <Row label={t('theme')}>
        <Segmented value={s.theme} options={[['dark', t('dark')], ['light', t('light')]]} onChange={(theme) => s.set({ theme })} />
      </Row>
      <Row label={t('density')}>
        <Segmented value={s.density} options={[['compact', t('compact')], ['cozy', t('cozy')]]} onChange={(density) => s.set({ density })} />
      </Row>
      <Row label={t('fontSize')} hint={`${s.fontSize} px`}>
        <SliderRow value={s.fontSize} min={11} max={20} step={1} onChange={(v) => s.set({ fontSize: v })} label={t('fontSize')} />
      </Row>
      <Toggle k="alternateRows" label="alternateRows" />
      <Toggle k="showBadges" label="showBadges" hint="showBadgesHint" />
      <Toggle k="timestamps" label="timestamps" />
      <Toggle k="timestampSeconds" label="timestampSeconds" />
    </>
  )
}

function ChatTab() {
  const s = useSettings()
  const t = useT()
  return (
    <>
      <Toggle k="thirdPartyEmotes" label="thirdParty" hint="thirdPartyHint" />
      <Toggle k="showHistory" label="history" hint="historyHint" />
      <Toggle k="pauseOnHover" label="pauseHover" hint="pauseHoverHint" />
      <Toggle k="inlineJoins" label="inlineJoins" hint="inlineJoinsHint" />
      <Row label={t('deletedMsgs')}>
        <Segmented value={s.deletedMode} options={[['strike', t('strike')], ['hide', t('hide')]]} onChange={(deletedMode) => s.set({ deletedMode })} />
      </Row>
      <Row label={t('keepMsgs')} hint={t('keepMsgsHint')}>
        <Segmented value={String(s.maxMessages) as '500' | '1500' | '5000'} options={[['500', '500'], ['1500', '1,500'], ['5000', '5,000']]} onChange={(v) => s.set({ maxMessages: Number(v) })} />
      </Row>
    </>
  )
}

function HighlightsTab() {
  const s = useSettings()
  const t = useT()
  const [pattern, setPattern] = useState('')
  const [color, setColor] = useState('#E5C07B')
  return (
    <>
      <Toggle k="highlightMentions" label="hlMentions" hint="hlMentionsHint" />
      <Toggle k="highlightFirst" label="hlFirst" hint="hlFirstHint" />
      <Section title={t('keywords')} hint={t('keywordsHint')}>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!pattern.trim()) return
            s.set({ keywords: [...s.keywords, { id: crypto.randomUUID(), pattern: pattern.trim(), color, sound: true }] })
            setPattern('')
          }}
          className="flex gap-2"
        >
          <Input value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder={t('keywordExample')} />
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-8 w-9 shrink-0 cursor-pointer rounded-md border border-line bg-transparent p-1" />
          <Button type="submit" disabled={!pattern.trim()}>
            <Plus size={13} />
          </Button>
        </form>
        <div className="mt-3">
          {s.keywords.map((k) => (
            <div key={k.id} className="flex items-center gap-3 border-b border-line py-2 last:border-0">
              <span className="h-2 w-2 rounded-full" style={{ background: k.color }} />
              <span className="flex-1 text-[13px]">{k.pattern}</span>
              <IconButton active={k.sound} onClick={() => s.set({ keywords: s.keywords.map((x) => (x.id === k.id ? { ...x, sound: !x.sound } : x)) })} title={t('soundOnMatch')}>
                <Volume2 size={14} strokeWidth={1.75} />
              </IconButton>
              <IconButton onClick={() => s.set({ keywords: s.keywords.filter((x) => x.id !== k.id) })}>
                <Trash2 size={14} strokeWidth={1.75} />
              </IconButton>
            </div>
          ))}
        </div>
      </Section>
    </>
  )
}

function NotifyTab() {
  const s = useSettings()
  const t = useT()
  return (
    <>
      <Section title={t('watchlist')} hint={t('watchlistHint')}>
        <ListEditor items={s.watchUsers} onAdd={(v) => s.toggleList('watchUsers', v)} onRemove={(v) => s.toggleList('watchUsers', v)} placeholder={t('twitchName')} empty={t('nobodyListed')} />
      </Section>
      <Toggle k="joinSound" label="joinSound" />
      <Toggle k="mentionSound" label="mentionSound" />
      <Toggle k="desktopNotify" label="desktopNotify" hint="desktopNotifyHint" />
      <Row label={t('volume')}>
        <div className="flex items-center gap-3">
          <SliderRow value={s.soundVolume} min={0} max={1} step={0.05} onChange={(v) => s.set({ soundVolume: v })} label={t('volume')} />
          <Button size="sm" onClick={() => chime('mention', s.soundVolume)}>
            {t('test')}
          </Button>
        </div>
      </Row>
    </>
  )
}

function IgnoreTab() {
  const s = useSettings()
  const t = useT()
  return (
    <>
      <Section title={t('ignoredUsers')} hint={t('ignoredUsersHint')}>
        <ListEditor items={s.ignoredUsers} onAdd={(v) => s.toggleList('ignoredUsers', v)} onRemove={(v) => s.toggleList('ignoredUsers', v)} placeholder={t('ignoredUsersExample')} empty={t('nobodyIgnored')} />
      </Section>
      <Section title={t('ignoredWords')} hint={t('ignoredWordsHint')}>
        <ListEditor items={s.ignoredPhrases} onAdd={(v) => s.toggleList('ignoredPhrases', v)} onRemove={(v) => s.toggleList('ignoredPhrases', v)} placeholder={t('wordOrPhrase')} empty={t('noWords')} />
      </Section>
    </>
  )
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="w-4 shrink-0 text-right tabular-nums text-faint">{n}.</span>
      <span>{children}</span>
    </li>
  )
}

function AccountTab() {
  const t = useT()
  const a = useAuth()
  const [clientId, setClientId] = useState(a.clientId)
  const [code, setCode] = useState<DeviceCode | null>(null)
  const [busy, setBusy] = useState(false)
  const [manual, setManual] = useState('')
  const polling = useRef(false)

  useEffect(
    () => () => {
      polling.current = false
    },
    []
  )

  const start = async (): Promise<void> => {
    const id = clientId.trim()
    if (!id) return
    a.set({ clientId: id })
    setBusy(true)
    const dc = await startDeviceFlow(id)
    setBusy(false)
    if (!dc) {
      toast.error(tt('clientRejected'))
      return
    }
    setCode(dc)
    void window.bridge.open(dc.verification_uri)
    polling.current = true
    const until = Date.now() + dc.expires_in * 1000
    while (polling.current && Date.now() < until) {
      await new Promise((r) => setTimeout(r, Math.max(2, dc.interval) * 1000))
      if (!polling.current) return
      const r = await pollDeviceToken(id, dc.device_code)
      if (r === 'pending') continue
      polling.current = false
      setCode(null)
      if (r === 'failed') {
        toast.error(tt('loginAborted'))
        return
      }
      a.set({ token: r.access_token, refresh: r.refresh_token ?? '' })
      await applyAuth()
      toast.success(tt('signedInToast', { n: useAuth.getState().login }))
      return
    }
  }

  const useManual = async (): Promise<void> => {
    const tok = manual.trim().replace(/^oauth:/, '')
    const v = await validateToken(tok)
    if (!v) {
      toast.error(tt('tokenInvalid'))
      return
    }
    a.set({ token: tok, refresh: '', clientId: v.client_id })
    setManual('')
    await applyAuth()
    toast.success(tt('signedInToast', { n: v.login }))
  }

  if (a.token && a.login) {
    return (
      <div className="py-4">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 text-[14px] font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-join" />
              {t('signedInAs', { n: a.login })}
            </div>
            <div className="mt-1 text-[12.5px] text-faint">{t('signedInDesc')}</div>
          </div>
          <Button
            variant="danger"
            onClick={async () => {
              a.logout()
              await applyAuth()
            }}
          >
            {t('signOut')}
          </Button>
        </div>
        <div className="mt-6 text-[11.5px] leading-relaxed text-faint">{t('scopes', { s: a.scopes.join(', ') || '–' })}</div>
      </div>
    )
  }

  return (
    <div className="space-y-5 py-4">
      <p className="text-[13px] leading-relaxed text-muted">{t('accIntro')}</p>
      <ol className="space-y-2 text-[13px] leading-relaxed text-ink">
        <Step n={1}>
          {t('step1a')}{' '}
          <button className="underline decoration-faint underline-offset-2 hover:decoration-ink" onClick={() => void window.bridge.open('https://dev.twitch.tv/console/apps/create')}>
            dev.twitch.tv/console/apps
          </button>{' '}
          {t('step1b')} <code className="rounded bg-raised px-1 text-[12px]">http://localhost</code>
          {t('step1c')}
        </Step>
        <Step n={2}>
          {t('step2a')} <b className="font-semibold">{t('step2public')}</b> {t('step2b')}
        </Step>
        <Step n={3}>{t('step3')}</Step>
      </ol>
      <div className="flex gap-2">
        <Input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder={t('clientId')} />
        <Button variant="primary" onClick={() => void start()} disabled={!clientId.trim() || busy || !!code}>
          {busy && <Loader2 size={13} className="animate-spin" />} {t('signIn')}
        </Button>
      </div>
      {code && (
        <div className="rounded-lg border border-line p-4">
          <div className="text-[12px] text-faint">{t('confirmCode')}</div>
          <div className="mt-1.5 flex items-center gap-3">
            <span className="select-text text-[24px] font-semibold tabular-nums tracking-[0.18em]">{code.user_code}</span>
            <Button size="sm" onClick={() => void navigator.clipboard.writeText(code.user_code)}>
              <Copy size={12} /> {t('copy')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void window.bridge.open(code.verification_uri)}>
              <ExternalLink size={12} /> {t('openPage')}
            </Button>
          </div>
          <div className="mt-3 flex items-center gap-2 text-[12px] text-faint">
            <Loader2 size={12} className="animate-spin" /> {t('waiting')}
            <button
              className="ml-auto hover:text-ink"
              onClick={() => {
                polling.current = false
                setCode(null)
              }}
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      )}
      <details className="border-t border-line pt-4 text-[13px]">
        <summary className="cursor-pointer text-faint hover:text-muted">{t('pasteToken')}</summary>
        <div className="mt-3 flex gap-2">
          <Input type="password" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="oauth:…" />
          <Button onClick={() => void useManual()} disabled={!manual.trim()}>
            {t('apply')}
          </Button>
        </div>
      </details>
    </div>
  )
}

function AboutTab() {
  const t = useT()
  const [version, setVersion] = useState('')
  const [upd, setUpd] = useState<UpdateState>({ state: 'idle' })
  useEffect(() => {
    void window.bridge.version().then(setVersion)
    return window.bridge.onUpdate(setUpd)
  }, [])
  const label: Record<UpdateState['state'], string> = {
    idle: t('updIdle'),
    checking: t('updChecking'),
    none: t('updNone'),
    available: t('updAvailable', { v: upd.version ?? '' }),
    downloading: t('updDownloading', { p: upd.percent ?? 0 }),
    ready: t('updReady', { v: upd.version ?? '' }),
    error: upd.message === 'dev' ? t('updDevOnly') : upd.message ?? t('updError')
  }
  return (
    <div className="space-y-6 py-4">
      <div className="flex items-center gap-3">
        <LurkMark size={28} />
        <div>
          <div className="text-[16px] font-semibold">Lurk {version}</div>
          <div className="text-[12.5px] text-faint">{t('aboutDesc')}</div>
        </div>
      </div>
      <div className="flex items-center gap-4 border-y border-line py-4">
        <div className="flex-1 text-[13px]">{label[upd.state]}</div>
        {upd.state === 'ready' ? (
          <Button variant="primary" onClick={() => window.bridge.installUpdate()}>
            {t('restartInstall')}
          </Button>
        ) : (
          <Button onClick={() => void window.bridge.checkUpdate().then((r) => r.state === 'error' && setUpd(r))} disabled={upd.state === 'checking' || upd.state === 'downloading'}>
            {t('checkNow')}
          </Button>
        )}
      </div>
      <div className="space-y-3 text-[12px] leading-relaxed text-faint">
        <p>
          <span className="text-muted">{t('shortcutsTitle')}: </span>
          {t('shortcuts')}
        </p>
        <p>{t('credits')}</p>
      </div>
    </div>
  )
}

export function SettingsDialog() {
  const t = useT()
  const open = useUi((u) => u.settingsOpen)
  const tab = useUi((u) => u.settingsTab)
  const set = useUi((u) => u.set)
  const current = TABS.find((x) => x.id === tab) ?? TABS[0]
  return (
    <Dialog.Root open={open} onOpenChange={(o) => set({ settingsOpen: o })}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay z-[60]" />
        <Dialog.Content onOpenAutoFocus={(e) => e.preventDefault()} className="fixed left-1/2 top-1/2 z-[61] flex h-[min(620px,88vh)] w-[min(820px,94vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-window border border-line bg-ground shadow-2xl">
          <nav className="flex w-[196px] shrink-0 flex-col gap-px border-r border-line p-3">
            <Dialog.Title className="px-2 pb-4 pt-1 text-[14px] font-semibold">{t('settingsTitle')}</Dialog.Title>
            {TABS.map((x) => (
              <button
                key={x.id}
                onClick={() => set({ settingsTab: x.id })}
                className={cn('rounded-md px-2 py-1.5 text-left text-[13px] transition-colors', current.id === x.id ? 'bg-raised font-medium text-ink' : 'text-muted hover:text-ink')}
              >
                {t(x.label)}
              </button>
            ))}
          </nav>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-6">
              <h2 className="text-[14px] font-semibold">{t(current.label)}</h2>
              <Dialog.Close asChild>
                <IconButton>
                  <X size={15} strokeWidth={1.75} />
                </IconButton>
              </Dialog.Close>
            </div>
            <Dialog.Description className="sr-only">{t('settingsTitle')}</Dialog.Description>
            <div className="min-h-0 flex-1 overflow-y-auto px-6">
              {current.id === 'look' && <LookTab />}
              {current.id === 'chat' && <ChatTab />}
              {current.id === 'highlights' && <HighlightsTab />}
              {current.id === 'notify' && <NotifyTab />}
              {current.id === 'ignore' && <IgnoreTab />}
              {current.id === 'account' && <AccountTab />}
              {current.id === 'about' && <AboutTab />}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
