import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'

const API = 'http://127.0.0.1:4326'
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const server = spawn(process.execPath, ['server/server.mjs'], {
  cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  env: { ...process.env, PULSEGUARD_PORT: '4326', PULSEGUARD_TEST_ALLOW_NO_TEMP: '1' }
})

async function waitForServer() {
  for (let index = 0; index < 40; index++) {
    try { if ((await fetch(`${API}/api/metrics`)).ok) return } catch {}
    await sleep(250)
  }
  throw new Error('Servidor no disponible')
}

let originalOverlay
try {
  await waitForServer()
  originalOverlay = await (await fetch(`${API}/api/overlay/config`)).json()
  const overlayResponse = await fetch(`${API}/api/overlay/config`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...originalOverlay, enabled: true, position: 'bottom-left', opacity: 72, metrics: { ...originalOverlay.metrics, power: true } })
  })
  assert.equal(overlayResponse.status, 200)
  const overlay = await overlayResponse.json()
  assert.equal(overlay.enabled, true)
  assert.equal(overlay.position, 'bottom-left')
  assert.equal(overlay.opacity, 72)
  assert.equal(overlay.metrics.power, true)

  const start = await fetch(`${API}/api/stress/start`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'cpu', intensity: 70, duration: 10, temperatureLimit: 95 })
  })
  assert.equal(start.status, 200)
  await sleep(2600)
  const stopped = await (await fetch(`${API}/api/stress/stop`, { method: 'POST' })).json()
  assert.equal(stopped.active, false)
  assert.ok(stopped.samples.length >= 3, `Sólo se registraron ${stopped.samples.length} muestras`)
  assert.ok(stopped.summary.samples >= 3)
  assert.ok(stopped.summary.peakActivity >= 0)
  assert.equal(stopped.summary.verified, true)
  assert.ok(stopped.workload.operations > 0, 'El trabajo CPU no produjo operaciones verificables')

  console.log(JSON.stringify({
    passed: true,
    stressSamples: stopped.summary.samples,
    peakActivity: stopped.summary.peakActivity,
    operations: stopped.workload.operations,
    overlayPersistence: true
  }, null, 2))
} finally {
  if (originalOverlay) {
    await fetch(`${API}/api/overlay/config`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(originalOverlay) }).catch(() => {})
  }
  server.kill('SIGTERM')
}
