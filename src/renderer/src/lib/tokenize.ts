import { findEmote, twitchEmoteUrl, type Emote } from './emotes'
import type { TwitchEmoteRef } from './types'

export type Token =
  | { t: 'text'; v: string }
  | { t: 'emote'; e: Emote; overlays: Emote[] }
  | { t: 'mention'; v: string; login: string }
  | { t: 'link'; v: string; href: string }

export function parseEmoteTag(tag: string | undefined): TwitchEmoteRef[] {
  if (!tag) return []
  const out: TwitchEmoteRef[] = []
  for (const group of tag.split('/')) {
    const [id, ranges] = group.split(':')
    if (!id || !ranges) continue
    for (const r of ranges.split(',')) {
      const [s, e] = r.split('-').map(Number)
      if (Number.isFinite(s) && Number.isFinite(e)) out.push({ id, start: s, end: e })
    }
  }
  return out.sort((a, b) => a.start - b.start)
}

const LINK = /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/[^\s]*)?$/i

/**
 * Zerlegt eine Nachricht in Text, Emotes (Twitch + 7TV/BTTV/FFZ inkl. Zero-Width),
 * Erwähnungen und Links.
 */
export function tokenize(text: string, twitchEmotes: TwitchEmoteRef[], roomId: string | undefined, enableThirdParty = true): Token[] {
  // Twitch-Emote-Positionen sind Codepoint-Indizes
  const cps = Array.from(text)
  const pieces: ({ kind: 'text'; v: string } | { kind: 'temote'; id: string; name: string })[] = []
  let cursor = 0
  for (const em of twitchEmotes) {
    if (em.start < cursor || em.end >= cps.length) continue
    if (em.start > cursor) pieces.push({ kind: 'text', v: cps.slice(cursor, em.start).join('') })
    pieces.push({ kind: 'temote', id: em.id, name: cps.slice(em.start, em.end + 1).join('') })
    cursor = em.end + 1
  }
  if (cursor < cps.length) pieces.push({ kind: 'text', v: cps.slice(cursor).join('') })

  const out: Token[] = []
  const pushText = (v: string): void => {
    const last = out[out.length - 1]
    if (last && last.t === 'text') last.v += v
    else out.push({ t: 'text', v })
  }
  const lastEmote = (): Extract<Token, { t: 'emote' }> | null => {
    // letzter Token, Leerzeichen dazwischen ignorieren
    for (let i = out.length - 1; i >= 0; i--) {
      const tk = out[i]
      if (tk.t === 'text' && tk.v.trim() === '') continue
      if (tk.t === 'emote') {
        out.length = i + 1
        return tk
      }
      return null
    }
    return null
  }

  for (const p of pieces) {
    if (p.kind === 'temote') {
      out.push({ t: 'emote', e: { name: p.name, url: twitchEmoteUrl(p.id), url4x: twitchEmoteUrl(p.id, '3.0'), source: 'twitch', scope: 'global' }, overlays: [] })
      continue
    }
    const words = p.v.split(/(\s+)/)
    for (const w of words) {
      if (!w) continue
      if (/^\s+$/.test(w)) {
        pushText(w)
        continue
      }
      const em = enableThirdParty ? findEmote(roomId, w) : undefined
      if (em) {
        if (em.zeroWidth) {
          const base = lastEmote()
          if (base) {
            base.overlays.push(em)
            continue
          }
        }
        out.push({ t: 'emote', e: em, overlays: [] })
        continue
      }
      const mention = /^@([a-z0-9_]{2,25})([,.!?:]*)$/i.exec(w)
      if (mention) {
        out.push({ t: 'mention', v: '@' + mention[1], login: mention[1].toLowerCase() })
        if (mention[2]) pushText(mention[2])
        continue
      }
      if (LINK.test(w) && /[a-z]/i.test(w.split('.').pop() ?? '') && (w.startsWith('http') || w.includes('/') || /\.(com|de|tv|gg|net|org|io|be|me|app|co|ly)$/i.test(w))) {
        out.push({ t: 'link', v: w, href: w.startsWith('http') ? w : 'https://' + w })
        continue
      }
      pushText(w)
    }
  }
  return out
}
