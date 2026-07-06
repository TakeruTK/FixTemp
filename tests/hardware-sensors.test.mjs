import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { promises as fs } from 'node:fs'
import path from 'node:path'

const execFileAsync = promisify(execFile)
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const helper = path.resolve('sensor-helper/publish/win-x64/PulseGuard.Sensors.exe')
const fixtureRoot = path.resolve('tests/.sensor-programdata')
const snapshotPath = path.join(fixtureRoot, 'PulseGuard', 'sensors.json')
const API = 'http://127.0.0.1:4322'

async function writeSnapshot(temperature, clock, power, fan = 0) {
  await fs.mkdir(path.dirname(snapshotPath), { recursive: true })
  await fs.writeFile(snapshotPath, JSON.stringify({
    timestamp: Date.now(), available: true, elevated: true,
    cpu: {
      model: 'CPU de prueba compatible', temperature, temperatureSource: 'CPU Package',
      clock, clockMin: clock - 100, clockMax: clock + 100,
      clockSource: 'LibreHardwareMonitor · núcleos',
      power: { value: power, source: 'CPU Package' },
      fan: { value: fan, source: 'Nuvoton NCT6798D - CPU Fan' },
      fans: [{ value: fan, source: 'Nuvoton NCT6798D - CPU Fan', hardware: 'Nuvoton NCT6798D', name: 'CPU Fan', type: 'Fan' }]
    },
    gpus: [{
      model: 'AMD Radeon de prueba', vendor: 'AMD',
      temperature: { value: 49, source: 'GPU Core' }, load: { value: 37, source: 'GPU Core' },
      clock: { value: 2200, source: 'GPU Core' }, fan: { value: 1250, source: 'GPU Fan' },
      power: { value: 82.4, source: 'GPU Package' }
    }]
  }))
}

async function waitForServer() {
  for (let i = 0; i < 40; i++) {
    try { if ((await fetch(`${API}/api/metrics`)).ok) return } catch {}
    await sleep(250)
  }
  throw new Error('Servidor de sensores no disponible')
}

let server
try {
  const helperSamples = []
  for (let i = 0; i < 3; i++) {
    const { stdout } = await execFileAsync(helper, ['--once'], { timeout: 15000, windowsHide: true })
    helperSamples.push(JSON.parse(stdout.trim()))
  }
  assert.ok(helperSamples.every(sample => sample.cpu.clock >= 400 && sample.cpu.clock <= 8000), 'Frecuencia Windows fuera de rango')
  assert.ok(helperSamples.every(sample => sample.cpu.clockSource?.includes('Windows') || sample.cpu.clockSource?.includes('LibreHardwareMonitor')), 'La frecuencia no declara una fuente real')
  assert.ok(helperSamples.every(sample => Array.isArray(sample.gpus)), 'El lector debe declarar la lista GPU aunque esté vacía')

  await writeSnapshot(55.4, 3800, 46.8)
  server = spawn(process.execPath, ['server/server.mjs'], {
    cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    env: { ...process.env, PULSEGUARD_PROGRAMDATA: fixtureRoot, PULSEGUARD_PORT: '4322', PULSEGUARD_DISABLE_NVIDIA_SMI: '1', PULSEGUARD_DISABLE_FAN_WMI: '1' }
  })
  await waitForServer(); await sleep(1600)
  const first = await (await fetch(`${API}/api/metrics`)).json()
  assert.equal(first.cpu.temperature, 55.4)
  assert.equal(first.cpu.clock, 3800)
  assert.equal(first.cpu.power, 46.8)
  assert.equal(first.cpu.fan, 0)
  assert.equal(first.cpu.powerEstimated, false)
  assert.equal(first.hardwareSensor.status, 'active')
  assert.equal(first.quality.temperature.source, 'CPU Package')
  assert.equal(first.quality.cpuFan.source, 'Nuvoton NCT6798D - CPU Fan')
  assert.equal(first.capabilities.cpu.fan, true)
  assert.equal(first.gpu.model, 'AMD Radeon de prueba')
  assert.equal(first.gpu.temperature, 49)
  assert.equal(first.gpu.power, 82.4)
  assert.equal(first.capabilities.gpu.source, 'LibreHardwareMonitor · GPU')

  await writeSnapshot(62.1, 3910, 58.3, 1450); await sleep(1600)
  const second = await (await fetch(`${API}/api/metrics`)).json()
  assert.equal(second.cpu.temperature, 62.1)
  assert.equal(second.cpu.clock, 3910)
  assert.equal(second.cpu.power, 58.3)
  assert.equal(second.cpu.fan, 1450)
  assert.ok(second.quality.clock.ageMs < 2500)

  await sleep(6500)
  const stale = await (await fetch(`${API}/api/metrics`)).json()
  assert.equal(stale.cpu.temperature, null, 'No debe conservar una temperatura obsoleta en pantalla')
  assert.equal(stale.cpu.powerEstimated, true, 'No debe presentar potencia antigua como lectura real')
  assert.equal(stale.cpu.power, null, 'No debe sustituir la potencia real por una estimación')
  assert.equal(stale.cpu.fan, null, 'No debe conservar una lectura obsoleta de ventilador')
  assert.equal(stale.cpu.clock, null, 'No debe sustituir la frecuencia medida por un valor fijo del sistema')
  assert.equal(stale.quality.cpuPower.source, 'unavailable')
  const unsafeStress = await fetch(`${API}/api/stress/start`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'cpu', intensity: 100, duration: 30, temperatureLimit: 90 })
  })
  assert.equal(unsafeStress.status, 412, 'Debe bloquear estrés CPU si la muestra térmica está obsoleta')

  console.log(JSON.stringify({
    passed: true,
    realWindowsClockMHz: helperSamples.map(sample => sample.cpu.clock),
    temperatureTransition: [first.cpu.temperature, second.cpu.temperature],
    clockTransitionMHz: [first.cpu.clock, second.cpu.clock],
    directPowerWatts: second.cpu.power,
    source: second.hardwareSensor.source,
    staleTemperatureStressBlocked: true
  }, null, 2))
} finally {
  if (server) server.kill('SIGTERM')
  await fs.rm(fixtureRoot, { recursive: true, force: true })
}
