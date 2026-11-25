import { useEffect, useState } from 'react'
import * as RTooltip from '@radix-ui/react-tooltip'
import { Toaster } from 'sonner'
import { Hash } from 'lucide-react'
import { TitleBar } from './components/TitleBar'
import { LurkLogo } from './components/LurkLogo'
import { ChannelRail } from './components/ChannelRail'
import { ChatSplit } from './components/ChatSplit'
import { SidePanel } from './components/PresencePanel'
import { UserCard } from './components/UserCard'
import { EmotePreview } from './components/EmotePreview'
import { SettingsDialog } from './components/SettingsDialog'
import { CommandPalette, JoinDialog, addAndJoin } from './components/CommandPalette'
import { MentionsView } from './components/MentionsView'
import { useUi } from './store/ui'
import { useSettings } from './store/settings'
import { setWindowFocused, startClient } from './lib/client'
import { useT } from './lib/i18n'

function Welcome() {
  const t = useT()
  const [v, setV] = useState('')
  const valid = /^[a-z0-9_]{2,25}$/i.test(v.trim().replace(/^#/, ''))
  return (
    <div className="flex flex-1 items-center overflow-y-auto px-[8%] py-10">
      <div className="w-full max-w-[480px]">
        <div className="mb-8 text-ink">
          <LurkLogo size={56} live peek />
        </div>
        <h1 className="text-[30px] font-semibold leading-[1.1] tracking-[-0.025em] [text-wrap:balance]">{t('welcomeTitle')}</h1>
        <p className="mt-3 text-[14px] leading-relaxed text-muted">{t('welcomeText')}</p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (valid) addAndJoin(v)
          }}
          className="mt-7 flex gap-2"
        >
          <div className="flex h-10 flex-1 items-center gap-2 rounded-md border border-line px-3 focus-within:border-muted">
            <Hash size={14} className="text-faint" />
            <input autoFocus value={v} onChange={(e) => setV(e.target.value)} placeholder={t('channelName')} className="w-full bg-transparent text-[14px] placeholder:text-faint" />
          </div>
          <button disabled={!valid} className="h-10 rounded-md bg-ink px-4 text-[13px] font-medium text-ground transition hover:bg-ink/85 disabled:opacity-30">
            {t('join')}
          </button>
        </form>
        <dl className="mt-12 grid gap-6 border-t border-line pt-6 sm:grid-cols-3">
          {(
            [
              ['feat1T', 'feat1D'],
              ['feat2T', 'feat2D'],
              ['feat3T', 'feat3D']
            ] as const
          ).map(([a, b]) => (
            <div key={a}>
              <dt className="text-[13px] font-medium">{t(a)}</dt>
              <dd className="m-0 mt-1 text-[12.5px] leading-snug text-faint">{t(b)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}

export default function App() {
  const ui = useUi()
  const theme = useSettings((s) => s.theme)
  const language = useSettings((s) => s.language)
  const fontSize = useSettings((s) => s.fontSize)

  useEffect(() => {
    void startClient()
    return window.bridge.onFocus(setWindowFocused)
  }, [])

  useEffect(() => {
    const r = document.documentElement
    r.dataset.theme = theme
    r.lang = language
    r.style.setProperty('--chat-size', `${fontSize}px`)
  }, [theme, language, fontSize])

  // Tastenkürzel
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return
      const u = useUi.getState()
      const k = e.key.toLowerCase()
      if (k === 'k') {
        e.preventDefault()
        u.set({ paletteOpen: !u.paletteOpen })
      } else if (k === 't') {
        e.preventDefault()
        u.set({ joinOpen: true })
      } else if (k === ',') {
        e.preventDefault()
        u.set({ settingsOpen: true })
      } else if (k === 'j') {
        e.preventDefault()
        u.set({ panelOpen: !u.panelOpen })
      } else if (k === 'b') {
        e.preventDefault()
        u.set({ railCollapsed: !u.railCollapsed })
      } else if (k === 'f') {
        const c = u.splits[u.focused]
        if (c) {
          e.preventDefault()
          u.set({ searchOpen: { ...u.searchOpen, [c]: true } })
        }
      } else if (k === 'w') {
        if (u.splits.length > 1) {
          e.preventDefault()
          u.closeSplit(u.focused)
        }
      } else if (/^[1-9]$/.test(k)) {
        const c = u.channels[Number(k) - 1]
        if (c) {
          e.preventDefault()
          u.showChannel(c)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const focusedChannel = ui.splits[ui.focused]
  const multi = ui.splits.length > 1

  return (
    <RTooltip.Provider>
      <div className="flex h-full flex-col">
        <TitleBar />
        <div className="flex min-h-0 flex-1">
          <ChannelRail />
          {ui.view === 'mentions' ? (
            <MentionsView />
          ) : ui.channels.length === 0 || ui.splits.length === 0 ? (
            <Welcome />
          ) : (
            <main className="flex min-w-0 flex-1 overflow-hidden">
              {ui.splits.map((c, i) => (
                <ChatSplit key={c} channel={c} index={i} focused={i === ui.focused} multi={multi} />
              ))}
            </main>
          )}
          {ui.view === 'chat' && focusedChannel && <SidePanel channel={focusedChannel} />}
        </div>
      </div>
      <UserCard />
      <EmotePreview />
      <SettingsDialog />
      <CommandPalette />
      <JoinDialog />
      <Toaster theme={theme} position="bottom-right" toastOptions={{ style: { background: 'rgb(var(--raised))', border: '1px solid rgb(var(--line))', color: 'rgb(var(--ink))', fontFamily: 'inherit', fontSize: 13, borderRadius: 8 } }} />
    </RTooltip.Provider>
  )
}
