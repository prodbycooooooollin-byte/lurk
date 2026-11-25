// Treue zu einem Kanal aus öffentlichen Quellen – damit "Stammgast" nicht erst nach Wochen mit
// Lurk stimmt, sondern ab dem ersten Start:
//  - logs.ivr.fi: in welchen Monaten jemand im Kanal geschrieben hat (seit wann, wie oft)
//  - api.ivr.fi:  Sub-Dauer (gesamt) und Follow-Datum
// Lurks eigener Besuchsverlauf zählt zusätzlich (fängt Lurker ein, die nie schreiben).
import { useSyncExternalStore } from 'react'
import { getJson, ivrSubage } from './api'
import { getHistory } from './history'

export interface Loyalty {
  /** Monate mit mindestens einer geloggten Nachricht im Kanal */
  logMonths?: number
  /** erster geloggter Monat (ms) */
  firstLog?: number
  /** Sub-Monate gesamt */
  subMonths?: number
  followedAt?: string
}

export type LoyaltyTier = 'regular' | 'returning' | 'new'

const cache = new Map<string, Loyalty>()
const queue: string[] = []
const queued = new Set<string>()
const listeners = new Set<() => void>()
let version = 0
let running = 0
const PARALLEL = 4

const k = (channel: string, login: string): string => `${channel}/${login}`

function notify(): void {
  version++
  listeners.forEach((l) => l())
}

async function fetchOne(channel: string, login: string): Promise<Loyalty> {
  const c = encodeURIComponent(channel)
  const u = encodeURIComponent(login)
  const [logs, sub] = await Promise.all([
    getJson<{ availableLogs?: { year: string; month: string }[] }>(`https://logs.ivr.fi/list?channel=${c}&user=${u}`),
    ivrSubage(login, channel)
  ])
  const months = logs?.availableLogs ?? []
  const oldest = months[months.length - 1]
  return {
    logMonths: logs ? months.length : undefined,
    firstLog: oldest ? new Date(Number(oldest.year), Number(oldest.month) - 1, 1).getTime() : undefined,
    subMonths: sub?.cumulative?.months ?? undefined,
    followedAt: sub?.followedAt ?? undefined
  }
}

function pump(): void {
  while (running < PARALLEL && queue.length) {
    const key = queue.shift()!
    const [channel, login] = key.split('/')
    running++
    void fetchOne(channel, login)
      .then((l) => cache.set(key, l))
      .catch(() => cache.set(key, {}))
      .finally(() => {
        running--
        queued.delete(key)
        // gesammelt melden statt nach jeder einzelnen Antwort neu zu rendern
        if (!queue.length || cache.size % 10 === 0) notify()
        pump()
      })
  }
}

/** Zum Nachschlagen vormerken; liefert sofort, was schon bekannt ist */
export function requestLoyalty(channel: string, login: string): Loyalty | undefined {
  const key = k(channel, login)
  const hit = cache.get(key)
  if (hit || queued.has(key)) return hit
  queued.add(key)
  queue.push(key)
  pump()
  return undefined
}

export const getLoyalty = (channel: string, login: string): Loyalty | undefined => cache.get(k(channel, login))

/** Rendert neu, wenn weitere Treue-Daten angekommen sind */
export function useLoyaltyVersion(): number {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => version
  )
}

const DAY = 86400000

/**
 * Einstufung aus allen Quellen. undefined = noch nicht geprüft.
 * Stammgast: ≥ 6 Monate im Chat aktiv, ≥ 6 Sub-Monate, Follow ≥ 1 Jahr oder ≥ 4 Besuche mit Lurk.
 * Wiederkehrend: ≥ 2 aktive Monate, schon mal Sub, Follow ≥ 30 Tage oder 2–3 Besuche.
 */
export function loyaltyTier(channel: string, login: string): LoyaltyTier | undefined {
  const h = getHistory(channel, login)
  const l = getLoyalty(channel, login)
  const visits = h?.v ?? 0
  if (visits >= 4) return 'regular'
  if (!l) return visits >= 2 ? 'returning' : undefined
  const followDays = l.followedAt ? (Date.now() - new Date(l.followedAt).getTime()) / DAY : 0
  if ((l.logMonths ?? 0) >= 6 || (l.subMonths ?? 0) >= 6 || followDays >= 365) return 'regular'
  if ((l.logMonths ?? 0) >= 2 || (l.subMonths ?? 0) >= 1 || followDays >= 30 || visits >= 2) return 'returning'
  return 'new'
}
