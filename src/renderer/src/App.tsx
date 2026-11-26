import { useEffect } from 'react'
import * as RTooltip from '@radix-ui/react-tooltip'
import { Toaster } from 'sonner'
import { TitleBar } from './components/TitleBar'
import { ChannelRail } from './components/ChannelRail'
import { ChatSplit } from './components/ChatSplit'
import { SidePanel } from './components/PresencePanel'
import { UserCard } from './components/UserCard'
import { EmotePreview } from './components/EmotePreview'
import { FpsMeter } from './components/FpsMeter'
import { SettingsDialog } from './components/SettingsDialog'
import { CommandPalette, JoinDialog } from './components/CommandPalette'
import { MentionsView } from './components/MentionsView'
import { Home } from './components/Home'
import { startLive } from './lib/live'
import { startEventSub } from './lib/eventsub'
import { BadgeDex } from './components/BadgeDex'
import { ErrorBoundary } from './components/ErrorBoundary'
import { toast } from 'sonner'
import { t as tr } from './lib/i18n'
import { useUi } from './store/ui'
import { useSettings } from './store/settings'
import { setWindowFocused, startClient } from './lib/client'

export default function App() {
  const ui = useUi()
  const theme = useSettings((s) => s.theme)
  const language = useSettings((s) => s.language)
  const fontSize = useSettings((s) => s.fontSize)
  const emoteScale = useSettings((s) => s.emoteScale)

  useEffect(() => {
    void startClient()
    startLive()
    startEventSub()
    return window.bridge.onFocus(setWindowFocused)
  }, [])

  useEffect(() => {
    const r = document.documentElement
    r.dataset.theme = theme
    r.lang = language
    r.style.setProperty('--chat-size', `${fontSize}px`)
    r.style.setProperty('--emote-scale', String(emoteScale))
  }, [theme, language, fontSize, emoteScale])

  // Tastenkürzel
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return
      const u = useUi.getState()
      const k = e.key.toLowerCase()
      if (k === 'b' && e.shiftKey) {
        e.preventDefault()
        u.set({ dexOpen: !u.dexOpen, dexFocus: null })
      } else if (k === 'k') {
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
          ) : ui.view === 'home' || ui.channels.length === 0 || ui.splits.length === 0 ? (
            <Home />
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
      <ErrorBoundary
        resetKey={ui.userCard}
        onError={() => {
          useUi.getState().set({ userCard: null })
          toast.error(tr('cardFailed'))
        }}
      >
        <UserCard />
      </ErrorBoundary>
      <EmotePreview />
      <FpsMeter />
      <SettingsDialog />
      <BadgeDex />
      <CommandPalette />
      <JoinDialog />
      <Toaster theme={theme} position="bottom-right" toastOptions={{ style: { background: 'rgb(var(--raised))', border: '1px solid rgb(var(--line))', color: 'rgb(var(--ink))', fontFamily: 'inherit', fontSize: 13, borderRadius: 8 } }} />
    </RTooltip.Provider>
  )
}
