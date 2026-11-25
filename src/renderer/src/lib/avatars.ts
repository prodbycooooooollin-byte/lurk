// Profilbilder (und Kontoalter) für beliebige Logins: gesammelt angefragt (40 pro Aufruf über IVR),
// im Speicher gehalten und an Komponenten verteilt. Angefragt wird nur, was gerade sichtbar ist.
import { useEffect, useSyncExternalStore } from 'react'
import { ivrUsers } from './api'

export interface UserMeta {
  logo?: string
  createdAt?: string
  displayName?: string
}

const cache = new Map<string, UserMeta | null>()
const queue = new Set<string>()
/** gerade unterwegs */
const pending = new Set<string>()
const listeners = new Set<() => void>()
let version = 0
let timer: number | undefined
let inflight = 0

function notify(): void {
  version++
  for (const l of listeners) l()
}

async function flush(): Promise<void> {
  timer = undefined
  if (inflight >= 2) {
    timer = window.setTimeout(() => void flush(), 400)
    return
  }
  const batch = [...queue].slice(0, 40)
  if (!batch.length) return
  for (const l of batch) {
    queue.delete(l)
    pending.add(l)
  }
  inflight++
  try {
    const users = await ivrUsers(batch)
    const found = new Set<string>()
    for (const u of users ?? []) {
      const login = u.login.toLowerCase()
      found.add(login)
      cache.set(login, { logo: u.logo, createdAt: u.createdAt, displayName: u.displayName })
    }
    // nicht gefunden (umbenannt/gesperrt): nicht ständig neu fragen
    if (users) {
      for (const l of batch) if (!found.has(l)) cache.set(l, null)
    }
    // bei Fehler nichts eintragen, damit später erneut gefragt wird
    notify()
  } finally {
    inflight--
    for (const l of batch) pending.delete(l)
  }
  if (queue.size) timer = window.setTimeout(() => void flush(), 150)
}

/** Login vormerken; liefert sofort, was schon bekannt ist */
export function requestMeta(login: string): UserMeta | null | undefined {
  const l = login.toLowerCase()
  if (cache.has(l)) return cache.get(l)
  if (queue.has(l) || pending.has(l)) return undefined
  queue.add(l)
  if (timer === undefined) timer = window.setTimeout(() => void flush(), 120)
  return undefined
}

/** Von außen bekannte Daten eintragen (z. B. aus der Infocard) */
export function primeMeta(login: string, meta: UserMeta): void {
  cache.set(login.toLowerCase(), meta)
  notify()
}

export function getMeta(login: string): UserMeta | null | undefined {
  return cache.get(login.toLowerCase())
}

const subscribe = (l: () => void): (() => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** Metadaten zu einem Login (lädt bei Bedarf nach) */
export function useUserMeta(login: string | undefined): UserMeta | null | undefined {
  useSyncExternalStore(subscribe, () => version)
  useEffect(() => {
    if (login) requestMeta(login)
  }, [login])
  return login ? cache.get(login.toLowerCase()) : undefined
}

/** Konto jünger als 30 Tage? */
export function isNewAccount(createdAt?: string): boolean {
  return !!createdAt && Date.now() - new Date(createdAt).getTime() < 30 * 86400000
}
