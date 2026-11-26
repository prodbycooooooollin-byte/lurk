import { app, BrowserWindow, ipcMain, shell, dialog, nativeTheme, screen } from 'electron'
import { join } from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import electronUpdater from 'electron-updater'

const { autoUpdater } = electronUpdater

interface Bounds { x?: number; y?: number; width: number; height: number; maximized?: boolean }

const boundsFile = (): string => join(app.getPath('userData'), 'window.json')

function loadBounds(): Bounds {
  try {
    const b = JSON.parse(readFileSync(boundsFile(), 'utf8')) as Bounds
    const visible = screen.getAllDisplays().some((d) => {
      const a = d.workArea
      return b.x !== undefined && b.y !== undefined && b.x < a.x + a.width && b.x + b.width > a.x && b.y < a.y + a.height && b.y > a.y - 20
    })
    return visible ? b : { width: b.width, height: b.height, maximized: b.maximized }
  } catch {
    return { width: 1320, height: 840 }
  }
}

function saveBounds(win: BrowserWindow): void {
  try {
    const b = win.getNormalBounds()
    writeFileSync(boundsFile(), JSON.stringify({ ...b, maximized: win.isMaximized() }))
  } catch {
    /* nicht kritisch */
  }
}

let win: BrowserWindow | null = null

function createWindow(): void {
  const b = loadBounds()
  win = new BrowserWindow({
    ...b,
    minWidth: 760,
    minHeight: 480,
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 14, y: 13 } } : { frame: false }),
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0a0a0b' : '#ffffff',
    title: 'Lurk',
    icon: join(__dirname, '../../build/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true
    }
  })
  if (b.maximized) win.maximize()
  win.once('ready-to-show', () => win?.show())
  win.on('close', () => win && saveBounds(win))
  const sendState = (): void => win?.webContents.send('win:state', { maximized: win.isMaximized() })
  win.on('maximize', sendState)
  win.on('unmaximize', sendState)
  win.on('focus', () => win?.webContents.send('win:focus', true))
  win.on('blur', () => win?.webContents.send('win:focus', false))

  // Links immer im Standardbrowser öffnen, nie in der App
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('http://localhost') && !url.startsWith('file://')) {
      e.preventDefault()
      if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    }
  })

  // Nur für Performance-Tests: LURK_FPS_PROBE=1 misst nach dem Start die Bildrate und beendet die App.
  if (process.env['LURK_FPS_PROBE']) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        const js = `new Promise(res=>{const d=document.createElement('div');d.style.cssText='position:fixed;left:0;bottom:0;width:8px;height:8px;background:red;z-index:9999';document.body.appendChild(d);let n=0,x=0;const s=performance.now();function f(t){n++;x=(x+2)%300;d.style.transform='translateX('+x+'px)'; if(t-s<3000) requestAnimationFrame(f); else {d.remove();res(Math.round(n/3))}} requestAnimationFrame(f)})`
        const fps = await win?.webContents.executeJavaScript(js)
        console.log('LURK_FPS', fps)
        app.quit()
      }, 4000)
    })
  }

  if (process.env['ELECTRON_RENDERER_URL']) void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

// Erlaubte Hosts für Netzwerkzugriffe aus dem Renderer (umgeht CORS sauber über den Main-Prozess)
const ALLOWED_HOSTS = [
  'api.twitch.tv', 'id.twitch.tv', 'api.ivr.fi', '7tv.io', 'api.betterttv.net',
  'api.frankerfacez.com', 'recent-messages.robotty.de', 'logs.ivr.fi',
  // nur für Bild-Vorschauen von Alben/Galerien (og:image aus dem HTML)
  'imgur.com', 'tenor.com',
  // vollständige Badge-Listen beliebiger Accounts (Twitch selbst zeigt nur das ausgewählte)
  'www.badgehq.xyz',
  // Titel und Vorschaubild für YouTube-Links (oEmbed)
  'www.youtube.com'
]

interface NetRequest { url: string; method?: string; headers?: Record<string, string>; body?: string }
interface NetResponse { ok: boolean; status: number; body: string }

ipcMain.handle('net:fetch', async (_e, req: NetRequest): Promise<NetResponse> => {
  const u = new URL(req.url)
  if (u.protocol !== 'https:' || !ALLOWED_HOSTS.includes(u.hostname)) {
    return { ok: false, status: 0, body: 'Host not allowed' }
  }
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 15000)
    const res = await fetch(req.url, {
      method: req.method ?? 'GET',
      headers: { 'User-Agent': 'Lurk/1.0', ...(req.headers ?? {}) },
      body: req.body,
      signal: ctrl.signal
    })
    clearTimeout(t)
    return { ok: res.ok, status: res.status, body: await res.text() }
  } catch (err) {
    return { ok: false, status: 0, body: String(err) }
  }
})

// ---------- Stream-Player in eigenem Fenster ----------
const players = new Map<string, BrowserWindow>()
ipcMain.on('player:open', (_e, channel: string) => {
  if (!/^[a-z0-9_]{2,25}$/.test(channel)) return
  const existing = players.get(channel)
  if (existing && !existing.isDestroyed()) return existing.focus()
  const p = new BrowserWindow({
    width: 960,
    height: 560,
    minWidth: 320,
    minHeight: 180,
    title: `${channel} · Lurk`,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    icon: join(__dirname, '../../build/icon.png'),
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
  })
  p.setMenuBarVisibility(false)
  p.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  p.on('page-title-updated', (e) => e.preventDefault())
  p.on('closed', () => players.delete(channel))
  players.set(channel, p)
  void p.loadURL(`https://player.twitch.tv/?channel=${channel}&parent=localhost&autoplay=true&muted=false`)
})
ipcMain.on('player:pin', (_e, channel: string, on: boolean) => players.get(channel)?.setAlwaysOnTop(on, 'floating'))

ipcMain.on('win:minimize', () => win?.minimize())
ipcMain.on('win:maximize', () => (win?.isMaximized() ? win.unmaximize() : win?.maximize()))
ipcMain.on('win:close', () => win?.close())
ipcMain.on('win:pin', (_e, on: boolean) => win?.setAlwaysOnTop(on, 'floating'))
ipcMain.on('win:flash', () => {
  if (win && !win.isFocused()) win.flashFrame(true)
})
ipcMain.handle('shell:open', (_e, url: string) => {
  if (/^https:\/\//.test(url)) return shell.openExternal(url)
  return undefined
})
ipcMain.handle('dialog:saveText', async (_e, name: string, text: string) => {
  if (!win) return false
  const r = await dialog.showSaveDialog(win, {
    defaultPath: name,
    filters: [{ name: 'Text', extensions: ['txt'] }]
  })
  if (r.canceled || !r.filePath) return false
  await writeFile(r.filePath, text, 'utf8')
  return true
})

// ---------- Auto-Updater (GitHub Releases) ----------
type UpdateState =
  | { state: 'idle' | 'checking' | 'none' }
  | { state: 'available' | 'ready'; version: string }
  | { state: 'downloading'; percent: number }
  | { state: 'error'; message: string }

function sendUpdate(s: UpdateState): void {
  win?.webContents.send('update:state', s)
}

function setupUpdater(): void {
  if (!app.isPackaged) return
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('checking-for-update', () => sendUpdate({ state: 'checking' }))
  autoUpdater.on('update-not-available', () => sendUpdate({ state: 'none' }))
  autoUpdater.on('update-available', (i) => sendUpdate({ state: 'available', version: i.version }))
  autoUpdater.on('download-progress', (p) => sendUpdate({ state: 'downloading', percent: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', (i) => sendUpdate({ state: 'ready', version: i.version }))
  autoUpdater.on('error', (e) => {
    console.error('[updater]', e)
    sendUpdate({ state: 'error', message: String(e?.message ?? e) })
  })
  const check = (): void => void autoUpdater.checkForUpdates().catch((e) => console.error('[updater] check failed', e))
  setTimeout(check, 4000)
  setInterval(check, 1000 * 60 * 60 * 2)
}

ipcMain.handle('update:check', async () => {
  if (!app.isPackaged) return { state: 'error', message: 'dev' }
  try {
    await autoUpdater.checkForUpdates()
  } catch (e) {
    return { state: 'error', message: String(e) }
  }
  return { state: 'checking' }
})
ipcMain.on('update:install', () => autoUpdater.quitAndInstall())
ipcMain.handle('app:version', () => app.getVersion())

app.whenReady().then(() => {
  app.setAppUserModelId('app.lurk.desktop')
  createWindow()
  setupUpdater()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
