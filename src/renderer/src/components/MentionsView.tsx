import { useChat } from '@/store/chat'
import { useSettings } from '@/store/settings'
import { useUi } from '@/store/ui'
import { useT } from '@/lib/i18n'
import { MessageRow } from './MessageRow'
import { Button } from './ui'

export function MentionsView() {
  const t = useT()
  const mentions = useChat((s) => s.mentions)
  const emoteVersion = useChat((s) => s.emoteVersion)
  const dark = useSettings((s) => s.theme) === 'dark'
  const showChannel = useUi((u) => u.showChannel)
  const list = mentions.slice().reverse()
  return (
    <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-line px-4">
        <div className="flex-1">
          <div className="text-[13.5px] font-semibold">{t('mentions')}</div>
          <div className="text-[12px] text-faint">{t('mentionsDesc')}</div>
        </div>
        {list.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => useChat.setState({ mentions: [] })}>
            {t('clear')}
          </Button>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {list.length === 0 && <div className="mx-auto max-w-sm px-6 py-20 text-center text-[13px] leading-relaxed text-faint">{t('mentionsEmpty')}</div>}
        {list.map((m, i) => (
          <div key={m.id + i} className="border-b border-line py-1.5">
            <button onClick={() => showChannel(m.channel)} className="px-4 text-[11.5px] text-faint hover:text-ink">
              #{m.channel}
            </button>
            <MessageRow msg={{ ...m, highlight: null }} index={0} dark={dark} emoteVersion={emoteVersion} canMod={false} />
          </div>
        ))}
      </div>
    </section>
  )
}
