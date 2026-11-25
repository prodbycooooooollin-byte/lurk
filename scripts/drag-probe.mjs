// Prüft das Verschieben der Infocard in der echten App: Karte öffnen, ziehen, Position messen.
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import electron from 'electron'

const port = 9341
const app = spawn(electron, ['.', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'lurk-drag-'))}`], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let page
for (let i = 0; i < 60 && !page; i++) {
  await sleep(500)
  try {
    page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page')
  } catch {}
}
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r))
let id = 0
const p = new Map()
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.id && p.has(m.id)) (p.get(m.id)(m), p.delete(m.id))
})
const send = (method, params = {}) => new Promise((r) => { const i = ++id; p.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
const ev = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value

await sleep(2500)
// zwei Kanäle laden, dann eine Karte über einen Namen im Chat öffnen
await ev(`localStorage.setItem('lurk-ui', JSON.stringify({state:{channels:['papaplatte'],splits:['papaplatte'],focused:0,panelOpen:true,panelTab:'presence',railCollapsed:true},version:2})); location.reload(); 1`)
await sleep(9000)
const opened = await ev(`(()=>{ const b=[...document.querySelectorAll('.chat-line button.font-semibold')].filter(x=>x.textContent.trim()).at(-2); if(!b) return 'no names'; b.click(); return b.textContent })()`)
await sleep(1500)
const box = await ev(`(()=>{ const f=[...document.querySelectorAll('div.fixed.z-50')].find(d=>d.querySelector('[class*="rounded-[14px]"]')); const b=f.querySelector('.cursor-grab').getBoundingClientRect(); const r=f.getBoundingClientRect(); return {x:b.left+80,y:b.top+30,left:r.left,top:r.top} })()`)
// echte Mausbewegung über CDP
const mouse = (type, x, y) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 })
await mouse('mousePressed', box.x, box.y)
for (let i = 1; i <= 20; i++) {
  await mouse('mouseMoved', box.x + i * 10, box.y + i * 8)
  await sleep(16)
}
await mouse('mouseReleased', box.x + 200, box.y + 160)
await sleep(300)
const after = await ev(`(()=>{ const f=[...document.querySelectorAll('div.fixed.z-50')].find(d=>d.querySelector('[class*="rounded-[14px]"]')); if(!f) return null; const r=f.getBoundingClientRect(); return {left:r.left,top:r.top} })()`)
console.log('card for', opened, 'before', Math.round(box.left), Math.round(box.top), 'after', after && Math.round(after.left), after && Math.round(after.top))
ws.close()
app.kill()
process.exit(0)
