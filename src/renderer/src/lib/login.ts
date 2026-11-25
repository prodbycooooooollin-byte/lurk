// Ein-Klick-Anmeldung mit Twitch (Device-Code-Flow) für Stellen außerhalb der Einstellungen.
import { toast } from 'sonner'
import { pollDeviceToken, startDeviceFlow } from './api'
import { applyAuth } from './client'
import { t } from './i18n'
import { BUILT_IN_CLIENT_ID, useAuth } from '@/store/auth'
import { useUi } from '@/store/ui'

let running = false

/**
 * Startet die Anmeldung direkt: öffnet die Twitch-Seite (Code ist dort schon eingetragen)
 * und wartet im Hintergrund. Ohne eingebaute Client-ID geht es in die Einstellungen.
 */
export async function signInWithTwitch(): Promise<void> {
  if (!BUILT_IN_CLIENT_ID) {
    useUi.getState().set({ settingsOpen: true, settingsTab: 'account' })
    return
  }
  if (running) return
  running = true
  const id = toast.loading(t('signInStarting'))
  try {
    const dc = await startDeviceFlow(BUILT_IN_CLIENT_ID)
    if (!dc) {
      toast.error(t('clientRejected'), { id })
      return
    }
    useAuth.getState().set({ clientId: BUILT_IN_CLIENT_ID })
    void window.bridge.open(dc.verification_uri)
    toast.loading(t('signInConfirm', { code: dc.user_code }), {
      id,
      action: { label: t('openPage'), onClick: () => void window.bridge.open(dc.verification_uri) }
    })
    const until = Date.now() + dc.expires_in * 1000
    while (Date.now() < until) {
      await new Promise((r) => setTimeout(r, Math.max(2, dc.interval) * 1000))
      const r = await pollDeviceToken(BUILT_IN_CLIENT_ID, dc.device_code)
      if (r === 'pending') continue
      if (r === 'failed') {
        toast.error(t('loginAborted'), { id })
        return
      }
      useAuth.getState().set({ token: r.access_token, refresh: r.refresh_token ?? '' })
      await applyAuth()
      toast.success(t('signedInToast', { n: useAuth.getState().login }), { id })
      return
    }
    toast.error(t('loginAborted'), { id })
  } finally {
    running = false
  }
}
