import { useEffect, useMemo, useState } from 'react'
import { Eye, EyeOff, Gamepad2, Info, MonitorUp, Save } from 'lucide-react'
import { useI18n } from '../i18n'
import type { Metrics, OverlayConfig } from '../types'

const defaults: OverlayConfig = { enabled: false, position: 'top-right', opacity: 88, scale: 'normal', metrics: { cpu: true, gpu: true, ram: true, vram: true, temperatures: true, power: false, fps: false } }

const copy = {
 es: {
 readError: 'No se pudo leer la configuracion.',
 saveError: 'No se pudo guardar',
 eyebrow: 'MONITOREO EN JUEGOS Y PROGRAMAS',
 title: 'Overlay en pantalla',
 description: 'Telemetria compacta, siempre visible y sin capturar clics ni teclado.',
 disable: 'Desactivar overlay',
 enable: 'Activar overlay',
 visibleMetrics: 'METRICAS VISIBLES',
 appearance: 'APARIENCIA Y POSICION',
 position: 'Posicion',
 layout: 'Diseno',
 compact: 'Compacto',
 normal: 'Normal',
 opacity: 'Opacidad',
 save: 'Guardar cambios',
 saved: 'Configuracion guardada',
 preview: 'VISTA PREVIA',
 topLeft: 'Superior izquierda',
 topRight: 'Superior derecha',
 bottomLeft: 'Inferior izquierda',
 bottomRight: 'Inferior derecha',
 windowed: 'Funciona sobre juegos en modo ventana o ventana sin bordes. El modo pantalla completa exclusiva puede impedir overlays externos.',
 fpsInfo: 'FixTemp no inventa FPS: quedara "-" hasta conectar un proveedor de cuadros compatible. Uso, VRAM, temperaturas y watts si provienen de los sensores actuales.',
 noData: '-',
 cpu: 'Uso de CPU',
 cpuDetail: 'Carga total del procesador',
 gpu: 'Uso de GPU',
 gpuDetail: 'Carga del adaptador grafico',
 ram: 'Uso de RAM',
 ramDetail: 'Porcentaje de memoria del sistema',
 vram: 'Uso de VRAM',
 vramDetail: 'Memoria grafica dedicada',
 temperatures: 'Temperaturas',
 temperaturesDetail: 'CPU y GPU cuando existe sensor',
 power: 'Consumo en watts',
 powerDetail: 'Solo lecturas fisicas disponibles',
 fps: 'FPS del juego',
 fpsDetail: 'Se muestra solo con proveedor compatible'
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
 fpsInfo: 'FixTemp does not invent FPS: it stays as "-" until a compatible frame provider is connected. Usage, VRAM, temperatures, and watts do come from current sensors.',
 noData: '-',
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
 readError: 'æ— æ³•è¯»å–e…ç½®ã€‚',
 saveError: 'æ— æ³•äå­˜',
 eyebrow: 'æ¸¸æˆä¸Žç¨‹åºç›‘æŽ§',
 title: 'å±å¹•æ‚¬æµ®å±‚',
 description: 'ç´§å‡‘åž‹e¥æµ‹äæ¯ï¼Œå§‹ç»ˆå¯è§ï¼Œå¹¶ä¸”ä¸ä¼šæ‹¦æˆªe¼ æ ‡æˆ–e”®ç›˜æ“ä½œã€‚',
 disable: 'å…³e—­æ‚¬æµ®å±‚',
 enable: 'å¼€å¯æ‚¬æµ®å±‚',
 visibleMetrics: 'å¯æ˜¾ç¤ºæŒ‡æ ‡',
 appearance: 'å¤–è§‚ä¸Žä½ç½®',
 position: 'ä½ç½®',
 layout: 'å¸ƒå±€',
 compact: 'ç´§å‡‘',
 normal: 'æ ‡å‡†',
 opacity: 'e€æ˜Žåº¦',
 save: 'äå­˜æ›´æ”¹',
 saved: 'e…ç½®å·²äå­˜',
 preview: 'e¢„è§ˆ',
 topLeft: 'å·¦ä¸Š',
 topRight: 'å³ä¸Š',
 bottomLeft: 'å·¦ä¸‹',
 bottomRight: 'å³ä¸‹',
 windowed: 'e€‚ç”¨äºŽçª—å£åŒ–æˆ–æ— è¾¹æ†çª—å£æ¸¸æˆã€‚ç‹¬å å…¨å±æ¨å¼å¯èƒ½ä¼še˜»æ­¢å¤–eƒ¨æ‚¬æµ®å±‚ã€‚',
 fpsInfo: 'FixTemp ä¸ä¼šè™šæž„ FPSï¼šåœ¨èžæŽ¥å…¼å®¹çš„å¸§çŽ‡æä¾›ç¨‹åºä¹‹å‰ä¼šæ˜¾ç¤ºä¸º "-"ã€‚ä½ç”¨çŽ‡ã€VRAMã€æ¸©åº¦å’ŒåŠŸè€—æ¥è‡ªå½“å‰ä¼ æ„Ÿå™¨ã€‚',
 noData: '-',
 cpu: 'CPU ä½ç”¨çŽ‡',
 cpuDetail: 'å¤„ç†å™¨æ€»è´Ÿè½½',
 gpu: 'GPU ä½ç”¨çŽ‡',
 gpuDetail: 'æ˜¾åè´Ÿè½½',
 ram: 'RAM ä½ç”¨çŽ‡',
 ramDetail: 'ç³»ç»Ÿå†…å­˜ç™¾åˆ†æ¯”',
 vram: 'VRAM ä½ç”¨çŽ‡',
 vramDetail: 'ç‹¬ç«‹æ˜¾å­˜',
 temperatures: 'æ¸©åº¦',
 temperaturesDetail: 'æœ‰ä¼ æ„Ÿå™¨æ—¶æ˜¾ç¤º CPU ä¸Ž GPU',
 power: 'åŠŸè€—ï¼ˆç“¦ï¼‰',
 powerDetail: 'ä»…æ˜¾ç¤ºå®že™…ç‰©ç†è¯»æ•°',
 fps: 'æ¸¸æˆ FPS',
 fpsDetail: 'ä»…åœ¨å…¼å®¹æä¾›ç¨‹åºä¸‹æ˜¾ç¤º'
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
 <section className="overlay-card overlay-preview-card"><p className="section-label">{text.preview}</p><div className="settings-preview" style={{ opacity: config.opacity / 100 }}><div><i/>FIXTEMP <span>LIVE</span></div><section><p><span>CPU</span><b>{data.cpu.load}%</b></p><p><span>GPU</span><b>{data.gpu.load}%</b></p><p><span>RAM</span><b>{data.memory.load}%</b></p><p><span>CPU TEMP</span><b>{data.cpu.temperature === null ? text.noData : `${data.cpu.temperature} C`}</b></p></section></div><div className="overlay-info"><MonitorUp size={17}/><span>{text.windowed}</span></div><div className="overlay-info"><Info size={17}/><span>{text.fpsInfo}</span></div></section>
 </div>
 </div>
}
