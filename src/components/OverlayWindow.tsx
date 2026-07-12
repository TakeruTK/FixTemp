import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'
import type { OverlayConfig } from '../types'
import { useMetrics } from '../hooks/useMetrics'

const labels = {
  es: { cpuTemp: 'CPU TEMP', gpuTemp: 'GPU TEMP', cpuW: 'CPU W', gpuW: 'GPU W' },
  en: { cpuTemp: 'CPU TEMP', gpuTemp: 'GPU TEMP', cpuW: 'CPU W', gpuW: 'GPU W' },
  'zh-CN': { cpuTemp: 'CPU 温度', gpuTemp: 'GPU 温度', cpuW: 'CPU 功耗', gpuW: 'GPU 功耗' }
} as const

function OverlayMetricsPanel({ config }: { config: OverlayConfig }) {
  const { language } = useI18n()
  const text = labels[language]
  const { data } = useMetrics()

  if (!data) return null

  const items: { key: string; label: string; value: string; tone?: string }[] = []
  if (config.metrics.cpu) items.push({ key: 'cpu', label: 'CPU', value: `${data.cpu.load}%`, tone: 'cyan' })
  if (config.metrics.gpu) items.push({ key: 'gpu', label: 'GPU', value: `${data.gpu.load}%`, tone: 'lime' })
  if (config.metrics.ram) items.push({ key: 'ram', label: 'RAM', value: `${data.memory.load}%` })
  if (config.metrics.vram) items.push({ key: 'vram', label: 'VRAM', value: data.gpu.memoryTotal > 0 ? `${(data.gpu.memoryUsed / 1024).toFixed(1)} GB` : '—' })
  if (config.metrics.temperatures) {
    items.push({ key: 'cpu-temp', label: text.cpuTemp, value: data.cpu.temperature === null ? '—' : `${data.cpu.temperature}°C`, tone: 'warm' })
    items.push({ key: 'gpu-temp', label: text.gpuTemp, value: data.gpu.temperature === null ? '—' : `${data.gpu.temperature}°C`, tone: 'warm' })
  }
  if (config.metrics.power) {
    items.push({ key: 'cpu-power', label: text.cpuW, value: data.cpu.power === null ? '—' : `${data.cpu.power} W` })
    items.push({ key: 'gpu-power', label: text.gpuW, value: data.gpu.power === null ? '—' : `${data.gpu.power} W` })
  }
  if (config.metrics.fps) items.push({ key: 'fps', label: 'FPS', value: data.fps === null || data.fps === undefined ? '—' : `${data.fps}`, tone: 'lime' })

  return <div className={`game-overlay ${config.scale}`} style={{ opacity: config.opacity / 100 }}>
    <div className="overlay-brand"><i/>PULSEGUARD <span>LIVE</span></div>
    <div className="overlay-values">{items.map(item => <div key={item.key}><span>{item.label}</span><b className={item.tone}>{item.value}</b></div>)}</div>
  </div>
}

export function OverlayWindow() {
  const [config, setConfig] = useState<OverlayConfig | null>(null)

  useEffect(() => {
    document.documentElement.classList.add('overlay-document')
    let active = true
    const refresh = async () => {
      try {
        const response = await fetch('/api/overlay/config')
        if (active && response.ok) setConfig(await response.json())
      } catch { /* keep transparent while reconnecting */ }
    }
    const timer = window.setInterval(refresh, 3000)
    void refresh()
    return () => {
      active = false
      window.clearInterval(timer)
      document.documentElement.classList.remove('overlay-document')
    }
  }, [])

  if (!config?.enabled) return null
  return <OverlayMetricsPanel config={config}/>
}
