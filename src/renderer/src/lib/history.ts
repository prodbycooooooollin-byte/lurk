// Lurker-Verlauf über Sitzungen hinweg (IndexedDB): pro Kanal und Person, wie oft und wie lange
// jemand da war. So sieht man "Stammzuschauer, die nie schreiben" – das kann sonst kein Chat-Client.
import { useChat } from '@/store/chat'

export interface HistoryEntry {
  /** Anzahl Besuche (neuer Besuch nach > 45 Min. Abwesenheit) */
  v: number
  /** zuerst gesehen */
  f: number
  /** zuletzt gesehen */
  l: number
  /** gesamte Anwesenheit in Minuten */
  m: number
  /** Nachrichten gesamt */
  c: number
}

type ChannelHistory = Record<string, HistoryEntry>

const TICK = 60_000
const NEW_VISIT_GAP = 45 * 60_000
const MAX_PER_CHANNEL = 25_000

const mem = new Map<string, ChannelHistory>()
const loaded = new Set<string>()
const dirty = new Set<string>()
const msgCounts = new Map<string, Map<string, number>>()
let dbp: Promise<IDBDatabase> | null = null
let started = false

function db(): Promise<IDBDatabase> {
  dbp ??= new Promise((resolve, reject) => {
    const r = indexedDB.open('lurk', 1)
    r.onupgradeneeded = () => r.result.createObjectStore('history')
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
  return dbp
}

async function load(channel: string): Promise<void> {
  if (loaded.has(channel)) return
  loaded.add(channel)
  try {
    const d = await db()
    const data = await new Promise<ChannelHistory | undefined>((res) => {
      const q = d.transaction('history').objectStore('history').get(channel)
      q.onsuccess = () => res(q.result as ChannelHistory | undefined)
      q.onerror = () => res(undefined)
    })
    // Einträge aus dieser Sitzung (vor dem Laden) behalten
    mem.set(channel, { ...(data ?? {}), ...(mem.get(channel) ?? {}) })
  } catch {
    /* ohne Verlauf weiter */
  }
}

async function save(): Promise<void> {
  if (!dirty.size) return
  try {
    const d = await db()
    const tx = d.transaction('history', 'readwrite')
    const store = tx.objectStore('history')
    for (const c of dirty) {
      let h = mem.get(c)
      if (!h) continue
      const keys = Object.keys(h)
      if (keys.length > MAX_PER_CHANNEL) {
        // die am längsten nicht Gesehenen zuerst verwerfen
        keys.sort((a, b) => h![b].l - h![a].l)
        h = Object.fromEntries(keys.slice(0, MAX_PER_CHANNEL).map((k) => [k, h![k]]))
        mem.set(c, h)
      }
      store.put(h, c)
    }
    dirty.clear()
  } catch {
    /* nächster Versuch beim nächsten Tick */
  }
}

/** Eine Nachricht zählen (für "schreibt nie" vs. "schreibt manchmal") */
export function countMessage(channel: string, login: string): void {
  let m = msgCounts.get(channel)
  if (!m) msgCounts.set(channel, (m = new Map()))
  m.set(login, (m.get(login) ?? 0) + 1)
}

function tick(): void {
  const now = Date.now()
  const channels = useChat.getState().channels
  for (const [c, ch] of Object.entries(channels)) {
    if (!ch.joined) continue
    void load(c)
    let h = mem.get(c)
    if (!h) mem.set(c, (h = {}))
    const counts = msgCounts.get(c)
    for (const p of Object.values(ch.presence)) {
      if (!p.present) continue
      const e = h[p.login]
      if (!e) h[p.login] = { v: 1, f: now, l: now, m: 1, c: counts?.get(p.login) ?? 0 }
      else {
        if (now - e.l > NEW_VISIT_GAP) e.v++
        e.l = now
        e.m++
        e.c += counts?.get(p.login) ?? 0
      }
    }
    counts?.clear()
    dirty.add(c)
  }
  void save()
}

/** Startet die minütliche Erfassung (einmalig) */
export function startHistory(): void {
  if (started) return
  started = true
  window.setInterval(tick, TICK)
  window.addEventListener('beforeunload', () => {
    tick()
  })
}

export function ensureHistory(channel: string): void {
  void load(channel)
}

export function getHistory(channel: string, login: string): HistoryEntry | undefined {
  return mem.get(channel)?.[login.toLowerCase()]
}

/** Stammgast: mindestens 4 Besuche */
export const isRegular = (e?: HistoryEntry): boolean => !!e && e.v >= 4
