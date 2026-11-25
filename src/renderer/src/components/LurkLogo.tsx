import { useEffect, useRef } from 'react'
import { useChat } from '@/store/chat'

/*
  Das Lurk-Zeichen: zwei Augen, die über die Kante einer Chat-Sprechblase lugen.
  Ein Lurker schaut dem Chat zu, ohne selbst zu schreiben – genau das zeigt es.

  Geometrie (viewBox 40×40)
    Sprechblase  x 3–37, y 17–34, Radius 8.5, Schwänzchen unten links
    Augen        Mitte (14.8 | 25.2, 13.6), r 4.85 × 6.5, die Unterkante verdeckt der Rand der Blase
                 → 1.6 Luft über der Blase, die Augen "liegen" auf der Kante
    Pupillen     r 2.6, in Hintergrundfarbe (pupilColor)

  Bewegung: gedämpfte Federn, per requestAnimationFrame direkt ins SVG geschrieben
  (kein React-Render pro Frame). Die Schleife schläft, sobald alles zur Ruhe kommt.
*/

export const BUBBLE_PATH =
  'M11.5 17H28.5A8.5 8.5 0 0 1 37 25.5A8.5 8.5 0 0 1 28.5 34H15.2L10.1 37.5C9.3 38.05 8.3 37.35 8.55 36.45L9.25 33.6A8.5 8.5 0 0 1 3 25.5A8.5 8.5 0 0 1 11.5 17Z'
const EYES = [14.8, 25.2] as const
const EYE_Y = 13.6
const EYE_RX = 4.85
const EYE_RY = 6.5
const LEDGE = 15.4
const PUPIL_R = 2.6
const PUPIL_REACH = { x: 2.1, y: 2.3 }

/** Kurz aufschrecken lassen, z. B. bei Erwähnung oder wenn jemand von der Watchlist joint */
export function startleLogo(): void {
  window.dispatchEvent(new Event('lurk:startle'))
}

interface Props {
  size?: number
  /** lebendig: Augen folgen der Maus, blinzeln, schauen sich um, reagieren auf Ereignisse */
  live?: boolean
  /** beim Erscheinen hinter der Blase hervorgucken */
  peek?: boolean
  /** Farbe von Pupillen und Lücke = Hintergrund, auf dem das Zeichen steht */
  pupilColor?: string
  className?: string
}

/** Gedämpfte Feder: x läuft weich auf target zu (leicht unterdämpft für etwas Leben). */
class Spring {
  v = 0
  target: number
  constructor(
    public x: number,
    private k = 170,
    private damping = 0.78
  ) {
    this.target = x
  }
  step(dt: number): void {
    const c = 2 * Math.sqrt(this.k) * this.damping
    const a = this.k * (this.target - this.x) - c * this.v
    this.v += a * dt
    this.x += this.v * dt
  }
  get settled(): boolean {
    return Math.abs(this.target - this.x) < 0.002 && Math.abs(this.v) < 0.002
  }
}

export function LurkLogo({ size = 16, live = false, peek = false, className, pupilColor = 'rgb(var(--ground))' }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const headRef = useRef<SVGGElement>(null)
  const whiteRefs = useRef<(SVGEllipseElement | null)[]>([])
  const pupilRefs = useRef<(SVGCircleElement | null)[]>([])
  const zRef = useRef<SVGTextElement>(null)
  const conn = useChat((s) => s.conn)
  const sleepRef = useRef(false)
  const kick = useRef<() => void>(() => undefined)

  sleepRef.current = live && conn !== 'connected'

  useEffect(() => {
    kick.current()
  }, [conn])

  useEffect(() => {
    const px = new Spring(1.2)
    const py = new Spring(-0.4)
    const lift = new Spring(peek ? 12 : 0, 90, 0.72)
    lift.target = 0
    const lid = new Spring(1, 420, 0.9)
    const pupilScale = new Spring(1, 260, 0.7)
    let raf = 0
    let last = 0
    let lastMouse = 0
    let hovering = false
    let duckUntil = 0
    let startledUntil = 0
    let blinkUntil = 0
    let nextBlink = performance.now() + 1800 + Math.random() * 3000
    let nextWander = 0
    const timers: number[] = []

    const render = (now: number): void => {
      const sleeping = sleepRef.current
      const breathe = sleeping ? Math.sin(now / 900) * 0.45 : 0
      headRef.current?.setAttribute('transform', `translate(${(px.x * 0.32).toFixed(3)} ${(py.x * 0.22 + lift.x + breathe).toFixed(3)})`)
      const base = LEDGE + 1.2
      EYES.forEach((cx, i) => {
        whiteRefs.current[i]?.setAttribute('transform', `translate(0 ${base}) scale(1 ${Math.max(0.06, lid.x).toFixed(3)}) translate(0 ${-base})`)
        const p = pupilRefs.current[i]
        if (p) {
          p.setAttribute('cx', (cx + px.x).toFixed(3))
          p.setAttribute('cy', (EYE_Y - 1 + py.x).toFixed(3))
          p.setAttribute('r', (PUPIL_R * pupilScale.x).toFixed(3))
        }
      })
      if (zRef.current) zRef.current.style.opacity = sleeping ? String(0.35 + 0.35 * Math.sin(now / 700)) : '0'
    }

    const tick = (now: number): void => {
      raf = 0
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016)
      last = now
      const sleeping = sleepRef.current

      if (sleeping) {
        lift.target = 6.5
        lid.target = 0.08
        px.target = 0
        py.target = 1
      } else {
        lift.target = now < duckUntil ? 13 : now < startledUntil ? -2.2 : 0
        pupilScale.target = now < startledUntil ? 0.62 : 1
        if (live && now > nextBlink) {
          blinkUntil = now + 110
          nextBlink = now + 2600 + Math.random() * 4400
          if (Math.random() < 0.22) timers.push(window.setTimeout(() => ((blinkUntil = performance.now() + 100), schedule()), 260))
        }
        // zufriedenes Blinzeln beim Hovern, sonst offen
        lid.target = now < blinkUntil ? 0.08 : hovering ? 0.58 : 1
        // Maus länger still: selbst umschauen oder den Chat "lesen"
        if (live && now - lastMouse > 3500 && now > nextWander) {
          if (Math.random() < 0.35) {
            px.target = 0.2 + Math.random() * 0.6
            py.target = 1.9
          } else {
            px.target = (Math.random() * 2 - 1) * PUPIL_REACH.x
            py.target = (Math.random() * 1.4 - 0.9) * PUPIL_REACH.y
          }
          nextWander = now + 1200 + Math.random() * 2400
        }
      }

      for (const s of [px, py, lift, lid, pupilScale]) s.step(dt)
      render(now)

      const busy = ![px, py, lift, lid, pupilScale].every((s) => s.settled)
      if (busy || sleeping || now < blinkUntil + 200 || now < duckUntil + 50 || now < startledUntil + 50) schedule()
      else if (live) {
        const wanderAt = now - lastMouse > 3500 ? nextWander : Infinity
        timers.push(window.setTimeout(schedule, Math.max(16, Math.min(nextBlink, wanderAt, lastMouse + 3600) - now)))
      }
    }
    const schedule = (): void => {
      if (!raf && !document.hidden) raf = requestAnimationFrame(tick)
    }
    kick.current = schedule

    const onMove = (e: MouseEvent): void => {
      const el = svgRef.current
      if (!el) return
      lastMouse = performance.now()
      const r = el.getBoundingClientRect()
      const dx = e.clientX - (r.left + r.width / 2)
      const dy = e.clientY - (r.top + r.height * 0.34)
      const d = Math.hypot(dx, dy) || 1
      const reach = Math.min(1, d / (hovering ? 40 : 220))
      px.target = (dx / d) * PUPIL_REACH.x * reach
      py.target = (dy / d) * PUPIL_REACH.y * reach
      schedule()
    }
    const onStartle = (): void => {
      startledUntil = performance.now() + 750
      timers.push(window.setTimeout(() => ((blinkUntil = performance.now() + 100), schedule()), 820))
      schedule()
    }
    const el = svgRef.current
    const onEnter = (): void => {
      hovering = true
      schedule()
    }
    const onLeave = (): void => {
      hovering = false
      schedule()
    }
    const onClick = (): void => {
      duckUntil = performance.now() + 520
      schedule()
    }

    if (live) {
      window.addEventListener('mousemove', onMove)
      window.addEventListener('lurk:startle', onStartle)
      el?.addEventListener('mouseenter', onEnter)
      el?.addEventListener('mouseleave', onLeave)
      el?.addEventListener('click', onClick)
    }
    render(performance.now())
    schedule()
    return () => {
      cancelAnimationFrame(raf)
      timers.forEach((t) => window.clearTimeout(t))
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('lurk:startle', onStartle)
      el?.removeEventListener('mouseenter', onEnter)
      el?.removeEventListener('mouseleave', onLeave)
      el?.removeEventListener('click', onClick)
      kick.current = () => undefined
    }
  }, [live, peek])

  // Keine SVG-Maske und kein Clip-Pfad: die zwangen Chromium bei jeder Augenbewegung zu teurem
  // Neu-Rastern und drückten die ganze App auf 30 FPS. Stattdessen: Pupillen in Hintergrundfarbe,
  // und die Sprechblase bekommt einen Rand in Hintergrundfarbe, der die Unterkante der Augen verdeckt.
  // Eigene GPU-Ebene (will-change), damit die Animation nichts anderes neu zeichnen lässt.
  return (
    <svg
      ref={svgRef}
      width={size}
      height={size}
      viewBox="0 0 40 40"
      aria-label="Lurk"
      role="img"
      className={className}
      style={{ overflow: 'visible', ...(live ? { cursor: 'pointer', willChange: 'transform', contain: 'layout paint' } : null) }}
    >
      <g ref={headRef} transform={peek ? 'translate(0 12)' : undefined}>
        {EYES.map((cx, i) => (
          <ellipse
            key={cx}
            ref={(n) => {
              whiteRefs.current[i] = n
            }}
            cx={cx}
            cy={EYE_Y}
            rx={EYE_RX}
            ry={EYE_RY}
            fill="currentColor"
          />
        ))}
        {EYES.map((cx, i) => (
          <circle
            key={cx}
            ref={(n) => {
              pupilRefs.current[i] = n
            }}
            cx={cx + 1.2}
            cy={EYE_Y - 1.4}
            r={PUPIL_R}
            fill={pupilColor}
          />
        ))}
      </g>

      {/* die Sprechblase: der Chat, über den geschaut wird. Der Rand (unter der Füllung) schafft die Lücke zu den Augen. */}
      <path d={BUBBLE_PATH} fill="currentColor" stroke={pupilColor} strokeWidth={(17 - LEDGE) * 2} paintOrder="stroke" strokeLinejoin="round" />

      {live && (
        <text ref={zRef} x="32" y="8" fontSize="7" fontWeight="700" fill="currentColor" style={{ opacity: 0, fontFamily: 'inherit' }}>
          z
        </text>
      )}
    </svg>
  )
}
