// Rendert build/icon.svg zu build/icon.png (1024×1024, transparent) mit Electron.
// Aufruf: npx electron scripts/render-icon.cjs
const { app, BrowserWindow } = require('electron')
const { readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const svg = readFileSync(join(__dirname, '../build/icon.svg'), 'utf8')
  const win = new BrowserWindow({ width: 1024, height: 1024, show: false, transparent: true, frame: false, useContentSize: true, webPreferences: { offscreen: true } })
  win.webContents.setZoomFactor(1)
  const html = `<html><body style="margin:0;background:transparent">${svg.replace('<svg ', '<svg width="1024" height="1024" ')}</body></html>`
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  await new Promise((r) => setTimeout(r, 400))
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 })
  writeFileSync(join(__dirname, '../build/icon.png'), img.resize({ width: 1024, height: 1024 }).toPNG())
  console.log('build/icon.png', img.getSize())
  app.quit()
})
