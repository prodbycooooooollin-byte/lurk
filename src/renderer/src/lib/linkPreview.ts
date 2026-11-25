// Erkennt Links, hinter denen ein Bild steckt, und liefert die direkte Bild-URL.
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif)(\?.*)?$/i

export function imageUrl(href: string): string | null {
  let u: URL
  try {
    u = new URL(href)
  } catch {
    return null
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  const host = u.hostname.replace(/^www\./, '')
  const path = u.pathname

  // Imgur: i.imgur.com/abc.png direkt, imgur.com/abc → i.imgur.com/abc.jpg (keine Alben/Galerien)
  if (host === 'i.imgur.com') {
    if (/\.gifv$/i.test(path)) return `https://i.imgur.com${path.replace(/\.gifv$/i, '.gif')}`
    return IMAGE_EXT.test(path) ? `https://i.imgur.com${path}` : `https://i.imgur.com${path}.jpg`
  }
  if (host === 'imgur.com') {
    const m = /^\/([a-zA-Z0-9]{5,8})$/.exec(path)
    return m ? `https://i.imgur.com/${m[1]}.jpg` : null
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
  // alles andere: nur echte Bilddateien
  return IMAGE_EXT.test(path) ? u.href : null
}
