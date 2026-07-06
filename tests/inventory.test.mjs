import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'

const API = 'http://127.0.0.1:4327'
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const normalizeMount = mount => process.platform === 'win32' ? String(mount || '').toUpperCase() : String(mount || '')
const server = spawn(process.execPath, ['server/server.mjs'], {
  cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  env: { ...process.env, PULSEGUARD_PORT: '4327', PULSEGUARD_BENCHMARK_MB: '32' }
})

try {
  for (let attempt = 0; attempt < 40; attempt++) {
    try { if ((await fetch(`${API}/api/metrics`)).ok) break } catch {}
    await sleep(250)
  }

  const firstStart = performance.now()
  const firstResponse = await fetch(`${API}/api/system`, { signal: AbortSignal.timeout(45000) })
  const firstLatency = performance.now() - firstStart
  assert.equal(firstResponse.status, 200)

  const inventory = await firstResponse.json()
  assert.ok(inventory.cpu?.brand, 'El inventario debe conservar al menos el modelo real de CPU')
  assert.ok(Array.isArray(inventory.memory) && Array.isArray(inventory.disks))
  assert.equal(typeof inventory.os, 'object')
  assert.equal(typeof inventory.directx, 'object')
  assert.equal(typeof inventory.memorySummary, 'object')
  assert.ok(Object.hasOwn(inventory.cpu, 'socket'), 'El inventario debe exponer el socket del procesador aunque Windows no lo rellene')
  assert.ok(inventory.disks.every(disk => Array.isArray(disk.volumes)), 'Cada disco debe incluir sus volumenes asociados')
  assert.equal(typeof inventory.limited, 'boolean')

  const cachedStart = performance.now()
  const cachedResponse = await fetch(`${API}/api/system`)
  const cachedLatency = performance.now() - cachedStart
  assert.equal(cachedResponse.status, 200)
  assert.ok(cachedLatency < 500, `El inventario almacenado tardo ${cachedLatency.toFixed(1)} ms`)

  const benchmarkResponse = await fetch(`${API}/api/storage/benchmark`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  })
  assert.equal(benchmarkResponse.status, 200)

  const benchmark = await benchmarkResponse.json()
  assert.match(benchmark.mount, process.platform === 'win32' ? /^[A-Z]:\\$/i : /^\//)
  assert.ok(benchmark.writeMbps > 0, 'La escritura debe medirse en MB/s')
  assert.ok(benchmark.readMbps > 0, 'La lectura debe medirse en MB/s')
  assert.equal(benchmark.verified, true, 'La transferencia debe validar la integridad del archivo temporal')

  const benchmarkState = await (await fetch(`${API}/api/storage/benchmark`)).json()
  assert.ok(benchmarkState.results.some(item => normalizeMount(item.mount) === normalizeMount(benchmark.mount)), 'El ultimo benchmark debe quedar disponible en cache')

  const reportResponse = await fetch(`${API}/api/report`)
  assert.equal(reportResponse.status, 200)
  const report = await reportResponse.json()
  assert.ok(report.app?.version, 'El informe debe incluir la version de PulseGuard')
  assert.ok(report.system?.cpu?.brand, 'El informe debe incluir inventario del sistema')
  assert.ok(Array.isArray(report.notes) && report.notes.length >= 2, 'El informe debe describir su contenido')
  assert.equal(normalizeMount(report.storageBenchmark.results[0].mount), normalizeMount(benchmark.mount))

  console.log(JSON.stringify({
    passed: true,
    initialLatencyMs: Number(firstLatency.toFixed(1)),
    cachedLatencyMs: Number(cachedLatency.toFixed(1)),
    limited: inventory.limited,
    cpuModel: inventory.cpu.brand,
    benchmarkWriteMbps: benchmark.writeMbps,
    benchmarkReadMbps: benchmark.readMbps,
    reportVersion: report.app.version
  }, null, 2))
} finally {
  server.kill('SIGTERM')
}
