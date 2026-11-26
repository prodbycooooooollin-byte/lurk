// Erkennt Links, hinter denen ein Bild (oder kurzes Video) steckt, und liefert die direkte URL.
// imageUrl() geht sofort ohne Netz; für Alben/Galerien/Tenor sagt pageToResolve(), welche Seite
// der Main-Prozess laden muss – resolveMedia() holt dann og:image / og:video aus deren HTML.
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif)(\?.*)?$/i
const VIDEO_EXT = /\.(mp4|webm)(\?.*)?$/i

export const isVideo = (url: string): boolean => VIDEO_EXT.test(url)

function parse(href: string): URL | null {
  try {
    const u = new URL(href)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u : null
  } catch {
    return null
  }
}

export function imageUrl(href: string): string | null {
  const u = parse(href)
  if (!u) return null
  const host = u.hostname.replace(/^www\./, '')
  const path = u.pathname

  // Imgur: i.imgur.com/abc.png direkt, imgur.com/abc → i.imgur.com/abc.jpg (Alben/Galerien: pageToResolve)
  if (host === 'i.imgur.com') {
    if (/\.gifv$/i.test(path)) return `https://i.imgur.com${path.replace(/\.gifv$/i, '.gif')}`
    if (VIDEO_EXT.test(path) || IMAGE_EXT.test(path)) return `https://i.imgur.com${path}`
    return `https://i.imgur.com${path.replace(/\.[a-z0-9]+$/i, '')}.jpg`
  }
  if (host === 'imgur.com' || host === 'm.imgur.com') {
    // alte Form imgur.com/AbC1234 und neue Form imgur.com/lustige-katze-AbC1234
    const m = /^\/(?:[a-z0-9-]+-)?([a-zA-Z0-9]{7})$/.exec(path) ?? /^\/([a-zA-Z0-9]{5,8})$/.exec(path)
    return m ? `https://i.imgur.com/${m[1]}.jpg` : null
  }
  // Giphy: Seite oder media-Link → das GIF selbst
  if (host === 'giphy.com') {
    const m = /^\/gifs\/(?:[\w-]*-)?([a-zA-Z0-9]{10,})$/.exec(path)
    return m ? `https://media.giphy.com/media/${m[1]}/giphy.gif` : null
  }
  if (/^media\d?\.giphy\.com$/.test(host)) {
    const m = /^\/media\/(?:v1\.[^/]+\/)?([a-zA-Z0-9]+)\//.exec(path)
    return m ? `https://media.giphy.com/media/${m[1]}/giphy.gif` : null
  }
  // 7TV-Emote-Seite → Bild
  if (host === '7tv.app') {
    const m = /^\/emotes\/([a-zA-Z0-9]+)/.exec(path)
    return m ? `https://cdn.7tv.app/emote/${m[1]}/2x.webp` : null
  }
  // Gyazo
  if (host === 'i.gyazo.com' && IMAGE_EXT.test(path)) return u.href
  if (host === 'gyazo.com') {
    const m = /^\/([a-f0-9]{32})$/.exec(path)
    return m ? `https://i.gyazo.com/${m[1]}.png` : null
  }
  // alles andere: nur echte Bild-/Videodateien
  return IMAGE_EXT.test(path) || VIDEO_EXT.test(path) ? u.href : null
}

/** Seiten, deren Vorschaubild erst aus dem HTML gelesen werden muss (nur bekannte Hosts) */
export function pageToResolve(href: string): string | null {
  const u = parse(href)
  if (!u) return null
  const host = u.hostname.replace(/^(www|m)\./, '')
  if (host === 'imgur.com' && /^\/(a|gallery|t\/[^/]+)\/[\w-]+$/.test(u.pathname)) return `https://imgur.com${u.pathname}`
  if (host === 'tenor.com' && /^\/(?:[a-z]{2}(?:-[A-Z]{2})?\/)?view\/[\w-]+$/.test(u.pathname)) return `https://tenor.com${u.pathname}`
  return null
}

/** og:video bevorzugt (Imgur-GIFs sind heute mp4), sonst og:image – ohne Imgurs "?fb"-Zuschnitt */
export function extractMedia(html: string): string | null {
  const meta = (prop: string): string | null => {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*>`, 'i')
    const tag = re.exec(html)?.[0]
    return tag ? (/content=["']([^"']+)["']/i.exec(tag)?.[1] ?? null) : null
  }
  const raw = meta('og:video') ?? meta('og:video:url') ?? meta('og:image') ?? meta('twitter:image')
  if (!raw) return null
  const url = raw.replace(/&amp;/g, '&')
  if (!/^https:\/\//i.test(url)) return null
  return /i\.imgur\.com/i.test(url) ? url.replace(/\?fb$/, '').replace(/\?.*$/, '') : url
}

const cache = new Map<string, Promise<string | null>>()

/** Direkte Medien-URL für einen Link – sofort, per Seitenabruf oder null */
export function resolveMedia(href: string): Promise<string | null> {
  const direct = imageUrl(href)
  if (direct) return Promise.resolve(direct)
  const page = pageToResolve(href)
  if (!page) return Promise.resolve(null)
  let p = cache.get(page)
  if (!p) {
    p = window.bridge
      .fetch({ url: page })
      .then((r) => (r.ok ? extractMedia(r.body) : null))
      .catch(() => null)
    cache.set(page, p)
  }
  return p
}

// ---------- Karten für YouTube-Videos und Twitch-Clips ----------
export interface LinkCard {
  kind: 'youtube' | 'clip'
  title: string
  author?: string
  thumb?: string
  /** Clip: Aufrufe */
  views?: number
  /** Clip: Länge in Sekunden */
  duration?: number
  /** Clip: Kanal */
  channel?: string
}

/** YouTube-Video-ID aus watch-, youtu.be- und Shorts-Links */
export function youtubeId(href: string): string | null {
  const u = parse(href)
  if (!u) return null
  const host = u.hostname.replace(/^(www|m)\./, '')
  if (host === 'youtu.be') return /^\/([\w-]{11})/.exec(u.pathname)?.[1] ?? null
  if (host === 'youtube.com' || host === 'music.youtube.com') {
    if (u.pathname === '/watch') return /^[\w-]{11}$/.test(u.searchParams.get('v') ?? '') ? u.searchParams.get('v') : null
    return /^\/(?:shorts|live|embed)\/([\w-]{11})/.exec(u.pathname)?.[1] ?? null
  }
  return null
}

/** Slug eines Twitch-Clips */
export function clipSlug(href: string): string | null {
  const u = parse(href)
  if (!u) return null
  const host = u.hostname.replace(/^(www|m)\./, '')
  if (host === 'clips.twitch.tv') return /^\/([\w-]{10,})$/.exec(u.pathname)?.[1] ?? null
  if (host === 'twitch.tv') return /^\/(?:[a-z0-9_]+\/)?clip\/([\w-]{10,})$/i.exec(u.pathname)?.[1] ?? null
  return null
}

export const isCardLink = (href: string): boolean => !!youtubeId(href) || !!clipSlug(href)

const cardCache = new Map<string, Promise<LinkCard | null>>()

/** Daten für eine Link-Karte; Clips brauchen eine Anmeldung (Twitch-API), sonst null */
export function resolveCard(href: string, helix?: { clientId: string; token: string } | null): Promise<LinkCard | null> {
  const yt = youtubeId(href)
  const slug = clipSlug(href)
  const key = yt ? `yt:${yt}` : slug ? `clip:${slug}` : ''
  if (!key) return Promise.resolve(null)
  let p = cardCache.get(key)
  if (p) return p
  if (yt) {
    p = window.bridge
      .fetch({ url: `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${yt}`)}` })
      .then((r) => {
        if (!r.ok) return null
        const d = JSON.parse(r.body) as { title?: string; author_name?: string }
        return d.title ? { kind: 'youtube' as const, title: d.title, author: d.author_name, thumb: `https://i.ytimg.com/vi/${yt}/mqdefault.jpg` } : null
      })
      .catch(() => null)
  } else {
    if (!helix) return Promise.resolve(null)
    p = window.bridge
      .fetch({ url: `https://api.twitch.tv/helix/clips?id=${encodeURIComponent(slug!)}`, headers: { 'Client-Id': helix.clientId, Authorization: `Bearer ${helix.token}` } })
      .then((r) => {
        if (!r.ok) return null
        const c = (JSON.parse(r.body) as { data?: { title: string; creator_name: string; broadcaster_name: string; thumbnail_url: string; view_count: number; duration: number }[] }).data?.[0]
        return c ? { kind: 'clip' as const, title: c.title, author: c.creator_name, channel: c.broadcaster_name, thumb: c.thumbnail_url, views: c.view_count, duration: c.duration } : null
      })
      .catch(() => null)
  }
  cardCache.set(key, p)
  return p
}
