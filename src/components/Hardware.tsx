import { useEffect, useMemo, useState } from 'react'
import { Box, CircuitBoard, Cpu, HardDrive, Headphones, MemoryStick, Monitor, MonitorCog, Network, RefreshCw } from 'lucide-react'
import { useI18n } from '../i18n'
import type { Metrics } from '../types'

interface DiskVolume {
 letter?: string
 mount?: string
 label?: string
 filesystem?: string
 freeGb?: number | null
 sizeGb?: number | null
}

interface DiskDetail {
 name?: string
 vendor?: string
 type?: string
 interfaceType?: string | null
 bus?: string
 size?: number
 smartStatus?: string
 serialNumber?: string
 serialNum?: string | null
 firmwareRevision?: string
 pnpDeviceId?: string
 scsiPort?: number
 scsiTargetId?: number
 partitions?: number
 volumes?: DiskVolume[]
}

interface SystemDetails {
 fetchedAt?: string
 limited?: boolean
 warning?: string
 system?: { manufacturer?: string; model?: string; version?: string; serial?: string; systemType?: string; totalMemoryGb?: number | null }
 os?: { name?: string; version?: string; build?: string; architecture?: string; bootDevice?: string; installDate?: string; lastBoot?: string; pageFile?: string; language?: string }
 directx?: { version?: string; dxDiagVersion?: string; databaseVersion?: string; miracast?: string }
 bios?: { vendor?: string; version?: string; releaseDate?: string }
 baseboard?: { manufacturer?: string; model?: string; version?: string; serial?: string }
 cpu?: {
 manufacturer?: string
 brand?: string
 vendor?: string
 socket?: string
 architecture?: string
 speed?: number
 speedMax?: number
 cores?: number
 physicalCores?: number
 processors?: number
 l2CacheKb?: number | null
 l3CacheKb?: number | null
 stepping?: string
 family?: string
 virtualizationFirmwareEnabled?: boolean
 estimatedTdp?: number
 }
 graphics?: {
 controllers?: Array<{
 vendor?: string
 model?: string
 bus?: string
 pnpDeviceId?: string
 pciAddress?: string
 location?: string
 vram?: number
 driverVersion?: string
 driverDate?: string
 currentMode?: string
 driverModel?: string
 featureLevels?: string
 ddi?: string
 hdr?: string
 dedicatedMemory?: string
 sharedMemory?: string
 monitor?: string
 }>
 }
 memory?: Array<{ size?: number; bank?: string; slot?: string; type?: string; clockSpeed?: number; speedMax?: number; manufacturer?: string; partNum?: string; serial?: string }>
 memorySummary?: { maxCapacityGb?: number | null; slots?: number | null; populated?: number | null }
 disks?: DiskDetail[]
 audio?: Array<{ name?: string; manufacturer?: string; status?: string; driverVersion?: string; driverDate?: string; driverName?: string }>
 network?: Array<{ iface?: string; type?: string; speed?: number; manufacturer?: string; model?: string; mac?: string; pnpDeviceId?: string }>
 monitors?: Array<{ name?: string; status?: string; screenHeight?: number; screenWidth?: number; pnpDeviceId?: string }>
}

interface StorageBenchmarkResult {
 mount: string
 startedAt: number
 finishedAt: number
 durationMs: number
 fileSizeMb: number
 bytesWritten: number
 bytesRead: number
 writeMbps: number
 readMbps: number
 verified: boolean
}

interface StorageBenchmarkState {
 active: boolean
 mount: string | null
 results: StorageBenchmarkResult[]
 lastError?: string | null
 updatedAt?: number
}

const copy = {
 es: {
 noReported: 'No reportado',
 yes: 'Si',
 no: 'No',
 inventory: 'INVENTARIO DEL SISTEMA',
 reading: 'Leyendo componentes…',
 limited: 'Inventario limitado',
 updated: 'Inventario actualizado',
 loadingTitle: 'Estamos reuniendo toda la ficha tecnica del equipo',
 loadingBody: 'Esta vista tarda mas que las demas porque tambien cruza datos avanzados de Windows, DirectX, buses y almacenamiento. Mientras siga este panel, el inventario todavia se esta completando.',
 waitFull: 'El usuario puede esperar aqui hasta que termine la carga completa de “Mi equipo”.',
 loadingSteps: [
 'Consultando Windows y el perfil base del equipo',
 'Leyendo buses, controladores y socket del procesador',
 'Recopilando detalles de DirectX, pantallas y audio',
 'Relacionando discos fisicos con volumenes y firmware'
 ],
 systemDirectx: 'Sistema y DirectX',
 boardFirmware: 'Placa madre y firmware',
 processor: 'Procesador',
 graphics: 'Tarjetas graficas',
 memory: 'Memoria RAM',
 physicalStorage: 'Almacenamiento fisico',
 diskTransfer: 'Transferencia de disco',
 audio: 'Audio',
 networkBuses: 'Red y buses',
 monitors: 'Pantallas detectadas',
 sensorCoverage: 'Cobertura de sensores',
 manufacturer: 'Fabricante',
 model: 'Modelo del equipo',
 systemType: 'Tipo de sistema',
 installedMemory: 'Memoria instalada',
 operatingSystem: 'Sistema operativo',
 versionBuild: 'Version / build',
 architecture: 'Arquitectura',
 directx: 'DirectX',
 dxdiag: 'DxDiag',
 lastBoot: 'Ultimo arranque',
 installDate: 'Instalado el',
 motherboard: 'Placa madre',
 boardVersion: 'Version de placa',
 boardSerial: 'Serie placa',
 bios: 'BIOS',
 biosDate: 'Fecha de BIOS',
 pageFile: 'Archivo de paginacion',
 systemLanguage: 'Idioma del sistema',
 miracast: 'Miracast',
 processorModel: 'Modelo',
 socket: 'Socket',
 coresThreads: 'Nucleos / hilos',
 physicalProcessors: 'Procesadores fisicos',
 baseClock: 'Reloj base',
 maxClock: 'Reloj maximo',
 cache: 'Cache L2 / L3',
 virtualization: 'Virtualizacion visible',
 tdp: 'TDP de referencia',
 ramCapacity: 'Capacidad',
 ramConfiguredSpeed: 'Velocidad configurada',
 ramMaxSpeed: 'Velocidad maxima (rated)',
 reportedBus: 'Bus reportado',
 pci: 'PCI / PNP',
 driver: 'Driver',
 wddm: 'Modelo WDDM',
 currentMode: 'Modo actual',
 ddi: 'DDI / Feature Levels',
 hdr: 'HDR / monitor',
 gpuClock: 'Reloj GPU',
 vramNotReported: 'VRAM no reportada',
 gpuIndex: 'GPU',
 maxBoardCapacity: 'Capacidad maxima placa',
 slots: 'Slots / poblados',
 module: 'MODULO',
 waitingVendor: 'Esperando detalles del fabricante…',
 unit: 'UNIDAD',
 smart: 'S.M.A.R.T.',
 interface: 'Interfaz',
 firmware: 'Firmware',
 serial: 'Serie',
 partitions: 'Particiones',
 scsi: 'SCSI',
 noLabel: 'Sin etiqueta',
 free: 'libres',
 transferNote: 'La medicion escribe y lee un archivo temporal verificado en el volumen seleccionado. Asi vemos caudal real sin depender de otra utilidad externa.',
 logicalCapacity: 'Capacidad logica detectada',
 measure: 'Medir',
 measuring: 'Midiendo…',
 write: 'Escritura',
 read: 'Lectura',
 integrity: 'Integridad',
 verified: 'Verificada',
 withErrors: 'Con errores',
 waitingVolumes: 'Esperando volumenes montados para poder medir transferencia…',
 detectingAudio: 'Detectando dispositivos de audio…',
 adapter: 'ADAPTADOR',
 speedNotReported: 'Velocidad no reportada',
 activeAdapter: 'Adaptador activo',
 waitingDisplays: 'Esperando informacion de pantallas…',
 available: 'Disponible',
 notExposed: 'No expuesta',
 notIdentified: 'No identificado',
 present: 'Si',
 notPresent: 'No presente',
 smartExposed: 'No expuesto',
 temperature: 'CPU · temperatura',
 frequency: 'CPU · frecuencia',
 power: 'CPU · potencia',
 gpuProvider: 'GPU · proveedor',
 gpuTempPower: 'GPU · temperatura/potencia',
 battery: 'Bateria · capacidad/ciclos',
 disksSmart: 'Discos · S.M.A.R.T.'
 },
 en: {
 noReported: 'Not reported',
 yes: 'Yes',
 no: 'No',
 inventory: 'SYSTEM INVENTORY',
 reading: 'Reading components…',
 limited: 'Limited inventory',
 updated: 'Inventory updated',
 loadingTitle: 'We are gathering the full technical profile of the device',
 loadingBody: 'This view takes longer because it also correlates advanced Windows, DirectX, bus, and storage details. While this panel remains visible, the inventory is still being completed.',
 waitFull: 'The user can wait here until the full “My device” load is finished.',
 loadingSteps: [
 'Querying Windows and the base device profile',
 'Reading buses, controllers, and processor socket',
 'Collecting DirectX, display, and audio details',
 'Matching physical disks with volumes and firmware'
 ],
 systemDirectx: 'System and DirectX',
 boardFirmware: 'Motherboard and firmware',
 processor: 'Processor',
 graphics: 'Graphics adapters',
 memory: 'RAM memory',
 physicalStorage: 'Physical storage',
 diskTransfer: 'Disk transfer',
 audio: 'Audio',
 networkBuses: 'Network and buses',
 monitors: 'Detected displays',
 sensorCoverage: 'Sensor coverage',
 manufacturer: 'Manufacturer',
 model: 'Device model',
 systemType: 'System type',
 installedMemory: 'Installed memory',
 operatingSystem: 'Operating system',
 versionBuild: 'Version / build',
 architecture: 'Architecture',
 directx: 'DirectX',
 dxdiag: 'DxDiag',
 lastBoot: 'Last boot',
 installDate: 'Installed on',
 motherboard: 'Motherboard',
 boardVersion: 'Board version',
 boardSerial: 'Board serial',
 bios: 'BIOS',
 biosDate: 'BIOS date',
 pageFile: 'Page file',
 systemLanguage: 'System language',
 miracast: 'Miracast',
 processorModel: 'Model',
 socket: 'Socket',
 coresThreads: 'Cores / threads',
 physicalProcessors: 'Physical processors',
 baseClock: 'Base clock',
 maxClock: 'Max clock',
 cache: 'L2 / L3 cache',
 virtualization: 'Visible virtualization',
 tdp: 'Reference TDP',
 ramCapacity: 'Capacity',
 ramConfiguredSpeed: 'Configured speed',
 ramMaxSpeed: 'Max speed (rated)',
 reportedBus: 'Reported bus',
 pci: 'PCI / PNP',
 driver: 'Driver',
 wddm: 'WDDM model',
 currentMode: 'Current mode',
 ddi: 'DDI / Feature Levels',
 hdr: 'HDR / monitor',
 gpuClock: 'GPU clock',
 vramNotReported: 'VRAM not reported',
 gpuIndex: 'GPU',
 maxBoardCapacity: 'Max board capacity',
 slots: 'Slots / populated',
 module: 'MODULE',
 waitingVendor: 'Waiting for vendor details…',
 unit: 'DRIVE',
 smart: 'S.M.A.R.T.',
 interface: 'Interface',
 firmware: 'Firmware',
 serial: 'Serial',
 partitions: 'Partitions',
 scsi: 'SCSI',
 noLabel: 'No label',
 free: 'free',
 transferNote: 'The measurement writes and reads a verified temporary file on the selected volume. This gives us real throughput without depending on another external utility.',
 logicalCapacity: 'Logical capacity detected',
 measure: 'Measure',
 measuring: 'Measuring…',
 write: 'Write',
 read: 'Read',
 integrity: 'Integrity',
 verified: 'Verified',
 withErrors: 'With errors',
 waitingVolumes: 'Waiting for mounted volumes to measure transfer…',
 detectingAudio: 'Detecting audio devices…',
 adapter: 'ADAPTER',
 speedNotReported: 'Speed not reported',
 activeAdapter: 'Active adapter',
 waitingDisplays: 'Waiting for display information…',
 available: 'Available',
 notExposed: 'Not exposed',
 notIdentified: 'Not identified',
 present: 'Yes',
 notPresent: 'Not present',
 smartExposed: 'Not exposed',
 temperature: 'CPU · temperature',
 frequency: 'CPU · frequency',
 power: 'CPU · power',
 gpuProvider: 'GPU · provider',
 gpuTempPower: 'GPU · temperature/power',
 battery: 'Battery · capacity/cycles',
 disksSmart: 'Disks · S.M.A.R.T.'
 },
 'zh-CN': {
 noReported: '未报告',
 yes: '是',
 no: '否',
 inventory: '系统清单',
 reading: '正在读取组件…',
 limited: '清单受限',
 updated: '清单已更新',
 loadingTitle: '正在收集设备的完整技术信息',
 loadingBody: '这个视图比其他页面更慢，因为它还会整合 Windows、DirectX、总线和存储的高级信息。只要此面板还在显示，说明清单仍在加载中。',
 waitFull: '用户可以在这里等待“我的设备”完整加载完成。',
 loadingSteps: [
 '正在查询 Windows 和设备基础信息',
 '正在读取总线、控制器和处理器插槽',
 '正在收集 DirectX、显示器和音频信息',
 '正在匹配物理磁盘、卷和固件'
 ],
 systemDirectx: '系统与 DirectX',
 boardFirmware: '主板与固件',
 processor: '处理器',
 graphics: '显卡',
 memory: '内存',
 physicalStorage: '物理存储',
 diskTransfer: '磁盘传输',
 audio: '音频',
 networkBuses: '网络与总线',
 monitors: '已检测显示器',
 sensorCoverage: '传感器覆盖范围',
 manufacturer: '制造商',
 model: '设备型号',
 systemType: '系统类型',
 installedMemory: '已安装内存',
 operatingSystem: '操作系统',
 versionBuild: '版本 / 构建号',
 architecture: '架构',
 directx: 'DirectX',
 dxdiag: 'DxDiag',
 lastBoot: '上次启动',
 installDate: '安装日期',
 motherboard: '主板',
 boardVersion: '主板版本',
 boardSerial: '主板序列号',
 bios: 'BIOS',
 biosDate: 'BIOS 日期',
 pageFile: '分页文件',
 systemLanguage: '系统语言',
 miracast: 'Miracast',
 processorModel: '型号',
 socket: '插槽',
 coresThreads: '核心 / 线程',
 physicalProcessors: '物理处理器',
 baseClock: '基础频率',
 maxClock: '最高频率',
 cache: 'L2 / L3 缓存',
 virtualization: '可见虚拟化',
 tdp: '参考 TDP',
 reportedBus: '报告总线',
 pci: 'PCI / PNP',
 driver: '驱动',
 wddm: 'WDDM 模型',
 currentMode: '当前模式',
 ddi: 'DDI / Feature Levels',
 hdr: 'HDR / 显示器',
 gpuClock: 'GPU 频率',
 vramNotReported: '未报告 VRAM',
 gpuIndex: 'GPU',
 maxBoardCapacity: '主板最大容量',
 slots: '插槽 / 已占用',
 module: '内存条',
 ramCapacity: '容量',
 ramConfiguredSpeed: '配置频率',
 ramMaxSpeed: '额定最高频率',
 waitingVendor: '正在等待厂商细节…',
 unit: '磁盘',
 smart: 'S.M.A.R.T.',
 interface: '接口',
 firmware: '固件',
 serial: '序列号',
 partitions: '分区数',
 scsi: 'SCSI',
 noLabel: '无标签',
 free: '可用',
 transferNote: '该测试会在所选卷中写入并读取一个经过校验的临时文件，因此无需依赖外部工具即可得到真实吞吐量。',
 logicalCapacity: '已检测逻辑容量',
 measure: '测试',
 measuring: '测试中…',
 write: '写入',
 read: '读取',
 integrity: '完整性',
 verified: '已验证',
 withErrors: '有错误',
 waitingVolumes: '正在等待已挂载卷以测量传输…',
 detectingAudio: '正在检测音频设备…',
 adapter: '适配器',
 speedNotReported: '未报告速度',
 activeAdapter: '活动适配器',
 waitingDisplays: '正在等待显示器信息…',
 available: '可用',
 notExposed: '未暴露',
 notIdentified: '未识别',
 present: '是',
 notPresent: '不存在',
 smartExposed: '未暴露',
 temperature: 'CPU · 温度',
 frequency: 'CPU · 频率',
 power: 'CPU · 功耗',
 gpuProvider: 'GPU · 提供方',
 gpuTempPower: 'GPU · 温度/功耗',
 battery: '电池 · 容量/循环',
 disksSmart: '磁盘 · S.M.A.R.T.'
 }
} as const

const display = (input: unknown, fallback = 'No reportado') => input === undefined || input === null || input === '' ? fallback : String(input)
const gb = (bytes?: number | null, fallback = 'No reportado') => bytes ? `${(bytes / 1024 ** 3).toFixed(bytes >= 1024 ** 3 ? 0 : 1)} GB` : fallback
const gbValue = (value?: number | null, fallback = 'No reportado') => value || value === 0 ? `${value.toFixed(value >= 100 ? 0 : 1)} GB` : fallback
const mhz = (value?: number | null, fallback = 'No reportado') => value ? `${Math.round(value * 1000)} MHz` : fallback
const cacheKb = (value?: number | null, fallback = 'No reportado') => value ? `${Math.round(value).toLocaleString()} KB` : fallback
const boolLabel = (value: boolean | null | undefined, yes: string, no: string, fallback: string) => value === undefined || value === null ? fallback : value ? yes : no
const normalizeMount = (mount?: string | null) => (mount || '').toUpperCase()
const round = (value: number, digits = 1) => Number(value.toFixed(digits))
const lookupBenchmark = (state: StorageBenchmarkState | null, mount: string) => state?.results?.find(item => normalizeMount(item.mount) === normalizeMount(mount)) || null

function SpecRows({ rows, fallback }: { rows: Array<[string, unknown]>; fallback: string }) {
 return <>{rows.map(([key, item]) => <div className="hardware-row" key={key}><span>{key}</span><strong>{display(item, fallback)}</strong></div>)}</>
}

export function Hardware({ data }: { data: Metrics }) {
 const { language } = useI18n()
 const text = copy[language]
 const [details, setDetails] = useState<SystemDetails | null>(null)
 const [loading, setLoading] = useState(true)
 const [inventoryError, setInventoryError] = useState<string | null>(null)
 const [benchmarkState, setBenchmarkState] = useState<StorageBenchmarkState | null>(null)
 const [runningMount, setRunningMount] = useState<string | null>(null)
 const [loadingPhase, setLoadingPhase] = useState(0)

 useEffect(() => {
 let alive = true
 async function load() {
 try {
 const [systemResponse, benchmarkResponse] = await Promise.all([fetch('/api/system'), fetch('/api/storage/benchmark')])
 const systemResult = await systemResponse.json()
 if (!systemResponse.ok) throw new Error(systemResult.error || 'Inventory unavailable')
 const benchmarkResult = benchmarkResponse.ok ? await benchmarkResponse.json() : { active: false, mount: null, results: [], lastError: null }
 if (!alive) return
 setDetails(systemResult)
 setBenchmarkState(benchmarkResult)
 setInventoryError(systemResult.limited ? systemResult.warning || text.limited : null)
 } catch (error) {
 if (!alive) return
 setInventoryError(error instanceof Error ? error.message : 'Inventory unavailable')
 } finally {
 if (alive) setLoading(false)
 }
 }
 load()
 return () => { alive = false }
 }, [text.limited])

 useEffect(() => {
 if (!loading) return
 const timer = window.setInterval(() => setLoadingPhase(current => (current + 1) % text.loadingSteps.length), 1800)
 return () => window.clearInterval(timer)
 }, [loading, text.loadingSteps])

 async function runBenchmark(mount: string) {
 setRunningMount(mount)
 try {
 const response = await fetch('/api/storage/benchmark', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ mount })
 })
 const result = await response.json()
 if (!response.ok) throw new Error(result.error || text.measure)
 setBenchmarkState(previous => ({
 active: false,
 mount: null,
 lastError: null,
 updatedAt: Date.now(),
 results: [result, ...(previous?.results || []).filter(item => normalizeMount(item.mount) !== normalizeMount(result.mount))].slice(0, 8)
 }))
 } catch (error) {
 setBenchmarkState(previous => ({
 active: false,
 mount: null,
 lastError: error instanceof Error ? error.message : text.measure,
 updatedAt: Date.now(),
 results: previous?.results || []
 }))
 } finally {
 setRunningMount(null)
 }
 }

 const cpu = details?.cpu
 const board = details?.baseboard
 const fallbackDisks: DiskDetail[] = data.hardware.disks.map(disk => ({ ...disk, bus: disk.interfaceType || undefined, size: disk.size * 1024 ** 3, smartStatus: disk.smartStatus || undefined, volumes: [] }))
 const benchmarkVolumes = useMemo(() => [
 ...data.storage.map(volume => ({ mount: volume.mount, fs: volume.fs, used: volume.used, size: volume.size })),
 ...((details?.disks || []).flatMap(disk => (disk.volumes || []).map(volume => ({
 mount: volume.mount || (volume.letter ? `${volume.letter}\\` : ''),
 fs: volume.filesystem || 'Volume',
 used: volume.sizeGb && volume.freeGb !== undefined && volume.freeGb !== null ? Math.max(0, round(volume.sizeGb - volume.freeGb, 1)) : null,
 size: volume.sizeGb || null
 })))).filter(volume => volume.mount)
 ].filter((volume, index, list) => list.findIndex(item => normalizeMount(item.mount) === normalizeMount(volume.mount)) === index), [data.storage, details?.disks])

 return <div className="hardware-page">
 <section className="hardware-intro">
 <div>
 <p className="eyebrow">{text.inventory}</p>
 <h2>{data.hardware.hostname}</h2>
 <p>{inventoryError || details?.os?.name || data.hardware.os}</p>
 </div>
 <span className={loading ? 'scan-state scanning' : 'scan-state'}>
 {loading ? <RefreshCw size={15}/> : <Box size={15}/>}
 {loading ? text.reading : inventoryError ? text.limited : text.updated}
 </span>
 </section>

 {loading ? <section className="hardware-loading-card" aria-live="polite" aria-busy="true">
 <div className="hardware-loading-copy">
 <p className="eyebrow">{text.inventory}</p>
 <h3>{text.loadingTitle}</h3>
 <p>{text.loadingBody}</p>
 </div>
 <div className="hardware-loading-progress">
 <div className="hardware-loading-track"><i/></div>
 <strong>{text.loadingSteps[loadingPhase]}</strong>
 <span>{text.waitFull}</span>
 </div>
 <div className="hardware-loading-steps">
 {text.loadingSteps.map((step, index) => <div className={`hardware-loading-step ${index === loadingPhase ? 'active' : ''}`} key={step}><i>{index + 1}</i><span>{step}</span></div>)}
 </div>
 </section> : null}

 <div className={`hardware-grid ${loading ? 'loading-grid' : ''}`}>
 <section className="hardware-card">
 <div className="hardware-title"><CircuitBoard size={20}/><h3>{text.systemDirectx}</h3></div>
 <SpecRows fallback={text.noReported} rows={[
 [text.manufacturer, details?.system?.manufacturer],
 [text.model, details?.system?.model],
 [text.systemType, details?.system?.systemType],
 [text.installedMemory, details?.system?.totalMemoryGb ? gbValue(details.system.totalMemoryGb, text.noReported) : `${data.memory.total} GB`],
 [text.operatingSystem, details?.os?.name || data.hardware.os],
 [text.versionBuild, `${display(details?.os?.version, '')} ${display(details?.os?.build, '')}`.trim()],
 [text.architecture, details?.os?.architecture],
 [text.directx, details?.directx?.version],
 [text.dxdiag, details?.directx?.dxDiagVersion],
 [text.lastBoot, details?.os?.lastBoot],
 [text.installDate, details?.os?.installDate]
 ]}/>
 </section>

 <section className="hardware-card">
 <div className="hardware-title"><CircuitBoard size={20}/><h3>{text.boardFirmware}</h3></div>
 <SpecRows fallback={text.noReported} rows={[
 [text.motherboard, `${display(board?.manufacturer, '')} ${display(board?.model, '')}`.trim()],
 [text.boardVersion, board?.version],
 [text.boardSerial, board?.serial],
 [text.bios, `${display(details?.bios?.vendor, '')} ${display(details?.bios?.version, '')}`.trim()],
 [text.biosDate, details?.bios?.releaseDate],
 [text.pageFile, details?.os?.pageFile],
 [text.systemLanguage, details?.os?.language],
 [text.miracast, details?.directx?.miracast]
 ]}/>
 </section>

 <section className="hardware-card">
 <div className="hardware-title"><Cpu size={20}/><h3>{text.processor}</h3></div>
 <SpecRows fallback={text.noReported} rows={[
 [text.processorModel, cpu?.brand || data.cpu.model],
 [text.manufacturer, cpu?.manufacturer || cpu?.vendor],
 [text.socket, cpu?.socket],
 [text.architecture, cpu?.architecture],
 [text.coresThreads, `${cpu?.physicalCores || data.cpu.physicalCores} / ${cpu?.cores || data.cpu.cores}`],
 [text.physicalProcessors, cpu?.processors],
 [text.baseClock, mhz(cpu?.speed, text.noReported)],
 [text.maxClock, mhz(cpu?.speedMax, text.noReported)],
 [text.cache, `${cacheKb(cpu?.l2CacheKb, text.noReported)} / ${cacheKb(cpu?.l3CacheKb, text.noReported)}`],
 [text.virtualization, boolLabel(cpu?.virtualizationFirmwareEnabled, text.yes, text.no, text.noReported)],
 [text.tdp, `${cpu?.estimatedTdp || data.cpu.tdp} W`]
 ]}/>
 </section>

 <section className="hardware-card">
 <div className="hardware-title"><MonitorCog size={20}/><h3>{text.graphics}</h3></div>
 {(details?.graphics?.controllers?.length ? details.graphics.controllers : [{ model: data.gpu.model, vendor: data.gpu.vendor, vram: data.gpu.memoryTotal }]).map((gpu, index) => {
 // Win32_VideoController.AdapterRAM esta limitado a 32-bit → max 4095 MB para GPUs con >4 GB VRAM
 // Si WMI da ≤4095 y nvidia-smi reporta mas, usar nvidia-smi (memoryTotal es en MB)
 const nvidiaVram = index === 0 ? data.gpu.memoryTotal : 0
 const displayVram = nvidiaVram && nvidiaVram > (gpu.vram ?? 0) ? nvidiaVram : gpu.vram
 const gpuClock = index === 0 && data.gpu.clock ? data.gpu.clock : null
 return <div className="component-block" key={`${gpu.model}-${index}`}>
 <span className="component-index">{text.gpuIndex} {index + 1}</span>
 <strong>{display(gpu.model, text.noReported)}</strong>
 <small>{display(gpu.vendor, text.noReported)} - {displayVram ? `${displayVram} MB VRAM` : text.vramNotReported}</small>
 <SpecRows fallback={text.noReported} rows={[
 [text.reportedBus, gpu.bus],
 [text.pci, gpu.pciAddress || gpu.pnpDeviceId],
 [text.driver, gpu.driverVersion],
 [text.wddm, gpu.driverModel],
 [text.currentMode, gpu.currentMode],
 [text.ddi, `${display(gpu.ddi, '')} ${display(gpu.featureLevels, '')}`.trim() || null],
 [text.hdr, `${display(gpu.hdr, '')} ${display(gpu.monitor, '')}`.trim() || null],
 ...(gpuClock ? [[text.gpuClock, `${gpuClock} MHz`] as [string, unknown]] : [])
 ]}/>
 </div>
 })}
 </section>

 <section className="hardware-card">
 <div className="hardware-title"><MemoryStick size={20}/><h3>{text.memory}</h3></div>
 <SpecRows fallback={text.noReported} rows={[
 [text.maxBoardCapacity, gbValue(details?.memorySummary?.maxCapacityGb, text.noReported)],
 [text.slots, `${display(details?.memorySummary?.slots, '0')} / ${display(details?.memorySummary?.populated, '0')}`]
 ]}/>
 {details?.memory?.length ? details.memory.map((module, index) => <div className="component-block" key={`${module.bank}-${index}`}>
 <span className="component-index">{text.module} {index + 1}</span>
 <strong>{display(module.partNum, `${gb(module.size, text.noReported)} ${display(module.type, '')}`)}</strong>
 <small>{display(module.manufacturer, text.noReported)} · {display(module.type, '')}</small>
 <SpecRows fallback={text.noReported} rows={[
 [text.ramCapacity, module.size ? gb(module.size, text.noReported) : text.noReported],
 [text.ramConfiguredSpeed, module.clockSpeed ? `${module.clockSpeed} MHz` : text.noReported],
 ...(module.speedMax && module.speedMax !== module.clockSpeed ? [[text.ramMaxSpeed, `${module.speedMax} MHz`] as [string, unknown]] : []),
 ['Banco / slot', `${display(module.bank, '')} ${display(module.slot, '')}`.trim() || text.noReported],
 ['Tipo', module.type],
 [text.serial, module.serial]
 ]}/>
 </div>) : <div className="component-block"><strong>{data.memory.total} GB</strong><small>{text.waitingVendor}</small></div>}
 </section>

 <section className="hardware-card">
 <div className="hardware-title"><HardDrive size={20}/><h3>{text.physicalStorage}</h3></div>
 {(details?.disks?.length ? details.disks : fallbackDisks).map((disk, index) => <div className="component-block" key={`${disk.name}-${index}`}>
 <span className="component-index">{text.unit} {index + 1}</span>
 <strong>{display(disk.name, text.noReported)}</strong>
 <small>{display(disk.vendor, '')} - {display(disk.bus || disk.interfaceType, text.noReported)} - {gb(disk.size, text.noReported)} {disk.smartStatus ? `- ${text.smart} ${disk.smartStatus}` : ''}</small>
 <SpecRows fallback={text.noReported} rows={[
 [text.interface, disk.interfaceType],
 [text.reportedBus, disk.bus],
 [text.firmware, disk.firmwareRevision],
 [text.serial, disk.serialNumber || disk.serialNum],
 [text.partitions, disk.partitions],
 [text.scsi, disk.scsiPort !== undefined ? `Puerto ${disk.scsiPort} - Target ${disk.scsiTargetId}` : undefined]
 ]}/>
 {disk.volumes?.length ? <div className="volume-list">{disk.volumes.map((volume, volumeIndex) => <div className="volume-chip" key={`${volume.mount || volume.letter}-${volumeIndex}`}>
 <strong>{display(volume.mount || volume.letter, text.noReported)}</strong>
 <span>{display(volume.label, text.noLabel)} - {display(volume.filesystem, text.noReported)} - {gbValue(volume.freeGb, text.noReported)} {text.free}{volume.sizeGb ? ` / ${gbValue(volume.sizeGb)}` : ''}</span>
 </div>)}</div> : null}
 </div>)}
 </section>

 <section className="hardware-card">
 <div className="hardware-title"><HardDrive size={20}/><h3>{text.diskTransfer}</h3></div>
 <p className="hardware-note">{text.transferNote}</p>
 {benchmarkVolumes.map(volume => {
 const result = lookupBenchmark(benchmarkState, volume.mount)
 const active = runningMount === volume.mount || (benchmarkState?.active && benchmarkState.mount === volume.mount)
 return <div className="benchmark-volume" key={volume.mount}>
 <div>
 <strong>{volume.mount}</strong>
 <small>{volume.fs} - {volume.used !== null && volume.size !== null ? `${volume.used}/${volume.size} GB usados` : text.logicalCapacity}</small>
 </div>
 <button type="button" className="benchmark-button" disabled={Boolean(runningMount) || Boolean(benchmarkState?.active)} onClick={() => runBenchmark(volume.mount)}>
 {active ? <RefreshCw size={14} className="spin"/> : null}
 {active ? text.measuring : text.measure}
 </button>
 <div className="benchmark-result">
 <span>{text.write}</span><b>{result ? `${result.writeMbps} MB/s` : '—'}</b>
 <span>{text.read}</span><b>{result ? `${result.readMbps} MB/s` : '—'}</b>
 <span>{text.integrity}</span><b>{result ? (result.verified ? text.verified : text.withErrors) : '—'}</b>
 </div>
 </div>
 })}
 {!benchmarkVolumes.length ? <p className="empty-detail">{text.waitingVolumes}</p> : null}
 {benchmarkState?.lastError ? <p className="hardware-note hardware-note-danger">{benchmarkState.lastError}</p> : null}
 </section>

 <section className="hardware-card">
 <div className="hardware-title"><Headphones size={20}/><h3>{text.audio}</h3></div>
 {details?.audio?.length ? details.audio.slice(0, 6).map((device, index) => <div className="simple-device" key={`${device.name}-${index}`}>
 <Headphones size={14}/>
 <div><strong>{display(device.name, text.noReported)}</strong><small>{display(device.manufacturer, text.noReported)} · {display(device.driverVersion, text.noReported)}</small></div>
 </div>) : <p className="empty-detail">{text.detectingAudio}</p>}
 </section>

 <section className="hardware-card">
 <div className="hardware-title"><Network size={20}/><h3>{text.networkBuses}</h3></div>
 {details?.network?.length ? details.network.filter(item => !item.iface?.toLowerCase().includes('loopback')).slice(0, 6).map((adapter, index) => <div className="component-block" key={`${adapter.iface}-${index}`}>
 <span className="component-index">{text.adapter} {index + 1}</span>
 <strong>{display(adapter.iface, display(adapter.model, text.noReported))}</strong>
 <small>{display(adapter.type, text.noReported)} - {adapter.speed ? `${adapter.speed} Mbps` : text.speedNotReported}</small>
 <SpecRows fallback={text.noReported} rows={[
 [text.model, adapter.model],
 [text.manufacturer, adapter.manufacturer],
 ['MAC', adapter.mac],
 ['PNP', adapter.pnpDeviceId]
 ]}/>
 </div>) : <div className="simple-device"><Network size={14}/><div><strong>{data.network.interface}</strong><small>{text.activeAdapter}</small></div></div>}
 </section>

 <section className="hardware-card">
 <div className="hardware-title"><Monitor size={20}/><h3>{text.monitors}</h3></div>
 {details?.monitors?.length ? details.monitors.map((monitor, index) => <div className="simple-device" key={`${monitor.name}-${index}`}>
 <Monitor size={14}/>
 <div><strong>{display(monitor.name, text.noReported)}</strong><small>{monitor.screenWidth && monitor.screenHeight ? `${monitor.screenWidth} x ${monitor.screenHeight}` : display(monitor.status, text.noReported)}</small></div>
 </div>) : <p className="empty-detail">{text.waitingDisplays}</p>}
 </section>

 <section className="hardware-card">
 <div className="hardware-title"><MonitorCog size={20}/><h3>{text.sensorCoverage}</h3></div>
 <SpecRows fallback={text.noReported} rows={[
 [text.temperature, data.capabilities?.cpu.temperature ? text.available : text.notExposed],
 [text.frequency, data.capabilities?.cpu.clock ? text.available : text.notExposed],
 [text.power, data.capabilities?.cpu.power ? text.available : text.notExposed],
 [text.gpuProvider, data.capabilities?.gpu.source || text.notIdentified],
 [text.gpuTempPower, `${data.capabilities?.gpu.temperature ? text.present : text.no} / ${data.capabilities?.gpu.power ? text.present : text.no}`],
 [text.battery, data.capabilities?.battery.present ? `${data.capabilities.battery.capacity ? text.present : text.no} / ${data.capabilities.battery.cycles ? text.present : text.no}` : text.notPresent],
 [text.disksSmart, data.capabilities?.storage.smart ? text.available : text.smartExposed]
 ]}/>
 </section>
 </div>
 </div>
}
