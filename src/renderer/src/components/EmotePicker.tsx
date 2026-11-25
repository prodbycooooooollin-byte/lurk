import { useMemo, useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { Smile, Search } from 'lucide-react'
import { emoteList, type Emote } from '@/lib/emotes'
import { useChat } from '@/store/chat'
import { useT } from '@/lib/i18n'
import { IconButton, Tabs } from './ui'

type Tab = 'used' | 'channel' | '7tv' | 'bttv' | 'ffz'

export function EmotePicker({ channel, roomId, onPick }: { channel: string; roomId?: string; onPick: (name: string) => void }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [tab, setTab] = useState<Tab>('channel')
  const emoteVersion = useChat((s) => s.emoteVersion)
  const used = useChat((s) => s.channels[channel]?.stats.emotes)

  const lists = useMemo(() => emoteList(roomId), [roomId, emoteVersion, open]) // eslint-disable-line react-hooks/exhaustive-deps
  const all = useMemo(() => {
    const m = new Map<string, Emote>()
    for (const e of [...lists.global, ...lists.channel]) m.set(e.name, e)
    return m
  }, [lists])

  const shown = useMemo(() => {
    let base: Emote[]
    if (q) {
      const ql = q.toLowerCase()
      base = [...all.values()].filter((e) => e.name.toLowerCase().includes(ql)).sort((a, b) => Number(!a.name.toLowerCase().startsWith(ql)) - Number(!b.name.toLowerCase().startsWith(ql)))
    } else if (tab === 'used') {
      base = Object.entries(used ?? {})
        .sort((a, b) => b[1] - a[1])
        .map(([n]) => all.get(n))
        .filter((e): e is Emote => !!e)
    } else if (tab === 'channel') base = lists.channel
    else base = lists.global.filter((e) => e.source === tab).concat(lists.channel.filter((e) => e.source === tab))
    return base.slice(0, 600)
  }, [q, tab, all, lists, used])

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <IconButton title={t('emotes')}>
          <Smile size={16} strokeWidth={1.75} />
        </IconButton>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="top" align="end" sideOffset={10} className="z-[70] flex h-[400px] w-[360px] flex-col overflow-hidden rounded-window border border-line bg-raised shadow-2xl">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
            <Search size={14} className="text-faint" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchEmotes')} className="w-full bg-transparent text-[13px] text-ink placeholder:text-faint" />
          </div>
          {!q && (
            <Tabs
              className="border-b border-line px-3"
              value={tab}
              onChange={setTab}
              items={[
                ['channel', t('channelTab')],
                ['used', t('popularHere')],
                ['7tv', '7TV'],
                ['bttv', 'BTTV'],
                ['ffz', 'FFZ']
              ]}
            />
          )}
          <div className="grid flex-1 auto-rows-[42px] grid-cols-[repeat(auto-fill,minmax(42px,1fr))] content-start gap-0.5 overflow-y-auto p-2">
            {shown.map((e) => (
              <button key={e.source + e.name} title={e.name} className="flex items-center justify-center rounded-md hover:bg-ink/[0.07]" onClick={() => onPick(e.name)}>
                <img src={e.url} alt={e.name} loading="lazy" className="max-h-7 max-w-[38px]" />
              </button>
            ))}
            {shown.length === 0 && <div className="col-span-full py-10 text-center text-[12.5px] text-faint">{q ? t('noEmote') : t('emotesLoading')}</div>}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
