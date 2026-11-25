// Klänge für Erwähnungen und Watchlist-Joins: eingebaute (per WebAudio erzeugt, keine Dateien,
// keine Lizenzfragen) und eigene Audiodateien der Nutzer.
import { useSettings } from '@/store/settings'

type Synth = (ctx: AudioContext, out: AudioNode, t: number) => void

let ctx: AudioContext | null = null
const decoded = new Map<string, Promise<AudioBuffer | null>>()

function tone(c: AudioContext, out: AudioNode, t: number, f: number, dur: number, type: OscillatorType = 'sine', gain = 0.22, glideTo?: number): void {
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(f, t)
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur * 0.8)
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(gain, t + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(out)
  o.start(t)
  o.stop(t + dur + 0.02)
}

function noiseHit(c: AudioContext, out: AudioNode, t: number, freq: number, dur: number, gain = 0.5): void {
  const len = Math.floor(c.sampleRate * dur)
  const buf = c.createBuffer(1, len, c.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3)
  const src = c.createBufferSource()
  src.buffer = buf
  const f = c.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.value = freq
  f.Q.value = 4
  const g = c.createGain()
  g.gain.value = gain
  src.connect(f).connect(g).connect(out)
  src.start(t)
}

/** Eingebaute Klänge – alle selbst erzeugt */
export const BUILTIN: { id: string; name: string; play: Synth }[] = [
  { id: 'ping', name: 'Ping', play: (c, o, t) => (tone(c, o, t, 880, 0.22), tone(c, o, t + 0.09, 1320, 0.26)) },
  { id: 'classic', name: 'Classic', play: (c, o, t) => (tone(c, o, t, 1568, 0.32, 'sine', 0.2), tone(c, o, t, 3136, 0.12, 'sine', 0.05)) },
  { id: 'knock', name: 'Knock', play: (c, o, t) => (noiseHit(c, o, t, 420, 0.09, 0.9), noiseHit(c, o, t + 0.13, 380, 0.09, 0.8)) },
  { id: 'pop', name: 'Pop', play: (c, o, t) => tone(c, o, t, 900, 0.12, 'sine', 0.3, 280) },
  {
    id: 'bell',
    name: 'Bell',
    play: (c, o, t) => {
      for (const [m, g] of [[1, 0.18], [2.76, 0.06], [5.4, 0.03]] as const) tone(c, o, t, 1046 * m, 1.1 / Math.sqrt(m), 'sine', g)
    }
  },
  { id: 'chime', name: 'Chime', play: (c, o, t) => [1047, 1319, 1568].forEach((f, i) => tone(c, o, t + i * 0.08, f, 0.35, 'triangle', 0.16)) },
  { id: 'blip', name: 'Blip', play: (c, o, t) => (tone(c, o, t, 1200, 0.06, 'square', 0.07), tone(c, o, t + 0.08, 1600, 0.07, 'square', 0.07)) },
  { id: 'marimba', name: 'Marimba', play: (c, o, t) => (tone(c, o, t, 523, 0.3, 'sine', 0.25), tone(c, o, t, 1569, 0.08, 'sine', 0.08), tone(c, o, t + 0.11, 784, 0.32, 'sine', 0.22)) },
  { id: 'whistle', name: 'Whistle', play: (c, o, t) => tone(c, o, t, 800, 0.35, 'sine', 0.18, 1700) },
  { id: 'drop', name: 'Drop', play: (c, o, t) => (tone(c, o, t, 1400, 0.16, 'sine', 0.22, 500), tone(c, o, t + 0.12, 700, 0.18, 'sine', 0.1, 350)) },
  { id: 'alert', name: 'Alert', play: (c, o, t) => [0, 0.16].forEach((d) => (tone(c, o, t + d, 1000, 0.1, 'triangle', 0.2), tone(c, o, t + d + 0.08, 750, 0.1, 'triangle', 0.2))) }
]

async function buffer(id: string, data: string): Promise<AudioBuffer | null> {
  let p = decoded.get(id)
  if (!p) {
    p = (async () => {
      try {
        const bytes = await (await fetch(data)).arrayBuffer()
        ctx ??= new AudioContext()
        return await ctx.decodeAudioData(bytes)
      } catch {
        return null
      }
    })()
    decoded.set(id, p)
  }
  return p
}

/** Spielt einen Klang: eingebauter Name oder "custom:<id>" */
export async function playSound(id: string, volume = useSettings.getState().soundVolume): Promise<void> {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') await ctx.resume()
    const out = ctx.createGain()
    out.gain.value = Math.max(0, Math.min(1, volume))
    out.connect(ctx.destination)
    if (id.startsWith('custom:')) {
      const s = useSettings.getState().customSounds.find((x) => `custom:${x.id}` === id)
      const b = s ? await buffer(s.id, s.data) : null
      if (!b) return void (BUILTIN[0].play(ctx, out, ctx.currentTime))
      const src = ctx.createBufferSource()
      src.buffer = b
      src.connect(out)
      src.start()
      return
    }
    ;(BUILTIN.find((b) => b.id === id) ?? BUILTIN[0]).play(ctx, out, ctx.currentTime)
  } catch {
    /* Audio nicht verfügbar */
  }
}

/** Liest eine Audiodatei ein (max. 1 MB) und legt sie als eigenen Klang an */
export async function addCustomSound(file: File): Promise<string | 'too-big' | null> {
  if (file.size > 1024 * 1024) return 'too-big'
  const data = await new Promise<string>((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(String(r.result))
    r.onerror = () => rej(r.error)
    r.readAsDataURL(file)
  })
  const id = Math.random().toString(36).slice(2, 10)
  const s = useSettings.getState()
  s.set({ customSounds: [...s.customSounds, { id, name: file.name.replace(/\.[^.]+$/, '').slice(0, 40), data }] })
  if (!(await buffer(id, data))) {
    s.set({ customSounds: useSettings.getState().customSounds.filter((x) => x.id !== id) })
    return null
  }
  return `custom:${id}`
}

export function removeCustomSound(id: string): void {
  const s = useSettings.getState()
  decoded.delete(id)
  const key = `custom:${id}`
  s.set({
    customSounds: s.customSounds.filter((x) => x.id !== id),
    ...(s.mentionSoundId === key ? { mentionSoundId: 'ping' } : {}),
    ...(s.joinSoundId === key ? { joinSoundId: 'knock' } : {})
  })
}
