export interface UpdateState {
  state: 'idle' | 'checking' | 'none' | 'available' | 'ready' | 'downloading' | 'error'
  version?: string
  percent?: number
  message?: string
}

export interface Bridge {
  platform: string
  fetch: (req: { url: string; method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; body: string }>
  open: (url: string) => Promise<void>
  saveText: (name: string, text: string) => Promise<boolean>
  minimize: () => void
  maximize: () => void
  close: () => void
  pin: (on: boolean) => void
  flash: () => void
  onWindowState: (cb: (s: { maximized: boolean }) => void) => () => void
  version: () => Promise<string>
  checkUpdate: () => Promise<UpdateState>
  installUpdate: () => void
  onUpdate: (cb: (s: UpdateState) => void) => () => void
  onFocus: (cb: (focused: boolean) => void) => () => void
}

declare global {
  interface Window {
    bridge: Bridge
  }
}
