// Nur für die Vorschau im normalen Browser (ohne Electron): ersetzt window.bridge
// durch eine einfache Variante mit fetch, damit die Oberfläche auch dort läuft.
import type { Bridge } from '../../../preload/index.d'

export function installBrowserShim(): void {
  if (typeof window === 'undefined' || window.bridge) return
  const noop = (): void => undefined
  const off = (): (() => void) => noop
  const bridge: Bridge = {
    platform: 'browser',
    fetch: async (req) => {
      try {
        const r = await fetch(req.url, { method: req.method ?? 'GET', headers: req.headers, body: req.body })
        return { ok: r.ok, status: r.status, body: await r.text() }
      } catch (e) {
        return { ok: false, status: 0, body: String(e) }
      }
    },
    open: async (url) => void window.open(url, '_blank'),
    saveText: async (name, text) => {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
      a.download = name
      a.click()
      return true
    },
    minimize: noop,
    maximize: noop,
    close: noop,
    pin: noop,
    flash: noop,
    openPlayer: (c) => void window.open(`https://player.twitch.tv/?channel=${c}&parent=localhost`, '_blank', 'width=960,height=560'),
    onWindowState: off,
    version: async () => 'dev',
    checkUpdate: async () => ({ state: 'error', message: 'dev' }),
    installUpdate: noop,
    onUpdate: off,
    onFocus: (cb) => {
      const f = (): void => cb(true)
      const b = (): void => cb(false)
      window.addEventListener('focus', f)
      window.addEventListener('blur', b)
      return () => {
        window.removeEventListener('focus', f)
        window.removeEventListener('blur', b)
      }
    }
  }
  window.bridge = bridge
}
