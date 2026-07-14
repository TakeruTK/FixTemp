import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import os from 'node:os'

const API = 'http://127.0.0.1:4320'
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

function cpuTicks() {
  return os.cpus().map(cpu => {
    const total = Object.values(cpu.times).reduce((sum, value) => sum + value, 0)
    return { idle: cpu.times.idle, total }
  })
}

async function nativeCpuLoad() {
  const before = cpuTicks(); await sleep(650); const after = cpuTicks()
  const values = after.map((item, index) => {
    const total = item.total - before[index].total; const idle = item.idle - before[index].idle
    return total > 0 ? (1 - idle / total) * 100 : 0
  })
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt++) {
    try { const response = await fetch(`${API}/api/metrics`); if (response.ok) return }
    catch { /* Todavía iniciando. */ }
    await sleep(250)
  }
  throw new Error('El servidor no inició dentro del tiempo esperado')
}

let server
try {
  try {
    const existing = await fetch(`${API}/api/metrics`)
    if (!existing.ok) throw new Error()
  } catch {
    server = spawn(process.execPath, ['server/server.mjs'], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: { ...process.env, FIXTEMP_PORT: '4320', FIXTEMP_TEST_ALLOW_NO_TEMP: '1' } })
    await waitForServer()
  }

  await sleep(3500)
  const samples = []
  const latencies = []
  for (let i = 0; i < 8; i++) {
    const start = performance.now(); const response = await fetch(`${API}/api/metrics`); latencies.push(performance.now() - start)
    assert.equal(response.status, 200, 'La API de métricas debe responder 200')
    const data = await response.json(); samples.push(data)
    assert.ok(data.cpu.load >= 0 && data.cpu.load <= 100, 'CPU fuera de rango')
    assert.ok(data.memory.load >= 0 && data.memory.load <= 100, 'RAM fuera de rango')
    assert.ok(data.gpu.load >= 0 && data.gpu.load <= 100, 'GPU fuera de rango')
    assert.ok(data.memory.used <= data.memory.total + 0.2, 'RAM usada supera la RAM total')
    assert.ok(data.storage.every(disk => disk.use >= 0 && disk.use <= 100), 'Disco fuera de rango')
    assert.ok(data.gpu.temperature === null || (data.gpu.temperature > 0 && data.gpu.temperature < 120), 'Temperatura GPU imposible')
    assert.ok(data.gpu.power === null || (data.gpu.power >= 0 && data.gpu.power < 1000), 'Potencia GPU imposible')
    assert.ok(data.quality, `La respuesta no incluye calidad: ${Object.keys(data).join(', ')}`)
    assert.equal(typeof data.battery.hasBattery, 'boolean', 'Debe declarar presencia de batería en PC y notebook')
    assert.ok(data.capabilities?.cpu && data.capabilities?.gpu && data.capabilities?.battery && data.capabilities?.storage, 'Falta el mapa de capacidades reales')
    assert.ok(data.quality.cpu.ageMs < 6500, 'La lectura de CPU está atrasada')
    assert.ok(data.quality.memory.ageMs < 12000, 'La lectura de RAM está atrasada')
    await sleep(1000)
  }

  const averageLatency = latencies.reduce((sum, value) => sum + value, 0) / latencies.length
  assert.ok(averageLatency < 250, `Latencia media demasiado alta: ${averageLatency.toFixed(1)} ms`)
  assert.ok(samples.at(-1).timestamp > samples[0].timestamp, 'La marca de tiempo debe avanzar')
  const expectedMemory = (1 - os.freemem() / os.totalmem()) * 100
  assert.ok(Math.abs(samples.at(-1).memory.load - expectedMemory) < 5, 'La RAM difiere del contador nativo')
  const independentCpu = await nativeCpuLoad()
  assert.ok(Math.abs(samples.at(-1).cpu.load - independentCpu) < 40, 'La CPU difiere demasiado del contador independiente')

  const startStress = await fetch(`${API}/api/stress/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'cpu', intensity: 10, duration: 10, temperatureLimit: 90 }) })
  assert.equal(startStress.status, 200, 'La prueba CPU debe poder iniciar')
  await sleep(1200)
  const stopStress = await fetch(`${API}/api/stress/stop`, { method: 'POST' })
  const stopped = await stopStress.json()
  assert.equal(stopped.active, false, 'La parada manual debe finalizar la prueba')
  assert.equal(stopped.stopReason, 'manual', 'Debe registrar el motivo de parada')

  console.log(JSON.stringify({
    passed: true,
    samples: samples.length,
    averageLatencyMs: Number(averageLatency.toFixed(1)),
    apiCpuPercent: samples.at(-1).cpu.load,
    independentCpuPercent: Number(independentCpu.toFixed(1)),
    memoryPercent: samples.at(-1).memory.load,
    gpuPowerWatts: samples.at(-1).gpu.power,
    serviceMemoryMb: samples.at(-1).agent?.memoryMb,
    stressStopVerified: true
  }, null, 2))
} finally {
  if (server) server.kill('SIGTERM')
}
