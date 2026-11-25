import { create } from 'zustand'
import { persist } from 'zustand/middleware'

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
