import { useState } from 'react'
import { Command } from 'cmdk'
import * as Dialog from '@radix-ui/react-dialog'
import { Hash, Columns2, Settings, PanelRight, Sun, Moon, AtSign, Rows3, LogIn, RefreshCw, Plus, Search, Languages } from 'lucide-react'
import { useUi } from '@/store/ui'
import { useSettings } from '@/store/settings'
import { useChat } from '@/store/chat'
import { joinChannel, reconnect } from '@/lib/client'
import { useT } from '@/lib/i18n'
import { Avatar, Button } from './ui'

const EMPTY: ReturnType<typeof useChat.getState>['channels'] = {}

export function addAndJoin(raw: string, asSplit = false): void {
  const before = useUi.getState().channels
  useUi.getState().addChannel(raw, asSplit)
  for (const c of useUi.getState().channels) if (!before.includes(c)) joinChannel(c)
}

export function CommandPalette() {
  const ui = useUi()
  const s = useSettings()
  const t = useT()
  // nur abonnieren, solange die Palette offen ist – sonst rendert sie bei jeder Chatnachricht mit
  const channels = useChat((st) => (ui.paletteOpen ? st.channels : EMPTY))
  const [q, setQ] = useState('')
  const close = (): void => {
    ui.set({ paletteOpen: false })
    setQ('')
  }
  const name = q.trim().toLowerCase().replace(/^#/, '')
  const validNew = /^[a-z0-9_]{2,25}$/.test(name) && !ui.channels.includes(name)
  const run = (fn: () => void) => () => {
    fn()
    close()
  }

  return (
    <Dialog.Root open={ui.paletteOpen} onOpenChange={(o) => (o ? ui.set({ paletteOpen: true }) : close())}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay z-[70]" />
        <Dialog.Content className="fixed left-1/2 top-[14vh] z-[71] w-[min(540px,92vw)] -translate-x-1/2 overflow-hidden rounded-window border border-line bg-ground shadow-2xl">
          <Dialog.Title className="sr-only">{t('commandPalette')}</Dialog.Title>
          <Dialog.Description className="sr-only">{t('palettePlaceholder')}</Dialog.Description>
          <Command loop label={t('commandPalette')}>
            <div className="flex items-center gap-2.5 border-b border-line px-4">
              <Search size={15} className="text-faint" />
              <Command.Input value={q} onValueChange={setQ} placeholder={t('palettePlaceholder')} className="h-12 w-full bg-transparent text-[14px] text-ink placeholder:text-faint" />
            </div>
            <Command.List className="max-h-[52vh] overflow-y-auto p-1.5">
              <Command.Empty className="px-4 py-8 text-center text-[13px] text-faint">{t('nothingFound')}</Command.Empty>
              {validNew && (
                <Command.Group heading={t('newChannel')}>
                  <Item icon={<Plus size={14} />} onSelect={run(() => addAndJoin(name))} value={`join ${name}`} hint="Enter">
                    {t('joinX', { c: name })}
                  </Item>
                  <Item icon={<Columns2 size={14} />} onSelect={run(() => addAndJoin(name, true))} value={`split ${name}`}>
                    {t('openXSplit', { c: name })}
                  </Item>
                </Command.Group>
              )}
              {ui.channels.length > 0 && (
                <Command.Group heading={t('yourChannels')}>
                  {ui.channels.map((c) => (
                    <Item key={c} value={`channel kanal ${c}`} icon={<Avatar src={channels[c]?.info.avatar} name={c} size={18} />} onSelect={run(() => ui.showChannel(c))} hint={channels[c]?.info.live ? t('live') : undefined}>
                      {channels[c]?.info.displayName ?? c}
                    </Item>
                  ))}
                </Command.Group>
              )}
              <Command.Group heading={t('actions')}>
                <Item icon={<Hash size={14} />} value="add channel kanal hinzufügen" onSelect={run(() => ui.set({ joinOpen: true }))} hint="Ctrl T">
                  {t('addChannel')}
                </Item>
                <Item icon={<AtSign size={14} />} value="mentions erwähnungen" onSelect={run(() => ui.set({ view: 'mentions' }))}>
                  {t('showMentions')}
                </Item>
                <Item icon={<PanelRight size={14} />} value="presence who chat sidebar präsenz" onSelect={run(() => ui.set({ panelOpen: !ui.panelOpen }))} hint="Ctrl J">
                  {t('togglePresence')}
                </Item>
                <Item icon={s.theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />} value="theme light dark hell dunkel" onSelect={run(() => s.set({ theme: s.theme === 'dark' ? 'light' : 'dark' }))}>
                  {s.theme === 'dark' ? t('lightTheme') : t('darkTheme')}
                </Item>
                <Item icon={<Languages size={14} />} value="language sprache english deutsch" onSelect={run(() => s.set({ language: s.language === 'en' ? 'de' : 'en' }))}>
                  {s.language === 'en' ? 'Deutsch' : 'English'}
                </Item>
                <Item icon={<Rows3 size={14} />} value="density compact kompakt" onSelect={run(() => s.set({ density: s.density === 'compact' ? 'cozy' : 'compact' }))}>
                  {s.density === 'compact' ? t('cozyView') : t('compactView')}
                </Item>
                <Item icon={<RefreshCw size={14} />} value="reconnect neu verbinden" onSelect={run(() => reconnect())}>
                  {t('reconnect')}
                </Item>
                <Item icon={<LogIn size={14} />} value="account login sign in konto anmelden" onSelect={run(() => ui.set({ settingsOpen: true, settingsTab: 'account' }))}>
                  {t('accountSignIn')}
                </Item>
                <Item icon={<Settings size={14} />} value="settings einstellungen" onSelect={run(() => ui.set({ settingsOpen: true }))} hint="Ctrl ,">
                  {t('settings')}
                </Item>
              </Command.Group>
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function Item({ icon, children, onSelect, value, hint }: { icon: React.ReactNode; children: React.ReactNode; onSelect: () => void; value: string; hint?: string }) {
  return (
    <Command.Item value={value} onSelect={onSelect} className="flex cursor-default items-center gap-3 rounded-md px-2.5 py-2 text-[13px] text-ink">
      <span className="flex w-5 justify-center text-faint">{icon}</span>
      <span className="flex-1 truncate">{children}</span>
      {hint && <span className="text-[11px] text-faint">{hint}</span>}
    </Command.Item>
  )
}

export function JoinDialog() {
  const t = useT()
  const open = useUi((u) => u.joinOpen)
  const set = useUi((u) => u.set)
  const [v, setV] = useState('')
  const [split, setSplit] = useState(false)
  const name = v.trim().toLowerCase().replace(/^#/, '').replace(/^https?:\/\/(www\.)?twitch\.tv\//, '').split(/[/?]/)[0]
  const valid = /^[a-z0-9_]{2,25}$/.test(name)
  const submit = (e: React.FormEvent): void => {
    e.preventDefault()
    if (!valid) return
    addAndJoin(name, split)
    setV('')
    set({ joinOpen: false })
  }
  return (
    <Dialog.Root open={open} onOpenChange={(o) => set({ joinOpen: o })}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay z-[70]" />
        <Dialog.Content className="fixed left-1/2 top-[20vh] z-[71] w-[min(400px,92vw)] -translate-x-1/2 rounded-window border border-line bg-ground p-5 shadow-2xl">
          <Dialog.Title className="text-[15px] font-semibold">{t('addChannel')}</Dialog.Title>
          <Dialog.Description className="mt-1 text-[12.5px] text-faint">{t('addChannelDesc')}</Dialog.Description>
          <form onSubmit={submit} className="mt-4 space-y-3">
            <div className="flex h-9 items-center gap-2 rounded-md border border-line px-2.5 focus-within:border-muted">
              <Hash size={14} className="text-faint" />
              <input autoFocus value={v} onChange={(e) => setV(e.target.value)} placeholder={t('channelExample')} className="w-full bg-transparent text-[13.5px] placeholder:text-faint" />
            </div>
            <label className="flex items-center gap-2 text-[12.5px] text-muted">
              <input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} className="accent-[rgb(var(--ink))]" />
              {t('openNextTo')}
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={() => set({ joinOpen: false })}>
                {t('cancel')}
              </Button>
              <Button type="submit" variant="primary" disabled={!valid}>
                {t('join')}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
