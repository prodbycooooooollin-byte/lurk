// Namen, die sich als der Kanal ausgeben (für das Mod-Radar). Ohne App-Abhängigkeiten, damit testbar.

/** Gleiche Zeichen, die Betrüger austauschen: 0→o, 1→l, 3→e … */
const confusable = (s: string): string => s.replace(/0/g, 'o').replace(/[1|i]/g, 'l').replace(/3/g, 'e').replace(/5/g, 's').replace(/[_-]/g, '')

// Ziffern nur hinter einer Nachsilbe ("xqc_official2"), sonst wären Fans wie "xqc123" verdächtig
const AFFIX = /^(real|the|official|its)?(.+?)(?:(official|real|tv|live|mods?|support|team|giveaways?|gifts?)\d*)?$/

/** Name gibt sich als der Kanal aus: "xqc_official", "x0c", "realxqc" … (Vor-/Nachsilben vor dem Zeichentausch abtrennen) */
export function lookalikeOf(login: string, channel: string): string | null {
  if (login === channel) return null
  const core = AFFIX.exec(login.replace(/[_-]/g, ''))?.[2] ?? login
  return confusable(core) === confusable(channel) ? channel : null
}
