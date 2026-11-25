import { useEffect, useRef, useState } from 'react'

/**
 * Kleine Leistungsanzeige (Ctrl+Shift+P): Bilder pro Sekunde, langsamster Frame und
 * Haupt-Thread-Blockaden der letzten Sekunde. Misst nur, solange sie sichtbar ist.
 */
export function FpsMeter() {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem('lurk-fps') === '1'
    } catch {
      return false
    }
  })
  const [s, setS] = useState({ fps: 0, worst: 0, long: 0 })
  const longRef = useRef(0)

  useEffect(() => {
    const key = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        setOn((v) => {
          try {
            localStorage.setItem('lurk-fps', v ? '0' : '1')
          } catch {
            /* egal */
          }
          return !v
        })
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])

  useEffect(() => {
    if (!on) return
    let raf = 0
    let frames = 0
    let worst = 0
    let last = performance.now()
    let windowStart = last
    let po: PerformanceObserver | undefined
    try {
      po = new PerformanceObserver((l) => {
        for (const e of l.getEntries()) longRef.current += e.duration
      })
      po.observe({ type: 'longtask' })
    } catch {
      /* nicht unterstützt */
    }
    const f = (t: number): void => {
      frames++
      worst = Math.max(worst, t - last)
      last = t
      if (t - windowStart >= 1000) {
        setS({ fps: Math.round((frames * 1000) / (t - windowStart)), worst: Math.round(worst), long: Math.round(longRef.current) })
        frames = 0
        worst = 0
        longRef.current = 0
        windowStart = t
      }
      raf = requestAnimationFrame(f)
    }
    raf = requestAnimationFrame(f)
    return () => {
      cancelAnimationFrame(raf)
      po?.disconnect()
    }
  }, [on])

  if (!on) return null
  const tone = s.fps >= 55 ? 'text-join' : s.fps >= 40 ? 'text-warn' : 'text-live'
  return (
    <div className="pointer-events-none fixed bottom-3 left-[64px] z-[95] flex items-baseline gap-3 rounded-md border border-line bg-raised/90 px-2.5 py-1.5 font-mono text-[11px] tabular-nums text-muted shadow-lg">
      <span>
        <b className={tone}>{s.fps}</b> fps
      </span>
      <span>max {s.worst} ms</span>
      <span>block {s.long} ms</span>
    </div>
  )
}
