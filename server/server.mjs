import express from 'express'
import si from 'systeminformation'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, writeFile, mkdir, open, rm } from 'node:fs/promises'
import { existsSync, createWriteStream } from 'node:fs'
import https from 'node:https'
import http from 'node:http'
import { buildExcelReport } from './xlsx-export.mjs'
import { createHash } from 'node:crypto'
import { getOverlayConfigPath, readPortableSystemDetails } from './system-details.mjs'

// URL del servidor de ranking — cambia esto a tu dominio cuando lo despliegues
const RANKING_SERVER_URL = process.env.RANKING_SERVER_URL || 'http://localhost:3500'

const runtimeDir = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const execFileAsync = promisify(execFile)
const stressWorkerPath = process.resourcesPath && runtimeDir.includes('app.asar')
  ? path.join(process.resourcesPath, 'app.asar.unpacked/build-server/stress-worker.cjs')
  : path.join(runtimeDir, 'stress-worker.mjs')
const systemInfoScript = process.resourcesPath && runtimeDir.includes('app.asar')
  ? path.join(process.resourcesPath, 'app.asar.unpacked/server/system-info.ps1')
  : path.join(runtimeDir, 'system-info.ps1')
const windowsProgramDataPath = process.env.FIXTEMP_PROGRAMDATA || process.env.ProgramData || process.env.PROGRAMDATA || 'C:\\ProgramData'
const hardwareSnapshotPath = process.platform === 'win32'
  ? path.join(windowsProgramDataPath, 'FixTemp', 'sensors.json')
  : null
const sensorHelperPath = process.platform === 'win32' && process.env.FIXTEMP_DISABLE_SENSOR_HELPER !== '1'
  ? (process.resourcesPath && runtimeDir.includes('app.asar')
      ? path.join(process.resourcesPath, 'sensor-helper', 'FixTemp.Sensors.exe')
      : path.resolve(runtimeDir, '../sensor-helper/publish/win-x64/FixTemp.Sensors.exe'))
  : null
const sensorInstallScriptPath = process.platform === 'win32'
  ? (process.resourcesPath && runtimeDir.includes('app.asar')
      ? path.join(process.resourcesPath, 'sensor-helper', 'install-sensors.ps1')
      : path.resolve(runtimeDir, '../sensor-helper/publish/win-x64/install-sensors.ps1'))
  : null
const sensorTaskName = 'FixTemp Sensors'
const sensorTaskPath = process.platform === 'win32'
  ? path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'Tasks', sensorTaskName)
  : null
const elevateExecutablePath = process.platform === 'win32'
  ? (process.resourcesPath && existsSync(path.join(process.resourcesPath, 'elevate.exe'))
      ? path.join(process.resourcesPath, 'elevate.exe')
      : path.resolve(runtimeDir, '../release/win-unpacked/resources/elevate.exe'))
  : null
const sensorLaunchLogPath = process.platform === 'win32'
  ? path.join(os.tmpdir(), 'FixTemp-sensor-install-launch.log')
  : null
const sensorInstallLogPath = process.platform === 'win32'
  ? path.join(windowsProgramDataPath, 'FixTemp', 'sensor-install.log')
  : null
const appInstallDir = process.resourcesPath
  ? path.dirname(process.resourcesPath)
  : path.resolve(runtimeDir, '..')
const appExecutablePath = process.platform === 'win32'
  ? path.join(appInstallDir, 'FixTemp.exe')
  : null
const packageJsonPath = process.resourcesPath && runtimeDir.includes('app.asar')
  ? path.join(process.resourcesPath, 'app.asar', 'package.json')
  : path.resolve(runtimeDir, '../package.json')
const overlayConfigPath = getOverlayConfigPath()
const defaultOverlayConfig = {
  enabled: false,
  position: 'top-right',
  opacity: 88,
  scale: 'normal',
  metrics: { cpu: true, gpu: true, ram: true, vram: true, temperatures: true, power: false, fps: false }
}
const app = express()
const port = Number(process.env.FIXTEMP_PORT || 4310)
app.use((req, res, next) => {
  if (!['POST', 'PUT', 'PATCH'].includes(req.method)) {
    req.body = {}
    next()
    return
  }

  const contentType = String(req.headers['content-type'] || '').toLowerCase()
  if (!contentType.includes('application/json')) {
    req.body = {}
    next()
    return
  }

  let raw = ''
  let done = false
  const finish = callback => {
    if (done) return
    done = true
    callback()
  }

  req.setEncoding('utf8')
  req.on('data', chunk => {
    if (done) return
    raw += chunk
    if (raw.length > 2 * 1024 * 1024) {
      finish(() => res.status(413).json({ error: 'JSON payload too large' }))
      req.destroy()
    }
  })
  req.on('end', () => {
    finish(() => {
      if (!raw.trim()) {
        req.body = {}
        next()
        return
      }

      try {
        req.body = JSON.parse(raw)
        next()
      } catch {
        res.status(400).json({ error: 'Invalid JSON body' })
      }
    })
  })
  req.on('error', error => finish(() => next(error)))
})

let appManifest = { name: 'fixtemp-monitor', version: '0.5.0' }
readFile(packageJsonPath, 'utf8').then(value => {
  const parsed = parseJsonText(value)
  appManifest = { name: parsed.name || appManifest.name, version: parsed.version || appManifest.version }
}).catch(() => {})

const state = {
  session: null,
  workers: [],
  workerStats: new Map(),
  timer: null,
  lastSampleBytes: 0,
  lastSampleAt: 0,
  history: [],
  lastClientSeen: 0,
  sensorUpdatedAt: {},
  agent: { cpu: 0, memoryMb: 0, updatedAt: Date.now() },
  hardwareSensor: { status: 'starting', source: null, error: null, updatedAt: 0 },
  sensorProcess: null,
  sensorWatchdog: { lastAdvancedCpuAt: 0, lastRestartAt: 0, restarts: 0 },
  cpuFanCandidates: [],
  systemDetails: null,
  systemDetailsPromise: null,
  nvidiaSmiAvailable: false,
  gpuSource: null,
  overlayConfig: structuredClone(defaultOverlayConfig),
  storageBenchmark: { active: false, mount: null, results: [], lastError: null, updatedAt: 0 }
}

let processRefreshPromise = null

readFile(overlayConfigPath, 'utf8').then(value => {
  const saved = parseJsonText(value)
  state.overlayConfig = { ...defaultOverlayConfig, ...saved, metrics: { ...defaultOverlayConfig.metrics, ...saved.metrics } }
}).catch(() => {})

const round = (value, digits = 0) => Number.isFinite(value) ? Number(value.toFixed(digits)) : 0
const celsius = (value) => Number.isFinite(value) && value > 0 ? round(value, 0) : null
const sensorValue = (sensor) => Number.isFinite(sensor?.value) ? Number(sensor.value) : null
const numericOrNull = (value) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}
const normalizeClockMhz = (value) => {
  const number = numericOrNull(value)
  if (number === null || number <= 0) return null
  return number > 100 ? round(number, 0) : round(number * 1000, 0)
}
const parseJsonText = (value) => JSON.parse(String(value).replace(/^\uFEFF/, ''))
const psQuote = value => `'${String(value).replace(/'/g, "''")}'`
const vbsQuote = value => String(value).replace(/"/g, '""')
const cpuFanRank = (sensor) => {
  const label = `${sensor?.source || ''} ${sensor?.hardware || ''} ${sensor?.name || ''}`.toLowerCase()
  if (/cpu[\s_-]*(fan|opt|optional)|processor/.test(label)) return 100
  if (/aio|pump|water/.test(label)) return 80
  if (/cha[\s_-]*fan|chassis|case|sys[\s_-]*fan/.test(label)) return 35
  if (/fan/.test(label)) return 60
  return 10
}
const normalizeFanSensor = (sensor) => {
  const value = sensorValue(sensor)
  if (value === null || value <= 0) return null
  return {
    value,
    source: typeof sensor?.source === 'string' && sensor.source.trim() ? sensor.source : null,
    hardware: typeof sensor?.hardware === 'string' ? sensor.hardware : null,
    name: typeof sensor?.name === 'string' ? sensor.name : null,
    type: typeof sensor?.type === 'string' ? sensor.type : null
  }
}
const selectCpuFanSensor = (primary, candidates) => {
  const direct = normalizeFanSensor(primary)
  if (direct) return direct
  const normalized = Array.isArray(candidates)
    ? candidates.map(normalizeFanSensor).filter(Boolean)
    : []
  return normalized
    .sort((a, b) => cpuFanRank(b) - cpuFanRank(a) || b.value - a.value)
    [0] || null
}

const nativeCpu = os.cpus()
const totalMemory = os.totalmem()
const metrics = {
  timestamp: Date.now(),
  cpu: {
    model: nativeCpu[0]?.model || 'Procesador', load: 0, temperature: null,
    clock: null, clockMin: null, clockMax: null, clockSource: null, cores: nativeCpu.length, physicalCores: nativeCpu.length,
    temperatureSource: null, fan: null, fanSource: null,
    perCore: nativeCpu.map(() => 0), power: null, powerEstimated: true, tdp: 65
  },
  gpu: { model: 'Detectando GPU…', vendor: '', load: 0, temperature: null, clock: 0, memoryUsed: 0, memoryTotal: 0, fan: null, power: null, powerLimit: null },
  battery: { hasBattery: false, percent: null, isCharging: null, acConnected: null, cycleCount: null, designedCapacity: null, maxCapacity: null, currentCapacity: null, capacityUnit: null, voltage: null, timeRemaining: null, manufacturer: null, model: null },
  memory: { load: 0, used: 0, total: round(totalMemory / 1024 ** 3, 1), available: 0 },
  storage: [],
  network: { interface: 'Detectando red…', down: 0, up: 0 },
  processes: [],
  hardware: { os: `${os.type()} ${os.release()}`, hostname: os.hostname(), uptime: os.uptime(), disks: [] },
  fps: null,
  fpsSource: null
}

const isClientActive = () => Date.now() - state.lastClientSeen < 12000
const cadence = (active, idle) => () => isClientActive() ? active : idle
const mark = (sensor) => { state.sensorUpdatedAt[sensor] = Date.now() }
const batterySourceLabel = process.platform === 'win32' ? 'Windows battery API' : 'systeminformation'
const clearCpuTemperature = () => {
  metrics.cpu.temperature = null
  metrics.cpu.temperatureSource = null
  state.sensorUpdatedAt.temperature = 0
}
const clearCpuClock = () => {
  metrics.cpu.clock = null
  metrics.cpu.clockMin = null
  metrics.cpu.clockMax = null
  metrics.cpu.clockSource = null
  state.sensorUpdatedAt.clock = 0
}
const clearCpuPower = () => {
  metrics.cpu.power = null
  metrics.cpu.powerEstimated = true
  state.sensorUpdatedAt.power = 0
}
const clearCpuFan = () => {
  metrics.cpu.fan = null
  metrics.cpu.fanSource = null
  state.sensorUpdatedAt.fan = 0
}
const expireStaleCpuHardware = (now = Date.now()) => {
  const temperatureAge = now - (state.sensorUpdatedAt.temperature || 0)
  const temperatureMaxAge = metrics.cpu.temperatureSource === 'systeminformation' ? 180000 : 5000
  if (state.sensorUpdatedAt.temperature && temperatureAge > temperatureMaxAge) clearCpuTemperature()

  const powerAge = now - (state.sensorUpdatedAt.power || 0)
  if (state.sensorUpdatedAt.power && powerAge > 5000) clearCpuPower()

  const clockAge = now - (state.sensorUpdatedAt.clock || 0)
  const clockMaxAge = metrics.cpu.clockSource === 'systeminformation' ? 180000 : 5000
  if (state.sensorUpdatedAt.clock && clockAge > clockMaxAge) clearCpuClock()

  const fanAge = now - (state.sensorUpdatedAt.fan || 0)
  if (state.sensorUpdatedAt.fan && fanAge > 5000) clearCpuFan()

  const hardwareAge = now - (state.hardwareSensor.updatedAt || 0)
  if (state.hardwareSensor.updatedAt && hardwareAge > 5000) {
    state.hardwareSensor = { ...state.hardwareSensor, status: 'unavailable' }
  }
}
const applyGpuSnapshot = (gpuList, observedAt) => {
  if (!Array.isArray(gpuList) || !gpuList.length) return false
  const priority = item => /AMD/i.test(item?.vendor || '') ? 3 : /NVIDIA/i.test(item?.vendor || '') ? 2 : /Intel/i.test(item?.vendor || '') ? 1 : 0
  const ordered = [...gpuList].sort((a, b) => priority(b) - priority(a))
  const selected = ordered.find(item => item.model === metrics.gpu.model) || ordered[0]
  if (state.nvidiaSmiAvailable && /NVIDIA/i.test(selected.vendor || '')) return false
  const temperature = sensorValue(selected.temperature)
  const load = sensorValue(selected.load)
  const clock = sensorValue(selected.clock)
  const fan = sensorValue(selected.fan)
  const power = sensorValue(selected.power)
  const hasHardwareReading = temperature !== null || load !== null || clock !== null || fan !== null || power !== null
  metrics.gpu = {
    ...metrics.gpu,
    model: selected.model || metrics.gpu.model,
    vendor: selected.vendor || metrics.gpu.vendor,
    load: load !== null && load >= 0 && load <= 100 ? round(load, 0) : metrics.gpu.load,
    temperature: temperature !== null && temperature > 0 && temperature < 125 ? round(temperature, 1) : null,
    clock: clock !== null && clock >= 0 ? round(clock, 0) : 0,
    fan: fan !== null && fan > 0 ? round(fan, 0) : metrics.gpu.fan,
    power: power !== null && power >= 0 ? round(power, 1) : null
  }
  state.gpuSource = 'LibreHardwareMonitor · GPU'
  state.sensorUpdatedAt.gpu = observedAt
  state.sensorUpdatedAt.gpuHardware = observedAt
  return hasHardwareReading
}
const applyHardwareSnapshot = (snapshot, source) => {
  const age = Date.now() - Number(snapshot.timestamp || 0)
  if (age < 0 || age > 5000 || !snapshot.cpu) throw new Error(`muestra obsoleta (${age} ms)`)
  const cpu = snapshot.cpu
  const observedAt = Number(snapshot.timestamp)
  const hasTemperature = Number.isFinite(cpu.temperature) && cpu.temperature > 0 && cpu.temperature < 125
  const hasPower = Number.isFinite(cpu.power?.value) && cpu.power.value > 0
  const selectedFan = selectCpuFanSensor(cpu.fan, cpu.fans)
  const hasFan = selectedFan !== null
  state.cpuFanCandidates = Array.isArray(cpu.fans) ? cpu.fans.map(normalizeFanSensor).filter(Boolean).slice(0, 12) : []
  if (hasTemperature) {
    metrics.cpu.temperature = round(cpu.temperature, 1)
    metrics.cpu.temperatureSource = cpu.temperatureSource || 'Sensor CPU'
    state.sensorUpdatedAt.temperature = observedAt
  } else if (metrics.cpu.temperatureSource !== 'systeminformation' && Date.now() - (state.sensorUpdatedAt.temperature || 0) > 5000) {
    clearCpuTemperature()
  }
  if (Number.isFinite(cpu.clock) && cpu.clock > 0) {
    metrics.cpu.clock = round(cpu.clock, 0)
    metrics.cpu.clockMin = Number.isFinite(cpu.clockMin) ? round(cpu.clockMin, 0) : null
    metrics.cpu.clockMax = Number.isFinite(cpu.clockMax) ? round(cpu.clockMax, 0) : null
    metrics.cpu.clockSource = cpu.clockSource || 'Sensor CPU'
    state.sensorUpdatedAt.clock = observedAt
  } else if (Date.now() - (state.sensorUpdatedAt.clock || 0) > 5000) {
    clearCpuClock()
  }
  if (hasPower) {
    metrics.cpu.power = round(cpu.power.value, 1)
    metrics.cpu.powerEstimated = false
    state.sensorUpdatedAt.power = observedAt
  } else if (Date.now() - (state.sensorUpdatedAt.power || 0) > 5000) {
    clearCpuPower()
  }
  if (hasFan) {
    metrics.cpu.fan = round(selectedFan.value, 0)
    metrics.cpu.fanSource = selectedFan.source || 'Sensor CPU'
    state.sensorUpdatedAt.fan = observedAt
  } else if (Date.now() - (state.sensorUpdatedAt.fan || 0) > 5000) {
    clearCpuFan()
  }
  if (hasTemperature || hasFan) {
    state.sensorWatchdog.lastAdvancedCpuAt = observedAt
  }
  if (cpu.model) metrics.cpu.model = cpu.model
  const hasGpuHardware = applyGpuSnapshot(snapshot.gpus, observedAt)
  const hasAnyCpuHardware = hasTemperature || hasPower || hasFan
  state.hardwareSensor = {
    status: hasAnyCpuHardware || hasGpuHardware ? 'active' : 'unavailable',
    source,
    error: hasTemperature || hasGpuHardware ? null : 'El lector no entrego temperatura de CPU en esta muestra.',
    updatedAt: Number(snapshot.timestamp)
  }
  state.sensorUpdatedAt.hardware = observedAt
}
const invalidateHardwareSnapshot = (error) => {
  if (Date.now() - state.hardwareSensor.updatedAt <= 5000) return
  if (metrics.cpu.temperatureSource !== 'systeminformation') clearCpuTemperature()
  if (metrics.cpu.clockSource !== 'systeminformation') clearCpuClock()
  clearCpuFan()
  clearCpuPower()
  state.hardwareSensor = { ...state.hardwareSensor, status: 'unavailable', error: error.message }
}
const repeat = (task, interval, initialDelay = 0) => {
  let running = false
  const run = async () => {
    if (!running) {
      running = true
      try { await task() } catch (error) { console.warn(`Sensor no disponible: ${error.message}`) }
      running = false
    }
    setTimeout(run, typeof interval === 'function' ? interval() : interval).unref()
  }
  setTimeout(run, initialDelay).unref()
}

let cpuRefreshPromise = null
async function refreshBasicCpuClock() {
  try {
    const speed = await si.cpuCurrentSpeed()
    const clock = normalizeClockMhz(speed.avg || speed.current || speed.max || speed.min)
    if (clock !== null) {
      metrics.cpu.clock = clock
      metrics.cpu.clockMin = normalizeClockMhz(speed.min)
      metrics.cpu.clockMax = normalizeClockMhz(speed.max)
      metrics.cpu.clockSource = 'systeminformation'
      state.sensorUpdatedAt.clock = Date.now()
      return true
    }
  } catch {
    // La carga de CPU sigue funcionando aunque Windows no entregue frecuencia.
  }
  return false
}
async function refreshCpuSnapshot() {
  const load = await si.currentLoad()
  metrics.cpu.load = round(load.currentLoad, 0)
  metrics.cpu.perCore = (load.cpus || []).map((item) => round(item.load, 0))
  if (Date.now() - (state.sensorUpdatedAt.clock || 0) > 5000) {
    const restored = await refreshBasicCpuClock()
    if (!restored && metrics.cpu.clockSource !== 'systeminformation') clearCpuClock()
  }
  if (metrics.cpu.powerEstimated) metrics.cpu.power = null
  mark('cpu')
}
async function ensureFreshCpuSnapshot(maxAgeMs = 3000) {
  if (Date.now() - (state.sensorUpdatedAt.cpu || 0) <= maxAgeMs) return
  if (!cpuRefreshPromise) cpuRefreshPromise = refreshCpuSnapshot().finally(() => { cpuRefreshPromise = null })
  await cpuRefreshPromise
}

repeat(async () => {
  await refreshCpuSnapshot()
}, cadence(1000, 5000))

async function refreshCpuSensorFallbacks() {
  await ensureFreshCpuSnapshot(0).catch(() => {})
  await refreshBasicCpuClock().catch(() => {})
  const temp = await si.cpuTemperature().catch(() => null)
  const fallbackTemperature = celsius(temp?.main)
  if (fallbackTemperature !== null) {
    metrics.cpu.temperature = fallbackTemperature
    metrics.cpu.temperatureSource = 'systeminformation'
    mark('temperature')
  } else if (process.platform === 'win32') {
    const script = `
$items = Get-CimInstance -Namespace root\\wmi -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction SilentlyContinue |
  Where-Object { $_.CurrentTemperature -gt 0 } |
  ForEach-Object { [math]::Round(($_.CurrentTemperature / 10) - 273.15, 1) } |
  Where-Object { $_ -ge 10 -and $_ -le 125 }
@($items) | ConvertTo-Json -Compress
`
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      timeout: 5000,
      windowsHide: true,
      maxBuffer: 64 * 1024
    }).catch(() => ({ stdout: '' }))
    const raw = stdout.trim()
    if (raw) {
      const parsed = parseJsonText(raw)
      const values = (Array.isArray(parsed) ? parsed : [parsed]).map(Number).filter(Number.isFinite)
      const acpiTemperature = finiteAverage(values)
      if (acpiTemperature !== null) {
        metrics.cpu.temperature = acpiTemperature
        metrics.cpu.temperatureSource = 'Windows ACPI'
        mark('temperature')
      }
    }
  }
  await refreshWindowsCpuFanFallback().catch(() => {})
}

repeat(async () => {
  if (!hardwareSnapshotPath) return
  try {
    const snapshot = parseJsonText(await readFile(hardwareSnapshotPath, 'utf8'))
    applyHardwareSnapshot(snapshot, 'LibreHardwareMonitor + PawnIO · SYSTEM')
  } catch (error) { invalidateHardwareSnapshot(error); startSensorFallback() }
}, cadence(1000, 5000), 500)

function startSensorFallback() {
  if (!sensorHelperPath || !existsSync(sensorHelperPath) || state.sensorProcess) return
  const child = spawn(sensorHelperPath, [], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })
  state.sensorProcess = child
  let buffer = ''
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', chunk => {
    buffer += chunk
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() || ''
    for (const line of lines) {
      if (!line.trim()) continue
      try { applyHardwareSnapshot(parseJsonText(line), 'Lector local · respaldo') } catch { /* siguiente muestra */ }
    }
  })
  child.once('error', (error) => {
    if (state.sensorProcess === child) state.sensorProcess = null
    invalidateHardwareSnapshot(error)
  })
  child.once('exit', () => { if (state.sensorProcess === child) state.sensorProcess = null })
}
if (sensorHelperPath && existsSync(sensorHelperPath)) {
  setTimeout(startSensorFallback, 250).unref()
  setTimeout(() => {
    void Promise.allSettled([
      refreshCpuSensorFallbacks(),
      refreshBasicGpuSnapshot(true),
      refreshMemorySnapshot(),
      refreshStorageSnapshot(),
      refreshDiskLayoutSnapshot()
    ])
  }, 900).unref()
}

function restartSensorReader(reason = 'watchdog') {
  const now = Date.now()
  if (now - state.sensorWatchdog.lastRestartAt < 30000) return
  state.sensorWatchdog.lastRestartAt = now
  state.sensorWatchdog.restarts += 1
  state.hardwareSensor = { ...state.hardwareSensor, status: 'reconnecting', error: `Reiniciando lector local: ${reason}` }
  if (state.sensorProcess) {
    const child = state.sensorProcess
    state.sensorProcess = null
    try { child.kill() } catch {}
  }
  setTimeout(startSensorFallback, 800).unref()
  if (process.platform === 'win32' && sensorTaskPath && existsSync(sensorTaskPath)) {
    void startSensorTaskNow().catch(() => {})
  }
}

repeat(async () => {
  if (!sensorHelperPath || !existsSync(sensorHelperPath)) return
  const now = Date.now()
  const hasRecoveredCpuBefore = state.sensorWatchdog.lastAdvancedCpuAt > 0
  const advancedCpuMissing = metrics.cpu.temperature === null && (metrics.cpu.fan === null || metrics.cpu.fan <= 0)
  const gpuStillStreaming = metrics.gpu.temperature !== null && now - (state.sensorUpdatedAt.gpu || 0) < 15000
  const cpuMissingFor = now - state.sensorWatchdog.lastAdvancedCpuAt
  if (hasRecoveredCpuBefore && advancedCpuMissing && gpuStillStreaming && cpuMissingFor > 15000) {
    restartSensorReader('CPU avanzada dejo de entregar datos')
  } else if (!state.sensorProcess && (!state.hardwareSensor.updatedAt || now - state.hardwareSensor.updatedAt > 10000)) {
    startSensorFallback()
  }
}, cadence(10000, 30000), 15000)

const buildSensorStatus = () => ({
  helperAvailable: Boolean(sensorHelperPath && existsSync(sensorHelperPath)),
  installerAvailable: Boolean(sensorInstallScriptPath && existsSync(sensorInstallScriptPath)),
  directActive: state.hardwareSensor.status === 'active',
  taskInstalled: Boolean(sensorTaskPath && existsSync(sensorTaskPath)),
  snapshotExists: Boolean(hardwareSnapshotPath && existsSync(hardwareSnapshotPath)),
  launchLogPath: sensorLaunchLogPath,
  installLogPath: sensorInstallLogPath,
  cpuFanAvailable: metrics.cpu.fan !== null && metrics.cpu.fan > 0,
  cpuFanSource: metrics.cpu.fanSource || null,
  cpuFanCandidates: state.cpuFanCandidates,
  cpuTempAvailable: metrics.cpu.temperature !== null,
  gpuTempAvailable: metrics.gpu.temperature !== null,
  gpuSource: state.gpuSource || null,
  watchdogRestarts: state.sensorWatchdog.restarts,
  source: state.hardwareSensor.source || null,
  error: state.hardwareSensor.error || null
})

async function waitForSensorConfirmation(maxAttempts = 18, intervalMs = 1500) {
  let lastError = null
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise(resolve => setTimeout(resolve, attempt === 0 ? 300 : intervalMs))
    if (hardwareSnapshotPath && existsSync(hardwareSnapshotPath)) {
      try {
        const snapshot = parseJsonText(await readFile(hardwareSnapshotPath, 'utf8'))
        applyHardwareSnapshot(snapshot, 'LibreHardwareMonitor + PawnIO · SYSTEM')
      } catch (error) {
        lastError = error
      }
    }
    const status = buildSensorStatus()
    if (status.directActive && (status.cpuTempAvailable || status.cpuFanAvailable || status.gpuTempAvailable)) return { confirmed: true, status }
  }
  if (lastError && !state.hardwareSensor.error) state.hardwareSensor = { ...state.hardwareSensor, error: lastError.message }
  return { confirmed: false, status: buildSensorStatus() }
}

async function startSensorTaskNow() {
  if (process.platform !== 'win32' || !sensorTaskPath || !existsSync(sensorTaskPath)) return false
  const shell = process.env.SystemRoot
    ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    : 'powershell.exe'
  await execFileAsync(shell, [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    `Start-ScheduledTask -TaskName ${psQuote(sensorTaskName)}; Start-Sleep -Milliseconds 700`
  ], { windowsHide: true, timeout: 10000 })
  return true
}

async function launchElevatedSensorInstaller(reason = 'Activar sensores') {
  if (!sensorInstallScriptPath || !existsSync(sensorInstallScriptPath)) {
    throw new Error('El instalador de sensores no esta disponible en este equipo.')
  }
  const logPath = sensorLaunchLogPath || path.join(os.tmpdir(), 'FixTemp-sensor-install-launch.log')
  await writeFile(logPath, `${new Date().toISOString()} ${reason}. script=${sensorInstallScriptPath} installDir=${appInstallDir}\r\n`, { flag: 'a' })
  if (elevateExecutablePath && existsSync(elevateExecutablePath)) {
    const cmdPath = path.join(os.tmpdir(), 'FixTemp-Install-Sensors.cmd')
    const cmd = [
      '@echo off',
      `>> "${logPath}" echo %DATE% %TIME% CMD elevado iniciado`,
      `"${process.env.SystemRoot || 'C:\\Windows'}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "${sensorInstallScriptPath}" -InstallDir "${appInstallDir}" >> "${logPath}" 2>&1`,
      `>> "${logPath}" echo %DATE% %TIME% CMD elevado termino con codigo %ERRORLEVEL%`
    ].join('\r\n')
    await writeFile(cmdPath, cmd, 'utf8')
    const child = spawn(elevateExecutablePath, ['-wait', 'cmd.exe', '/d', '/c', cmdPath], {
      windowsHide: true,
      detached: true,
      stdio: 'ignore'
    })
    child.unref()
    await writeFile(logPath, `${new Date().toISOString()} elevate.exe lanzado desde ${elevateExecutablePath} con ${cmdPath}\r\n`, { flag: 'a' })
    return { launched: true, method: 'elevate.exe-cmd', logPath }
  }

  const launcherPath = path.join(os.tmpdir(), 'FixTemp-Install-Sensors.ps1')
  const script = [
    '$ErrorActionPreference = "Continue"',
    `$log = ${psQuote(logPath)}`,
    'function Write-LaunchLog([string]$message) { New-Item -ItemType Directory -Force -Path (Split-Path -Parent $log) | Out-Null; Add-Content -LiteralPath $log -Encoding UTF8 -Value "$(Get-Date -Format o) $message" }',
    `Write-LaunchLog ${psQuote(`${reason}. script=${sensorInstallScriptPath} installDir=${appInstallDir}`)}`,
    `$arguments = @('-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', ${psQuote(sensorInstallScriptPath)}, '-InstallDir', ${psQuote(appInstallDir)})`,
    'try {',
    '  $process = Start-Process -FilePath powershell.exe -Verb RunAs -WindowStyle Hidden -ArgumentList $arguments -PassThru -ErrorAction Stop',
    '  Write-LaunchLog "Asistente elevado iniciado pid=$($process.Id)"',
    '} catch {',
    '  Write-LaunchLog "No se pudo iniciar asistente elevado: $($_.Exception.Message)"',
    '  exit 1',
    '}'
  ].join('\r\n')
  await writeFile(launcherPath, script, 'utf8')
  const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', launcherPath], {
    windowsHide: true,
    detached: true,
    stdio: 'ignore'
  })
  child.unref()
  await writeFile(logPath, `${new Date().toISOString()} fallback powershell lanzado desde ${launcherPath}\r\n`, { flag: 'a' })
  return { launched: true, method: 'powershell-runas', logPath }
}

let cpuFanFallbackPromise = null
async function refreshWindowsCpuFanFallback() {
  if (process.platform !== 'win32') return
  if (process.env.FIXTEMP_DISABLE_FAN_WMI === '1') return
  if (Date.now() - (state.sensorUpdatedAt.fan || 0) <= 5000) return
  const script = `
$ErrorActionPreference = 'SilentlyContinue'
$items = @()
foreach ($namespace in @('root\\LibreHardwareMonitor', 'root\\OpenHardwareMonitor')) {
  $items += @(Get-CimInstance -Namespace $namespace -ClassName Sensor -ErrorAction SilentlyContinue |
    Where-Object { $_.SensorType -match 'Fan|Control' -and $_.Value -ne $null } |
    ForEach-Object {
      [pscustomobject]@{
        value = [double]$_.Value
        source = "$namespace - $($_.Name)"
        hardware = "$($_.Identifier)"
        name = "$($_.Name)"
        type = "$($_.SensorType)"
      }
    })
}
$items += @(Get-CimInstance Win32_Fan -ErrorAction SilentlyContinue |
  Where-Object { $_.DesiredSpeed -ne $null } |
  ForEach-Object {
    [pscustomobject]@{
      value = [double]$_.DesiredSpeed
      source = "Windows Win32_Fan - $($_.Name)"
      hardware = "$($_.DeviceID)"
      name = "$($_.Name)"
      type = 'Win32_Fan'
    }
  })
@($items) | ConvertTo-Json -Compress -Depth 5
`
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    timeout: 8000,
    windowsHide: true,
    maxBuffer: 128 * 1024
  })
  const raw = stdout.trim()
  if (!raw) return
  const parsed = parseJsonText(raw)
  const candidates = Array.isArray(parsed) ? parsed : [parsed]
  const selected = selectCpuFanSensor(null, candidates)
  if (!selected) return
  metrics.cpu.fan = round(selected.value, 0)
  metrics.cpu.fanSource = selected.source || 'Windows fan sensor'
  state.cpuFanCandidates = candidates.map(normalizeFanSensor).filter(Boolean).slice(0, 12)
  state.sensorUpdatedAt.fan = Date.now()
}

repeat(async () => {
  if (!cpuFanFallbackPromise) {
    cpuFanFallbackPromise = refreshWindowsCpuFanFallback().finally(() => { cpuFanFallbackPromise = null })
  }
  await cpuFanFallbackPromise
}, cadence(60000, 180000), 12000)

repeat(async () => {
  const available = os.freemem()
  const used = totalMemory - available
  metrics.memory = { load: round(used / totalMemory * 100, 0), used: round(used / 1024 ** 3, 1), total: round(totalMemory / 1024 ** 3, 1), available: round(available / 1024 ** 3, 1) }
  metrics.hardware.uptime = os.uptime()
  metrics.timestamp = Date.now()
  state.history.push({ time: metrics.timestamp, cpu: metrics.cpu.load, gpu: metrics.gpu.load, ram: metrics.memory.load })
  if (state.history.length > 60) state.history.shift()
  mark('memory')
}, cadence(2000, 10000))

async function refreshMemorySnapshot() {
  const available = os.freemem()
  const used = totalMemory - available
  metrics.memory = { load: round(used / totalMemory * 100, 0), used: round(used / 1024 ** 3, 1), total: round(totalMemory / 1024 ** 3, 1), available: round(available / 1024 ** 3, 1) }
  metrics.hardware.uptime = os.uptime()
  metrics.timestamp = Date.now()
  mark('memory')
}

repeat(async () => {
  const [cpu, osInfo] = await Promise.all([si.cpu(), si.osInfo()])
  metrics.cpu.model = `${cpu.manufacturer || ''} ${cpu.brand || ''}`.trim() || metrics.cpu.model
  metrics.cpu.cores = cpu.cores || metrics.cpu.cores
  metrics.cpu.physicalCores = cpu.physicalCores || metrics.cpu.physicalCores
  metrics.hardware.os = `${osInfo.distro || os.type()} ${osInfo.release || os.release()}`
  mark('system')
}, 300000, 4000)

repeat(async () => {
  const hardwareTemperatureFresh = metrics.cpu.temperature !== null &&
    metrics.cpu.temperatureSource !== 'systeminformation' &&
    Date.now() - (state.sensorUpdatedAt.temperature || 0) <= 5000
  if (hardwareTemperatureFresh) return
  const temp = await si.cpuTemperature()
  const fallbackTemperature = celsius(temp.main)
  if (fallbackTemperature !== null) {
    metrics.cpu.temperature = fallbackTemperature
    metrics.cpu.temperatureSource = 'systeminformation'
    mark('temperature')
  }
}, cadence(30000, 120000), 6000)

// nvidia-smi como proceso persistente — evita CreateProcess() cada 2.5s (causa micro-freeze en Windows)
let nvidiaSmiChild = null
function parseNvidiaLine(line) {
  const parts = line.split(',').map(s => s.trim())
  if (parts.length < 9 || !parts[0] || parts[0].toLowerCase() === 'name') return
  const [model, load, temperature, clock, memoryUsed, memoryTotal, fan, power, powerLimit] = parts
  const fanValue = numericOrNull(fan)
  metrics.gpu = {
    model, vendor: 'NVIDIA',
    load: round(Number(load), 0), temperature: celsius(Number(temperature)),
    clock: round(Number(clock), 0), memoryUsed: round(Number(memoryUsed), 0),
    memoryTotal: round(Number(memoryTotal), 0),
    fan: fanValue !== null && fanValue > 0 ? round(fanValue, 0) : metrics.gpu.fan,
    power: Number.isFinite(Number(power)) ? round(Number(power), 1) : null,
    powerLimit: Number.isFinite(Number(powerLimit)) ? round(Number(powerLimit), 0) : null
  }
  state.nvidiaSmiAvailable = true
  state.gpuSource = 'NVIDIA NVML · nvidia-smi'
  mark('gpu')
}
function startNvidiaSmiLoop() {
  if (nvidiaSmiChild || process.env.FIXTEMP_DISABLE_NVIDIA_SMI === '1') return
  try {
    nvidiaSmiChild = spawn('nvidia-smi', [
      '--query-gpu=name,utilization.gpu,temperature.gpu,clocks.gr,memory.used,memory.total,fan.speed,power.draw,power.limit',
      '--format=csv,noheader,nounits', '-l', '2'
    ], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })
    nvidiaSmiChild.unref()
    let nvBuf = ''
    nvidiaSmiChild.stdout.setEncoding('utf8')
    nvidiaSmiChild.stdout.on('data', chunk => {
      nvBuf += chunk
      const lines = nvBuf.split('\n'); nvBuf = lines.pop() || ''
      for (const line of lines) { if (line.trim()) parseNvidiaLine(line) }
    })
    nvidiaSmiChild.once('error', () => { nvidiaSmiChild = null; state.nvidiaSmiAvailable = false })
    nvidiaSmiChild.once('exit', () => {
      nvidiaSmiChild = null; state.nvidiaSmiAvailable = false
      setTimeout(startNvidiaSmiLoop, 10000).unref()
    })
  } catch { state.nvidiaSmiAvailable = false }
}
const selectBasicGpu = (controllers) => {
  const list = Array.isArray(controllers) ? controllers.filter(Boolean) : []
  if (!list.length) return null
  const priority = item => {
    const text = `${item.vendor || ''} ${item.model || item.name || ''}`.toLowerCase()
    if (/nvidia|geforce|rtx|gtx|quadro/.test(text)) return 40
    if (/amd|radeon/.test(text)) return 35
    if (/intel/.test(text)) return 20
    return 10
  }
  return [...list].sort((a, b) => priority(b) - priority(a))[0]
}
async function refreshBasicGpuSnapshot(force = false) {
  if (state.nvidiaSmiAvailable) return
  if (state.hardwareSensor.status === 'active') return
  if (!force && Date.now() - (state.sensorUpdatedAt.gpuHardware || 0) <= 5000) return
  const graphics = await si.graphics()
  const gpu = selectBasicGpu(graphics.controllers)
  if (!gpu) return
  metrics.gpu = {
    ...metrics.gpu,
    model: gpu.model || gpu.name || metrics.gpu.model,
    vendor: gpu.vendor || metrics.gpu.vendor,
    load: round(numericOrNull(gpu.utilizationGpu) || metrics.gpu.load || 0, 0),
    temperature: celsius(numericOrNull(gpu.temperatureGpu)),
    clock: round(numericOrNull(gpu.clockCore) || metrics.gpu.clock || 0, 0),
    memoryUsed: round(numericOrNull(gpu.memoryUsed) || metrics.gpu.memoryUsed || 0, 0),
    memoryTotal: round(numericOrNull(gpu.memoryTotal) || metrics.gpu.memoryTotal || 0, 0),
    fan: Number.isFinite(gpu.fanSpeed) && gpu.fanSpeed > 0 ? round(gpu.fanSpeed, 0) : metrics.gpu.fan,
    power: null,
    powerLimit: null
  }
  state.gpuSource = 'Sistema operativo · información básica'
  mark('gpu')
}
// Fallback GPU sólo cuando nvidia-smi no está activo
repeat(async () => {
  if (state.nvidiaSmiAvailable) return
  if (state.hardwareSensor.status === 'active') return
  if (Date.now() - (state.sensorUpdatedAt.gpuHardware || 0) <= 5000) return
  const graphics = await si.graphics()
  const gpu = selectBasicGpu(graphics.controllers)
  if (!gpu) return
  metrics.gpu = {
    ...metrics.gpu,
    model: gpu.model || gpu.name || metrics.gpu.model,
    vendor: gpu.vendor || metrics.gpu.vendor,
    load: round(numericOrNull(gpu.utilizationGpu) || metrics.gpu.load || 0, 0),
    temperature: celsius(numericOrNull(gpu.temperatureGpu)),
    clock: round(numericOrNull(gpu.clockCore) || metrics.gpu.clock || 0, 0),
    memoryUsed: round(numericOrNull(gpu.memoryUsed) || metrics.gpu.memoryUsed || 0, 0),
    memoryTotal: round(numericOrNull(gpu.memoryTotal) || metrics.gpu.memoryTotal || 0, 0),
    fan: Number.isFinite(gpu.fanSpeed) && gpu.fanSpeed > 0 ? round(gpu.fanSpeed, 0) : metrics.gpu.fan,
    power: null,
    powerLimit: null
  }
  state.gpuSource = 'Sistema operativo · información básica'
  mark('gpu')
}, cadence(30000, 120000), 2000)
setTimeout(startNvidiaSmiLoop, 1000).unref()

repeat(async () => {
  const battery = await si.battery()
  metrics.battery = {
    hasBattery: Boolean(battery.hasBattery),
    percent: battery.hasBattery && Number.isFinite(battery.percent) ? round(battery.percent, 0) : null,
    isCharging: battery.hasBattery ? Boolean(battery.isCharging) : null,
    acConnected: battery.hasBattery ? Boolean(battery.acConnected) : null,
    cycleCount: Number.isFinite(battery.cycleCount) && battery.cycleCount >= 0 ? battery.cycleCount : null,
    designedCapacity: Number.isFinite(battery.designedCapacity) && battery.designedCapacity > 0 ? battery.designedCapacity : null,
    maxCapacity: Number.isFinite(battery.maxCapacity) && battery.maxCapacity > 0 ? battery.maxCapacity : null,
    currentCapacity: Number.isFinite(battery.currentCapacity) && battery.currentCapacity >= 0 ? battery.currentCapacity : null,
    capacityUnit: battery.capacityUnit || null,
    voltage: Number.isFinite(battery.voltage) && battery.voltage > 0 ? battery.voltage : null,
    timeRemaining: Number.isFinite(battery.timeRemaining) && battery.timeRemaining >= 0 ? battery.timeRemaining : null,
    manufacturer: battery.manufacturer || null,
    model: battery.model || battery.type || null
  }
  mark('battery')
}, cadence(30000, 120000), 6000)

// Network stats: PowerShell persistente en Windows — evita spawn de powershell.exe cada 2s
// En otros SO sigue usando si.networkStats() con la llamada de calentamiento habitual.
if (process.platform === 'win32') {
  let netChild = null
  let netBuf = ''
  // Script PS que corre en bucle: emite una línea JSON por adaptador activo cada 2s
  const NET_PS = [
    '$p=@{}',
    'while($true){',
    '  Start-Sleep -Milliseconds 2000',
    '  try{',
    '    $a=Get-NetAdapterStatistics -EA SilentlyContinue',
    '    $s=Get-NetAdapter -EA SilentlyContinue|Select-Object Name,Status',
    '    foreach($x in $a){',
    '      $st=($s|Where-Object{$_.Name -eq $x.Name}).Status',
    '      $r=0;$t=0',
    '      if($p.ContainsKey($x.Name)){$r=[math]::Max(0,[math]::Round(($x.ReceivedBytes-$p[$x.Name][0])/2,0));$t=[math]::Max(0,[math]::Round(($x.SentBytes-$p[$x.Name][1])/2,0))}',
    '      $p[$x.Name]=@($x.ReceivedBytes,$x.SentBytes)',
    '      [PSCustomObject]@{n=$x.Name;r=$r;t=$t;up=($st -eq "Up")}|ConvertTo-Json -Compress',
    '    }',
    '  }catch{}',
    '}'
  ].join('\n')
  function startNetLoop() {
    if (netChild) return
    try {
      netChild = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', NET_PS], {
        windowsHide: true, stdio: ['ignore', 'pipe', 'ignore']
      })
      netChild.unref()
      netChild.stdout.setEncoding('utf8')
      netChild.stdout.on('data', chunk => {
        netBuf += chunk
        const lines = netBuf.split('\n'); netBuf = lines.pop() || ''
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const obj = parseJsonText(line)
            if (!obj.up) continue
            // Preferir adaptador con tráfico; si ninguno tiene, al menos fijar el nombre
            if (obj.r > 0 || obj.t > 0 || metrics.network.interface === 'Detectando red…') {
              metrics.network = { interface: obj.n, down: round(obj.r / 1024, 0), up: round(obj.t / 1024, 0) }
              mark('network')
            }
          } catch { /* línea incompleta */ }
        }
      })
      netChild.once('error', () => { netChild = null })
      netChild.once('exit', () => { netChild = null; setTimeout(startNetLoop, 5000).unref() })
    } catch { /* PS no disponible, ignorar */ }
  }
  startNetLoop()
} else {
  // Linux / macOS: si.networkStats() no lanza PowerShell, es eficiente
  si.networkStats().catch(() => {})
  repeat(async () => {
    const network = await si.networkStats()
    const primary = network.find((n) => n.operstate === 'up' && !n.virtual) || network[0] || {}
    if (primary.rx_sec !== null || primary.tx_sec !== null) {
      metrics.network = { interface: primary.iface || 'Red', down: round((primary.rx_sec || 0) / 1024, 0), up: round((primary.tx_sec || 0) / 1024, 0) }
      mark('network')
    } else if (primary.iface) {
      metrics.network = { ...metrics.network, interface: primary.iface }
    }
  }, cadence(2000, 10000), 1500)
}

async function refreshNetworkSnapshot() {
  const network = await si.networkStats()
  const primary = network.find((n) => n.operstate === 'up' && !n.virtual) || network.find((n) => !n.virtual) || network[0] || {}
  if (primary.iface) {
    metrics.network = {
      interface: primary.iface,
      down: round((primary.rx_sec || 0) / 1024, 0),
      up: round((primary.tx_sec || 0) / 1024, 0)
    }
    mark('network')
  }
}

async function refreshProcessesSnapshot() {
  const processes = await si.processes()
  metrics.processes = [...(processes.list || [])]
    .filter((p) => p.pid !== 0 && p.name !== 'System Idle Process')
    .sort((a, b) => (b.cpu + b.mem) - (a.cpu + a.mem)).slice(0, 8)
    .map((p) => ({ pid: p.pid, name: p.name || 'Proceso', cpu: round(p.cpu, 1), memory: round(p.memRss / 1024, 0), memoryPercent: round(p.mem, 1) }))
  mark('processes')
}

function queueProcessRefresh(force = false) {
  const age = Date.now() - (state.sensorUpdatedAt.processes || 0)
  if (!force && age < 60000) return processRefreshPromise
  if (!processRefreshPromise) {
    processRefreshPromise = refreshProcessesSnapshot()
      .catch(() => {})
      .finally(() => { processRefreshPromise = null })
  }
  return processRefreshPromise
}

repeat(async () => {
  await queueProcessRefresh(true)
}, cadence(180000, 360000), 45000)

async function refreshStorageSnapshot() {
  const fsSize = await si.fsSize()
  metrics.storage = fsSize.filter((disk) => disk.size > 0).slice(0, 5).map((disk) => ({
    fs: disk.fs, mount: disk.mount, used: round(disk.used / 1024 ** 3, 0), size: round(disk.size / 1024 ** 3, 0), use: round(disk.use, 0)
  }))
  mark('storage')
}

async function refreshDiskLayoutSnapshot() {
  const disks = await si.diskLayout()
  metrics.hardware.disks = disks.map((d) => ({
    name: d.name, type: d.type, size: round(d.size / 1024 ** 3, 0), vendor: d.vendor,
    smartStatus: d.smartStatus || null, interfaceType: d.interfaceType || null, serialNum: d.serialNum || null
  }))
  mark('storage')
}

repeat(async () => {
  await refreshStorageSnapshot()
}, cadence(120000, 480000), 2500)

repeat(async () => {
  await refreshDiskLayoutSnapshot()
}, cadence(600000, 1800000), 8000)

let previousCpuUsage = process.cpuUsage()
let previousCpuTime = Date.now()
repeat(async () => {
  const now = Date.now()
  const usage = process.cpuUsage(previousCpuUsage)
  const elapsedMicros = Math.max(1, (now - previousCpuTime) * 1000)
  state.agent = {
    cpu: round(((usage.user + usage.system) / elapsedMicros / Math.max(1, os.cpus().length)) * 100, 2),
    memoryMb: round(process.memoryUsage().rss / 1024 / 1024, 1),
    updatedAt: now
  }
  previousCpuUsage = process.cpuUsage()
  previousCpuTime = now
}, 5000, 5000)

const finiteAverage = values => values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length, 1) : null
const normalizeMount = mount => typeof mount === 'string' ? mount.trim() : ''
const isWindowsMount = mount => /^[A-Za-z]:\\?$/.test(normalizeMount(mount))
const canonicalMount = mount => {
  const normalized = normalizeMount(mount)
  if (!normalized) return ''
  if (isWindowsMount(normalized)) {
    const drive = normalized.slice(0, 1).toUpperCase()
    return `${drive}:\\`
  }
  if (normalized === '/') return '/'
  return normalized.replace(/[\\/]+$/, '')
}
const benchmarkChunkSize = 4 * 1024 ** 2
const benchmarkSizeMb = () => Math.max(32, Math.min(Number(process.env.FIXTEMP_BENCHMARK_MB) || 192, 512))
const sameVolume = (left, right) => {
  const normalizedLeft = canonicalMount(left)
  const normalizedRight = canonicalMount(right)
  if (!normalizedLeft || !normalizedRight) return false
  if (process.platform === 'win32') return normalizedLeft.slice(0, 2) === normalizedRight.slice(0, 2)
  return normalizedLeft === normalizedRight || normalizedLeft.startsWith(`${normalizedRight}/`) || normalizedRight.startsWith(`${normalizedLeft}/`)
}
const benchmarkRoots = mount => {
  const roots = []
  const normalizedMount = canonicalMount(mount)
  const tempRoot = process.env.TEMP || os.tmpdir()
  if (sameVolume(tempRoot, normalizedMount)) roots.push(path.join(tempRoot, 'FixTemp-Benchmark'))
  if (process.platform === 'win32') {
    roots.push(path.join(normalizedMount, 'Users', 'Public', 'Documents', 'FixTemp-Benchmark'))
  } else {
    roots.push(path.join(normalizedMount, 'tmp', 'FixTemp-Benchmark'))
    roots.push(path.join(normalizedMount, 'var', 'tmp', 'FixTemp-Benchmark'))
  }
  roots.push(path.join(normalizedMount, 'FixTemp-Benchmark'))
  return [...new Set(roots)]
}
const currentWorkload = () => {
  const entries = [...state.workerStats.values()]
  return {
    operations: entries.reduce((sum, item) => sum + (item.operations || 0), 0),
    bytesProcessed: entries.reduce((sum, item) => sum + (item.bytesProcessed || 0), 0),
    errors: entries.reduce((sum, item) => sum + (item.errors || 0), 0),
    verified: entries.every(item => item.verified !== false)
  }
}
const stressSensor = type => type === 'gpu'
  ? { activity: metrics.gpu.load, unit: '%', temperature: metrics.gpu.temperature, power: metrics.gpu.power }
  : type === 'memory'
    ? { activity: metrics.memory.used, unit: 'GB', temperature: null, power: null }
  : type === 'disk'
      ? { activity: 0, unit: 'MB/s', temperature: null, power: null }
      : { activity: metrics.cpu.load, unit: '%', temperature: metrics.cpu.temperature, power: metrics.cpu.power }

async function runStorageBenchmark(mount) {
  const targetMount = canonicalMount(mount) || canonicalMount(metrics.storage[0]?.mount)
  if (!targetMount) throw new Error(process.platform === 'win32' ? 'Debe indicar un volumen valido, por ejemplo C:\\' : 'Debe indicar un punto de montaje valido, por ejemplo / o /mnt/datos')
  const normalizedMount = canonicalMount(targetMount)
  const fileSizeBytes = benchmarkSizeMb() * 1024 ** 2
  const pattern = Buffer.allocUnsafe(benchmarkChunkSize)
  for (let index = 0; index < pattern.length; index++) pattern[index] = index % 251
  let handle = null
  let filePath = ''
  let bytesWritten = 0
  let bytesRead = 0
  let verified = true
  const startedAt = Date.now()

  try {
    let lastDirectoryError = null
    for (const root of benchmarkRoots(normalizedMount)) {
      const candidate = path.join(root, `fixtemp-benchmark-${crypto.randomUUID()}.bin`)
      try {
        await mkdir(path.dirname(candidate), { recursive: true })
        handle = await open(candidate, 'w+')
        filePath = candidate
        break
      } catch (error) {
        lastDirectoryError = error
      }
    }
    if (!handle) throw new Error(lastDirectoryError?.message || 'No se pudo reservar un archivo temporal en el volumen seleccionado.')

    const writeStartedAt = performance.now()
    while (bytesWritten < fileSizeBytes) {
      const remaining = fileSizeBytes - bytesWritten
      const chunk = remaining >= pattern.length ? pattern : pattern.subarray(0, remaining)
      await handle.write(chunk, 0, chunk.length, bytesWritten)
      bytesWritten += chunk.length
    }
    await handle.sync()
    const writeSeconds = Math.max(0.001, (performance.now() - writeStartedAt) / 1000)

    const readBuffer = Buffer.allocUnsafe(pattern.length)
    const readStartedAt = performance.now()
    while (bytesRead < fileSizeBytes) {
      const remaining = fileSizeBytes - bytesRead
      const readLength = Math.min(readBuffer.length, remaining)
      const { bytesRead: chunkBytes } = await handle.read(readBuffer, 0, readLength, bytesRead)
      if (chunkBytes <= 0) break
      if (!readBuffer.subarray(0, chunkBytes).equals(pattern.subarray(0, chunkBytes))) verified = false
      bytesRead += chunkBytes
    }
    const readSeconds = Math.max(0.001, (performance.now() - readStartedAt) / 1000)
    const finishedAt = Date.now()

    return {
      mount: normalizedMount,
      startedAt,
      finishedAt,
      durationMs: finishedAt - startedAt,
      fileSizeMb: round(fileSizeBytes / 1024 ** 2, 0),
      pathUsed: filePath,
      bytesWritten,
      bytesRead,
      writeMbps: round((bytesWritten / 1024 ** 2) / writeSeconds, 1),
      readMbps: round((bytesRead / 1024 ** 2) / readSeconds, 1),
      verified: verified && bytesRead === fileSizeBytes
    }
  } finally {
    try { await handle?.close() } catch {}
    await rm(filePath, { force: true }).catch(() => {})
  }
}

function captureStressSample() {
  if (!state.session?.active) return
  const now = Date.now()
  const workload = currentWorkload()
  const sensor = stressSensor(state.session.type)
  if (state.session.type === 'disk') {
    const elapsedSeconds = Math.max(0.1, (now - (state.lastSampleAt || now - 1000)) / 1000)
    sensor.activity = round(Math.max(0, workload.bytesProcessed - state.lastSampleBytes) / 1024 ** 2 / elapsedSeconds, 1)
  }
  state.session.samples.push({
    timestamp: now,
    elapsedMs: now - state.session.startedAt,
    activity: round(sensor.activity, 1),
    activityUnit: sensor.unit,
    temperature: Number.isFinite(sensor.temperature) ? sensor.temperature : null,
    power: Number.isFinite(sensor.power) ? sensor.power : null,
    cpuLoad: metrics.cpu.load,
    gpuLoad: metrics.gpu.load,
    memoryLoad: metrics.memory.load
  })
  if (state.session.samples.length > 601) state.session.samples.shift()
  state.session.workload = workload
  state.lastSampleBytes = workload.bytesProcessed
  state.lastSampleAt = now
}

function summarizeStress() {
  if (!state.session) return null
  const samples = state.session.samples || []
  const activities = samples.map(item => item.activity).filter(Number.isFinite)
  const temperatures = samples.map(item => item.temperature).filter(Number.isFinite)
  const powers = samples.map(item => item.power).filter(Number.isFinite)
  const baselineTemperature = temperatures.length ? temperatures[0] : null
  const peakTemperature = temperatures.length ? Math.max(...temperatures) : null
  const averagePower = finiteAverage(powers)
  const durationHours = Math.max(0, ((state.session.stoppedAt || Date.now()) - state.session.startedAt) / 3600000)
  state.session.summary = {
    samples: samples.length,
    peakActivity: activities.length ? round(Math.max(...activities), 1) : 0,
    averageActivity: finiteAverage(activities) || 0,
    baselineTemperature,
    peakTemperature,
    temperatureDelta: baselineTemperature !== null && peakTemperature !== null ? round(peakTemperature - baselineTemperature, 1) : null,
    averagePower,
    peakPower: powers.length ? round(Math.max(...powers), 1) : null,
    energyWh: averagePower !== null ? round(averagePower * durationHours, 3) : null,
    verified: state.session.workload?.verified !== false && (state.session.workload?.errors || 0) === 0
  }
  return state.session.summary
}

function stopStress(reason = 'manual') {
  captureStressSample()
  for (const worker of state.workers) worker.postMessage('stop')
  setTimeout(() => state.workers.forEach((worker) => worker.terminate()), 800).unref()
  state.workers = []
  if (state.timer) clearInterval(state.timer)
  if (state.session) {
    state.session = { ...state.session, active: false, stoppedAt: Date.now(), stopReason: reason, workload: currentWorkload() }
    summarizeStress()
  }
  state.timer = null
  return state.session
}

app.get('/api/metrics', (_req, res) => {
  state.lastClientSeen = Date.now()
  const now = Date.now()
  expireStaleCpuHardware(now)
  res.json({
    ...metrics,
    history: state.history,
    stress: state.session,
    agent: state.agent,
    hardwareSensor: state.hardwareSensor,
    quality: {
      cpu: { ageMs: now - (state.sensorUpdatedAt.cpu || now), cadenceMs: 1000, source: 'system' },
      memory: { ageMs: now - (state.sensorUpdatedAt.memory || now), cadenceMs: 2000, source: 'system' },
      gpu: { ageMs: now - (state.sensorUpdatedAt.gpu || now), cadenceMs: 2500, source: state.gpuSource || 'unavailable' },
      battery: { ageMs: now - (state.sensorUpdatedAt.battery || now), cadenceMs: 30000, source: metrics.battery.hasBattery ? batterySourceLabel : 'unavailable' },
      temperature: { ageMs: now - (state.sensorUpdatedAt.temperature || now), cadenceMs: state.hardwareSensor.status === 'active' ? 1000 : 20000, source: metrics.cpu.temperatureSource || 'unavailable' },
      clock: { ageMs: now - (state.sensorUpdatedAt.clock || state.sensorUpdatedAt.cpu || now), cadenceMs: state.hardwareSensor.status === 'active' ? 1000 : 5000, source: metrics.cpu.clockSource || 'unavailable' },
      cpuFan: { ageMs: now - (state.sensorUpdatedAt.fan || now), cadenceMs: metrics.cpu.fanSource?.includes('Windows') ? 60000 : 1000, source: metrics.cpu.fanSource || 'unavailable' },
      network: { ageMs: now - (state.sensorUpdatedAt.network || now), cadenceMs: 10000, source: 'system' },
      processes: { ageMs: now - (state.sensorUpdatedAt.processes || now), cadenceMs: 60000, source: 'system' },
      storage: { ageMs: now - (state.sensorUpdatedAt.storage || now), cadenceMs: 120000, source: 'system' },
      cpuPower: { estimated: false, source: metrics.cpu.powerEstimated ? 'unavailable' : 'hardware-sensor' },
      gpuPower: { estimated: false, source: metrics.gpu.power === null ? 'unavailable' : state.gpuSource || 'hardware-sensor' }
    },
    capabilities: {
      cpu: { temperature: metrics.cpu.temperature !== null, clock: metrics.cpu.clock !== null, fan: metrics.cpu.fan !== null, power: !metrics.cpu.powerEstimated && metrics.cpu.power !== null },
      gpu: { temperature: metrics.gpu.temperature !== null, clock: metrics.gpu.clock > 0, load: state.gpuSource !== null, fan: metrics.gpu.fan !== null && metrics.gpu.fan > 0, power: metrics.gpu.power !== null, source: state.gpuSource },
      battery: { present: metrics.battery.hasBattery, cycles: metrics.battery.cycleCount !== null, capacity: metrics.battery.maxCapacity !== null },
      storage: { smart: metrics.hardware.disks.some(disk => disk.smartStatus), devices: metrics.hardware.disks.length }
    }
  })
})

app.get('/api/metrics/live', (_req, res) => {
  state.lastClientSeen = Date.now()
  const now = Date.now()
  expireStaleCpuHardware(now)
  res.json({
    ...metrics,
    processes: [],
    history: state.history,
    stress: state.session,
    agent: state.agent,
    hardwareSensor: state.hardwareSensor,
    quality: {
      cpu: { ageMs: now - (state.sensorUpdatedAt.cpu || now), cadenceMs: 1000, source: 'system' },
      memory: { ageMs: now - (state.sensorUpdatedAt.memory || now), cadenceMs: 2000, source: 'system' },
      gpu: { ageMs: now - (state.sensorUpdatedAt.gpu || now), cadenceMs: 2500, source: state.gpuSource || 'unavailable' },
      battery: { ageMs: now - (state.sensorUpdatedAt.battery || now), cadenceMs: 30000, source: metrics.battery.hasBattery ? batterySourceLabel : 'unavailable' },
      temperature: { ageMs: now - (state.sensorUpdatedAt.temperature || now), cadenceMs: state.hardwareSensor.status === 'active' ? 1000 : 20000, source: metrics.cpu.temperatureSource || 'unavailable' },
      clock: { ageMs: now - (state.sensorUpdatedAt.clock || state.sensorUpdatedAt.cpu || now), cadenceMs: state.hardwareSensor.status === 'active' ? 1000 : 5000, source: metrics.cpu.clockSource || 'unavailable' },
      cpuFan: { ageMs: now - (state.sensorUpdatedAt.fan || now), cadenceMs: metrics.cpu.fanSource?.includes('Windows') ? 60000 : 1000, source: metrics.cpu.fanSource || 'unavailable' },
      network: { ageMs: now - (state.sensorUpdatedAt.network || now), cadenceMs: 10000, source: 'system' },
      processes: { ageMs: now - (state.sensorUpdatedAt.processes || now), cadenceMs: 60000, source: 'system' },
      storage: { ageMs: now - (state.sensorUpdatedAt.storage || now), cadenceMs: 120000, source: 'system' },
      cpuPower: { estimated: false, source: metrics.cpu.powerEstimated ? 'unavailable' : 'hardware-sensor' },
      gpuPower: { estimated: false, source: metrics.gpu.power === null ? 'unavailable' : state.gpuSource || 'hardware-sensor' }
    },
    capabilities: {
      cpu: { temperature: metrics.cpu.temperature !== null, clock: metrics.cpu.clock !== null, fan: metrics.cpu.fan !== null, power: !metrics.cpu.powerEstimated && metrics.cpu.power !== null },
      gpu: { temperature: metrics.gpu.temperature !== null, clock: metrics.gpu.clock > 0, load: state.gpuSource !== null, fan: metrics.gpu.fan !== null && metrics.gpu.fan > 0, power: metrics.gpu.power !== null, source: state.gpuSource },
      battery: { present: metrics.battery.hasBattery, cycles: metrics.battery.cycleCount !== null, capacity: metrics.battery.maxCapacity !== null },
      storage: { smart: metrics.hardware.disks.some(disk => disk.smartStatus), devices: metrics.hardware.disks.length }
    }
  })
})

app.post('/api/metrics/refresh', async (req, res) => {
  state.lastClientSeen = Date.now()
  const target = String(req.body?.target || 'all').toLowerCase()
  const tasks = {
    cpu: () => refreshCpuSensorFallbacks(),
    gpu: () => refreshBasicGpuSnapshot(true),
    memory: () => refreshMemorySnapshot(),
    network: () => refreshNetworkSnapshot(),
    storage: async () => {
      await refreshStorageSnapshot()
      await refreshDiskLayoutSnapshot().catch(() => {})
    },
    processes: () => queueProcessRefresh(true)
  }
  const selected = target === 'all'
    ? Object.entries(tasks)
    : Object.entries(tasks).filter(([name]) => name === target)
  if (!selected.length) return res.status(400).json({ error: 'Unknown refresh target' })
  const results = await Promise.allSettled(selected.map(([, task]) => task()))
  const errors = results
    .map((result, index) => result.status === 'rejected' ? `${selected[index][0]}: ${result.reason?.message || result.reason}` : null)
    .filter(Boolean)
  expireStaleCpuHardware(Date.now())
  res.json({ ok: errors.length === 0, target, errors, metrics })
})

app.get('/api/health', (_req, res) => {
  state.lastClientSeen = Date.now()
  res.json({ ok: true, timestamp: Date.now(), uptime: metrics.hardware.uptime })
})

app.get('/api/sensors/status', (_req, res) => {
  res.json(buildSensorStatus())
})

app.post('/api/sensors/install', async (_req, res) => {
  if (process.platform !== 'win32' || !sensorInstallScriptPath || !existsSync(sensorInstallScriptPath)) {
    res.status(400).json({ error: 'El instalador de sensores no esta disponible en este equipo.' })
    return
  }

  try {
    res.json(await launchElevatedSensorInstaller('Solicitando elevacion para sensores'))
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'No se pudo iniciar el instalador de sensores.' })
  }
})

app.post('/api/sensors/reconnect', async (_req, res) => {
  if (process.platform !== 'win32') {
    await Promise.allSettled([
      refreshCpuSensorFallbacks(),
      refreshBasicGpuSnapshot(true),
      refreshMemorySnapshot(),
      refreshStorageSnapshot()
    ])
    return res.json({ reconnected: true, needsElevation: false, status: buildSensorStatus() })
  }

  if (!sensorTaskPath || !existsSync(sensorTaskPath)) {
    if (!sensorInstallScriptPath || !existsSync(sensorInstallScriptPath)) {
      if (state.sensorProcess) {
        state.sensorProcess.kill()
        state.sensorProcess = null
      }
      startSensorFallback()
      await Promise.allSettled([
        refreshCpuSensorFallbacks(),
        refreshBasicGpuSnapshot(true),
        refreshMemorySnapshot(),
        refreshStorageSnapshot(),
        refreshDiskLayoutSnapshot()
      ])
      res.json({
        reconnected: false,
        needsElevation: false,
        limited: true,
        message: 'FixTemp intento fuentes seguras de Windows. Para temperatura real de CPU y ventiladores se necesita el lector avanzado firmado.',
        status: buildSensorStatus()
      })
      return
    }
    try {
      res.json({ needsElevation: true, ...(await launchElevatedSensorInstaller('Reconectar sensores solicita elevacion')), status: buildSensorStatus() })
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'No se pudo iniciar el instalador de sensores.' })
    }
    return
  }

  try {
    if (state.sensorProcess) {
      state.sensorProcess.kill()
      state.sensorProcess = null
    }
    await startSensorTaskNow()
    await ensureFreshCpuSnapshot(0).catch(() => {})
    const result = await waitForSensorConfirmation()
    if (!result.confirmed) startSensorFallback()
    await Promise.allSettled([refreshCpuSensorFallbacks(), refreshBasicGpuSnapshot(true)])
    res.json({
      reconnected: result.confirmed,
      needsElevation: false,
      limited: !result.confirmed,
      message: result.confirmed ? null : 'FixTemp intento reconectar el lector avanzado y fuentes seguras de Windows. No hubo confirmacion de temperatura real de CPU ni ventilador.',
      status: buildSensorStatus()
    })
  } catch (error) {
    startSensorFallback()
    if (!sensorInstallScriptPath || !existsSync(sensorInstallScriptPath)) {
      await Promise.allSettled([refreshCpuSensorFallbacks(), refreshBasicGpuSnapshot(true)])
      res.json({
        reconnected: false,
        needsElevation: false,
        limited: true,
        message: 'FixTemp intento fuentes seguras de Windows. Para temperatura real de CPU y ventiladores se necesita el lector avanzado firmado.',
        status: buildSensorStatus()
      })
      return
    }
    try {
      const launch = await launchElevatedSensorInstaller(`Reconectar sensores requiere elevacion despues de error: ${error instanceof Error ? error.message : 'desconocido'}`)
      res.json({ needsElevation: true, ...launch, status: buildSensorStatus() })
    } catch {
      res.status(500).json({ error: error instanceof Error ? error.message : 'No se pudo reconectar el lector de sensores.', status: buildSensorStatus() })
    }
  }
})

app.get('/api/processes', (_req, res) => {
  if (Date.now() - (state.sensorUpdatedAt.processes || 0) > 60000) void queueProcessRefresh()
  res.json({
    processes: metrics.processes,
    uptime: metrics.hardware.uptime,
    updatedAt: state.sensorUpdatedAt.processes || 0
  })
})

async function readSystemDetails() {
  if (process.platform !== 'win32') return readPortableSystemDetails(metrics)
  try {
    const nativePowerShell = process.env.SystemRoot
      ? path.join(process.env.SystemRoot, 'Sysnative', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
      : 'powershell.exe'
    const shell = existsSync(nativePowerShell) ? nativePowerShell : 'powershell.exe'
    const { stdout } = await execFileAsync(shell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', systemInfoScript], { windowsHide: true, timeout: 60000, maxBuffer: 8 * 1024 * 1024 })
    // Extraer el JSON desde la última línea que empiece con '{' — robusto contra
    // cualquier texto/warning que PowerShell pueda escribir antes del ConvertTo-Json
    const lines = stdout.trim().split(/\r?\n/)
    const jsonLine = lines.slice().reverse().find(l => l.trim().startsWith('{'))
    if (!jsonLine) throw new Error('system-info.ps1 no produjo JSON válido.')
    const details = parseJsonText(jsonLine)
    const hasInventory = details.cpu?.brand || details.system?.model || details.memory?.length || details.disks?.length || details.graphics?.controllers?.length
    if (!hasInventory) throw new Error('Windows restringió el inventario WMI.')
    const fallback = await readPortableSystemDetails(metrics)
    mergeSystemDetails(details, fallback)
    details.cpu ||= {}
    details.cpu.estimatedTdp = metrics.cpu.tdp
    details.limited = false
    return details
  } catch (error) {
    try {
      const fallback = await readPortableSystemDetails(metrics)
      fallback.limited = true
      fallback.warning = `Inventario parcial: ${error.message}`
      fallback.system ||= {}
      fallback.system.totalMemoryGb ||= metrics.memory.total
      fallback.cpu ||= {}
      fallback.cpu.brand ||= metrics.cpu.model
      fallback.cpu.cores ||= metrics.cpu.cores
      fallback.cpu.physicalCores ||= metrics.cpu.physicalCores
      fallback.cpu.estimatedTdp = metrics.cpu.tdp
      fallback.graphics ||= { controllers: [] }
      if (!fallback.graphics.controllers?.length && metrics.gpu.model !== 'Detectando GPU…') {
        fallback.graphics.controllers = [{ model: metrics.gpu.model, vendor: metrics.gpu.vendor, vram: metrics.gpu.memoryTotal }]
      }
      fallback.disks ||= metrics.hardware.disks.map(disk => ({ ...disk, size: disk.size * 1024 ** 3, volumes: [] }))
      fallback.network ||= metrics.network.interface === 'Detectando red…' ? [] : [{ iface: metrics.network.interface }]
      return fallback
    } catch {}
    return {
      limited: true,
      warning: `Inventario parcial: ${error.message}`,
      system: { totalMemoryGb: metrics.memory.total }, os: {}, directx: {}, bios: {}, baseboard: {}, memorySummary: {},
      cpu: { brand: metrics.cpu.model, socket: null, architecture: null, cores: metrics.cpu.cores, physicalCores: metrics.cpu.physicalCores, estimatedTdp: metrics.cpu.tdp },
      graphics: { controllers: metrics.gpu.model === 'Detectando GPU…' ? [] : [{ model: metrics.gpu.model, vendor: metrics.gpu.vendor, vram: metrics.gpu.memoryTotal }] },
      memory: [],
      disks: metrics.hardware.disks.map(disk => ({ ...disk, size: disk.size * 1024 ** 3, volumes: [] })),
      audio: [],
      network: metrics.network.interface === 'Detectando red…' ? [] : [{ iface: metrics.network.interface }],
      monitors: []
    }
  }
}

function mergeObjectMissing(target = {}, fallback = {}) {
  for (const [key, value] of Object.entries(fallback || {})) {
    if ((target[key] === null || target[key] === undefined || target[key] === '') && value !== null && value !== undefined && value !== '') {
      target[key] = value
    }
  }
  return target
}

function mergeSystemDetails(details, fallback) {
  details.system = mergeObjectMissing(details.system || {}, fallback.system || {})
  details.os = mergeObjectMissing(details.os || {}, fallback.os || {})
  details.directx = mergeObjectMissing(details.directx || {}, fallback.directx || {})
  details.bios = mergeObjectMissing(details.bios || {}, fallback.bios || {})
  details.baseboard = mergeObjectMissing(details.baseboard || {}, fallback.baseboard || {})
  details.cpu = mergeObjectMissing(details.cpu || {}, fallback.cpu || {})
  details.memorySummary = mergeObjectMissing(details.memorySummary || {}, fallback.memorySummary || {})
  if (!Array.isArray(details.memory) || !details.memory.length) details.memory = fallback.memory || []
  if (!Array.isArray(details.disks) || !details.disks.length) details.disks = fallback.disks || []
  details.graphics ||= {}
  fallback.graphics ||= {}
  if (!Array.isArray(details.graphics.controllers) || !details.graphics.controllers.length) details.graphics.controllers = fallback.graphics.controllers || []
  if (!Array.isArray(details.audio) || !details.audio.length) details.audio = fallback.audio || []
  if (!Array.isArray(details.network) || !details.network.length) details.network = fallback.network || []
  if (!Array.isArray(details.monitors) || !details.monitors.length) details.monitors = fallback.monitors || []
  return details
}

async function ensureSystemDetails() {
  if (!state.systemDetails) {
    state.systemDetailsPromise ||= readSystemDetails()
    state.systemDetails = await state.systemDetailsPromise
    state.systemDetailsPromise = null
  }
  return state.systemDetails
}

app.get('/api/system', async (_req, res) => {
  try {
    res.json(await ensureSystemDetails())
  } catch (error) {
    state.systemDetailsPromise = null
    res.status(500).json({ error: error.message })
  }
})

app.get('/api/report', async (_req, res) => {
  try {
    const system = await ensureSystemDetails()
    res.json({
      reportId: crypto.randomUUID(),
      generatedAt: new Date().toISOString(),
      app: {
        name: appManifest.name,
        version: appManifest.version,
        platform: process.platform,
        arch: process.arch
      },
      machine: {
        hostname: metrics.hardware.hostname,
        os: metrics.hardware.os,
        uptimeSeconds: metrics.hardware.uptime
      },
      metrics,
      system,
      overlayConfig: state.overlayConfig,
      storageBenchmark: state.storageBenchmark,
      notes: [
        'Este informe es local y se exporta manualmente por el usuario.',
        'Incluye inventario del equipo, sensores, benchmark de disco y el ultimo estado de pruebas conocido.',
        'Si el tester quiere mas contexto, debe ejecutar las pruebas y luego volver a exportar el informe.'
      ]
    })
  } catch (error) {
    state.systemDetailsPromise = null
    res.status(500).json({ error: error.message })
  }
})

// ── POST /api/ranking/submit ──────────────────────────────────────────────────
// Recibe datos del frontend, agrega hostname + machineId y reenvía al ranking server
app.post('/api/ranking/submit', async (req, res) => {
  try {
    const body = req.body || {}
    const system = await ensureSystemDetails().catch(() => null)
    const hostname = system?.system?.hostname || metrics.hardware?.hostname || os.hostname()
    const cpuModel = body.cpuModel || system?.cpu?.name || metrics.cpu?.model || null
    const machineId = createHash('sha256')
      .update(`${hostname}:${cpuModel}`)
      .digest('hex').slice(0, 16)

    const payload = {
      ...body,
      hostname,
      machineId,
      cpuModel,
      osName: body.osName || system?.os?.name || metrics.hardware?.os || null
    }

    const response = await fetch(`${RANKING_SERVER_URL}/api/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000)
    })
    const result = await response.json()
    res.status(response.ok ? 200 : 502).json(result)
  } catch (error) {
    res.status(502).json({ error: error.message })
  }
})

app.get('/api/export/excel', async (_req, res) => {
  try {
    const system = await ensureSystemDetails()
    const report = { system, metrics }
    const xlsx = buildExcelReport(report)
    const hostname = (metrics.hardware.hostname || 'equipo').replace(/[^a-zA-Z0-9_-]/g, '_')
    const date = new Date().toISOString().slice(0, 10)
    const filename = `FixTemp-${hostname}-${date}.xlsx`
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Content-Length', xlsx.length)
    res.end(xlsx)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.get('/api/storage/benchmark', (_req, res) => res.json(state.storageBenchmark))
app.post('/api/storage/benchmark', async (req, res) => {
  if (state.storageBenchmark.active) return res.status(409).json({ error: 'Ya hay una medicion de disco en curso.', ...state.storageBenchmark })
  const requested = req.body || {}
  const discoveredMounts = new Set(metrics.storage.map(item => {
    const mount = canonicalMount(item.mount)
    return mount || null
  }))
  for (const disk of state.systemDetails?.disks || []) {
    for (const volume of disk.volumes || []) {
      const mount = canonicalMount(volume.mount || volume.letter)
      if (mount) discoveredMounts.add(mount)
    }
  }
  const fallbackMount = canonicalMount(path.parse(os.tmpdir()).root || os.tmpdir())
  discoveredMounts.delete(null)
  const mount = canonicalMount(requested.mount) || [...discoveredMounts][0] || fallbackMount
  const normalizedMount = canonicalMount(mount)
  if (!normalizedMount || !existsSync(normalizedMount)) return res.status(400).json({ error: 'El volumen solicitado no existe en el inventario actual.' })

  state.storageBenchmark = { ...state.storageBenchmark, active: true, mount: normalizedMount, lastError: null, updatedAt: Date.now() }
  try {
    const result = await runStorageBenchmark(normalizedMount)
    state.storageBenchmark = {
      active: false,
      mount: null,
      lastError: null,
      updatedAt: Date.now(),
      results: [result, ...state.storageBenchmark.results.filter(item => item.mount !== result.mount)].slice(0, 8)
    }
    res.json(result)
  } catch (error) {
    state.storageBenchmark = { ...state.storageBenchmark, active: false, mount: null, lastError: error.message, updatedAt: Date.now() }
    res.status(500).json({ error: error.message, ...state.storageBenchmark })
  }
})

app.get('/api/overlay/config', (_req, res) => res.json(state.overlayConfig))
app.post('/api/overlay/config', async (req, res) => {
  const requested = req.body || {}
  const positions = ['top-left', 'top-right', 'bottom-left', 'bottom-right']
  const metricsConfig = Object.fromEntries(Object.keys(defaultOverlayConfig.metrics).map(key => [key, requested.metrics?.[key] !== false]))
  state.overlayConfig = {
    enabled: Boolean(requested.enabled),
    position: positions.includes(requested.position) ? requested.position : defaultOverlayConfig.position,
    opacity: Math.max(45, Math.min(100, Number(requested.opacity) || defaultOverlayConfig.opacity)),
    scale: requested.scale === 'compact' ? 'compact' : 'normal',
    metrics: metricsConfig
  }
  try {
    await mkdir(path.dirname(overlayConfigPath), { recursive: true })
    await writeFile(overlayConfigPath, JSON.stringify(state.overlayConfig, null, 2), 'utf8')
  } catch (error) { console.warn(`No se pudo guardar el overlay: ${error.message}`) }
  res.json(state.overlayConfig)
})

app.post('/api/stress/start', async (req, res) => {
  if (state.session?.active) return res.status(409).json({ error: 'Ya existe una prueba en ejecución.' })
  const requested = req.body || {}
  const type = ['cpu', 'gpu', 'memory', 'disk'].includes(requested.type) ? requested.type : 'cpu'
  const intensity = Math.max(10, Math.min(Number(requested.intensity) || 70, 100))
  const duration = Math.max(10, Math.min(Number(requested.duration) || 60, 600))
  const temperatureLimit = Math.max(70, Math.min(Number(requested.temperatureLimit) || 90, 95))
  if (type === 'cpu' && process.env.FIXTEMP_TEST_ALLOW_NO_TEMP !== '1' && (metrics.cpu.temperature === null || Date.now() - (state.sensorUpdatedAt.temperature || 0) > 5000))
    return res.status(412).json({ error: 'No hay una temperatura CPU real y reciente. La prueba se bloqueó por seguridad.' })
  if (type === 'gpu' && process.env.FIXTEMP_TEST_ALLOW_NO_TEMP !== '1' && (metrics.gpu.temperature === null || Date.now() - (state.sensorUpdatedAt.gpu || 0) > 5000))
    return res.status(412).json({ error: 'No hay una temperatura GPU real y reciente. La prueba se bloqueo por seguridad.' })
  const workerCount = type === 'cpu' ? Math.max(1, os.cpus().length) : type === 'gpu' ? 0 : 1
  state.workerStats.clear()
  state.lastSampleBytes = 0
  state.lastSampleAt = Date.now()
  state.session = {
    id: crypto.randomUUID(), type, intensity, duration, temperatureLimit, active: true, startedAt: Date.now(),
    stopReason: null, samples: [], summary: null,
    workload: { operations: 0, bytesProcessed: 0, errors: 0, verified: true }
  }
  state.workers = Array.from({ length: workerCount }, (_, workerIndex) => new Worker(stressWorkerPath, {
    workerData: { type, intensity, workerIndex, targetMb: Math.min(4096, Math.max(128, Math.round(os.freemem() / 1024 ** 2 * intensity / 100 * 0.35))) }
  }))
  state.workers.forEach((worker, workerIndex) => {
    state.workerStats.set(workerIndex, { operations: 0, bytesProcessed: 0, errors: 0, verified: true })
    worker.on('message', message => {
      if (message?.type === 'progress' && message.stats) state.workerStats.set(workerIndex, message.stats)
    })
    worker.once('error', (error) => { if (state.session?.active) { state.session.error = error.message; stopStress('error') } })
  })
  captureStressSample()
  state.timer = setInterval(async () => {
    if (!state.session?.active) return
    captureStressSample()
    const elapsed = (Date.now() - state.session.startedAt) / 1000
    if (elapsed >= duration) return stopStress('completed')
    const thermal = type === 'gpu' ? metrics.gpu.temperature : metrics.cpu.temperature
    const thermalAge = type === 'gpu' ? Date.now() - (state.sensorUpdatedAt.gpu || 0) : Date.now() - (state.sensorUpdatedAt.temperature || 0)
    if (thermal !== null && thermalAge <= 5000 && thermal >= temperatureLimit)
      stopStress('temperature')
  }, 1000)
  res.json(state.session)
})

app.post('/api/stress/stop', (req, res) => {
  if (req.body?.error && state.session) state.session.error = String(req.body.error).slice(0, 500)
  const allowedReasons = ['manual', 'completed', 'temperature', 'error']
  const reason = allowedReasons.includes(req.body?.reason) ? req.body.reason : 'manual'
  res.json(stopStress(reason))
})


// --- Speed Test ---
const CF = 'https://speed.cloudflare.com'
const speedTestDefault = {
  active: false,
  phase: 'idle',
  progress: 0,
  latencyMs: null,
  downloadMbps: null,
  uploadMbps: null,
  currentMbps: null,
  server: 'speed.cloudflare.com',
  error: null,
  startedAt: null,
  completedAt: null
}
let speedTestState = { ...speedTestDefault }
let speedTestAbort = null

async function measureLatency(signal) {
  const samples = []
  for (let i = 0; i < 5; i++) {
    if (signal.aborted) break
    const t0 = performance.now()
    try {
      const res = await fetch(`${CF}/__down?bytes=0`, { signal })
      await res.arrayBuffer()
      samples.push(performance.now() - t0)
    } catch { /* ignorar */ }
    if (i < 4) await new Promise(r => setTimeout(r, 150).unref())
  }
  if (!samples.length) return null
  samples.sort((a, b) => a - b)
  return round(samples[Math.floor(samples.length / 2)], 1)
}

async function measureDownload(signal, onProgress) {
  const SIZE = 10_000_000
  const start = performance.now()
  let totalBytes = 0
  const stream = async (url) => {
    const res = await fetch(url, { signal })
    const reader = res.body.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done || signal.aborted) break
      totalBytes += value.length
      const elapsed = (performance.now() - start) / 1000
      if (elapsed > 0) onProgress(round((totalBytes * 8) / 1e6 / elapsed, 1), totalBytes)
    }
  }
  await Promise.allSettled([
    stream(`${CF}/__down?bytes=${SIZE}`),
    stream(`${CF}/__down?bytes=${SIZE}`),
    stream(`${CF}/__down?bytes=${SIZE}`)
  ])
  const elapsed = (performance.now() - start) / 1000
  return elapsed > 0 ? round((totalBytes * 8) / 1e6 / elapsed, 1) : 0
}

async function measureUpload(signal) {
  const SIZE = 5_000_000
  const uploadData = Buffer.allocUnsafe(SIZE).fill(0x55)
  const start = performance.now()
  const res = await fetch(`${CF}/__up`, {
    method: 'POST', body: uploadData, signal,
    headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(SIZE) }
  })
  await res.text()
  const elapsed = (performance.now() - start) / 1000
  return elapsed > 0 ? round((SIZE * 8) / 1e6 / elapsed, 1) : 0
}

async function runSpeedTest() {
  const ac = new AbortController()
  speedTestAbort = ac
  speedTestState = { ...speedTestDefault, active: true, startedAt: Date.now() }
  try {
    speedTestState = { ...speedTestState, phase: 'latency', progress: 5 }
    speedTestState.latencyMs = await measureLatency(ac.signal)
    if (ac.signal.aborted) return
    speedTestState.progress = 15
    speedTestState = { ...speedTestState, phase: 'warmup', progress: 18 }
    try { const r = await fetch(`${CF}/__down?bytes=1000000`, { signal: ac.signal }); await r.arrayBuffer() } catch { /* ignorar */ }
    if (ac.signal.aborted) return
    speedTestState.progress = 22
    speedTestState = { ...speedTestState, phase: 'download', progress: 25 }
    const dlMbps = await measureDownload(ac.signal, (mbps, bytes) => {
      speedTestState.currentMbps = mbps
      speedTestState.progress = 25 + Math.min(45, Math.round((bytes / 30_000_000) * 45))
    })
    speedTestState = { ...speedTestState, downloadMbps: dlMbps, currentMbps: null, progress: 70 }
    if (ac.signal.aborted) return
    speedTestState = { ...speedTestState, phase: 'upload', progress: 72 }
    const ulMbps = await measureUpload(ac.signal)
    if (ac.signal.aborted) return
    speedTestState = { ...speedTestState, uploadMbps: ulMbps, currentMbps: null, phase: 'done', progress: 100, completedAt: Date.now() }
  } catch (err) {
    if (!ac.signal.aborted) speedTestState = { ...speedTestState, phase: 'error', error: err.message }
  } finally {
    speedTestState = { ...speedTestState, active: false }
    speedTestAbort = null
  }
}

app.get('/api/speedtest', (_req, res) => res.json(speedTestState))
app.post('/api/speedtest/start', (_req, res) => {
  if (speedTestState.active) return res.status(409).json({ error: 'Prueba en curso.' })
  runSpeedTest()
  res.json(speedTestState)
})
app.post('/api/speedtest/stop', (_req, res) => {
  speedTestAbort?.abort()
  speedTestState = { ...speedTestState, active: false, phase: 'cancelled', currentMbps: null }
  speedTestAbort = null
  res.json(speedTestState)
})

// ── Auto-update ─────────────────────────────────────────────────────────────
const DEFAULT_UPDATE_RELEASE_URL = 'https://api.github.com/repos/TakeruTK/FixTemp/releases/latest'
const UPDATE_MANIFEST_URL = process.env.FIXTEMP_UPDATE_URL || DEFAULT_UPDATE_RELEASE_URL
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

let updateDownload = { active: false, percent: 0, filePath: null, error: null }
let updateState = {
  available: true,
  checking: false,
  checkedAt: 0,
  currentVersion: appManifest.version,
  latestVersion: appManifest.version,
  hasUpdate: false,
  downloadUrl: null,
  changelog: '',
  error: null
}

const syncUpdateCurrentVersion = async () => {
  try {
    const pkg = parseJsonText(await readFile(packageJsonPath, 'utf-8').catch(() => '{"version":"0.0.0"}'))
    const current = pkg.version || appManifest.version || '0.0.0'
    updateState.currentVersion = current
    return current
  } catch {
    const current = appManifest.version || '0.0.0'
    updateState.currentVersion = current
    return current
  }
}

const normalizeVersion = (value) => String(value || '').trim().replace(/^v/i, '')
const compareVersions = (left, right) => normalizeVersion(left).localeCompare(normalizeVersion(right), undefined, { numeric: true, sensitivity: 'base' })
const updateFetchHeaders = () => UPDATE_MANIFEST_URL.includes('api.github.com')
  ? { 'User-Agent': 'FixTemp-Updater', Accept: 'application/vnd.github+json' }
  : undefined
const releaseAssetDownloadUrl = (assets) => {
  if (!Array.isArray(assets)) return null
  const installer = assets.find(asset => /^FixTemp-Setup-.*\.exe$/i.test(asset?.name || ''))
    || assets.find(asset => /\.exe$/i.test(asset?.name || ''))
  return typeof installer?.browser_download_url === 'string' ? installer.browser_download_url : null
}
const normalizeUpdateManifest = (payload, current) => {
  const version = normalizeVersion(payload?.version || payload?.tag_name || payload?.name || current) || current
  return {
    version,
    downloadUrl: typeof payload?.downloadUrl === 'string'
      ? payload.downloadUrl
      : typeof payload?.download_url === 'string'
        ? payload.download_url
        : releaseAssetDownloadUrl(payload?.assets),
    changelog: typeof payload?.changelog === 'string'
      ? payload.changelog
      : typeof payload?.body === 'string'
        ? payload.body
        : ''
  }
}

async function performUpdateCheck(force = false) {
  const current = await syncUpdateCurrentVersion()
  if (!updateState.available) {
    updateState = { ...updateState, currentVersion: current, checkedAt: Date.now(), checking: false, hasUpdate: false, latestVersion: current, downloadUrl: null, changelog: '', error: 'Las actualizaciones automáticas no están disponibles en este sistema.' }
    return updateState
  }

  if (updateState.checking) return updateState
  if (!force && updateState.checkedAt && Date.now() - updateState.checkedAt < UPDATE_CHECK_INTERVAL_MS) return updateState

  updateState = { ...updateState, currentVersion: current, checking: true, error: null }
  try {
    const response = await fetch(UPDATE_MANIFEST_URL, { signal: AbortSignal.timeout(8000), headers: updateFetchHeaders() })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const manifest = normalizeUpdateManifest(await response.json(), current)
    const latest = manifest.version || current
    const hasUpdate = latest !== current && compareVersions(latest, current) > 0
    updateState = {
      ...updateState,
      checking: false,
      checkedAt: Date.now(),
      currentVersion: current,
      latestVersion: latest,
      hasUpdate,
      downloadUrl: manifest.downloadUrl,
      changelog: manifest.changelog,
      error: null
    }
  } catch (err) {
    updateState = {
      ...updateState,
      checking: false,
      checkedAt: Date.now(),
      currentVersion: current,
      latestVersion: current,
      hasUpdate: false,
      downloadUrl: null,
      changelog: '',
      error: err instanceof Error ? err.message : String(err)
    }
  }
  return updateState
}

app.get('/api/update/status', async (_req, res) => {
  await syncUpdateCurrentVersion()
  res.json({ ...updateState, download: updateDownload })
})

app.get('/api/update/check', async (_req, res) => {
  const nextState = await performUpdateCheck(true)
  if (nextState.error) {
    res.status(503).json({ error: 'No se pudo verificar actualizaciones', detail: nextState.error, ...nextState })
    return
  }
  res.json(nextState)
})

app.post('/api/update/check', async (req, res) => {
  const force = Boolean(req.body?.force)
  const nextState = await performUpdateCheck(force)
  if (nextState.error) {
    res.status(503).json({ error: 'No se pudo verificar actualizaciones', detail: nextState.error, ...nextState })
    return
  }
  res.json(nextState)
})

app.get('/api/update/progress', (_req, res) => res.json(updateDownload))

app.post('/api/update/download', (req, res) => {
  const { downloadUrl } = req.body || {}
  if (!downloadUrl) return res.status(400).json({ error: 'downloadUrl requerido' })
  if (updateDownload.active) return res.status(409).json({ error: 'Descarga en progreso' })

  const filePath = path.join(os.tmpdir(), 'FixTemp-Setup.exe')
  updateDownload = { active: true, percent: 0, filePath: null, error: null }
  res.json({ started: true, filePath })

  const doGet = (url, depth = 0) => {
    if (depth > 5) { updateDownload = { active: false, percent: 0, filePath: null, error: 'Demasiadas redirecciones' }; return }
    const client = url.startsWith('https') ? https : http
    client.get(url, (incoming) => {
      if (incoming.statusCode >= 300 && incoming.statusCode < 400 && incoming.headers.location) {
        incoming.resume()
        const nextUrl = new URL(incoming.headers.location, url).toString()
        doGet(nextUrl, depth + 1)
        return
      }
      if (incoming.statusCode !== 200) {
        incoming.resume()
        updateDownload = { active: false, percent: 0, filePath: null, error: `HTTP ${incoming.statusCode}` }
        return
      }
      const total = parseInt(incoming.headers['content-length'] || '0')
      let received = 0
      const fileStream = createWriteStream(filePath)
      let completed = false
      const fail = (err) => {
        if (completed) return
        completed = true
        void rm(filePath, { force: true }).catch(() => {})
        updateDownload = { active: false, percent: 0, filePath: null, error: err instanceof Error ? err.message : String(err) }
      }
      incoming.on('data', chunk => {
        received += chunk.length
        updateDownload.percent = total ? Math.min(99, Math.round(received / total * 100)) : -1
      })
      incoming.on('error', fail)
      fileStream.on('error', fail)
      fileStream.on('finish', () => {
        if (completed) return
        completed = true
        updateDownload = { active: false, percent: 100, filePath, error: null }
      })
      incoming.pipe(fileStream)
    }).on('error', err => {
      updateDownload = { active: false, percent: 0, filePath: null, error: err.message }
    })
  }
  doGet(downloadUrl)
})

app.post('/api/update/install', (req, res) => {
  if (process.platform !== 'win32') return res.status(400).json({ error: 'La instalación automática de actualizaciones está disponible actualmente sólo en Windows.' })
  const filePath = updateDownload.filePath || req.body?.filePath
  if (!filePath || !existsSync(filePath)) return res.status(400).json({ error: 'Instalador no encontrado en: ' + filePath })
  res.json({ installing: true })
  setTimeout(async () => {
    const directLogPath = path.join(windowsProgramDataPath, 'FixTemp', 'update-install.log')
    await mkdir(path.dirname(directLogPath), { recursive: true })
    const relaunchTarget = appExecutablePath && existsSync(appExecutablePath) ? appExecutablePath : path.join(process.env.ProgramFiles || appInstallDir, 'FixTemp', 'FixTemp.exe')
    const updaterScriptPath = path.join(os.tmpdir(), 'FixTemp-Apply-Update.vbs')
    const updaterScript = [
      'On Error Resume Next',
      'Dim shell, fso, logFile, log, installer, appPath, exitCode',
      'Set shell = CreateObject("WScript.Shell")',
      'Set fso = CreateObject("Scripting.FileSystemObject")',
      `installer = "${vbsQuote(filePath)}"`,
      `appPath = "${vbsQuote(relaunchTarget)}"`,
      `logFile = "${vbsQuote(directLogPath)}"`,
      'Sub WriteLog(message)',
      '  On Error Resume Next',
      '  Set log = fso.OpenTextFile(logFile, 8, True)',
      '  log.WriteLine Now & " " & message',
      '  log.Close',
      'End Sub',
      'WriteLog "Actualizador silencioso iniciado: " & installer',
      'WScript.Sleep 2500',
      'exitCode = shell.Run("""" & installer & """ /S", 0, True)',
      'WriteLog "Instalador terminado con codigo " & exitCode',
      'WScript.Sleep 3500',
      'If fso.FileExists(appPath) Then',
      '  shell.Run """" & appPath & """", 1, False',
      '  WriteLog "FixTemp relanzado: " & appPath',
      'Else',
      '  WriteLog "No se encontro FixTemp para relanzar: " & appPath',
      'End If',
      'fso.DeleteFile WScript.ScriptFullName, True'
    ].join('\r\n')
    await writeFile(updaterScriptPath, updaterScript, 'utf8')
    await writeFile(directLogPath, `${new Date().toISOString()} Lanzando actualizador silencioso: ${updaterScriptPath}\r\n`, { flag: 'a' })
    const installerProcess = spawn(path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'wscript.exe'), ['//B', '//Nologo', updaterScriptPath], { detached: true, stdio: 'ignore', windowsHide: true })
    installerProcess.unref()
    process.exit(0)
    return
    const updateScriptPath = path.join(os.tmpdir(), 'FixTemp-Apply-Update.ps1')
    const logPath = path.join(windowsProgramDataPath, 'FixTemp', 'update-install.log')
    const script = [
      `$installer = ${psQuote(filePath)}`,
      `$app = ${psQuote(relaunchTarget)}`,
      `$installDir = ${psQuote(appInstallDir)}`,
      `$parentPid = ${process.pid}`,
      `$log = ${psQuote(logPath)}`,
      `New-Item -ItemType Directory -Force -Path (Split-Path -Parent $log) | Out-Null`,
      `function Write-FixTempLog([string]$message) { Add-Content -LiteralPath $log -Value "$(Get-Date -Format o) $message" }`,
      `Write-FixTempLog "Script de actualizacion iniciado. installer=$installer app=$app installDir=$installDir parentPid=$parentPid"`,
      `$uiReady = $false`,
      `try {`,
      `  Add-Type -AssemblyName System.Windows.Forms`,
      `  Add-Type -AssemblyName System.Drawing`,
      `  $form = New-Object System.Windows.Forms.Form`,
      `  $form.Text = 'Actualizando FixTemp'`,
      `  $form.StartPosition = 'CenterScreen'`,
      `  $form.Size = New-Object System.Drawing.Size(440, 180)`,
      `  $form.FormBorderStyle = 'FixedDialog'`,
      `  $form.MaximizeBox = $false`,
      `  $form.MinimizeBox = $false`,
      `  $form.TopMost = $true`,
      `  $label = New-Object System.Windows.Forms.Label`,
      `  $label.AutoSize = $false`,
      `  $label.Location = New-Object System.Drawing.Point(24, 24)`,
      `  $label.Size = New-Object System.Drawing.Size(380, 48)`,
      `  $label.Font = New-Object System.Drawing.Font('Segoe UI', 11, [System.Drawing.FontStyle]::Bold)`,
      `  $label.Text = 'Preparando actualizacion...'`,
      `  $detail = New-Object System.Windows.Forms.Label`,
      `  $detail.AutoSize = $false`,
      `  $detail.Location = New-Object System.Drawing.Point(24, 78)`,
      `  $detail.Size = New-Object System.Drawing.Size(380, 22)`,
      `  $detail.Font = New-Object System.Drawing.Font('Segoe UI', 9)`,
      `  $detail.ForeColor = [System.Drawing.Color]::FromArgb(95, 95, 95)`,
      `  $detail.Text = 'No cierres esta ventana. FixTemp se abrira al terminar.'`,
      `  $bar = New-Object System.Windows.Forms.ProgressBar`,
      `  $bar.Location = New-Object System.Drawing.Point(24, 112)`,
      `  $bar.Size = New-Object System.Drawing.Size(380, 18)`,
      `  $bar.Style = 'Marquee'`,
      `  $bar.MarqueeAnimationSpeed = 28`,
      `  $form.Controls.AddRange(@($label, $detail, $bar))`,
      `  $form.Show()`,
      `  [System.Windows.Forms.Application]::DoEvents()`,
      `  $uiReady = $true`,
      `} catch { Write-FixTempLog "No se pudo abrir panel de actualizacion: $($_.Exception.Message)" }`,
      `function Set-UpdateStatus([string]$message, [string]$info = '') { if ($uiReady) { $label.Text = $message; if ($info) { $detail.Text = $info }; [System.Windows.Forms.Application]::DoEvents() }; Write-FixTempLog $message }`,
      `function Invoke-FixTempInstaller([bool]$elevated) {`,
      `  $mode = if ($elevated) { 'elevado' } else { 'normal' }`,
      `  $startInfo = @{ FilePath = $installer; ArgumentList = '/S'; PassThru = $true; ErrorAction = 'Stop' }`,
      `  if ($elevated) { $startInfo.Verb = 'RunAs' }`,
      `  $proc = Start-Process @startInfo`,
      `  Write-FixTempLog "Instalador $mode iniciado pid=$($proc.Id)"`,
      `  $deadline = (Get-Date).AddMinutes(8)`,
      `  $tick = 0`,
      `  while (!$proc.HasExited) {`,
      `    if ((Get-Date) -gt $deadline) {`,
      `      try { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } catch {}`,
      `      throw "Tiempo agotado esperando instalador $mode"`,
      `    }`,
      `    $tick++`,
      `    $dots = '.' * (($tick % 3) + 1)`,
      `    Set-UpdateStatus 'Instalando actualizacion...' "Copiando archivos$dots"`,
      `    Start-Sleep -Seconds 2`,
      `    try { $proc.Refresh() } catch {}`,
      `  }`,
      `  Write-FixTempLog "Instalador $mode termino con codigo $($proc.ExitCode)"`,
      `  if ($null -ne $proc.ExitCode -and $proc.ExitCode -ne 0) { throw "Instalador $mode termino con codigo $($proc.ExitCode)" }`,
      `}`,
      `Write-FixTempLog "Iniciando actualizacion con $installer"`,
      `Set-UpdateStatus 'Esperando que FixTemp cierre...' 'Estamos preparando la instalacion.'`,
      `try { Wait-Process -Id $parentPid -Timeout 35 -ErrorAction SilentlyContinue } catch {}`,
      `Start-Sleep -Seconds 2`,
      `Set-UpdateStatus 'Cerrando procesos anteriores...' 'Esto evita que Windows deje archivos bloqueados.'`,
      `Get-Process FixTemp,PulseGuard -ErrorAction SilentlyContinue | Where-Object { $_.Id -ne $PID } | ForEach-Object { try { Write-FixTempLog "Cerrando proceso $($_.ProcessName) $($_.Id)"; Stop-Process -Id $_.Id -Force -ErrorAction Stop } catch { Write-FixTempLog "No se pudo cerrar $($_.Id): $($_.Exception.Message)" } }`,
      `$installed = $false`,
      `Set-UpdateStatus 'Instalando actualizacion...' 'Puede aparecer una confirmacion de Windows.'`,
      `try {`,
      `  Invoke-FixTempInstaller $true`,
      `  $installed = $true`,
      `} catch {`,
      `  Write-FixTempLog "Instalador elevado fallo: $($_.Exception.Message)"`,
      `  try {`,
      `    Set-UpdateStatus 'Instalando sin elevacion...' 'Si esta parte falla, ejecuta el instalador como administrador.'`,
      `    Invoke-FixTempInstaller $false`,
      `    $installed = $true`,
      `  } catch { Write-FixTempLog "Instalador normal fallo: $($_.Exception.Message)" }`,
      `}`,
      `if (!$installed) {`,
      `  if ($uiReady) {`,
      `    $bar.Style = 'Blocks'`,
      `    $label.Text = 'No se pudo instalar la actualizacion'`,
      `    $detail.Text = 'Revisa el log en C:\\ProgramData\\FixTemp\\update-install.log'`,
      `    [System.Windows.Forms.Application]::DoEvents()`,
      `  }`,
      `  Start-Sleep -Seconds 12`,
      `  if ($uiReady) { $form.Close() }`,
      `  exit 1`,
      `}`,
      `Set-UpdateStatus 'Finalizando...' 'FixTemp se abrira en unos segundos.'`,
      `Start-Sleep -Seconds 8`,
      `$programFiles = [Environment]::GetFolderPath('ProgramFiles')`,
      `$programFilesX86 = [Environment]::GetFolderPath('ProgramFilesX86')`,
      `$candidates = @($app, (Join-Path $installDir 'FixTemp.exe'), (Join-Path $programFiles 'FixTemp\\FixTemp.exe'), (Join-Path $programFilesX86 'FixTemp\\FixTemp.exe')) | Where-Object { $_ } | Select-Object -Unique`,
      `foreach ($candidate in $candidates) {`,
      `  if (Test-Path -LiteralPath $candidate) {`,
      `    for ($i = 1; $i -le 8; $i++) {`,
      `      try { Set-UpdateStatus 'Abriendo FixTemp...' "Intento $i"; Start-Process -FilePath $candidate -ErrorAction Stop; break } catch { Write-FixTempLog "No se pudo abrir intento $i: $($_.Exception.Message)"; Start-Sleep -Seconds 5 }`,
      `    }`,
      `    break`,
      `  }`,
      `}`,
      `if ($uiReady) {`,
      `  $bar.Style = 'Blocks'`,
      `  $bar.Value = 100`,
      `  $label.Text = 'Actualizacion lista'`,
      `  $detail.Text = 'FixTemp ya se esta abriendo.'`,
      `  [System.Windows.Forms.Application]::DoEvents()`,
      `}`,
      `Start-Sleep -Seconds 3`,
      `if ($uiReady) { $form.Close() }`,
      `Write-FixTempLog "Actualizacion finalizada. installed=$installed"`,
      `Remove-Item -LiteralPath $PSCommandPath -Force -ErrorAction SilentlyContinue`
    ].join('\r\n')
    await writeFile(updateScriptPath, script, 'utf8')
    spawn('powershell.exe', ['-NoProfile', '-STA', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', updateScriptPath], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
    process.exit(0)
  }, 600)
})

if (process.platform === 'win32') {
  setTimeout(() => { void performUpdateCheck(false) }, 20000).unref()
  repeat(async () => { await performUpdateCheck(false) }, 60 * 60 * 1000, 30 * 60 * 1000)
} else {
  updateState = {
    ...updateState,
    available: false,
    currentVersion: appManifest.version,
    latestVersion: appManifest.version,
    error: 'Las actualizaciones automáticas no están disponibles en este sistema.'
  }
}
// ─────────────────────────────────────────────────────────────────────────────

const dist = process.resourcesPath && runtimeDir.includes('app.asar')
  ? path.join(process.resourcesPath, 'app.asar', 'dist')
  : path.resolve(runtimeDir, '../dist')
app.use(express.static(dist))
app.get('/{*path}', (_req, res) => res.sendFile(path.join(dist, 'index.html')))

const httpServer = app.listen(port, '127.0.0.1', () => console.log(`FixTemp API: http://127.0.0.1:${port}`))
httpServer.ref()

process.on('SIGINT', () => { state.sensorProcess?.kill(); nvidiaSmiChild?.kill(); stopStress('shutdown'); process.exit(0) })
process.on('SIGTERM', () => { state.sensorProcess?.kill(); nvidiaSmiChild?.kill(); stopStress('shutdown'); process.exit(0) })
