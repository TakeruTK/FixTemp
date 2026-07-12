import React, { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowDown, ArrowUp, Check, Cpu, Globe, HardDrive, MemoryStick, Play, Square, Thermometer, Timer, Wifi, Zap } from 'lucide-react'
import { useI18n } from '../i18n'
import type { Metrics, SpeedTestState, StressSample, StressSession, StressType } from '../types'

type ExtendedType = StressType | 'internet'

const copy = {
 es: {
 tests: {
 cpu: { name: 'Procesador', desc: 'Calculo multinucleo verificado' },
 gpu: { name: 'Tarjeta grafica', desc: 'Shaders WebGL 2 de alta carga' },
 memory: { name: 'Memoria RAM', desc: 'Escritura y verificacion fisica' },
 disk: { name: 'Disco', desc: 'E/S sincronizada y verificada' },
 internet: { name: 'Velocidad de internet', desc: 'Latencia, descarga y subida reales' }
 },
 noSensor: 'Sin sensor',
 inetDesc: 'Mide la velocidad real de tu conexion usando servidores Cloudflare distribuidos globalmente. Requiere conexion a internet activa.',
 inetLatency: 'Latencia',
 inetDownload: 'Descarga',
 inetUpload: 'Subida',
 inetCurrentSpeed: 'Velocidad actual',
 inetServer: 'Servidor',
 inetPhaseLatency: 'Midiendo latencia…',
 inetPhaseWarmup: 'Calentando conexion…',
 inetPhaseDownload: 'Midiendo descarga…',
 inetPhaseUpload: 'Midiendo subida…',
 inetDone: 'Medicion completada',
 inetError: 'Error en la medicion',
 inetCancelled: 'Medicion cancelada',
 inetReady: 'Listo para medir',
 inetStart: 'Medir velocidad de internet',
 inetStop: 'Cancelar medicion',
 inetNote: 'La medicion no consume datos significativos (~ 35 MB) y no estresa el hardware local.',
 chartOf: 'Grafico de',
 chartWaiting: 'La grafica aparecera con las primeras muestras reales.',
 completed: 'Prueba completada',
 thermalCut: 'Corte termico activado',
 withError: 'Prueba con error',
 stopped: 'Prueba detenida',
 verified: 'verificada',
 integrityErrors: 'con errores',
 peakActivity: 'Actividad maxima',
 peakTemp: 'Temperatura maxima',
 thermalDelta: 'Cambio termico',
 averagePower: 'Potencia media',
 peakPower: 'Potencia maxima',
 measuredEnergy: 'Energia medida',
 notAvailable: 'No disponible',
 heroEyebrow: 'LABORATORIO DE RENDIMIENTO',
 heroTitle: 'Pruebas de estres reales',
 heroDesc: 'Carga el componente, verifica el trabajo y registra actividad, temperatura y potencia sin inventar sensores.',
 activeLimits: 'Limites activos',
 activeLimitsDesc: 'Corte termico, tiempo e integridad',
 choose: '1 — ELIGE EL COMPONENTE',
 configure: '2 — CONFIGURA LA PRUEBA',
 intensity: 'Intensidad',
 duration: 'Duracion',
 tempCut: 'Corte termico',
 saveWork: 'Guarda tu trabajo. Una prueba de estres real eleva consumo y temperatura y puede revelar inestabilidad.',
 stopTest: 'Detener prueba',
 startTest: 'Iniciar prueba de',
 running: 'CARGA Y REGISTRO EN CURSO',
 ready: 'LISTO PARA INICIAR',
 cpuLoad: 'Carga CPU',
 gpuLoad: 'Carga GPU',
 ramUsed: 'RAM ocupada',
 diskPerf: 'Rendimiento de disco',
 memoryNotice: 'La RAM no expone temperatura ni potencia mediante sensores estandar; se muestra solo actividad real y verificacion de memoria.',
 diskNotice: 'El sensor actual no expone temperatura ni potencia del disco; se mide el caudal real de lectura/escritura y su integridad.',
 startedMsg: 'Carga real iniciada. La telemetria se registrara cada segundo.',
 startError: 'No se pudo iniciar la prueba',
 componentTemp: 'Temperatura del componente',
 componentPower: 'Potencia del componente',
 seconds30: '30 segundos',
 minute1: '1 minuto',
 minutes3: '3 minutos',
 minutes5: '5 minutos',
 minutes10: '10 minutos'
 },
 en: {
 tests: {
 cpu: { name: 'Processor', desc: 'Verified multi-core compute' },
 gpu: { name: 'Graphics card', desc: 'High-load WebGL 2 shaders' },
 memory: { name: 'RAM memory', desc: 'Physical write and verification' },
 disk: { name: 'Disk', desc: 'Synchronized and verified I/O' },
 internet: { name: 'Internet speed', desc: 'Real latency, download & upload' }
 },
 noSensor: 'No sensor',
 inetDesc: 'Measures your real connection speed using globally distributed Cloudflare servers. Requires an active internet connection.',
 inetLatency: 'Latency',
 inetDownload: 'Download',
 inetUpload: 'Upload',
 inetCurrentSpeed: 'Current speed',
 inetServer: 'Server',
 inetPhaseLatency: 'Measuring latency…',
 inetPhaseWarmup: 'Warming up connection…',
 inetPhaseDownload: 'Measuring download…',
 inetPhaseUpload: 'Measuring upload…',
 inetDone: 'Measurement complete',
 inetError: 'Measurement failed',
 inetCancelled: 'Measurement cancelled',
 inetReady: 'Ready to measure',
 inetStart: 'Measure internet speed',
 inetStop: 'Cancel measurement',
 inetNote: 'The measurement uses minimal data (~ 35 MB) and does not stress local hardware.',
 chartOf: 'Chart for',
 chartWaiting: 'The chart will appear after the first real samples.',
 completed: 'Test completed',
 thermalCut: 'Thermal cutoff triggered',
 withError: 'Test ended with error',
 stopped: 'Test stopped',
 verified: 'verified',
 integrityErrors: 'with errors',
 peakActivity: 'Peak activity',
 peakTemp: 'Peak temperature',
 thermalDelta: 'Thermal delta',
 averagePower: 'Average power',
 peakPower: 'Peak power',
 measuredEnergy: 'Measured energy',
 notAvailable: 'Not available',
 heroEyebrow: 'PERFORMANCE LAB',
 heroTitle: 'Real stress tests',
 heroDesc: 'Load the component, verify the work, and capture activity, temperature, and power without inventing sensors.',
 activeLimits: 'Active limits',
 activeLimitsDesc: 'Thermal cutoff, time, and integrity',
 choose: '1 — CHOOSE THE COMPONENT',
 configure: '2 — CONFIGURE THE TEST',
 intensity: 'Intensity',
 duration: 'Duration',
 tempCut: 'Thermal cutoff',
 saveWork: 'Save your work. A real stress test raises power draw and temperature and may reveal instability.',
 stopTest: 'Stop test',
 startTest: 'Start test for',
 running: 'LOAD AND LOGGING IN PROGRESS',
 ready: 'READY TO START',
 cpuLoad: 'CPU load',
 gpuLoad: 'GPU load',
 ramUsed: 'RAM used',
 diskPerf: 'Disk throughput',
 memoryNotice: 'RAM does not expose temperature or power through standard sensors; only real activity and memory verification are shown.',
 diskNotice: 'The current sensor path does not expose disk temperature or power; real read/write throughput and integrity are measured instead.',
 startedMsg: 'Real load started. Telemetry will be logged every second.',
 startError: 'Could not start the test',
 componentTemp: 'Component temperature',
 componentPower: 'Component power',
 seconds30: '30 seconds',
 minute1: '1 minute',
 minutes3: '3 minutes',
 minutes5: '5 minutes',
 minutes10: '10 minutes'
 },
 'zh-CN': {
 tests: {
 cpu: { name: '处理器', desc: '已验证的多核计算' },
 gpu: { name: '显卡', desc: '高负载 WebGL 2 着色器' },
 memory: { name: '内存', desc: '实际写入与校验' },
 disk: { name: '磁盘', desc: '同步并校验的 I/O' },
 internet: { name: '网速测试', desc: '真实延迟、下载与上传速度' }
 },
 noSensor: '无传感器',
 inetDesc: '使用 Cloudflare 全球分布式服务器测量您的真实网速。需要有效的网络连接。',
 inetLatency: '延迟',
 inetDownload: '下载',
 inetUpload: '上传',
 inetCurrentSpeed: '当前速度',
 inetServer: '服务器',
 inetPhaseLatency: '正在测量延迟…',
 inetPhaseWarmup: '正在预热连接…',
 inetPhaseDownload: '正在测量下载速度…',
 inetPhaseUpload: '正在测量上传速度…',
 inetDone: '测量完成',
 inetError: '测量失败',
 inetCancelled: '测量已取消',
 inetReady: '准备测量',
 inetStart: '测量网速',
 inetStop: '取消测量',
 inetNote: '本次测量流量消耗极少（约 35 MB），不会对本地硬件造成压力。',
 chartOf: '图表：',
 chartWaiting: '有了第一批真实采样后，这里会显示图表。',
 completed: '测试已完成',
 thermalCut: '已触发温度保护',
 withError: '测试出错',
 stopped: '测试已停止',
 verified: '已验证',
 integrityErrors: '有错误',
 peakActivity: '峰值活动',
 peakTemp: '最高温度',
 thermalDelta: '温差变化',
 averagePower: '平均功耗',
 peakPower: '峰值功耗',
 measuredEnergy: '测得能量',
 notAvailable: '不可用',
 heroEyebrow: '性能实验室',
 heroTitle: '真实压力测试',
 heroDesc: '对组件施加负载、验证工作结果，并记录活动、温度和功耗，不虚构任何传感器数据。',
 activeLimits: '保护限制已启用',
 activeLimitsDesc: '温度保护、时长与完整性',
 choose: '1 — 选择组件',
 configure: '2 — 配置测试',
 intensity: '强度',
 duration: '时长',
 tempCut: '温度保护',
 saveWork: '请先保存你的工作。真实压力测试会提高功耗和温度，并可能暴露系统不稳定问题。',
 stopTest: '停止测试',
 startTest: '开始测试：',
 running: '负载与记录进行中',
 ready: '准备开始',
 cpuLoad: 'CPU 负载',
 gpuLoad: 'GPU 负载',
 ramUsed: '已用内存',
 diskPerf: '磁盘吞吐',
 memoryNotice: '标准传感器通常不提供 RAM 温度或功耗；这里只显示真实活动与内存校验结果。',
 diskNotice: '当前传感器路径不提供磁盘温度或功耗；因此测量的是实际读写吞吐量与完整性。',
 startedMsg: '真实负载已启动。遥测数据将每秒记录一次。',
 startError: '无法启动测试',
 componentTemp: '组件温度',
 componentPower: '组件功耗',
 seconds30: '30 秒',
 minute1: '1 分钟',
 minutes3: '3 分钟',
 minutes5: '5 分钟',
 minutes10: '10 分钟'
 }
} as const

type StressText = typeof copy['es'] | typeof copy['en'] | typeof copy['zh-CN']

function TelemetryPlot({ label, values, unit, color, fixedMax, waiting, chartOf }: { label: string; values: (number | null)[]; unit: string; color: string; fixedMax?: number; waiting: string; chartOf: string }) {
 const valid = values.filter((value): value is number => value !== null && Number.isFinite(value))
 const width = 420
 const height = 78
 const max = fixedMax || Math.max(1, ...valid) * 1.12
 const min = fixedMax ? 0 : Math.min(0, ...valid)
 const points = valid.length > 1
 ? values.map((value, index) => value === null ? null : `${index / Math.max(1, values.length - 1) * width},${height - 5 - ((value - min) / Math.max(1, max - min)) * (height - 10)}`).filter(Boolean).join(' ')
 : ''
 const current = valid.at(-1)
 return <div className="telemetry-plot">
 <div><span>{label}</span><strong>{current === undefined ? waiting : `${current.toFixed(unit === 'W' || unit === 'GB' || unit === 'MB/s' ? 1 : 0)} ${unit}`}</strong></div>
 {points ? <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-label={`${chartOf} ${label}`}>
 <line x1="0" y1={height - 5} x2={width} y2={height - 5}/><polyline points={points} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke"/>
 </svg> : <p>{waiting}</p>}
 </div>
}

function Result({ session, text }: { session: StressSession; text: StressText }) {
 const summary = session.summary
 if (!summary) return null
 const status = session.stopReason === 'completed' ? text.completed : session.stopReason === 'temperature' ? text.thermalCut : session.stopReason === 'error' ? text.withError : text.stopped
 return <div className={`stress-report ${session.stopReason === 'temperature' || session.stopReason === 'error' ? 'danger' : ''}`}>
 <div className="report-title"><Check size={18}/><div><strong>{status}</strong><span>{summary.samples} muestras - integridad {summary.verified ? text.verified : text.integrityErrors}</span></div></div>
 <div className="report-grid">
 <div><span>{text.peakActivity}</span><b>{summary.peakActivity} {session.samples?.[0]?.activityUnit || '%'}</b></div>
 <div><span>{text.peakTemp}</span><b>{summary.peakTemperature === null ? text.notAvailable : `${summary.peakTemperature} -C`}</b></div>
 <div><span>{text.thermalDelta}</span><b>{summary.temperatureDelta === null ? text.notAvailable : `${summary.temperatureDelta >= 0 ? '+' : ''}${summary.temperatureDelta} -C`}</b></div>
 <div><span>{text.averagePower}</span><b>{summary.averagePower === null ? text.notAvailable : `${summary.averagePower} W`}</b></div>
 <div><span>{text.peakPower}</span><b>{summary.peakPower === null ? text.notAvailable : `${summary.peakPower} W`}</b></div>
 <div><span>{text.measuredEnergy}</span><b>{summary.energyWh === null ? text.notAvailable : `${summary.energyWh} Wh`}</b></div>
 </div>
 </div>
}

// ── Speed Test Panel ──────────────────────────────────────────────────────────
function SpeedPanel({ text }: { text: ReturnType<typeof getTextForLang> }) {
 const [st, setSt] = useState<SpeedTestState | null>(null)
 const [message, setMessage] = useState<string | null>(null)
 const pollRef = useRef<number>(0)

 useEffect(() => {
 let active = true
 const poll = async () => {
 try {
 const res = await fetch('/api/speedtest')
 if (!res.ok) return
 const data: SpeedTestState = await res.json()
 if (active) setSt(data)
 if (active) pollRef.current = window.setTimeout(poll, data.active ? 400 : 3000)
 } catch { if (active) pollRef.current = window.setTimeout(poll, 3000) }
 }
 poll()
 return () => { active = false; window.clearTimeout(pollRef.current) }
 }, [])

 const start = async () => {
 setMessage(null)
 try {
 const res = await fetch('/api/speedtest/start', { method: 'POST' })
 if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
 const data: SpeedTestState = await res.json()
 setSt(data)
 // Activar polling rapido
 window.clearTimeout(pollRef.current)
 const fastPoll = async () => {
 const r = await fetch('/api/speedtest')
 const d: SpeedTestState = await r.json()
 setSt(d)
 if (d.active) pollRef.current = window.setTimeout(fastPoll, 400)
 }
 pollRef.current = window.setTimeout(fastPoll, 400)
 } catch (err) { setMessage(err instanceof Error ? err.message : text.inetError) }
 }

 const stop = async () => {
 await fetch('/api/speedtest/stop', { method: 'POST' })
 const res = await fetch('/api/speedtest')
 setSt(await res.json())
 }

 const running = Boolean(st?.active)
 const phase = st?.phase ?? 'idle'
 const phaseLabel = phase === 'latency' ? text.inetPhaseLatency
 : phase === 'warmup' ? text.inetPhaseWarmup
 : phase === 'download' ? text.inetPhaseDownload
 : phase === 'upload' ? text.inetPhaseUpload
 : phase === 'done' ? text.inetDone
 : phase === 'error' ? text.inetError
 : phase === 'cancelled' ? text.inetCancelled
 : text.inetReady

 const fmtMbps = (v: number | null) => v === null ? '—' : `${v} Mbps`

 return <div className="stress-console">
 <div className="stress-controls">
 <p className="section-label">{text.configure}</p>
 <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '1rem' }}>{text.inetDesc}</p>
 <div className="warning" style={{ marginBottom: '1rem' }}>
 <Globe size={17}/><span>{text.inetNote}</span>
 </div>
 {running
 ? <button className="stop-button" onClick={stop}><Square size={17} fill="currentColor"/> {text.inetStop}</button>
 : <button className="start-button" onClick={start}><Play size={17} fill="currentColor"/> {text.inetStart}</button>
 }
 {message && <p className="action-message">{message}</p>}
 </div>

 <div className="live-test">
 <div className="live-head">
 <div><span className={running ? 'live-dot pulsing' : 'live-dot'}/><strong>{phaseLabel}</strong></div>
 <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{st?.server ?? 'speed.cloudflare.com'}</span>
 </div>
 <div className="progress-track"><i style={{ width: `${st?.progress ?? 0}%` }}/></div>

 <div className="report-grid" style={{ marginTop: '1rem' }}>
 <div><span>{text.inetLatency}</span>
 <b>{st?.latencyMs === null || st?.latencyMs === undefined ? '—' : `${st.latencyMs} ms`}</b>
 </div>
 <div><span>{text.inetDownload}</span>
 <b style={{ color: '#b9f65c' }}>{fmtMbps(st?.downloadMbps ?? null)}</b>
 </div>
 <div><span>{text.inetUpload}</span>
 <b style={{ color: '#42e6f5' }}>{fmtMbps(st?.uploadMbps ?? null)}</b>
 </div>
 {st?.currentMbps !== null && st?.currentMbps !== undefined && (
 <div><span>{text.inetCurrentSpeed}</span>
 <b style={{ color: phase === 'upload' ? '#42e6f5' : '#b9f65c' }}>{st.currentMbps} Mbps</b>
 </div>
 )}
 </div>

 {phase === 'done' && st && (
 <div className="stress-report" style={{ marginTop: '1rem' }}>
 <div className="report-title">
 <Check size={18}/>
 <div>
 <strong>{text.inetDone}</strong>
 <span>{st.server}</span>
 </div>
 </div>
 <div className="report-grid">
 <div><span>{text.inetLatency}</span><b>{st.latencyMs} ms</b></div>
 <div><span><ArrowDown size={13}/> {text.inetDownload}</span><b style={{ color: '#b9f65c' }}>{st.downloadMbps} Mbps</b></div>
 <div><span><ArrowUp size={13}/> {text.inetUpload}</span><b style={{ color: '#42e6f5' }}>{st.uploadMbps} Mbps</b></div>
 <div><span>Wifi</span><b><Wifi size={13}/></b></div>
 </div>
 </div>
 )}

 {phase === 'error' && st?.error && (
 <p className="action-message" style={{ color: 'var(--danger)' }}>
 <AlertTriangle size={14}/> {st.error}
 </p>
 )}
 </div>
 </div>
}

// Helper para tipar el texto correctamente
function getTextForLang(lang: 'es' | 'en' | 'zh-CN') { return copy[lang] }

export function StressLab({ data }: { data: Metrics }) {
 const { language } = useI18n()
 const text = copy[language]
 const tests: { id: ExtendedType; name: string; desc: string; icon: React.ComponentType<{ size?: number }> }[] = [
 { id: 'cpu', name: text.tests.cpu.name, desc: text.tests.cpu.desc, icon: Cpu },
 { id: 'gpu', name: text.tests.gpu.name, desc: text.tests.gpu.desc, icon: Zap },
 { id: 'memory', name: text.tests.memory.name, desc: text.tests.memory.desc, icon: MemoryStick },
 { id: 'disk', name: text.tests.disk.name, desc: text.tests.disk.desc, icon: HardDrive },
 { id: 'internet', name: text.tests.internet.name, desc: text.tests.internet.desc, icon: Globe }
 ]

 const [selected, setSelected] = useState<ExtendedType>('cpu')
 const [intensity, setIntensity] = useState(70)
 const [duration, setDuration] = useState(60)
 const [tempLimit, setTempLimit] = useState(90)
 const [message, setMessage] = useState<string | null>(null)
 const [, setTick] = useState(0)
 const session = data.stress
 const running = Boolean(session?.active)
 const isInternet = selected === 'internet'

 useEffect(() => { if (session?.active) setSelected(session.type) }, [session?.active, session?.type])
 useEffect(() => {
 if (!running) return
 const timer = window.setInterval(() => setTick(value => value + 1), 500)
 return () => window.clearInterval(timer)
 }, [running])

 const elapsed = running && session ? Math.floor((Date.now() - session.startedAt) / 1000) : session?.stoppedAt && session ? Math.floor((session.stoppedAt - session.startedAt) / 1000) : 0
 const progress = running && session ? Math.min(100, elapsed / session.duration * 100) : 0
 const samples = session?.type === selected ? session.samples || [] : []
 const activityUnit = samples.at(-1)?.activityUnit || (selected === 'memory' ? 'GB' : selected === 'disk' ? 'MB/s' : '%')
 const activityLabel = selected === 'cpu' ? text.cpuLoad : selected === 'gpu' ? text.gpuLoad : selected === 'memory' ? text.ramUsed : text.diskPerf
 const componentName = tests.find(t => t.id === selected)?.name || selected
 const sensorNotice = useMemo(() => {
 if (selected === 'memory') return text.memoryNotice
 if (selected === 'disk') return text.diskNotice
 return null
 }, [selected, text])

 const stop = async () => { await fetch('/api/stress/stop', { method: 'POST' }) }
 const start = async () => {
 setMessage(null)
 try {
 const response = await fetch('/api/stress/start', {
 method: 'POST', headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ type: selected, intensity, duration, temperatureLimit: tempLimit })
 })
 const result = await response.json()
 if (!response.ok) throw new Error(result.error || text.startError)
 setMessage(text.startedMsg)
 } catch (error) { setMessage(error instanceof Error ? error.message : text.startError) }
 }

 return <div className="stress-layout">
 <section className="stress-hero"><div><span className="hero-icon"><Zap size={24}/></span><p className="eyebrow">{text.heroEyebrow}</p><h2>{text.heroTitle}</h2><p>{text.heroDesc}</p></div><div className="safety-badge"><Check size={16}/><span><strong>{text.activeLimits}</strong>{text.activeLimitsDesc}</span></div></section>
 <section className="test-picker"><p className="section-label">{text.choose}</p><div className="test-options">{tests.map(({ id, name, desc, icon: Icon }) => <button key={id} className={selected === id ? 'selected' : ''} onClick={() => !running && setSelected(id)} disabled={running && id !== 'internet'}><Icon size={22}/><span><strong>{name}</strong><small>{desc}</small></span>{selected === id && <Check size={15}/>}</button>)}</div></section>
 {isInternet
 ? <SpeedPanel text={text}/>
 : <section className="stress-console">
 <div className="stress-controls"><p className="section-label">{text.configure}</p><label><span>{text.intensity} <b>{intensity}%</b></span><input type="range" min="20" max="100" value={intensity} onChange={event => setIntensity(Number(event.target.value))} disabled={running}/></label><div className="control-pair"><label><span><Timer size={15}/> {text.duration}</span><select value={duration} onChange={event => setDuration(Number(event.target.value))} disabled={running}><option value="30">{text.seconds30}</option><option value="60">{text.minute1}</option><option value="180">{text.minutes3}</option><option value="300">{text.minutes5}</option><option value="600">{text.minutes10}</option></select></label><label><span><Thermometer size={15}/> {text.tempCut}</span><select value={tempLimit} onChange={event => setTempLimit(Number(event.target.value))} disabled={running}><option value="80">80 -C</option><option value="85">85 -C</option><option value="90">90 -C</option><option value="95">95 -C</option></select></label></div><div className="warning"><AlertTriangle size={17}/><span>{text.saveWork}</span></div>{running ? <button className="stop-button" onClick={stop}><Square size={17} fill="currentColor"/> {text.stopTest}</button> : <button className="start-button" onClick={start}><Play size={17} fill="currentColor"/> {text.startTest} {componentName}</button>}{message && <p className="action-message">{message}</p>}</div>
 <div className="live-test"><div className="live-head"><div><span className={running ? 'live-dot pulsing' : 'live-dot'}/><strong>{running ? text.running : text.ready}</strong></div><span>{session ? `${elapsed}s / ${session.duration}s` : '—'}</span></div><div className="progress-track"><i style={{ width: `${progress}%` }}/></div>
 <div className="telemetry-grid">
 <TelemetryPlot label={activityLabel} values={samples.map((sample: StressSample) => sample.activity)} unit={activityUnit} color="#b9f65c" fixedMax={activityUnit === '%' ? 100 : undefined} waiting={text.chartWaiting} chartOf={text.chartOf}/>
 <TelemetryPlot label={text.componentTemp} values={samples.map((sample: StressSample) => sample.temperature)} unit=" C" color="#ffb45e" fixedMax={100} waiting={text.chartWaiting} chartOf={text.chartOf}/>
 <TelemetryPlot label={text.componentPower} values={samples.map((sample: StressSample) => sample.power)} unit="W" color="#42e6f5" waiting={text.chartWaiting} chartOf={text.chartOf}/>
 </div>
 {sensorNotice && <p className="sensor-disclosure"><AlertTriangle size={14}/>{sensorNotice}</p>}
 {session && !session.active && <Result session={session} text={text}/>}
 </div>
 </section>
 }
 </div>
}
