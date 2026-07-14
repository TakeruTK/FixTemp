import { startTransition, useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Clock3, HardDrive, MemoryStick, Radio, RefreshCw, ShieldCheck } from 'lucide-react'
import { useI18n } from '../i18n'
import type { Metrics } from '../types'
import { MetricCard } from './MetricCard'
import { Gauge } from './Gauge'

interface ProcessSnapshot {
  processes: Metrics['processes']
  uptime: number
}

interface SensorStatus {
  helperAvailable: boolean
  installerAvailable: boolean
  directActive: boolean
  taskInstalled?: boolean
  snapshotExists?: boolean
  cpuFanAvailable: boolean
  cpuFanSource?: string | null
  cpuFanCandidates?: { value: number; source?: string | null; name?: string | null; type?: string | null }[]
  cpuTempAvailable: boolean
  source: string | null
  error?: string | null
}

const formatRate = (kb: number) => kb > 1024 ? `${(kb / 1024).toFixed(1)} MB/s` : `${kb} KB/s`
const formatUptime = (seconds: number) => `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const normalize = (value: number | null, max: number) => value === null || !Number.isFinite(value) ? null : clamp(value / Math.max(1, max) * 100, 0, 100)
const sameProcesses = (a: Metrics['processes'], b: Metrics['processes']) =>
  a.length === b.length && a.every((item, index) => {
    const other = b[index]
    return Boolean(other)
      && item.pid === other.pid
      && item.name === other.name
      && item.cpu === other.cpu
      && item.memory === other.memory
  })

const copy = {
  es: {
    processor: 'Procesador',
    directSensor: 'SENSOR DIRECTO',
    limitedRead: 'LECTURA LIMITADA',
    sensorNA: 'Sensor no disponible',
    cpuTemp: 'Temperatura',
    cpuClock: 'Reloj',
    gpuTemp: 'Temperatura',
    frequency: 'Reloj',
    fan: 'Ventilador',
    fanStopped: '0% (apagado)',
    noSensor: 'Sin sensor',
    fanUnavailable: 'Sin lectura fiable',
    memory: 'MEMORIA',
    inUse: 'En uso',
    available: 'GB disponibles',
    of: 'de',
    liveTraffic: 'TRAFICO EN VIVO',
    network: 'Red',
    download: 'Descarga',
    upload: 'Subida',
    capacity: 'CAPACIDAD',
    storage: 'Almacenamiento',
    activity: 'ACTIVIDAD',
    topProcesses: 'Procesos principales',
    activeFor: 'Activo',
    process: 'PROCESO',
    sensorsTitle: 'Sensores avanzados de CPU',
    sensorsText: 'La lectura completa de temperatura y ventilador requiere el lector avanzado de placa. Activalo para recuperar los sensores reales del procesador.',
    sensorsReady: 'Lectura avanzada activa',
    sensorsReadyText: 'FixTemp ya puede usar temperatura y ventilador reales desde el lector de placa.',
    sensorsInstall: 'Activar sensores avanzados',
    sensorsInstalling: 'Abriendo asistente...',
    sensorsRefresh: 'Actualizar estado',
    sensorsLaunched: 'Se abrio el asistente con permisos de Windows. Cuando termine, espera unos segundos y pulsa actualizar.',
    sensorsWaiting: 'Esperando confirmacion del lector avanzado...',
    sensorsActivated: 'Lectura avanzada activa.',
    sensorsStillLimited: 'El lector avanzado aun no quedo activo. Acepta el permiso de Windows o revisa si el antivirus lo bloqueo.',
    sensorsError: 'No se pudo iniciar el asistente de sensores.',
    sensorsLimited: 'Modo limitado',
    sensorsSource: 'Origen',
    sensorsRecommendation: 'Recomendacion',
    okShort: 'OK',
    missingShort: 'Sin lectura'
  },
  en: {
    processor: 'Processor',
    directSensor: 'DIRECT SENSOR',
    limitedRead: 'LIMITED READOUT',
    sensorNA: 'Sensor unavailable',
    cpuTemp: 'Temperature',
    cpuClock: 'Clock',
    gpuTemp: 'Temperature',
    frequency: 'Clock',
    fan: 'Fan',
    fanStopped: '0% (stopped)',
    noSensor: 'No sensor',
    fanUnavailable: 'No reliable reading',
    memory: 'MEMORY',
    inUse: 'In use',
    available: 'GB available',
    of: 'of',
    liveTraffic: 'LIVE TRAFFIC',
    network: 'Network',
    download: 'Download',
    upload: 'Upload',
    capacity: 'CAPACITY',
    storage: 'Storage',
    activity: 'ACTIVITY',
    topProcesses: 'Top processes',
    activeFor: 'Up',
    process: 'PROCESS',
    sensorsTitle: 'Advanced CPU sensors',
    sensorsText: 'Full temperature and fan readout requires the advanced motherboard reader. Enable it to recover real CPU sensors.',
    sensorsReady: 'Advanced readout active',
    sensorsReadyText: 'FixTemp can already use real temperature and fan readings from the motherboard reader.',
    sensorsInstall: 'Enable advanced sensors',
    sensorsInstalling: 'Opening assistant...',
    sensorsRefresh: 'Refresh status',
    sensorsLaunched: 'The elevated assistant was opened. When it finishes, wait a few seconds and refresh the status.',
    sensorsWaiting: 'Waiting for the advanced reader to confirm...',
    sensorsActivated: 'Advanced readout is active.',
    sensorsStillLimited: 'The advanced reader is not active yet. Accept the Windows permission or check whether antivirus blocked it.',
    sensorsError: 'Could not start the sensor assistant.',
    sensorsLimited: 'Limited mode',
    sensorsSource: 'Source',
    sensorsRecommendation: 'Recommendation',
    okShort: 'OK',
    missingShort: 'Missing'
  },
  'zh-CN': {
    processor: '处理器',
    directSensor: '直接传感器',
    limitedRead: '受限读数',
    sensorNA: '传感器不可用',
    cpuTemp: '温度',
    cpuClock: '频率',
    gpuTemp: '温度',
    frequency: '频率',
    fan: '风扇',
    fanStopped: '0%（停止）',
    noSensor: '无传感器',
    fanUnavailable: '无可靠读数',
    memory: '内存',
    inUse: '已使用',
    available: 'GB 可用',
    of: '/',
    liveTraffic: '实时流量',
    network: '网络',
    download: '下载',
    upload: '上传',
    capacity: '容量',
    storage: '存储',
    activity: '活动',
    topProcesses: '主要进程',
    activeFor: '运行',
    process: '进程',
    sensorsTitle: 'CPU 高级传感器',
    sensorsText: '完整的温度和风扇读数需要高级主板读取器。启用它以恢复真实 CPU 传感器。',
    sensorsReady: '高级读数已启用',
    sensorsReadyText: 'FixTemp 已可使用来自主板读取器的真实温度和风扇读数。',
    sensorsInstall: '启用高级传感器',
    sensorsInstalling: '正在打开向导...',
    sensorsRefresh: '刷新状态',
    sensorsLaunched: '已打开 Windows 提权向导。完成后请等待几秒再刷新状态。',
    sensorsWaiting: '正在等待高级读取器确认...',
    sensorsActivated: '高级读取已启用。',
    sensorsStillLimited: '高级读取器尚未启用。请接受 Windows 权限或检查防病毒软件是否阻止了它。',
    sensorsError: '无法启动传感器向导。',
    sensorsLimited: '受限模式',
    sensorsSource: '来源',
    sensorsRecommendation: '建议',
    okShort: '正常',
    missingShort: '缺失'
  }
} as const

export function Dashboard({ data }: { data: Metrics }) {
  const { language } = useI18n()
  const text = copy[language]
  const [processes, setProcesses] = useState<Metrics['processes']>([])
  const [processUptime, setProcessUptime] = useState(data.hardware.uptime)
  const [sensorStatus, setSensorStatus] = useState<SensorStatus | null>(null)
  const [sensorLoading, setSensorLoading] = useState(false)
  const [sensorInstalling, setSensorInstalling] = useState(false)
  const [sensorMessage, setSensorMessage] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    let timer = 0

    const load = async () => {
      try {
        const response = await fetch('/api/processes', { signal: AbortSignal.timeout(3500) })
        if (!response.ok) throw new Error()
        const result = await response.json() as ProcessSnapshot
        if (!active) return

        const nextProcesses = Array.isArray(result.processes) ? result.processes.slice(0, 6) : []
        const nextUptime = typeof result.uptime === 'number' ? result.uptime : data.hardware.uptime

        startTransition(() => {
          setProcesses(current => sameProcesses(current, nextProcesses) ? current : nextProcesses)
          setProcessUptime(nextUptime)
        })
      } catch {
        if (active) {
          startTransition(() => setProcessUptime(data.hardware.uptime))
        }
      } finally {
        if (active) timer = window.setTimeout(load, document.hidden ? 90000 : 45000)
      }
    }

    load()
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [data.hardware.uptime])

  useEffect(() => {
    let active = true
    let timer = 0

    const loadStatus = async (withSpinner = false) => {
      if (withSpinner) setSensorLoading(true)
      try {
        const response = await fetch('/api/sensors/status', { signal: AbortSignal.timeout(7000) })
        if (!response.ok) throw new Error()
        const result = await response.json() as SensorStatus
        if (!active) return
        setSensorStatus(result)
        if (!result.error) setSensorMessage(null)
      } catch {
        if (active) setSensorMessage(text.sensorsError)
      } finally {
        if (active && withSpinner) setSensorLoading(false)
      }
    }

    const poll = async () => {
      await loadStatus(timer === 0)
      if (!active) return
      const limited = !sensorStatus?.directActive || !sensorStatus?.cpuFanAvailable || !sensorStatus?.cpuTempAvailable
      timer = window.setTimeout(poll, limited ? 12000 : 30000)
    }

    void poll()
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [language, sensorStatus?.cpuFanAvailable, sensorStatus?.cpuTempAvailable, sensorStatus?.directActive, text.sensorsError])

  const installSensors = async () => {
    setSensorInstalling(true)
    try {
      const response = await fetch('/api/sensors/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || text.sensorsError)
      setSensorMessage(text.sensorsWaiting)
      for (let attempt = 0; attempt < 30; attempt++) {
        await new Promise(resolve => window.setTimeout(resolve, 2000))
        const statusResponse = await fetch('/api/sensors/status', { signal: AbortSignal.timeout(7000) })
        if (!statusResponse.ok) continue
        const status = await statusResponse.json() as SensorStatus
        setSensorStatus(status)
        if (status.directActive && status.cpuTempAvailable) {
          setSensorMessage(text.sensorsActivated)
          return
        }
      }
      setSensorMessage(text.sensorsStillLimited)
    } catch (error) {
      setSensorMessage(error instanceof Error ? error.message : text.sensorsError)
    } finally {
      setSensorInstalling(false)
      try {
        const response = await fetch('/api/sensors/status', { signal: AbortSignal.timeout(7000) })
        if (response.ok) {
          const result = await response.json() as SensorStatus
          setSensorStatus(result)
        }
      } catch {
        // no-op
      }
    }
  }

  const refreshSensors = async () => {
    setSensorLoading(true)
    try {
      const response = await fetch('/api/sensors/status', { signal: AbortSignal.timeout(7000) })
      if (!response.ok) throw new Error()
      const result = await response.json() as SensorStatus
      setSensorStatus(result)
      if (!result.error) setSensorMessage(null)
    } catch {
      setSensorMessage(text.sensorsError)
    } finally {
      setSensorLoading(false)
    }
  }

  const directSensor = data.hardwareSensor?.status === 'active'
  const limitedSensors = !sensorStatus?.directActive || !sensorStatus?.cpuFanAvailable || !sensorStatus?.cpuTempAvailable
  const cpuClockRange = data.cpu.clockMin && data.cpu.clockMax && Math.abs(data.cpu.clockMax - data.cpu.clockMin) >= 5
    ? ` · ${data.cpu.clockMin}–${data.cpu.clockMax}` : ''
  const cpuClock = data.cpu.clock !== null ? `${data.cpu.clock} MHz${cpuClockRange}` : text.sensorNA
  const cpuTempProgress = normalize(data.cpu.temperature, 100)
  const cpuClockProgress = normalize(data.cpu.clock, Math.max(data.cpu.clockMax || 0, data.cpu.clock || 0, 5200))
  const cpuFanAvailable = data.cpu.fan !== null && data.cpu.fan !== undefined && Number.isFinite(data.cpu.fan) && data.cpu.fan > 0
  const cpuFanIsPercent = cpuFanAvailable && data.cpu.fan! >= 0 && data.cpu.fan! <= 100
  const cpuFanProgress = cpuFanAvailable ? normalize(data.cpu.fan!, cpuFanIsPercent ? 100 : Math.max(2200, data.cpu.fan! * 1.08)) : null
  const cpuFanValue = cpuFanAvailable ? `${data.cpu.fan}${cpuFanIsPercent ? '%' : ' RPM'}` : text.fanUnavailable

  const gpuTempProgress = normalize(data.gpu.temperature, 100)
  const gpuClockProgress = data.gpu.clock > 0 ? normalize(data.gpu.clock, Math.max(2200, data.gpu.clock * 1.08)) : null
  const gpuFanAvailable = data.gpu.fan !== null && Number.isFinite(data.gpu.fan) && data.gpu.fan > 0
  const gpuFanIsPercent = gpuFanAvailable && data.gpu.fan! >= 0 && data.gpu.fan! <= 100
  const gpuFanProgress = gpuFanAvailable ? normalize(data.gpu.fan, gpuFanIsPercent ? 100 : Math.max(2200, data.gpu.fan! * 1.08)) : null
  const gpuFanValue = gpuFanAvailable ? `${data.gpu.fan}${gpuFanIsPercent ? '%' : ' RPM'}` : text.fanUnavailable

  return <div className="dashboard-grid">
    {sensorStatus?.installerAvailable && limitedSensors ? (
      <section className="sensor-helper-card">
        <div className="sensor-helper-copy">
          <p className="eyebrow">{text.sensorsRecommendation}</p>
          <h3>{text.sensorsTitle}</h3>
          <p>{text.sensorsText}</p>
          {sensorStatus.source ? <span>{text.sensorsSource}: {sensorStatus.source}</span> : null}
          {sensorStatus.error ? <span className="sensor-helper-error">{sensorStatus.error}</span> : null}
          {sensorMessage ? <span className="sensor-helper-note">{sensorMessage}</span> : null}
        </div>
        <div className="sensor-helper-actions">
          <button className="intensive-button" onClick={installSensors} disabled={sensorInstalling}>
            <ShieldCheck size={15}/> {sensorInstalling ? text.sensorsInstalling : text.sensorsInstall}
          </button>
          <button className="export-report-button" onClick={() => void refreshSensors()} disabled={sensorLoading}>
            <RefreshCw size={15} className={sensorLoading ? 'spin' : undefined}/> {text.sensorsRefresh}
          </button>
          <div className="sensor-helper-status">
            <b>{text.sensorsLimited}</b>
            <small>
              CPU temp: {sensorStatus.cpuTempAvailable ? text.okShort : text.missingShort}
              {' · '}
              CPU fan: {sensorStatus.cpuFanAvailable ? text.okShort : text.missingShort}
            </small>
          </div>
        </div>
      </section>
    ) : sensorStatus?.directActive ? (
      <section className="sensor-helper-card sensor-helper-card--ready">
        <div className="sensor-helper-copy">
          <p className="eyebrow">{text.sensorsRecommendation}</p>
          <h3>{text.sensorsReady}</h3>
          <p>{text.sensorsReadyText}</p>
          {sensorStatus.source ? <span>{text.sensorsSource}: {sensorStatus.source}</span> : null}
        </div>
      </section>
    ) : null}

    <MetricCard
      title="CPU"
      subtitle={data.cpu.model || text.processor}
      value={data.cpu.load}
      history={data.history.map(h => h.cpu)}
      badge={directSensor ? text.directSensor : text.limitedRead}
      stats={[
        { label: text.cpuTemp, value: data.cpu.temperature !== null ? `${data.cpu.temperature}°C` : text.sensorNA, progress: cpuTempProgress },
        { label: text.cpuClock, value: cpuClock, progress: cpuClockProgress },
        { label: text.fan, value: cpuFanValue, progress: cpuFanProgress }
      ]}
    />

    <MetricCard
      title="GPU"
      subtitle={data.gpu.model}
      value={data.gpu.load}
      tone="lime"
      history={data.history.map(h => h.gpu)}
      badge={data.capabilities?.gpu.source || data.gpu.vendor || undefined}
      stats={[
        { label: text.gpuTemp, value: data.gpu.temperature !== null ? `${data.gpu.temperature}°C` : text.noSensor, progress: gpuTempProgress },
        { label: text.frequency, value: data.gpu.clock ? `${data.gpu.clock} MHz` : '—', progress: gpuClockProgress },
        { label: text.fan, value: gpuFanValue, progress: gpuFanProgress }
      ]}
    />

    <section className="compact-card ram-card"><div className="card-heading"><div><p className="eyebrow">{text.memory}</p><h2>RAM</h2></div><MemoryStick size={21}/></div><div className="compact-main"><Gauge value={data.memory.load} label={text.inUse} tone="amber" size="small"/><div className="big-number"><strong>{data.memory.used}</strong><span>{text.of} {data.memory.total} GB</span><small>{data.memory.available} {text.available}</small></div></div></section>
    <section className="compact-card network-card"><div className="card-heading"><div><p className="eyebrow">{text.liveTraffic}</p><h2>{text.network}</h2></div><Radio size={21}/></div><p className="muted">{data.network.interface}</p><div className="network-values"><div><ArrowDown size={18}/><span>{text.download}</span><strong>{formatRate(data.network.down)}</strong></div><div><ArrowUp size={18}/><span>{text.upload}</span><strong>{formatRate(data.network.up)}</strong></div></div></section>
    <section className="compact-card storage-card"><div className="card-heading"><div><p className="eyebrow">{text.capacity}</p><h2>{text.storage}</h2></div><HardDrive size={21}/></div><div className="drive-list">{data.storage.map(disk => <div className="drive" key={`${disk.fs}-${disk.mount}`}><div><strong>{disk.mount || disk.fs}</strong><span>{disk.used} / {disk.size} GB</span></div><div className="bar"><i style={{ width: `${disk.use}%` }}/></div><b>{disk.use}%</b></div>)}</div></section>
    <section className="process-card"><div className="card-heading"><div><p className="eyebrow">{text.activity}</p><h2>{text.topProcesses}</h2></div><span className="uptime"><Clock3 size={14}/> {text.activeFor} {formatUptime(processUptime)}</span></div><div className="process-table"><div className="process-row table-head"><span>{text.process}</span><span>PID</span><span>CPU</span><span>RAM</span></div>{processes.map(p => <div className="process-row" key={p.pid}><span><i>{p.name.slice(0, 1).toUpperCase()}</i>{p.name}</span><span>{p.pid}</span><span>{p.cpu}%</span><span>{p.memory} MB</span></div>)}</div></section>
  </div>
}
