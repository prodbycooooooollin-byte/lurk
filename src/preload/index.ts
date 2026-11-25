import { contextBridge, ipcRenderer } from 'electron'

type UpdateState = { state: string; version?: string; percent?: number; message?: string }

const bridge = {
  platform: process.platform,
  fetch: (req: { url: string; method?: string; headers?: Record<string, string>; body?: string }) =>
    ipcRenderer.invoke('net:fetch', req) as Promise<{ ok: boolean; status: number; body: string }>,
  open: (url: string) => ipcRenderer.invoke('shell:open', url),
  saveText: (name: string, text: string) => ipcRenderer.invoke('dialog:saveText', name, text) as Promise<boolean>,
  minimize: () => ipcRenderer.send('win:minimize'),
  maximize: () => ipcRenderer.send('win:maximize'),
  close: () => ipcRenderer.send('win:close'),
  pin: (on: boolean) => ipcRenderer.send('win:pin', on),
  flash: () => ipcRenderer.send('win:flash'),
  onWindowState: (cb: (s: { maximized: boolean }) => void) => {
    const h = (_: unknown, s: { maximized: boolean }): void => cb(s)
    ipcRenderer.on('win:state', h)
    return () => ipcRenderer.removeListener('win:state', h)
  },
  version: () => ipcRenderer.invoke('app:version') as Promise<string>,
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.send('update:install'),
  onUpdate: (cb: (s: UpdateState) => void) => {
    const h = (_: unknown, s: UpdateState): void => cb(s)
    ipcRenderer.on('update:state', h)
    return () => ipcRenderer.removeListener('update:state', h)
  },
  onFocus: (cb: (focused: boolean) => void) => {
    const h = (_: unknown, f: boolean): void => cb(f)
    ipcRenderer.on('win:focus', h)
    return () => ipcRenderer.removeListener('win:focus', h)
  }
}

export type Bridge = typeof bridge
contextBridge.exposeInMainWorld('bridge', bridge)
