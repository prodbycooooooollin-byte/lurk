// Akzentfarbe pro Kanal: die prägende Farbe aus dem Profilbild des Streamers, auf eine ruhige
// Helligkeit/Sättigung gebracht. So bekommt jeder Kanal ein eigenes Gesicht, ohne bunt zu werden.
import { useEffect, useState } from 'react'

export interface Accent {
  h: number
  s: number
}

const cache = new Map<string, Promise<Accent | null>>()

function extract(url: string): Promise<Accent | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const size = 32
        const c = document.createElement('canvas')
        c.width = size
        c.height = size
        const ctx = c.getContext('2d', { willReadFrequently: true })
        if (!ctx) return resolve(null)
        ctx.drawImage(img, 0, 0, size, size)
        const px = ctx.getImageData(0, 0, size, size).data
        // Farbtöne in 24 Fächern sammeln, gewichtet nach Sättigung – graue/fast schwarze/weiße Pixel zählen kaum
        const buckets = new Array(24).fill(0)
        const sat = new Array(24).fill(0)
        for (let i = 0; i < px.length; i += 4) {
          const r = px[i] / 255
          const g = px[i + 1] / 255
          const b = px[i + 2] / 255
          const max = Math.max(r, g, b)
          const min = Math.min(r, g, b)
          const l = (max + min) / 2
          const d = max - min
          if (d < 0.08 || l < 0.1 || l > 0.92) continue
          const s = d / (1 - Math.abs(2 * l - 1))
          let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
          h = (h * 60 + 360) % 360
          const k = Math.floor(h / 15) % 24
          const w = s * (1 - Math.abs(l - 0.5))
          buckets[k] += w
          sat[k] += s * w
        }
        let best = -1
        let bestW = 0
        for (let k = 0; k < 24; k++) {
          // Nachbarfächer mitzählen, damit Verläufe nicht zersplittern
          const w = buckets[k] + 0.5 * (buckets[(k + 23) % 24] + buckets[(k + 1) % 24])
          if (w > bestW) {
            bestW = w
            best = k
          }
        }
        // zu wenig Farbe im Bild: kein Akzent (bleibt neutral)
        if (best < 0 || bestW < 6) return resolve(null)
        resolve({ h: best * 15 + 7.5, s: Math.min(1, sat[best] / Math.max(1e-6, buckets[best])) })
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = url.replace(/\d+x\d+(\.\w+)$/, '70x70$1')
  })
}

/** Prägende Farbe eines Bildes (gecacht); null = neutral */
export function useAccent(url: string | undefined): Accent | null {
  const [a, setA] = useState<Accent | null>(null)
  useEffect(() => {
    if (!url) return setA(null)
    let alive = true
    let p = cache.get(url)
    if (!p) cache.set(url, (p = extract(url)))
    void p.then((r) => alive && setA(r))
    return () => {
      alive = false
    }
  }, [url])
  return a
}

/** CSS-Variablen für einen Bereich: --ch = Akzent (HSL-Werte), passend zu hellem/dunklem Theme */
export function accentVars(a: Accent | null, dark: boolean): React.CSSProperties | undefined {
  if (!a) return undefined
  const s = Math.round(Math.max(28, Math.min(58, a.s * 100 * 0.8)))
  const l = dark ? 66 : 44
  return { ['--ch' as string]: `${Math.round(a.h)} ${s}% ${l}%` }
}
