// Startet die gebaute App mit Debug-Port, öffnet zwei große Kanäle und misst FPS + CPU-Profil.
// Aufruf: node scripts/perf-probe.mjs <kanal1> <kanal2> [sekunden]
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import electron from 'electron'

const [c1 = 'auronplay', c2 = 'papaplatte', secs = '10'] = process.argv.slice(2)
const port = 9333
const profileDir = mkdtempSync(join(tmpdir(), 'lurk-perf-'))
const app = spawn(electron, ['.', `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let target
for (let i = 0; i < 60 && !target; i++) {
  await sleep(500)
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
    target = list.find((t) => t.type === 'page' && !t.url.startsWith('devtools'))
  } catch {}
}
if (!target) throw new Error('no target')
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r))
let id = 0
const pending = new Map()
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m)
    pending.delete(m.id)
  }
})
const send = (method, params = {}) => new Promise((r) => {
  const i = ++id
  pending.set(i, r)
  ws.send(JSON.stringify({ id: i, method, params }))
})
const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value

await sleep(1500)
await evaluate(`localStorage.setItem('lurk-ui', JSON.stringify({state:{channels:['${c1}','${c2}'],splits:['${c1}','${c2}'],focused:0,panelOpen:true,panelTab:'presence',railCollapsed:true},version:2})); localStorage.setItem('lurk-fps','1'); location.reload(); 1`)
await sleep(12000)
const inApp = []
for (let i = 0; i < 6; i++) { await sleep(1000); inApp.push(await evaluate(`[...document.querySelectorAll('div.font-mono')].map(d=>d.textContent).join('')`)) }
console.log('in-app meter:', inApp.join(' | '))

await send('Profiler.enable')
await send('Profiler.setSamplingInterval', { interval: 200 })
await send('Profiler.start')
const ms = Number(secs) * 1000
const stats = await evaluate(`new Promise((resolve)=>{
  const frames=[]; const longs=[]; let last=performance.now(); const start=last;
  const po=new PerformanceObserver(l=>{for(const e of l.getEntries()) longs.push(Math.round(e.duration))}); po.observe({type:'longtask'});
  function f(t){frames.push(t-last); last=t; if(t-start<${ms}) requestAnimationFrame(f); else {po.disconnect();
    const fr=frames.slice(1); const s=[...fr].sort((a,b)=>a-b);
    resolve({fps:Math.round(fr.length/${secs}), p50:+s[Math.floor(s.length*.5)].toFixed(1), p95:+s[Math.floor(s.length*.95)].toFixed(1), p99:+s[Math.floor(s.length*.99)].toFixed(1), max:Math.round(Math.max(...fr)), framesOver17:fr.filter(x=>x>17.5).length, framesOver33:fr.filter(x=>x>33.4).length, longTasks:longs.length, longMax:Math.max(0,...longs), chatLines:document.querySelectorAll('.chat-line').length, images:document.images.length, nodes:document.getElementsByTagName('*').length})}}
  requestAnimationFrame(f);
})`)
const { result } = await send('Profiler.stop')
const prof = result.profile
writeFileSync(join(profileDir, 'cpu.cpuprofile'), JSON.stringify(prof))

// Selbstzeit pro Funktion
const dt = new Map()
prof.samples.forEach((s, i) => dt.set(s, (dt.get(s) ?? 0) + (prof.timeDeltas[i] ?? 0)))
const byNode = new Map(prof.nodes.map((n) => [n.id, n]))
const self = new Map()
let total = 0
for (const [nid, t] of dt) {
  const n = byNode.get(nid)
  const f = n.callFrame
  const key = `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber + 1}`
  self.set(key, (self.get(key) ?? 0) + t)
  total += t
}
const idle = [...self].filter(([k]) => k.startsWith('(idle)')).reduce((a, [, t]) => a + t, 0)
console.log(JSON.stringify(stats))
console.log(`busy ${(((total - idle) / total) * 100).toFixed(1)}% of ${(total / 1e6).toFixed(1)}s`)
for (const [k, t] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 28)) console.log(((t / total) * 100).toFixed(1).padStart(5) + '%  ' + k)
console.log('profile:', join(profileDir, 'cpu.cpuprofile'))
ws.close()
app.kill()
process.exit(0)
