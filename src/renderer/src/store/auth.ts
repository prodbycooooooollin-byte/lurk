import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** Eingebaute Client-ID: damit reicht ein Klick auf "Mit Twitch anmelden". */
export const BUILT_IN_CLIENT_ID = (import.meta.env.VITE_TWITCH_CLIENT_ID ?? '').trim()

interface AuthState {
  clientId: string
  token: string
  refresh: string
  login: string
  userId: string
  scopes: string[]
  set: (p: Partial<Omit<AuthState, 'set' | 'logout'>>) => void
  logout: () => void
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      clientId: '',
      token: '',
      refresh: '',
      login: '',
      userId: '',
      scopes: [],
      set: (p) => set(p),
      logout: () => set({ token: '', refresh: '', login: '', userId: '', scopes: [] })
    }),
    { name: 'lurk-auth', version: 1 }
  )
)

export const helixCtx = (): { clientId: string; token: string; userId: string } | null => {
  const a = useAuth.getState()
  return a.token && a.clientId && a.userId ? { clientId: a.clientId, token: a.token, userId: a.userId } : null
}
