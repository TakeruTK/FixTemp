import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const API = 'http://127.0.0.1:4321'
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const server = spawn(process.execPath, ['server/server.mjs'], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: { ...process.env, FIXTEMP_PORT: '4321', FIXTEMP_TEST_ALLOW_NO_TEMP: '1' } })

async function waitForServer() {
  for (let i = 0; i < 40; i++) { try { if ((await fetch(`${API}/api/metrics`)).ok) return } catch {} await sleep(250) }
  throw new Error('Servidor no disponible')
}
async function start(type, intensity) {
  const response = await fetch(`${API}/api/stress/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, intensity, duration: 10, temperatureLimit: 95 }) })
  assert.equal(response.status, 200, `No se pudo iniciar ${type}`)
}
async function stop() { await fetch(`${API}/api/stress/stop`, { method: 'POST' }); await sleep(1000) }

try {
  await waitForServer(); await sleep(2500)
  await start('cpu', 100)
  const cpuLoads = []
  for (let i = 0; i < 5; i++) { await sleep(700); cpuLoads.push((await (await fetch(`${API}/api/metrics`)).json()).cpu.load) }
  await stop()
  assert.ok(Math.max(...cpuLoads) >= 80, `CPU no alcanzó carga completa: ${Math.max(...cpuLoads)}%`)

  await start('memory', 10); await sleep(1200); await stop()
  await start('disk', 20); await sleep(1500); await stop()
  const leftovers = (await fs.readdir(os.tmpdir())).filter(name => name.startsWith('pulseguard-stress-'))
  assert.equal(leftovers.length, 0, `Archivos temporales sin limpiar: ${leftovers.join(', ')}`)

  const final = await (await fetch(`${API}/api/metrics`)).json()
  assert.equal(final.stress.active, false)
  console.log(JSON.stringify({ passed: true, peakCpuLoad: Math.max(...cpuLoads), memoryStartStop: true, diskStartStop: true, temporaryFilesClean: true }, null, 2))
} finally {
  server.kill('SIGTERM')
}
