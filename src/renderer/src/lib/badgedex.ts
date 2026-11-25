// Badge-Dex: jedes globale Twitch-Badge, das Lurk im Chat zu sehen bekommt, landet in einer
// lokalen Sammlung (IndexedDB). Daraus ergeben sich
//  - der Dex selbst (entdeckt / fehlt, wann, bei wem, in welchem Kanal zuerst),
//  - eine Seltenheit pro Badge (bei wie vielen verschiedenen Leuten gesehen),
//  - pro Person die Badges, die sie schon mal getragen hat (Twitch zeigt immer nur eins).
// Kanal-Badges (Sub, Bits, Mod, VIP …) zählen nicht – die sind pro Kanal und nicht sammelbar.
import { useSyncExternalStore } from 'react'
import type { BadgeRef } from './types'

export interface Sighting {
  /** verschiedene Leute, bei denen das Badge gesehen wurde */
  n: number
  /** zuerst gesehen (ms) */
  f: number
  /** zuletzt gesehen (ms) */
  l: number
  /** Kanal der ersten Sichtung */
  c: string
  /** Login der ersten Sichtung */
  by: string
}

interface DexData {
  s: Record<string, Sighting>
  /** login -> Badge-Schlüssel ("set/version") */
  u: Record<string, string[]>
  /** login -> zuletzt gesehen (für das Aufräumen) */
  t: Record<string, number>
}

/** Sets, die pro Kanal vergeben werden oder nur Rollen anzeigen */
const NOT_COLLECTIBLE = new Set([
  'subscriber', 'sub-gifter', 'sub-gift-leader', 'founder', 'bits', 'bits-leader', 'bits-charity',
  'moderator', 'vip', 'broadcaster', 'lead_moderator', 'artist-badge', 'predictions', 'hype-train',
  'clip-champ', 'moments', 'no_audio', 'no_video', 'anonymous-cheerer', 'raider'
])

const MAX_USERS = 60_000
const SAVE_EVERY = 45_000

let data: DexData = { s: {}, u: {}, t: {} }
let loaded = false
let dirty = false
let version = 0
let started = false
let userCount = 0
const listeners = new Set<() => void>()

const emit = (): void => {
  version++
  listeners.forEach((l) => l())
}

export const isCollectible = (set: string): boolean => !NOT_COLLECTIBLE.has(set)

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('lurk-dex', 1)
    r.onupgradeneeded = () => r.result.createObjectStore('dex')
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

async function load(): Promise<void> {
  try {
    const d = await db()
    const stored = await new Promise<DexData | undefined>((res) => {
      const q = d.transaction('dex').objectStore('dex').get('v1')
      q.onsuccess = () => res(q.result as DexData | undefined)
      q.onerror = () => res(undefined)
    })
    if (stored?.s) data = { s: stored.s, u: stored.u ?? {}, t: stored.t ?? {} }
    userCount = Object.keys(data.u).length
  } catch {
    /* ohne Speicher weiter – dann nur für diese Sitzung */
  }
  loaded = true
  emit()
}

async function save(): Promise<void> {
  if (!dirty) return
  dirty = false
  const logins = Object.keys(data.u)
  if (logins.length > MAX_USERS) {
    logins.sort((a, b) => (data.t[b] ?? 0) - (data.t[a] ?? 0))
    for (const l of logins.slice(MAX_USERS)) {
      delete data.u[l]
      userCount--
      delete data.t[l]
    }
  }
  try {
    const d = await db()
    d.transaction('dex', 'readwrite').objectStore('dex').put(data, 'v1')
  } catch {
    dirty = true
  }
}

/** Einmal starten: lädt den Dex und speichert regelmäßig */
export function startBadgeDex(): void {
  if (started) return
  started = true
  void load()
  window.setInterval(() => void save(), SAVE_EVERY)
  window.addEventListener('beforeunload', () => void save())
}

/** Badges aus den Chat-Logs nachtragen (älteste Sichtung zählt als "zuerst gesehen") */
export function recordHistoric(login: string, spans: { key: string; first: number; last: number }[], channel: string): void {
  if (!loaded) return
  let changed = false
  for (const sp of spans) {
    if (!isCollectible(sp.key.split('/')[0])) continue
    if (!data.u[login]) {
      data.u[login] = []
      userCount++
    }
    const mine = data.u[login]
    let s = data.s[sp.key]
    if (!s) s = data.s[sp.key] = { n: 0, f: sp.first, l: sp.last, c: channel, by: login }
    if (sp.first < s.f) Object.assign(s, { f: sp.first, c: channel, by: login })
    if (sp.last > s.l) s.l = sp.last
    if (!mine.includes(sp.key)) {
      mine.push(sp.key)
      s.n++
      changed = true
    }
  }
  if (changed) {
    dirty = true
    emit()
  }
}

/** Badges einer Nachricht erfassen. historical = aus dem Verlauf (keine Benachrichtigung) */
export function recordBadges(login: string | undefined, badges: BadgeRef[], channel: string, ts: number, historical: boolean): void {
  if (!loaded || !login || !badges.length) return
  let changed = false
  for (const b of badges) {
    if (!isCollectible(b.set)) continue
    const key = `${b.set}/${b.version}`
    if (!data.u[login]) {
      data.u[login] = []
      userCount++
    }
    const mine = data.u[login]
    data.t[login] = ts
    let s = data.s[key]
    if (!s) {
      s = data.s[key] = { n: 0, f: ts, l: ts, c: channel, by: login }
    }
    if (ts > s.l) s.l = ts
    if (!mine.includes(key)) {
      mine.push(key)
      s.n++
      changed = true
    }
  }
  if (changed) {
    dirty = true
    emit()
  }
}

/** Anteil der erfassten Leute (mit sammelbaren Badges), bei denen das Badge gesehen wurde */
export const shareOf = (n: number): number => (userCount ? n / userCount : 0)
export const trackedPeople = (): number => userCount

export const getSighting = (key: string): Sighting | undefined => data.s[key]
export const userBadges = (login: string): string[] => data.u[login.toLowerCase()] ?? []
export const allSightings = (): Record<string, Sighting> => data.s
export const isDexLoaded = (): boolean => loaded

/** Rendert neu, sobald sich der Dex ändert */
export function useDexVersion(): number {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => version
  )
}

