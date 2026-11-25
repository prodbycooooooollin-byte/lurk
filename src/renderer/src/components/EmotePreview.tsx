import { useEffect, useState } from 'react'
import { useT } from '@/lib/i18n'

interface Preview {
  /** reines Bild (Link-Vorschau) statt Emote */
  image?: boolean
  name: string
  big: string
  source: string
  scope: string
  x: number
  y: number
}

const SOURCES: Record<string, string> = { twitch: 'Twitch', '7tv': '7TV', bttv: 'BetterTTV', ffz: 'FrankerFaceZ' }

/** Eine einzige Emote-Vorschau für die ganze App (statt eines Tooltips pro Emote). */
export function EmotePreview() {
  const t = useT()
  const [p, setP] = useState<Preview | null>(null)

  useEffect(() => {
    let timer: number | undefined
    let current: HTMLElement | null = null
    const over = (e: MouseEvent): void => {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-emote],[data-image]') ?? null
      if (el === current) return
      current = el
      window.clearTimeout(timer)
      if (!el) return setP(null)
      timer = window.setTimeout(() => {
        const r = el.getBoundingClientRect()
        if (el.dataset.image) setP({ image: true, name: '', big: el.dataset.image, source: '', scope: '', x: r.left + r.width / 2, y: r.top })
        else setP({ name: el.dataset.emote ?? '', big: el.dataset.big ?? '', source: el.dataset.src ?? '', scope: el.dataset.scope ?? '', x: r.left + r.width / 2, y: r.top })
      }, 220)
    }
    const hide = (): void => {
      current = null
      window.clearTimeout(timer)
      setP(null)
    }
    document.addEventListener('mouseover', over)
    document.addEventListener('scroll', hide, true)
    window.addEventListener('blur', hide)
    return () => {
      document.removeEventListener('mouseover', over)
      document.removeEventListener('scroll', hide, true)
      window.removeEventListener('blur', hide)
    }
  }, [])

  if (!p) return null
  if (p.image) {
    const below = p.y < window.innerHeight / 2
    return (
      <div
        className="pointer-events-none fixed z-[90] overflow-hidden rounded-lg border border-line bg-raised shadow-2xl"
        style={{ left: Math.min(Math.max(170, p.x), window.innerWidth - 170), top: below ? p.y + 24 : p.y - 8, transform: `translate(-50%, ${below ? '0' : '-100%'})` }}
      >
        <img src={p.big} alt="" referrerPolicy="no-referrer" className="block max-h-[360px] max-w-[320px] object-contain" />
      </div>
    )
  }
  const left = Math.min(Math.max(90, p.x), window.innerWidth - 90)
  const below = p.y < 150
  return (
    <div
      className="pointer-events-none fixed z-[90] flex -translate-x-1/2 flex-col items-center gap-1 rounded-lg border border-line bg-raised p-3 shadow-xl"
      style={{ left, top: below ? p.y + 36 : p.y - 8, transform: `translate(-50%, ${below ? '0' : '-100%'})` }}
    >
      <img src={p.big} alt="" className="h-16 w-auto" />
      <span className="mt-1 max-w-[220px] truncate text-[13px] font-medium text-ink">{p.name}</span>
      <span className="text-[11.5px] text-faint">
        {SOURCES[p.source] ?? p.source} · {p.scope === 'channel' ? t('emoteChannel') : t('emoteGlobal')}
      </span>
    </div>
  )
}
