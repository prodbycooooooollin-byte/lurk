import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { t, locale } from './i18n'

export const cn = (...v: ClassValue[]): string => twMerge(clsx(v))

const FALLBACK = ['#FF6B6B', '#4ECDC4', '#FFD166', '#8B9CFF', '#F78C6B', '#5BE3A8', '#C792EA', '#64B5F6', '#FF8FB1', '#A3E635', '#FDBA74', '#67E8F9']

export function fallbackColor(login: string): string {
  let h = 0
  for (let i = 0; i < login.length; i++) h = (h * 31 + login.charCodeAt(i)) >>> 0
  return FALLBACK[h % FALLBACK.length]
}

function hexToHsl(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return null
  const n = parseInt(m[1], 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    h /= 6
  }
  return [h * 360, s * 100, l * 100]
}

const colorCache = new Map<string, string>()

/** Namensfarbe lesbar machen – dunkle Farben im Dark-Mode aufhellen und umgekehrt */
export function readableColor(color: string | undefined, login: string, dark: boolean): string {
  const base = color || fallbackColor(login)
  const key = base + (dark ? 'd' : 'l')
  const hit = colorCache.get(key)
  if (hit) return hit
  const hsl = hexToHsl(base)
  let out = base
  if (hsl) {
    const [h, s, l] = hsl
    const nl = dark ? Math.max(l, 62) : Math.min(l, 42)
    out = `hsl(${h.toFixed(0)} ${Math.min(s, 90).toFixed(0)}% ${nl.toFixed(0)}%)`
  }
  colorCache.set(key, out)
  return out
}

export function timeShort(ts: number, seconds = false): string {
  return new Date(ts).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', ...(seconds ? { second: '2-digit' } : {}) })
}

export function relTime(ts: number): string {
  const d = Math.max(0, Date.now() - ts) / 1000
  if (d < 45) return t('justNow')
  if (d < 3600) return t('minAgo', { n: Math.round(d / 60) })
  if (d < 86400) return t('hAgo', { n: Math.round(d / 3600) })
  return t('dAgo', { n: Math.round(d / 86400) })
}

export function durationSince(iso?: string): string {
  if (!iso) return ''
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h ? t('uptime', { h, m }) : t('uptimeMin', { m })
}

/** Length of time since a date, e.g. "3 years" – combine with t('ago') or t('followsFor') */
export function formatAge(iso?: string | null): string {
  if (!iso) return '–'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days < 1) return t('today')
  if (days < 31) return days === 1 ? t('day1') : t('days', { n: days })
  const months = Math.floor(days / 30.44)
  if (months < 12) return months === 1 ? t('month1') : t('months', { n: months })
  const y = Math.floor(months / 12)
  const rm = months % 12
  const ys = y === 1 ? t('year1') : t('years', { n: y })
  return rm ? t('yearsMonths', { y: ys, m: rm }) : ys
}

export function formatNumber(n?: number): string {
  if (n === undefined) return '–'
  return n.toLocaleString(locale())
}

export function formatDuration(sec: number): string {
  if (sec < 60) return t('durS', { n: sec })
  if (sec < 3600) return t('durMin', { n: Math.round(sec / 60) })
  if (sec < 86400) return t('durH', { n: Math.round(sec / 3600) })
  return t('durD', { n: Math.round(sec / 86400) })
}

/** Kurzer Ton über WebAudio – keine Audiodatei nötig */
let audioCtx: AudioContext | null = null
export function chime(kind: 'mention' | 'join' = 'mention', volume = 0.5): void {
  try {
    audioCtx ??= new AudioContext()
    const ctx = audioCtx
    const notes = kind === 'mention' ? [880, 1320] : [660, 990]
    notes.forEach((f, i) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'sine'
      o.frequency.value = f
      const t = ctx.currentTime + i * 0.09
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(0.18 * volume, t + 0.01)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22)
      o.connect(g).connect(ctx.destination)
      o.start(t)
      o.stop(t + 0.25)
    })
  } catch {
    /* Audio nicht verfügbar */
  }
}

export function parseDurationArg(s: string | undefined): number | undefined {
  if (!s) return undefined
  const m = /^(\d+)([smhdw]?)$/i.exec(s)
  if (!m) return undefined
  const n = Number(m[1])
  const mult: Record<string, number> = { '': 1, s: 1, m: 60, h: 3600, d: 86400, w: 604800 }
  return n * mult[m[2].toLowerCase()]
}
