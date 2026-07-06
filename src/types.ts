export type StressType = 'cpu' | 'memory' | 'disk' | 'gpu'

export type SpeedTestPhase = 'idle' | 'latency' | 'warmup' | 'download' | 'upload' | 'done' | 'error' | 'cancelled'

export interface SpeedTestState {
  active: boolean
  phase: SpeedTestPhase
  progress: number
  latencyMs: number | null
  downloadMbps: number | null
  uploadMbps: number | null
  currentMbps: number | null
  server: string
  error: string | null
  startedAt: number | null
  completedAt: number | null
}

export interface StressSample {
  timestamp: number
  elapsedMs: number
  activity: number
  activityUnit: '%' | 'GB' | 'MB/s'
  temperature: number | null
  power: number | null
  cpuLoad: number
  gpuLoad: number
  memoryLoad: number
}

export interface StressSummary {
  samples: number
  peakActivity: number
  averageActivity: number
  baselineTemperature: number | null
  peakTemperature: number | null
  temperatureDelta: number | null
  averagePower: number | null
  peakPower: number | null
  energyWh: number | null
  verified: boolean
}

export interface StressSession {
  id?: string
  type: StressType
  intensity: number
  duration: number
  temperatureLimit: number
  active: boolean
  startedAt: number
  stoppedAt?: number
  stopReason?: 'manual' | 'completed' | 'temperature' | 'shutdown' | 'error' | null
  error?: string
  samples?: StressSample[]
  summary?: StressSummary | null
  workload?: { operations: number; bytesProcessed: number; errors: number; verified: boolean }
}

export interface OverlayConfig {
  enabled: boolean
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  opacity: number
  scale: 'compact' | 'normal'
  metrics: { cpu: boolean; gpu: boolean; ram: boolean; vram: boolean; temperatures: boolean; power: boolean; fps: boolean }
}

export interface Metrics {
  timestamp: number
  cpu: { model: string; load: number; temperature: number | null; temperatureSource?: string | null; clock: number | null; clockMin?: number | null; clockMax?: number | null; clockSource?: string | null; fan?: number | null; fanSource?: string | null; cores: number; physicalCores: number; perCore: number[]; power: number | null; powerEstimated: boolean; tdp: number }
  gpu: { model: string; vendor: string; load: number; temperature: number | null; clock: number; memoryUsed: number; memoryTotal: number; fan: number | null; power: number | null; powerLimit: number | null }
  battery: { hasBattery: boolean; percent: number | null; isCharging: boolean | null; acConnected: boolean | null; cycleCount: number | null; designedCapacity: number | null; maxCapacity: number | null; currentCapacity: number | null; capacityUnit: string | null; voltage: number | null; timeRemaining: number | null; manufacturer: string | null; model: string | null }
  memory: { load: number; used: number; total: number; available: number }
  network: { interface: string; down: number; up: number }
  storage: { fs: string; mount: string; used: number; size: number; use: number }[]
  processes: { pid: number; name: string; cpu: number; memory: number; memoryPercent: number }[]
  hardware: { os: string; hostname: string; uptime: number; disks: { name: string; type: string; size: number; vendor: string; smartStatus?: string | null; interfaceType?: string | null; serialNum?: string | null }[] }
  history: { time: number; cpu: number; gpu: number; ram: number }[]
  stress: StressSession | null
  fps?: number | null
  fpsSource?: string | null
  agent?: { cpu: number; memoryMb: number; updatedAt: number }
  hardwareSensor?: { status: 'starting' | 'active' | 'unavailable'; source: string | null; error: string | null; updatedAt: number }
  quality?: Record<string, { ageMs?: number; cadenceMs?: number; source: string; estimated?: boolean }>
  capabilities?: {
    cpu: { temperature: boolean; clock: boolean; fan: boolean; power: boolean }
    gpu: { temperature: boolean; clock: boolean; load: boolean; fan: boolean; power: boolean; source: string | null }
    battery: { present: boolean; cycles: boolean; capacity: boolean }
    storage: { smart: boolean; devices: number }
  }
}
