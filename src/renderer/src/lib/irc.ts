// Twitch IRC (WebSocket) – Parser und Verbindung
export interface IrcMessage {
  raw: string
  tags: Record<string, string>
  prefix: string
  nick: string
  command: string
  params: string[]
  /** Kanal ohne # (falls vorhanden) */
  channel: string
  /** letzter Parameter (Trailing) */
  trailing: string
}

const TAG_ESCAPES: Record<string, string> = { s: ' ', ':': ';', '\\': '\\', r: '\r', n: '\n' }

export function unescapeTag(v: string): string {
  return v.replace(/\\(.?)/g, (_, c: string) => (c in TAG_ESCAPES ? TAG_ESCAPES[c] : c))
}

export function parseIrc(line: string): IrcMessage | null {
  if (!line) return null
  let pos = 0
  const tags: Record<string, string> = {}
  if (line[0] === '@') {
    const end = line.indexOf(' ')
    if (end < 0) return null
    for (const part of line.slice(1, end).split(';')) {
      const eq = part.indexOf('=')
      if (eq < 0) tags[part] = ''
      else tags[part.slice(0, eq)] = unescapeTag(part.slice(eq + 1))
    }
    pos = end + 1
    while (line[pos] === ' ') pos++
  }
  let prefix = ''
  if (line[pos] === ':') {
    const end = line.indexOf(' ', pos)
    if (end < 0) return null
    prefix = line.slice(pos + 1, end)
    pos = end + 1
    while (line[pos] === ' ') pos++
  }
  const params: string[] = []
  let command = ''
  const rest = line.slice(pos)
  const trailIdx = rest.indexOf(' :')
  let head = rest
  let trailing: string | null = null
  if (rest.startsWith(':')) {
    head = ''
    trailing = rest.slice(1)
  } else if (trailIdx >= 0) {
    head = rest.slice(0, trailIdx)
    trailing = rest.slice(trailIdx + 2)
  }
  const parts = head.split(' ').filter(Boolean)
  command = parts.shift() ?? ''
  params.push(...parts)
  if (trailing !== null) params.push(trailing)
  const nick = prefix.includes('!') ? prefix.slice(0, prefix.indexOf('!')) : prefix
  const chanParam = params.find((p) => p.startsWith('#')) ?? ''
  return {
    raw: line,
    tags,
    prefix,
    nick,
    command,
    params,
    channel: chanParam.slice(1).toLowerCase(),
    trailing: params.length ? params[params.length - 1] : ''
  }
}

export type ConnState = 'disconnected' | 'connecting' | 'connected'

export interface IrcAuth {
  login: string
  token: string
}

/**
 * Eine Verbindung für alle Kanäle. Liest anonym (justinfan) oder angemeldet.
 * Fordert die Membership-Capability an – damit kommen JOIN/PART und die NAMES-Liste,
 * also auch Zuschauer, die nichts schreiben.
 */
export class TwitchIrc {
  private ws: WebSocket | null = null
  private channels = new Set<string>()
  private auth: IrcAuth | null = null
  private retry = 0
  private pingTimer: number | undefined
  private lastPong = Date.now()
  private closedByUser = false
  private queue: string[] = []
  private sendTimes: number[] = []

  constructor(
    private onMessage: (m: IrcMessage) => void,
    private onState: (s: ConnState, info?: string) => void
  ) {}

  setAuth(auth: IrcAuth | null): void {
    const changed = auth?.token !== this.auth?.token || auth?.login !== this.auth?.login
    this.auth = auth
    if (changed && this.ws) this.reconnect()
  }

  get loggedIn(): boolean {
    return !!this.auth
  }

  connect(): void {
    this.closedByUser = false
    this.onState('connecting')
    const ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443')
    this.ws = ws
    ws.onopen = () => {
      this.retry = 0
      ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands twitch.tv/membership')
      if (this.auth) {
        ws.send(`PASS oauth:${this.auth.token}`)
        ws.send(`NICK ${this.auth.login}`)
      } else {
        ws.send(`NICK justinfan${Math.floor(10000 + Math.random() * 80000)}`)
      }
      this.joinMany([...this.channels])
      this.lastPong = Date.now()
      window.clearInterval(this.pingTimer)
      this.pingTimer = window.setInterval(() => {
        if (Date.now() - this.lastPong > 75_000) {
          this.reconnect()
          return
        }
        this.raw('PING :lurk')
      }, 30_000)
    }
    ws.onmessage = (ev) => {
      const data = String(ev.data)
      for (const line of data.split('\r\n')) {
        if (!line) continue
        const m = parseIrc(line)
        if (!m) continue
        if (m.command === 'PING') {
          this.raw(`PONG :${m.trailing}`)
          continue
        }
        if (m.command === 'PONG') {
          this.lastPong = Date.now()
          continue
        }
        if (m.command === '001') this.onState('connected')
        if (m.command === 'RECONNECT') {
          this.reconnect()
          continue
        }
        if (m.command === 'NOTICE' && /authentication failed|improperly formatted auth/i.test(m.trailing)) {
          this.onState('disconnected', 'auth-failed')
        }
        this.onMessage(m)
      }
    }
    ws.onclose = () => {
      window.clearInterval(this.pingTimer)
      if (this.ws !== ws) return
      this.ws = null
      this.onState('disconnected')
      if (this.closedByUser) return
      const delay = Math.min(30_000, 1000 * 2 ** this.retry++) + Math.random() * 500
      window.setTimeout(() => {
        if (!this.ws && !this.closedByUser) this.connect()
      }, delay)
    }
  }

  reconnect(): void {
    const old = this.ws
    this.ws = null
    if (old) {
      old.onclose = null
      old.close()
    }
    window.clearInterval(this.pingTimer)
    this.connect()
  }

  disconnect(): void {
    this.closedByUser = true
    this.ws?.close()
  }

  private raw(line: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(line)
  }

  private joinMany(list: string[]): void {
    // Twitch erlaubt ~20 JOINs pro 10 s – in Paketen senden
    for (let i = 0; i < list.length; i += 10) {
      const chunk = list.slice(i, i + 10)
      window.setTimeout(() => this.raw(`JOIN ${chunk.map((c) => '#' + c).join(',')}`), (i / 10) * 1100)
    }
  }

  join(channel: string): void {
    const c = channel.toLowerCase()
    if (this.channels.has(c)) return
    this.channels.add(c)
    this.raw(`JOIN #${c}`)
  }

  part(channel: string): void {
    const c = channel.toLowerCase()
    this.channels.delete(c)
    this.raw(`PART #${c}`)
  }

  /** Nachricht senden (mit einfachem Rate-Limit: 20 / 30 s) */
  say(channel: string, text: string, replyTo?: string): boolean {
    if (!this.auth || this.ws?.readyState !== WebSocket.OPEN) return false
    const now = Date.now()
    this.sendTimes = this.sendTimes.filter((t) => now - t < 30_000)
    if (this.sendTimes.length >= 19) return false
    this.sendTimes.push(now)
    const tag = replyTo ? `@reply-parent-msg-id=${replyTo} ` : ''
    this.raw(`${tag}PRIVMSG #${channel} :${text.replace(/[\r\n]+/g, ' ')}`)
    return true
  }

  get pending(): number {
    return this.queue.length
  }
}
