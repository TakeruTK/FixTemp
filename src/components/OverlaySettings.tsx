import { useEffect, useMemo, useState } from 'react'
import { Eye, EyeOff, Gamepad2, Info, MonitorUp, Save } from 'lucide-react'
import { useI18n } from '../i18n'
import type { Metrics, OverlayConfig } from '../types'

const defaults: OverlayConfig = { enabled: false, position: 'top-right', opacity: 88, scale: 'normal', metrics: { cpu: true, gpu: true, ram: true, vram: true, temperatures: true, power: false, fps: false } }

const copy = {
  es: {
    readError: 'No se pudo leer la configuración.',
    saveError: 'No se pudo guardar',
    eyebrow: 'MONITOREO EN JUEGOS Y PROGRAMAS',
    title: 'Overlay en pantalla',
    description: 'Telemetría compacta, siempre visible y sin capturar clics ni teclado.',
    disable: 'Desactivar overlay',
    enable: 'Activar overlay',
    visibleMetrics: 'MÉTRICAS VISIBLES',
    appearance: 'APARIENCIA Y POSICIÓN',
    position: 'Posición',
    layout: 'Diseño',
    compact: 'Compacto',
    normal: 'Normal',
    opacity: 'Opacidad',
    save: 'Guardar cambios',
    saved: 'Configuración guardada',
    preview: 'VISTA PREVIA',
    topLeft: 'Superior izquierda',
    topRight: 'Superior derecha',
    bottomLeft: 'Inferior izquierda',
    bottomRight: 'Inferior derecha',
    windowed: 'Funciona sobre juegos en modo ventana o ventana sin bordes. El modo pantalla completa exclusiva puede impedir overlays externos.',
    fpsInfo: 'PulseGuard no inventa FPS: quedará “—” hasta conectar un proveedor de cuadros compatible. Uso, VRAM, temperaturas y watts sí provienen de los sensores actuales.',
    noData: '—',
    cpu: 'Uso de CPU',
    cpuDetail: 'Carga total del procesador',
    gpu: 'Uso de GPU',
    gpuDetail: 'Carga del adaptador gráfico',
    ram: 'Uso de RAM',
    ramDetail: 'Porcentaje de memoria del sistema',
    vram: 'Uso de VRAM',
    vramDetail: 'Memoria gráfica dedicada',
    temperatures: 'Temperaturas',
    temperaturesDetail: 'CPU y GPU cuando existe sensor',
    power: 'Consumo en watts',
    powerDetail: 'Sólo lecturas físicas disponibles',
    fps: 'FPS del juego',
    fpsDetail: 'Se muestra sólo con proveedor compatible'
  },
  en: {
    readError: 'Could not read the configuration.',
    saveError: 'Could not save',
    eyebrow: 'MONITORING IN GAMES AND PROGRAMS',
    title: 'On-screen overlay',
    description: 'Compact telemetry, always visible, without capturing clicks or keyboard input.',
    disable: 'Disable overlay',
    enable: 'Enable overlay',
    visibleMetrics: 'VISIBLE METRICS',
    appearance: 'APPEARANCE AND POSITION',
    position: 'Position',
    layout: 'Layout',
    compact: 'Compact',
    normal: 'Normal',
    opacity: 'Opacity',
    save: 'Save changes',
    saved: 'Configuration saved',
    preview: 'PREVIEW',
    topLeft: 'Top left',
    topRight: 'Top right',
    bottomLeft: 'Bottom left',
    bottomRight: 'Bottom right',
    windowed: 'Works over windowed or borderless-window games. Exclusive full-screen mode may block external overlays.',
    fpsInfo: 'PulseGuard does not invent FPS: it stays as “—” until a compatible frame provider is connected. Usage, VRAM, temperatures, and watts do come from current sensors.',
    noData: '—',
    cpu: 'CPU usage',
    cpuDetail: 'Total processor load',
    gpu: 'GPU usage',
    gpuDetail: 'Graphics adapter load',
    ram: 'RAM usage',
    ramDetail: 'System memory percentage',
    vram: 'VRAM usage',
    vramDetail: 'Dedicated graphics memory',
    temperatures: 'Temperatures',
    temperaturesDetail: 'CPU and GPU when a sensor exists',
    power: 'Power in watts',
    powerDetail: 'Physical readouts only',
    fps: 'Game FPS',
    fpsDetail: 'Shown only with a compatible provider'
  },
  'zh-CN': {
    readError: '无法读取配置。',
    saveError: '无法保存',
    eyebrow: '游戏与程序监控',
    title: '屏幕悬浮层',
    description: '紧凑型遥测信息，始终可见，并且不会拦截鼠标或键盘操作。',
    disable: '关闭悬浮层',
    enable: '开启悬浮层',
    visibleMetrics: '可显示指标',
    appearance: '外观与位置',
    position: '位置',
    layout: '布局',
    compact: '紧凑',
    normal: '标准',
    opacity: '透明度',
    save: '保存更改',
    saved: '配置已保存',
    preview: '预览',
    topLeft: '左上',
    topRight: '右上',
    bottomLeft: '左下',
    bottomRight: '右下',
    windowed: '适用于窗口化或无边框窗口游戏。独占全屏模式可能会阻止外部悬浮层。',
    fpsInfo: 'PulseGuard 不会虚构 FPS：在连接兼容的帧率提供程序之前会显示为 “—”。使用率、VRAM、温度和功耗来自当前传感器。',
    noData: '—',
    cpu: 'CPU 使用率',
    cpuDetail: '处理器总负载',
    gpu: 'GPU 使用率',
    gpuDetail: '显卡负载',
    ram: 'RAM 使用率',
    ramDetail: '系统内存百分比',
    vram: 'VRAM 使用率',
    vramDetail: '独立显存',
    temperatures: '温度',
    temperaturesDetail: '有传感器时显示 CPU 与 GPU',
    power: '功耗（瓦）',
    powerDetail: '仅显示实际物理读数',
    fps: '游戏 FPS',
    fpsDetail: '仅在兼容提供程序下显示'
  }
} as const

export function OverlaySettings({ data }: { data: Metrics }) {
  const { language } = useI18n()
  const text = copy[language]
  const options: { key: keyof OverlayConfig['metrics']; label: string; detail: string }[] = useMemo(() => [
    { key: 'cpu', label: text.cpu, detail: text.cpuDetail },
    { key: 'gpu', label: text.gpu, detail: text.gpuDetail },
    { key: 'ram', label: text.ram, detail: text.ramDetail },
    { key: 'vram', label: text.vram, detail: text.vramDetail },
    { key: 'temperatures', label: text.temperatures, detail: text.temperaturesDetail },
    { key: 'power', label: text.power, detail: text.powerDetail },
    { key: 'fps', label: text.fps, detail: text.fpsDetail }
  ], [text])

  const [config, setConfig] = useState<OverlayConfig>(defaults)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/overlay/config').then(response => response.json()).then(setConfig).catch(() => setError(text.readError))
  }, [text.readError])

  const updateMetric = (key: keyof OverlayConfig['metrics']) => setConfig(current => ({ ...current, metrics: { ...current.metrics, [key]: !current.metrics[key] } }))
  const save = async (next = config) => {
    setSaved(false); setError(null)
    try {
      const response = await fetch('/api/overlay/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) })
      if (!response.ok) throw new Error(text.saveError)
      setConfig(await response.json()); setSaved(true); window.setTimeout(() => setSaved(false), 1800)
    } catch (reason) { setError(reason instanceof Error ? reason.message : text.saveError) }
  }
  const toggleEnabled = () => { const next = { ...config, enabled: !config.enabled }; setConfig(next); void save(next) }

  return <div className="overlay-page">
    <section className="overlay-hero"><div><span className="hero-icon"><Gamepad2 size={23}/></span><p className="eyebrow">{text.eyebrow}</p><h2>{text.title}</h2><p>{text.description}</p></div><button className={config.enabled ? 'overlay-disable' : 'overlay-enable'} onClick={toggleEnabled}>{config.enabled ? <EyeOff size={17}/> : <Eye size={17}/>} {config.enabled ? text.disable : text.enable}</button></section>
    <div className="overlay-settings-grid"><section className="overlay-card"><p className="section-label">{text.visibleMetrics}</p><div className="overlay-toggles">{options.map(option => <button key={option.key} className={config.metrics[option.key] ? 'on' : ''} onClick={() => updateMetric(option.key)}><span><b>{option.label}</b><small>{option.detail}</small></span><i/></button>)}</div></section>
      <section className="overlay-card"><p className="section-label">{text.appearance}</p><label className="overlay-field"><span>{text.position}</span><select value={config.position} onChange={event => setConfig({ ...config, position: event.target.value as OverlayConfig['position'] })}><option value="top-left">{text.topLeft}</option><option value="top-right">{text.topRight}</option><option value="bottom-left">{text.bottomLeft}</option><option value="bottom-right">{text.bottomRight}</option></select></label><label className="overlay-field"><span>{text.layout}</span><select value={config.scale} onChange={event => setConfig({ ...config, scale: event.target.value as OverlayConfig['scale'] })}><option value="compact">{text.compact}</option><option value="normal">{text.normal}</option></select></label><label className="overlay-field"><span>{text.opacity} <b>{config.opacity}%</b></span><input type="range" min="45" max="100" value={config.opacity} onChange={event => setConfig({ ...config, opacity: Number(event.target.value) })}/></label><button className="save-overlay" onClick={() => save()}><Save size={16}/>{saved ? text.saved : text.save}</button>{error && <p className="overlay-error">{error}</p>}</section>
      <section className="overlay-card overlay-preview-card"><p className="section-label">{text.preview}</p><div className="settings-preview" style={{ opacity: config.opacity / 100 }}><div><i/>PULSEGUARD <span>LIVE</span></div><section><p><span>CPU</span><b>{data.cpu.load}%</b></p><p><span>GPU</span><b>{data.gpu.load}%</b></p><p><span>RAM</span><b>{data.memory.load}%</b></p><p><span>CPU TEMP</span><b>{data.cpu.temperature === null ? text.noData : `${data.cpu.temperature}°C`}</b></p></section></div><div className="overlay-info"><MonitorUp size={17}/><span>{text.windowed}</span></div><div className="overlay-info"><Info size={17}/><span>{text.fpsInfo}</span></div></section>
    </div>
  </div>
}
