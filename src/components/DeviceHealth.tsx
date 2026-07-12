import { useEffect, useMemo, useState } from 'react'
import { BatteryCharging, CheckCircle2, Cpu, Download, FileText, Gauge, Globe, LoaderCircle, MemoryStick, MonitorSmartphone, Play, ShieldAlert, Smartphone, Thermometer, Trophy, Zap } from 'lucide-react'
import { useI18n } from '../i18n'
import type { Metrics, StressSession } from '../types'

interface BatteryInfo { level: number; charging: boolean }
interface DeviceProfile { cores: number; memoryGb: number | null; platform: string; screen: string; gpu: string; storageUsed: number; storageTotal: number }
interface BrowserBattery {
  level: number
  charging: boolean
  addEventListener: (event: string, callback: () => void) => void
  removeEventListener: (event: string, callback: () => void) => void
}
interface StorageBenchmarkResult {
  mount: string
  writeMbps: number
  readMbps: number
  verified: boolean
}
interface Diagnostic {
  date: number
  mode: 'quick' | 'full'
  cpuScore: number
  gpuFps: number | null
  memoryScore: number | null
  score: number
  coverage: number
  storageReadMbps: number | null
  storageWriteMbps: number | null
  batteryHealthPercent: number | null
  cpuPeakTemp: number | null
  gpuPeakTemp: number | null
  cpuPeakPower: number | null
  gpuPeakPower: number | null
  notes: string[]
}
interface EvaluationState {
  active: boolean
  mode: 'quick' | 'full'
  step: string
  startedAt: number
  durationMs: number
  diskActive: boolean
}
interface VerificationItem {
  title: string
  detail: string
  state: 'measured' | 'limited' | 'unavailable'
}

const getNavigator = () => navigator as Navigator & { deviceMemory?: number; getBattery?: () => Promise<BrowserBattery> }
const sleep = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms))
const formatGb = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(1)} GB`
const safeName = (value: string) => value.replace(/[^a-z0-9_-]+/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'device'
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const round = (value: number, digits = 1) => Number(value.toFixed(digits))
const average = (values: number[]) => values.length ? values.reduce((sum, item) => sum + item, 0) / values.length : 0

const copy = {
  es: {
    fetchError: 'No se pudo leer',
    quickDone: 'DiagnÃ³stico rÃ¡pido completado',
    quickFailed: 'No fue posible completar todas las pruebas',
    fullDone: 'EvaluaciÃ³n completa terminada',
    fullFailed: 'La evaluaciÃ³n completa no pudo finalizar',
    notExported: 'AÃºn no se ha exportado un informe de pruebas.',
    ready: 'Listo para evaluar',
    evalCpu: 'Evaluando CPU...',
    evalMemory: 'Evaluando memoria...',
    evalGpu: 'Evaluando GPU...',
    preparingFull: 'Preparando la evaluaciÃ³n completa. El equipo puede ponerse lento.',
    stressingAll: 'Estresando CPU, GPU, memoria y disco en simultÃ¡neo...',
    concurrentLoad: 'Aplicando carga concurrente. El equipo puede responder lento durante el proceso.',
    consolidating: 'Consolidando resultados y calculando el promedio final...',
    reportFailed: 'No se pudo exportar el informe',
    reportReady: 'Informe exportado: {filename}. El tester ya puede enviarlo al equipo de anÃ¡lisis.',
    quickNote: 'Prueba comparativa rÃ¡pida ejecutada desde el navegador integrado.',
    fullNote: 'EvaluaciÃ³n completa terminada sin incidencias adicionales.',
    cpuTimeout: 'La prueba sostenida de CPU no terminÃ³ a tiempo y se detuvo de forma preventiva.',
    cpuCouldNotRun: 'No se pudo ejecutar la prueba sostenida de CPU.',
    fullNoDisk: 'No habÃ­a un volumen disponible para benchmark de disco.',
    fullNoCpuTemp: 'No habÃ­a temperatura real reciente para la prueba sostenida de CPU.',
    batteryProtected: 'GPU protegida por el navegador',
    heroEyebrow: 'PC Â· MÃ“VIL Â· TABLET',
    heroTitle: 'Rendimiento del dispositivo',
    heroDesc: 'Este panel distingue entre mediciÃ³n real, cobertura parcial y partes no expuestas por el sistema. La evaluaciÃ³n completa somete el equipo a carga real para obtener una comparaciÃ³n mÃ¡s sÃ³lida.',
    currentIndex: 'ÃNDICE ACTUAL',
    runningEyebrow: 'EVALUACIÃ“N EN CURSO',
    runningTitle: 'Se estÃ¡n estresando varios componentes al mismo tiempo',
    machineSlow: 'El equipo puede ponerse lento',
    important: 'Importante',
    importantDesc: 'Durante este proceso el equipo puede responder mÃ¡s lento y los ventiladores pueden subir. La duraciÃ³n cambia segÃºn el hardware, el disco y la disponibilidad de sensores.',
    noThermalSensor: 'sin sensor tÃ©rmico',
    loading: 'cargando',
    diskActive: 'ACTIVO',
    diskOk: 'OK',
    diskBusy: 'lectura y escritura real en curso',
    diskDone: 'benchmark consolidado',
    verify: 'QuÃ© se verifica',
    measured: 'Medido',
    limited: 'Limitado',
    unavailable: 'No disponible',
    profile: 'Perfil detectado',
    logicalThreads: 'hilos lÃ³gicos',
    visibleMemory: 'memoria visible',
    renderer: 'renderizador',
    batteryStorage: 'BaterÃ­a y almacenamiento',
    batteryCurrent: 'BaterÃ­a actual',
    batteryMissing: 'No presente o no expuesta',
    pluggedIn: 'Conectado a energÃ­a',
    discharging: 'En descarga',
    noReading: 'Sin lectura disponible',
    cycles: 'ciclos',
    storageUsed: 'Almacenamiento usado',
    restricted: 'Restringido',
    browserNoCapacity: 'El navegador no expone la capacidad',
    testsAvailable: 'Pruebas disponibles',
    testsDesc: 'Usa el diagnÃ³stico rÃ¡pido para una comparaciÃ³n local y la evaluaciÃ³n completa para capturar rendimiento, sensores y almacenamiento con mucha mayor cobertura.',
    quickTest: 'DiagnÃ³stico rÃ¡pido',
    fullTest: 'EvaluaciÃ³n completa del equipo',
    fullNoteUi: 'La evaluaciÃ³n completa lanza carga concurrente y puede hacer que el equipo se note mÃ¡s pesado durante varios segundos.',
    mode: 'MODO',
    full: 'FULL',
    quick: 'RÃPIDO',
    coverage: 'de cobertura',
    operationsPerSec: 'operaciones/s',
    testFps: 'FPS de prueba',
    loopsPerSec: 'MB/s',
    readWrite: 'lectura/escritura',
    estimatedHealth: 'salud estimada',
    averageTrend: 'Promedio y tendencia',
    storedAverage: 'promedio guardado',
    localTests: 'pruebas locales',
    vsBaseline: 'frente a lÃ­nea base',
    lastFull: 'Ãºltima full',
    comparativeNote: 'Para base de datos comparativa, la muestra mÃ¡s valiosa es la Ãºltima evaluaciÃ³n completa, porque indica claramente quÃ© partes fueron verificadas y con quÃ© cobertura.',
    reportTitle: 'Informe para pruebas',
    reportDesc: 'Exporta el estado del equipo junto con la Ãºltima evaluaciÃ³n local. AsÃ­ la base de datos puede distinguir rendimiento, sensores disponibles y limitaciones del sistema.',
    generating: 'Generando informe...',
    exportFull: 'Exportar informe completo',
    recommend: 'Recomendado: ejecutar primero la evaluaciÃ³n completa y luego exportar. El informe no inventa datos ausentes.',
    readyToSend: 'Listo para enviar',
    latestFull: 'Ãšltima evaluaciÃ³n completa',
    cpuPeak: 'pico CPU',
    gpuPeak: 'pico GPU',
    cpuPowerPeak: 'CPU pico',
    gpuPowerPeak: 'GPU pico',
    impact: 'Impacto de FixTemp',
    serviceCpu: 'CPU del servicio',
    serviceRam: 'RAM del servicio',
    serviceNote: 'Medido por el propio servicio; no incluye la ventana Chromium.',
    batteryMeasured: 'Nivel, ciclos y salud estimada si la baterÃ­a lo reporta.',
    batteryUnavailable: 'No aplica o no se expone por el sistema.',
    diskMeasured: 'Lectura y escritura real sobre un volumen local.',
    diskUnavailable: 'No hay volumen listo para benchmark.',
    cpuMeasured: 'Carga breve y carga sostenida con telemetrÃ­a real cuando existe sensor.',
    gpuMeasured: 'Render WebGL 2 con FPS reales y seguimiento de temperatura/potencia si el sistema lo expone.',
    memoryMeasured: 'Actividad sostenida en RAM visible al usuario.',
    browserQuickName: 'equipo',
    testRequiredNote: 'Completa la evaluaciÃ³n completa para desbloquear el informe y participar en el ranking.',
    rankSending: 'Enviando al ranking globalâ€¦',
    rankSent: 'Â¡Registrado en el ranking!',
    rankFailed: 'No se pudo enviar al ranking.',
    rankRetry: 'Reintentar envÃ­o',
    rankPosition: 'PosiciÃ³n',
    rankOf: 'de {total} equipos',
    rankPercentile: 'Superas al',
    rankOfDevices: 'de los equipos',
    scoreLabel: 'TU PUNTUACIÃ“N',
    viewRanking: 'Ver ranking global'
  },
  en: {
    fetchError: 'Could not read',
    quickDone: 'Quick diagnosis completed',
    quickFailed: 'Could not complete all tests',
    fullDone: 'Full evaluation finished',
    fullFailed: 'The full evaluation could not finish',
    notExported: 'No test report has been exported yet.',
    ready: 'Ready to evaluate',
    evalCpu: 'Testing CPU...',
    evalMemory: 'Testing memory...',
    evalGpu: 'Testing GPU...',
    preparingFull: 'Preparing the full evaluation. The device may become slow.',
    stressingAll: 'Stressing CPU, GPU, memory, and disk at the same time...',
    concurrentLoad: 'Applying concurrent load. The device may feel slower during the process.',
    consolidating: 'Consolidating results and calculating the final average...',
    reportFailed: 'Could not export the report',
    reportReady: 'Report exported: {filename}. The tester can now send it to the analysis team.',
    quickNote: 'Quick comparison test run from the integrated browser.',
    fullNote: 'Full evaluation finished without additional incidents.',
    cpuTimeout: 'The sustained CPU test did not finish in time and was stopped as a precaution.',
    cpuCouldNotRun: 'The sustained CPU test could not be executed.',
    fullNoDisk: 'No volume was available for the disk benchmark.',
    fullNoCpuTemp: 'There was no recent real CPU temperature for the sustained test.',
    batteryProtected: 'GPU protected by the browser',
    heroEyebrow: 'PC Â· MOBILE Â· TABLET',
    heroTitle: 'Device performance',
    heroDesc: 'This panel distinguishes between real measurement, partial coverage, and parts not exposed by the system. The full evaluation applies real load to obtain a stronger comparison.',
    currentIndex: 'CURRENT INDEX',
    runningEyebrow: 'EVALUATION IN PROGRESS',
    runningTitle: 'Several components are being stressed at the same time',
    machineSlow: 'The device may become slow',
    important: 'Important',
    importantDesc: 'During this process the device may respond more slowly and the fans may ramp up. Duration changes depending on the hardware, disk, and sensor availability.',
    noThermalSensor: 'no thermal sensor',
    loading: 'loading',
    diskActive: 'ACTIVE',
    diskOk: 'OK',
    diskBusy: 'real read/write in progress',
    diskDone: 'benchmark consolidated',
    verify: 'What is verified',
    measured: 'Measured',
    limited: 'Limited',
    unavailable: 'Unavailable',
    profile: 'Detected profile',
    logicalThreads: 'logical threads',
    visibleMemory: 'visible memory',
    renderer: 'renderer',
    batteryStorage: 'Battery and storage',
    batteryCurrent: 'Current battery',
    batteryMissing: 'Not present or not exposed',
    pluggedIn: 'Plugged into power',
    discharging: 'Discharging',
    noReading: 'No reading available',
    cycles: 'cycles',
    storageUsed: 'Storage used',
    restricted: 'Restricted',
    browserNoCapacity: 'The browser does not expose capacity',
    testsAvailable: 'Available tests',
    testsDesc: 'Use the quick diagnosis for a local comparison and the full evaluation to capture performance, sensors, and storage with much broader coverage.',
    quickTest: 'Quick diagnosis',
    fullTest: 'Full device evaluation',
    fullNoteUi: 'The full evaluation launches concurrent load and may make the device feel heavier for several seconds.',
    mode: 'MODE',
    full: 'FULL',
    quick: 'QUICK',
    coverage: 'coverage',
    operationsPerSec: 'operations/s',
    testFps: 'test FPS',
    loopsPerSec: 'MB/s',
    readWrite: 'read/write',
    estimatedHealth: 'estimated health',
    averageTrend: 'Average and trend',
    storedAverage: 'stored average',
    localTests: 'local tests',
    vsBaseline: 'vs baseline',
    lastFull: 'last full',
    comparativeNote: 'For a comparative database, the most valuable sample is the latest full evaluation, because it clearly shows which parts were verified and with what coverage.',
    reportTitle: 'Report for testing',
    reportDesc: 'Export the device state together with the latest local evaluation. This lets the database distinguish performance, available sensors, and system limitations.',
    generating: 'Generating report...',
    exportFull: 'Export full report',
    recommend: 'Recommended: run the full evaluation first and then export. The report does not invent missing data.',
    readyToSend: 'Ready to send',
    latestFull: 'Latest full evaluation',
    cpuPeak: 'CPU peak',
    gpuPeak: 'GPU peak',
    cpuPowerPeak: 'CPU power peak',
    gpuPowerPeak: 'GPU power peak',
    impact: 'FixTemp impact',
    serviceCpu: 'service CPU',
    serviceRam: 'service RAM',
    serviceNote: 'Measured by the service itself; this does not include the Chromium window.',
    batteryMeasured: 'Level, cycles, and estimated health when the battery reports it.',
    batteryUnavailable: 'Not applicable or not exposed by the system.',
    diskMeasured: 'Real read and write on a local volume.',
    diskUnavailable: 'No volume ready for benchmarking.',
    cpuMeasured: 'Short load and sustained load with real telemetry when a sensor exists.',
    gpuMeasured: 'WebGL 2 rendering with real FPS and temperature/power tracking when exposed by the system.',
    memoryMeasured: 'Sustained RAM activity visible to the user.',
    browserQuickName: 'device',
    testRequiredNote: 'Complete the full evaluation to unlock the report and join the ranking.',
    rankSending: 'Sending to global rankingâ€¦',
    rankSent: 'Registered in the ranking!',
    rankFailed: 'Could not send to ranking.',
    rankRetry: 'Retry submission',
    rankPosition: 'Position',
    rankOf: 'of {total} devices',
    rankPercentile: 'You beat',
    rankOfDevices: 'of all devices',
    scoreLabel: 'YOUR SCORE',
    viewRanking: 'View global ranking'
  },
  'zh-CN': {
    fetchError: 'æ— æ³•è¯»å–',
    quickDone: 'å¿«é€Ÿè¯Šæ–­å·²å®Œæˆ',
    quickFailed: 'æ— æ³•å®Œæˆæ‰€æœ‰æµ‹è¯•',
    fullDone: 'å®Œæ•´è¯„ä¼°å·²å®Œæˆ',
    fullFailed: 'å®Œæ•´è¯„ä¼°æœªèƒ½å®Œæˆ',
    notExported: 'å°šæœªå¯¼å‡ºæµ‹è¯•æŠ¥å‘Šã€‚',
    ready: 'å‡†å¤‡è¯„ä¼°',
    evalCpu: 'æ­£åœ¨æµ‹è¯• CPU...',
    evalMemory: 'æ­£åœ¨æµ‹è¯•å†…å­˜...',
    evalGpu: 'æ­£åœ¨æµ‹è¯• GPU...',
    preparingFull: 'æ­£åœ¨å‡†å¤‡å®Œæ•´è¯„ä¼°ã€‚è®¾å¤‡å¯èƒ½ä¼šå˜æ…¢ã€‚',
    stressingAll: 'æ­£åœ¨åŒæ—¶åŽ‹æµ‹ CPUã€GPUã€å†…å­˜å’Œç£ç›˜...',
    concurrentLoad: 'æ­£åœ¨æ–½åŠ å¹¶å‘è´Ÿè½½ã€‚è®¾å¤‡åœ¨è¿‡ç¨‹ä¸­å¯èƒ½ä¼šå˜æ…¢ã€‚',
    consolidating: 'æ­£åœ¨æ±‡æ€»ç»“æžœå¹¶è®¡ç®—æœ€ç»ˆå¹³å‡å€¼...',
    reportFailed: 'æ— æ³•å¯¼å‡ºæŠ¥å‘Š',
    reportReady: 'æŠ¥å‘Šå·²å¯¼å‡ºï¼š{filename}ã€‚æµ‹è¯•äººå‘˜çŽ°åœ¨å¯ä»¥å‘é€ç»™åˆ†æžå›¢é˜Ÿã€‚',
    quickNote: 'åœ¨å†…ç½®æµè§ˆå™¨ä¸­æ‰§è¡Œçš„å¿«é€Ÿå¯¹æ¯”æµ‹è¯•ã€‚',
    fullNote: 'å®Œæ•´è¯„ä¼°å·²å®Œæˆï¼Œæ²¡æœ‰é¢å¤–å¼‚å¸¸ã€‚',
    cpuTimeout: 'æŒç»­ CPU æµ‹è¯•æœªèƒ½æŒ‰æ—¶ç»“æŸï¼Œå·²å‡ºäºŽä¿æŠ¤ç›®çš„åœæ­¢ã€‚',
    cpuCouldNotRun: 'æ— æ³•æ‰§è¡ŒæŒç»­ CPU æµ‹è¯•ã€‚',
    fullNoDisk: 'æ²¡æœ‰å¯ç”¨äºŽç£ç›˜åŸºå‡†æµ‹è¯•çš„å·ã€‚',
    fullNoCpuTemp: 'æ²¡æœ‰å¯ç”¨äºŽæŒç»­æµ‹è¯•çš„è¿‘æœŸçœŸå®ž CPU æ¸©åº¦ã€‚',
    batteryProtected: 'æµè§ˆå™¨ä¿æŠ¤çš„ GPU',
    heroEyebrow: 'PC Â· æ‰‹æœº Â· å¹³æ¿',
    heroTitle: 'è®¾å¤‡æ€§èƒ½',
    heroDesc: 'æ­¤é¢æ¿ä¼šåŒºåˆ†çœŸå®žæµ‹é‡ã€éƒ¨åˆ†è¦†ç›–ä»¥åŠç³»ç»Ÿæœªæš´éœ²çš„éƒ¨åˆ†ã€‚å®Œæ•´è¯„ä¼°ä¼šå¯¹è®¾å¤‡æ–½åŠ çœŸå®žè´Ÿè½½ï¼Œä»¥èŽ·å¾—æ›´å¯é çš„å¯¹æ¯”ç»“æžœã€‚',
    currentIndex: 'å½“å‰æŒ‡æ•°',
    runningEyebrow: 'è¯„ä¼°è¿›è¡Œä¸­',
    runningTitle: 'å¤šä¸ªç»„ä»¶æ­£åœ¨åŒæ—¶å—åŽ‹',
    machineSlow: 'è®¾å¤‡å¯èƒ½ä¼šå˜æ…¢',
    important: 'é‡è¦',
    importantDesc: 'åœ¨æ­¤è¿‡ç¨‹ä¸­ï¼Œè®¾å¤‡å“åº”å¯èƒ½ä¼šå˜æ…¢ï¼Œé£Žæ‰‡ä¹Ÿå¯èƒ½å‡é€Ÿã€‚è€—æ—¶å–å†³äºŽç¡¬ä»¶ã€ç£ç›˜å’Œä¼ æ„Ÿå™¨å¯ç”¨æ€§ã€‚',
    noThermalSensor: 'æ— æ¸©åº¦ä¼ æ„Ÿå™¨',
    loading: 'åŠ è½½ä¸­',
    diskActive: 'è¿è¡Œä¸­',
    diskOk: 'å®Œæˆ',
    diskBusy: 'çœŸå®žè¯»å†™è¿›è¡Œä¸­',
    diskDone: 'åŸºå‡†ç»“æžœå·²æ±‡æ€»',
    verify: 'éªŒè¯å†…å®¹',
    measured: 'å·²æµ‹é‡',
    limited: 'å—é™',
    unavailable: 'ä¸å¯ç”¨',
    profile: 'æ£€æµ‹åˆ°çš„é…ç½®',
    logicalThreads: 'é€»è¾‘çº¿ç¨‹',
    visibleMemory: 'å¯è§å†…å­˜',
    renderer: 'æ¸²æŸ“å™¨',
    batteryStorage: 'ç”µæ± ä¸Žå­˜å‚¨',
    batteryCurrent: 'å½“å‰ç”µæ± ',
    batteryMissing: 'ä¸å­˜åœ¨æˆ–æœªæš´éœ²',
    pluggedIn: 'å·²æŽ¥é€šç”µæº',
    discharging: 'æ”¾ç”µä¸­',
    noReading: 'æ— å¯ç”¨è¯»æ•°',
    cycles: 'å¾ªçŽ¯',
    storageUsed: 'å·²ç”¨å­˜å‚¨',
    restricted: 'å—é™',
    browserNoCapacity: 'æµè§ˆå™¨æœªæš´éœ²å®¹é‡ä¿¡æ¯',
    testsAvailable: 'å¯ç”¨æµ‹è¯•',
    testsDesc: 'å¿«é€Ÿè¯Šæ–­ç”¨äºŽæœ¬åœ°å¯¹æ¯”ï¼›å®Œæ•´è¯„ä¼°åˆ™èƒ½ä»¥æ›´é«˜è¦†ç›–çŽ‡æ•èŽ·æ€§èƒ½ã€ä¼ æ„Ÿå™¨ä¸Žå­˜å‚¨è¡¨çŽ°ã€‚',
    quickTest: 'å¿«é€Ÿè¯Šæ–­',
    fullTest: 'å®Œæ•´è®¾å¤‡è¯„ä¼°',
    fullNoteUi: 'å®Œæ•´è¯„ä¼°ä¼šå¯åŠ¨å¹¶å‘è´Ÿè½½ï¼Œè®¾å¤‡åœ¨æ•°ç§’å†…å¯èƒ½æ˜Žæ˜¾å˜é‡ã€‚',
    mode: 'æ¨¡å¼',
    full: 'å®Œæ•´',
    quick: 'å¿«é€Ÿ',
    coverage: 'è¦†ç›–çŽ‡',
    operationsPerSec: 'æ¬¡æ“ä½œ/ç§’',
    testFps: 'æµ‹è¯• FPS',
    loopsPerSec: 'è½®æ¬¡/ç§’',
    readWrite: 'è¯»å–/å†™å…¥',
    estimatedHealth: 'ä¼°ç®—å¥åº·åº¦',
    averageTrend: 'å¹³å‡å€¼ä¸Žè¶‹åŠ¿',
    storedAverage: 'å·²ä¿å­˜å¹³å‡å€¼',
    localTests: 'æœ¬åœ°æµ‹è¯•',
    vsBaseline: 'ç›¸å¯¹åŸºçº¿',
    lastFull: 'ä¸Šæ¬¡å®Œæ•´è¯„ä¼°',
    comparativeNote: 'å¯¹äºŽå¯¹æ¯”æ•°æ®åº“è€Œè¨€ï¼Œæœ€æœ‰ä»·å€¼çš„æ ·æœ¬æ˜¯æœ€è¿‘ä¸€æ¬¡å®Œæ•´è¯„ä¼°ï¼Œå› ä¸ºå®ƒèƒ½æ¸…æ¥šè¯´æ˜Žå“ªäº›éƒ¨åˆ†å·²è¢«éªŒè¯ä»¥åŠè¦†ç›–çŽ‡å¦‚ä½•ã€‚',
    reportTitle: 'æµ‹è¯•æŠ¥å‘Š',
    reportDesc: 'å¯¼å‡ºè®¾å¤‡çŠ¶æ€ä»¥åŠæœ€è¿‘ä¸€æ¬¡æœ¬åœ°è¯„ä¼°ã€‚è¿™æ ·æ•°æ®åº“å°±èƒ½åŒºåˆ†æ€§èƒ½ã€å¯ç”¨ä¼ æ„Ÿå™¨å’Œç³»ç»Ÿé™åˆ¶ã€‚',
    generating: 'æ­£åœ¨ç”ŸæˆæŠ¥å‘Š...',
    exportFull: 'å¯¼å‡ºå®Œæ•´æŠ¥å‘Š',
    recommend: 'å»ºè®®å…ˆæ‰§è¡Œå®Œæ•´è¯„ä¼°ï¼Œå†å¯¼å‡ºæŠ¥å‘Šã€‚æŠ¥å‘Šä¸ä¼šè™šæž„ç¼ºå¤±æ•°æ®ã€‚',
    readyToSend: 'å¯å‘é€',
    latestFull: 'æœ€è¿‘ä¸€æ¬¡å®Œæ•´è¯„ä¼°',
    cpuPeak: 'CPU å³°å€¼æ¸©åº¦',
    gpuPeak: 'GPU å³°å€¼æ¸©åº¦',
    cpuPowerPeak: 'CPU å³°å€¼åŠŸè€—',
    gpuPowerPeak: 'GPU å³°å€¼åŠŸè€—',
    impact: 'FixTemp å½±å“',
    serviceCpu: 'æœåŠ¡ CPU',
    serviceRam: 'æœåŠ¡ RAM',
    serviceNote: 'ç”±æœåŠ¡æœ¬èº«æµ‹å¾—ï¼›ä¸åŒ…å« Chromium çª—å£ã€‚',
    batteryMeasured: 'å¦‚æžœç”µæ± æä¾›æ•°æ®ï¼Œåˆ™æ˜¾ç¤ºç”µé‡ã€å¾ªçŽ¯æ¬¡æ•°ä¸Žä¼°ç®—å¥åº·åº¦ã€‚',
    batteryUnavailable: 'ä¸é€‚ç”¨æˆ–ç³»ç»Ÿæœªæš´éœ²ã€‚',
    diskMeasured: 'å¯¹æœ¬åœ°å·è¿›è¡ŒçœŸå®žè¯»å†™ã€‚',
    diskUnavailable: 'æ²¡æœ‰å¯ç”¨äºŽåŸºå‡†æµ‹è¯•çš„å·ã€‚',
    cpuMeasured: 'å½“å­˜åœ¨ä¼ æ„Ÿå™¨æ—¶ï¼Œè¿›è¡ŒçŸ­è´Ÿè½½ä¸ŽæŒç»­è´Ÿè½½å¹¶è®°å½•çœŸå®žé¥æµ‹ã€‚',
    gpuMeasured: 'ä½¿ç”¨ WebGL 2 è¿›è¡Œæ¸²æŸ“ï¼Œåœ¨ç³»ç»Ÿå…è®¸æ—¶è®°å½•çœŸå®ž FPSã€æ¸©åº¦ä¸ŽåŠŸè€—ã€‚',
    memoryMeasured: 'ç”¨æˆ·å¯è§çš„æŒç»­å†…å­˜æ´»åŠ¨ã€‚',
    browserQuickName: 'device',
    testRequiredNote: 'å®Œæˆå®Œæ•´è¯„ä¼°åŽå³å¯è§£é”æŠ¥å‘Šå¹¶å‚ä¸ŽæŽ’åã€‚',
    rankSending: 'æ­£åœ¨æäº¤åˆ°å…¨çƒæŽ’åâ€¦',
    rankSent: 'å·²åŠ å…¥æŽ’åï¼',
    rankFailed: 'æ— æ³•æäº¤åˆ°æŽ’åã€‚',
    rankRetry: 'é‡æ–°æäº¤',
    rankPosition: 'æŽ’å',
    rankOf: 'å…± {total} å°è®¾å¤‡',
    rankPercentile: 'è¶…è¿‡äº†',
    rankOfDevices: 'çš„è®¾å¤‡',
    scoreLabel: 'æ‚¨çš„å¾—åˆ†',
    viewRanking: 'æŸ¥çœ‹å…¨çƒæŽ’å'
  }
} as const

type HealthText = typeof copy['es'] | typeof copy['en'] | typeof copy['zh-CN']

function migrateDiagnostic(value: Partial<Diagnostic> & { date?: number; score?: number }): Diagnostic {
  return {
    date: value.date || Date.now(),
    mode: value.mode === 'full' ? 'full' : 'quick',
    cpuScore: value.cpuScore || 0,
    gpuFps: value.gpuFps ?? null,
    memoryScore: value.memoryScore ?? null,
    score: value.score || 0,
    coverage: value.coverage || 35,
    storageReadMbps: value.storageReadMbps ?? null,
    storageWriteMbps: value.storageWriteMbps ?? null,
    batteryHealthPercent: value.batteryHealthPercent ?? null,
    cpuPeakTemp: value.cpuPeakTemp ?? null,
    gpuPeakTemp: value.gpuPeakTemp ?? null,
    cpuPeakPower: value.cpuPeakPower ?? null,
    gpuPeakPower: value.gpuPeakPower ?? null,
    notes: Array.isArray(value.notes) ? value.notes.filter(item => typeof item === 'string') : []
  }
}

async function fetchJson<T>(url: string, fallbackError: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options)
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || `${fallbackError} ${url}`)
  return payload as T
}

async function cpuBenchmark() {
  const source = 'onmessage=()=>{const start=performance.now();let ops=0,x=0;while(performance.now()-start<1600){for(let i=1;i<12000;i++)x+=Math.sqrt(i)*Math.sin(i);ops+=12000}postMessage({ops,elapsed:performance.now()-start,x})}'
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))
  try {
    return await new Promise<number>((resolve, reject) => {
      const worker = new Worker(url)
      const timeout = window.setTimeout(() => { worker.terminate(); reject(new Error('Timeout')) }, 5000)
      worker.onmessage = ({ data }) => { window.clearTimeout(timeout); worker.terminate(); resolve(Math.round(data.ops / data.elapsed * 1000)) }
      worker.onerror = () => { window.clearTimeout(timeout); worker.terminate(); reject(new Error('Worker error')) }
      worker.postMessage('start')
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function gpuBenchmark(durationMs = 1800, intensive = false): Promise<number | null> {
  const canvas = document.createElement('canvas')
  canvas.width = intensive ? 1280 : 640
  canvas.height = intensive ? 720 : 360
  // Adjuntar al DOM para garantizar que requestAnimationFrame dispare correctamente
  canvas.style.cssText = 'position:fixed;opacity:0;pointer-events:none;z-index:-9999;top:0;left:0;'
  document.body.appendChild(canvas)
  try {
    const gl = canvas.getContext('webgl2', { antialias: false, powerPreference: 'high-performance' })
      ?? canvas.getContext('webgl', { antialias: false, powerPreference: 'high-performance' }) as WebGL2RenderingContext | null
    if (!gl) return null

    const vertex = gl.createShader(gl.VERTEX_SHADER)!
    gl.shaderSource(vertex, '#version 300 es\nin vec2 p;void main(){gl_Position=vec4(p,0.,1.);}')
    gl.compileShader(vertex)

    const fragment = gl.createShader(gl.FRAGMENT_SHADER)!
    // Intensive: 224 iteraciones a 1280Ã—720 (mismo shader que GpuStressEngine â€” estresa la GPU real)
    // Quick: 90 iteraciones a 640Ã—360 (mediciÃ³n comparativa ligera)
    const iters = intensive ? 224 : 90
    const w = intensive ? 1280 : 640
    const h = intensive ? 720 : 360
    gl.shaderSource(fragment, `#version 300 es\nprecision highp float;out vec4 o;uniform float t;void main(){vec2 u=gl_FragCoord.xy/vec2(${w}.,${h}.);float v=0.;for(int i=0;i<${iters};i++){float f=float(i)+1.;v+=sin(u.x*f+t)*cos(u.y*f-t)/f;}o=vec4(vec3(v*.5+.5),1.);}`)
    gl.compileShader(fragment)

    const program = gl.createProgram()!
    gl.attachShader(program, vertex)
    gl.attachShader(program, fragment)
    gl.linkProgram(program)
    gl.useProgram(program)

    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const position = gl.getAttribLocation(program, 'p')
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)

    const time = gl.getUniformLocation(program, 't')
    const start = performance.now()
    let frames = 0

    return await new Promise<number | null>(resolve => {
      const draw = (now: number) => {
        gl.uniform1f(time, now / 1000)
        gl.drawArrays(gl.TRIANGLES, 0, 3)
        frames++
        if (now - start < durationMs) requestAnimationFrame(draw)
        else {
          gl.getExtension('WEBGL_lose_context')?.loseContext()
          resolve(Math.round(frames / ((now - start) / 1000)))
        }
      }
      requestAnimationFrame(draw)
    })
  } catch {
    return null
  } finally {
    document.body.removeChild(canvas)
  }
}

async function memoryBenchmark() {
  // Buffer 128 MB â€” supera la cachÃ© L3 de cualquier CPU actual.
  // Acceso secuencial completo (i++) en lugar de stride-32, lo que obliga a acceder a RAM fÃ­sica.
  // MÃ©trica de salida: MB/s de ancho de banda de lectura+escritura real.
  const source = 'onmessage=e=>{const dur=e.data;const size=32*1024*1024;const block=new Uint32Array(size);const bytesPerPass=size*4;const start=performance.now();let passes=0,checksum=0;while(performance.now()-start<dur){for(let i=0;i<size;i++){block[i]=(block[i]^i)+passes}for(let i=0;i<size;i++){checksum^=block[i]}passes++}const elapsed=performance.now()-start;const mbps=Math.round(passes*bytesPerPass*2/1024/1024/(elapsed/1000));postMessage({mbps,elapsed,checksum})}'
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))
  try {
    return await new Promise<number>((resolve, reject) => {
      const worker = new Worker(url)
      const timeout = window.setTimeout(() => { worker.terminate(); reject(new Error('Timeout')) }, 30000)
      worker.onmessage = ({ data }) => {
        window.clearTimeout(timeout)
        worker.terminate()
        resolve(data.mbps as number)
      }
      worker.onerror = () => {
        window.clearTimeout(timeout)
        worker.terminate()
        reject(new Error('Worker error'))
      }
      worker.postMessage(12000)
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

function weightedAverage(entries: Array<{ value: number | null; weight: number }>) {
  const available = entries.filter(item => item.value !== null)
  const totalWeight = available.reduce((sum, item) => sum + item.weight, 0)
  const maxWeight = entries.reduce((sum, item) => sum + item.weight, 0)
  if (!totalWeight) return { score: 0, coverage: 0 }
  const total = available.reduce((sum, item) => sum + (item.value || 0) * item.weight, 0)
  return { score: Math.round(total / totalWeight), coverage: Math.round(totalWeight / maxWeight * 100) }
}

const scoreFromCpu = (cpuScore: number) => clamp(Math.round(Math.log10(Math.max(1, cpuScore)) * 15), 0, 100)
const scoreFromGpu = (gpuFps: number) => clamp(Math.round(gpuFps / 1.3), 0, 100)
// memoryScore ahora es MB/s de ancho de banda real: DDR3â‰ˆ8000, DDR4-2666â‰ˆ18000, DDR5â‰ˆ35000
const scoreFromMemory = (memoryScore: number) => clamp(Math.round(memoryScore / 400), 0, 100)
const scoreFromStorage = (result: StorageBenchmarkResult | null) => result ? clamp(Math.round(Math.log10(Math.max(1, (result.readMbps + result.writeMbps) / 2)) * 35), 0, 100) : null
const scoreFromBattery = (healthPercent: number | null) => healthPercent === null ? null : clamp(Math.round(healthPercent), 0, 100)
const scoreFromThermal = (peakTemp: number | null, peakPower: number | null) => peakTemp === null && peakPower === null ? null : clamp(Math.round(100 - Math.max(0, (peakTemp || 0) - 72) * 1.8 - Math.max(0, (peakPower || 0) - 220) * 0.2), 0, 100)

async function runStressCapture(baseline: Metrics, notes: string[], text: HealthText) {
  const temperatureLimit = clamp(Math.round((baseline.cpu.temperature ?? 60) + 18), 78, 92)
  try {
    const started = await fetchJson<StressSession>('/api/stress/start', text.fetchError, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'cpu', intensity: 76, duration: 16, temperatureLimit })
    })
    const deadline = Date.now() + 50000
    while (Date.now() < deadline) {
      const live = await fetchJson<Metrics>('/api/metrics/live', text.fetchError, { signal: AbortSignal.timeout(5000) })
      if (live.stress && live.stress.id === started.id && !live.stress.active) return live.stress
      await sleep(1000)
    }
    notes.push(text.cpuTimeout)
    await fetch('/api/stress/stop', { method: 'POST' }).catch(() => {})
    return null
  } catch (error) {
    notes.push(error instanceof Error ? error.message : text.cpuCouldNotRun)
    return null
  }
}

function saveDiagnostics(history: Diagnostic[], setHistory: (value: Diagnostic[]) => void, entry: Diagnostic) {
  const next = [...history, entry].slice(-20)
  setHistory(next)
  localStorage.setItem('fixtemp-device-history', JSON.stringify(next))
}

export function DeviceHealth({ data }: { data: Metrics | null }) {
  const { language } = useI18n()
  const text = copy[language]
  const [battery, setBattery] = useState<BatteryInfo | null>(null)
  const [profile, setProfile] = useState<DeviceProfile>({
    cores: navigator.hardwareConcurrency || 0,
    memoryGb: getNavigator().deviceMemory || null,
    platform: (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform || navigator.platform || 'Device',
    screen: `${screen.width} x ${screen.height} @${devicePixelRatio.toFixed(1)}x`,
    gpu: text.batteryProtected,
    storageUsed: 0,
    storageTotal: 0
  })
  const [runningQuick, setRunningQuick] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState<string>(text.ready)
  const [exportStatus, setExportStatus] = useState<string>(text.notExported)
  const [evaluation, setEvaluation] = useState<EvaluationState | null>(null)
  const [testCompleted, setTestCompleted] = useState(() => Boolean(localStorage.getItem('pg_full_test_done')))
  const [submissionStatus, setSubmissionStatus] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')
  const [rankingResult, setRankingResult] = useState<{ rank: number; total: number; percentile: number } | null>(null)
  const [lastDiagnostic, setLastDiagnostic] = useState<Diagnostic | null>(null)
  const [history, setHistory] = useState<Diagnostic[]>(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem('fixtemp-device-history') || '[]')
      return Array.isArray(parsed) ? parsed.map(migrateDiagnostic) : []
    } catch {
      return []
    }
  })

  useEffect(() => { setProgress(text.ready); setExportStatus(current => current === text.notExported ? current : current) }, [text.ready, text.notExported])

  const latest = history.at(-1) || null
  const lastFull = [...history].reverse().find(item => item.mode === 'full') || null
  const averageScore = history.length ? Math.round(average(history.map(item => item.score))) : null
  const nativeBattery = data?.battery?.hasBattery ? { level: data.battery.percent ?? 0, charging: Boolean(data.battery.isCharging || data.battery.acConnected) } : null
  const displayedBattery = nativeBattery || battery
  const fullTestBusy = Boolean(evaluation?.active) || Boolean(data?.stress?.active)

  useEffect(() => {
    const nav = getNavigator()
    let active = true
    let batteryInfo: BrowserBattery | null = null
    let batteryUpdate: (() => void) | null = null

    nav.getBattery?.().then(info => {
      if (!active) return
      batteryInfo = info
      batteryUpdate = () => setBattery({ level: Math.round(info.level * 100), charging: info.charging })
      batteryUpdate()
      info.addEventListener('levelchange', batteryUpdate)
      info.addEventListener('chargingchange', batteryUpdate)
    }).catch(() => {})

    navigator.storage?.estimate().then(storage => {
      if (active) setProfile(current => ({ ...current, storageUsed: storage.usage || 0, storageTotal: storage.quota || 0 }))
    })

    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl')
    const ext = gl?.getExtension('WEBGL_debug_renderer_info')
    const gpu = gl && ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : text.batteryProtected
    setProfile(current => ({ ...current, gpu }))

    return () => {
      active = false
      if (batteryInfo && batteryUpdate) {
        batteryInfo.removeEventListener('levelchange', batteryUpdate)
        batteryInfo.removeEventListener('chargingchange', batteryUpdate)
      }
      gl?.getExtension('WEBGL_lose_context')?.loseContext()
    }
  }, [text.batteryProtected])

  const retention = useMemo(() => {
    if (history.length < 3 || !latest) return null
    const baseline = average(history.slice(0, 3).map(item => item.score))
    return Math.min(120, Math.round(latest.score / baseline * 100))
  }, [history, latest])

  const batteryHealthPercent = data?.battery?.designedCapacity && data?.battery?.maxCapacity
    ? clamp(Math.round((data.battery.maxCapacity / data.battery.designedCapacity) * 100), 0, 120)
    : null

  const verificationMatrix: VerificationItem[] = [
    { title: 'CPU', detail: text.cpuMeasured, state: data?.capabilities?.cpu.temperature ? 'measured' : 'limited' },
    { title: 'GPU', detail: text.gpuMeasured, state: data?.capabilities?.gpu.temperature ? 'measured' : 'limited' },
    { title: 'RAM', detail: text.memoryMeasured, state: 'measured' },
    { title: 'Disk', detail: data?.storage.length ? text.diskMeasured : text.diskUnavailable, state: data?.storage.length ? 'measured' : 'unavailable' },
    { title: 'Battery', detail: data?.battery?.hasBattery ? text.batteryMeasured : text.batteryUnavailable, state: data?.battery?.hasBattery ? 'measured' : 'limited' }
  ]

  const submitToRanking = async (diagnostic: Diagnostic) => {
    if (!data) return
    setSubmissionStatus('sending')
    try {
      const res = await fetch('/api/ranking/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          score: diagnostic.score,
          coverage: diagnostic.coverage,
          cpuModel: data.cpu.model || null,
          gpuModel: data.gpu.model || null,
          ramGb: data.memory.total || null,
          diskReadMbps: diagnostic.storageReadMbps,
          diskWriteMbps: diagnostic.storageWriteMbps,
          cpuPeakTemp: diagnostic.cpuPeakTemp,
          gpuPeakTemp: diagnostic.gpuPeakTemp,
          cpuPeakPower: diagnostic.cpuPeakPower,
          gpuPeakPower: diagnostic.gpuPeakPower,
          osName: data.hardware.os || null,
          notes: diagnostic.notes,
          testedAt: diagnostic.date
        })
      })
      if (res.ok) {
        const result = await res.json()
        setRankingResult({ rank: result.rank, total: result.total, percentile: result.percentile })
        setSubmissionStatus('sent')
      } else {
        setSubmissionStatus('failed')
      }
    } catch {
      setSubmissionStatus('failed')
    }
  }

  const runQuick = async () => {
    setRunningQuick(true)
    try {
      setProgress(text.evalCpu)
      const cpuScore = await cpuBenchmark()
      setProgress(text.evalMemory)
      const memoryScore = await memoryBenchmark().catch((): null => null)
      setProgress(text.evalGpu)
      const gpuFps = await gpuBenchmark().catch((): null => null)
      const composed = weightedAverage([
        { value: scoreFromCpu(cpuScore), weight: 0.45 },
        { value: gpuFps !== null ? scoreFromGpu(gpuFps) : null, weight: 0.3 },
        { value: memoryScore !== null ? scoreFromMemory(memoryScore) : null, weight: 0.25 }
      ])
      saveDiagnostics(history, setHistory, migrateDiagnostic({ date: Date.now(), mode: 'quick', cpuScore, gpuFps, memoryScore, score: composed.score, coverage: composed.coverage, notes: [text.quickNote] }))
      setProgress(text.quickDone)
    } catch {
      setProgress(text.quickFailed)
    } finally {
      setRunningQuick(false)
    }
  }

  const runFull = async () => {
    if (!data) return
    const notes: string[] = []
    setEvaluation({ active: true, mode: 'full', step: text.preparingFull, startedAt: Date.now(), durationMs: 22000, diskActive: true })

    try {
      const baseline = await fetchJson<Metrics>('/api/metrics/live', text.fetchError, { signal: AbortSignal.timeout(6000) })
      const liveSamples: Metrics[] = []
      let sampling = true
      const sampleLoop = (async () => {
        while (sampling) {
          try { liveSamples.push(await fetchJson<Metrics>('/api/metrics/live', text.fetchError, { signal: AbortSignal.timeout(5000) })) } catch {}
          await sleep(1000)
        }
      })()

      setProgress(text.stressingAll)
      setEvaluation(current => current ? { ...current, step: text.concurrentLoad } : current)

      const cpuStressPromise = baseline.capabilities?.cpu.temperature ? runStressCapture(baseline, notes, text) : Promise.resolve(null)
      const gpuPromise = gpuBenchmark(16000, true).catch((): null => null)
      const memoryPromise = memoryBenchmark().catch((): null => null)
      const diskPromise = fetchJson<StorageBenchmarkResult>('/api/storage/benchmark', text.fetchError, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mount: baseline.storage[0]?.mount ?? '' })
      }).catch(error => { notes.push(error instanceof Error ? error.message : text.fullNoDisk); return null })

      if (!baseline.capabilities?.cpu.temperature) notes.push(text.fullNoCpuTemp)

      const [cpuStress, gpuFps, memoryScore, diskResult] = await Promise.all([cpuStressPromise, gpuPromise, memoryPromise, diskPromise])

      sampling = false
      await sampleLoop
      setEvaluation(current => current ? { ...current, diskActive: false, step: text.consolidating } : current)

      const cpuScore = cpuStress?.workload?.operations && cpuStress.stoppedAt
        ? Math.round(cpuStress.workload.operations / Math.max(1, (cpuStress.stoppedAt - cpuStress.startedAt) / 1000))
        : await cpuBenchmark()

      const cpuPeakTemp = cpuStress?.summary?.peakTemperature ?? null
      const cpuPeakPower = cpuStress?.summary?.peakPower ?? null
      const gpuTemps = liveSamples.map(sample => sample.gpu.temperature).filter((value): value is number => value !== null)
      const gpuPowers = liveSamples.map(sample => sample.gpu.power).filter((value): value is number => value !== null)
      const gpuPeakTemp = gpuTemps.length ? Math.max(...gpuTemps) : null
      const gpuPeakPower = gpuPowers.length ? Math.max(...gpuPowers) : null

      const composed = weightedAverage([
        { value: scoreFromCpu(cpuScore), weight: 0.24 },
        { value: gpuFps !== null ? scoreFromGpu(gpuFps) : null, weight: 0.18 },
        { value: memoryScore !== null ? scoreFromMemory(memoryScore) : null, weight: 0.14 },
        { value: scoreFromStorage(diskResult), weight: 0.18 },
        { value: scoreFromThermal(cpuPeakTemp, cpuPeakPower), weight: 0.18 },
        { value: scoreFromThermal(gpuPeakTemp, gpuPeakPower), weight: 0.04 },
        { value: scoreFromBattery(batteryHealthPercent), weight: 0.04 }
      ])

      const newDiag = migrateDiagnostic({
        date: Date.now(),
        mode: 'full',
        cpuScore,
        gpuFps,
        memoryScore,
        score: composed.score,
        coverage: composed.coverage,
        storageReadMbps: diskResult?.readMbps ?? null,
        storageWriteMbps: diskResult?.writeMbps ?? null,
        batteryHealthPercent,
        cpuPeakTemp,
        gpuPeakTemp,
        cpuPeakPower,
        gpuPeakPower,
        notes: notes.length ? notes : [text.fullNote]
      })
      saveDiagnostics(history, setHistory, newDiag)
      setTestCompleted(true)
      localStorage.setItem('pg_full_test_done', '1')
      setLastDiagnostic(newDiag)
      void submitToRanking(newDiag)
      setProgress(text.fullDone)
    } catch {
      setProgress(text.fullFailed)
    } finally {
      setEvaluation(null)
    }
  }

  const exportReport = async () => {
    setExporting(true)
    try {
      // Download Excel directly from server endpoint
      const response = await fetch('/api/export/excel', { signal: AbortSignal.timeout(60000) })
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: text.reportFailed }))
        throw new Error(err.error || text.reportFailed)
      }
      const blob = await response.blob()
      const disposition = response.headers.get('Content-Disposition') || ''
      const match = disposition.match(/filename="([^"]+)"/)
      const filename = match ? match[1] : `FixTemp-${new Date().toISOString().slice(0, 10)}.xlsx`
      const href = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = href
      anchor.download = filename
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(href)
      setExportStatus(text.reportReady.replace('{filename}', filename))
    } catch (error) {
      setExportStatus(error instanceof Error ? error.message : text.reportFailed)
    } finally {
      setExporting(false)
    }
  }

  const storagePercent = profile.storageTotal ? Math.round(profile.storageUsed / profile.storageTotal * 100) : null
  const evaluationProgress = evaluation ? clamp(Math.round((Date.now() - evaluation.startedAt) / evaluation.durationMs * 100), 3, 97) : 0

  return <div className="health-page">
    <section className="health-hero">
      <div>
        <p className="eyebrow">{text.heroEyebrow}</p>
        <h2>{text.heroTitle}</h2>
        <p>{text.heroDesc}</p>
      </div>
      <div className="health-score"><span>{latest?.score ?? 'â€”'}</span><small>{text.currentIndex}</small></div>
    </section>

    {evaluation?.active ? <section className="health-evaluation-live">
      <div className="health-evaluation-head">
        <div>
          <p className="eyebrow">{text.runningEyebrow}</p>
          <h3>{text.runningTitle}</h3>
          <p>{evaluation.step}</p>
        </div>
        <div className="health-evaluation-badge"><LoaderCircle size={16} className="spin"/> {text.machineSlow}</div>
      </div>
      <div className="health-evaluation-track"><i style={{ width: `${evaluationProgress}%` }}/></div>
      <div className="health-evaluation-warn">
        <ShieldAlert size={18}/>
        <span><b>{text.important}</b>{text.importantDesc}</span>
      </div>
      <div className="health-live-grid">
        <div><span>CPU</span><b>{data?.cpu.load ?? 0}%</b><small>{data?.cpu.temperature !== null && data?.cpu.temperature !== undefined ? `${data.cpu.temperature}Â°C` : text.noThermalSensor}</small></div>
        <div><span>GPU</span><b>{data?.gpu.load ?? 0}%</b><small>{data?.gpu.temperature !== null && data?.gpu.temperature !== undefined ? `${data.gpu.temperature}Â°C` : text.noThermalSensor}</small></div>
        <div><span>RAM</span><b>{data?.memory.load ?? 0}%</b><small>{data ? `${data.memory.used}/${data.memory.total} GB` : text.loading}</small></div>
        <div><span>DISK</span><b>{evaluation.diskActive ? text.diskActive : text.diskOk}</b><small>{evaluation.diskActive ? text.diskBusy : text.diskDone}</small></div>
      </div>
    </section> : null}

    <div className="health-grid">
      <section className="health-card">
        <div className="hardware-title"><Gauge size={20}/><h3>{text.verify}</h3></div>
        <div className="verification-list">
          {verificationMatrix.map(item => <div className={`verification-item ${item.state}`} key={item.title}>
            <div><strong>{item.title}</strong><small>{item.detail}</small></div>
            <span>{item.state === 'measured' ? text.measured : item.state === 'limited' ? text.limited : text.unavailable}</span>
          </div>)}
        </div>
      </section>

      <section className="health-card profile-card">
        <div className="hardware-title"><MonitorSmartphone size={20}/><h3>{text.profile}</h3></div>
        <div className="profile-list">
          <div><Cpu/><span><b>{profile.cores || 'â€”'}</b> {text.logicalThreads}</span></div>
          <div><MemoryStick/><span><b>{profile.memoryGb ? `${profile.memoryGb} GB` : text.restricted}</b> {text.visibleMemory}</span></div>
          <div><Smartphone/><span><b>{profile.platform}</b> {profile.screen}</span></div>
          <div><Zap/><span><b>{profile.gpu}</b> {text.renderer}</span></div>
        </div>
      </section>

      <section className="health-card">
        <div className="hardware-title"><BatteryCharging size={20}/><h3>{text.batteryStorage}</h3></div>
        <div className="health-bars">
          <div>
            <span>{text.batteryCurrent} <b>{displayedBattery ? `${displayedBattery.level}%` : text.batteryMissing}</b></span>
            <i><em style={{ width: `${displayedBattery?.level || 0}%` }}/></i>
            <small>{displayedBattery ? displayedBattery.charging ? text.pluggedIn : text.discharging : text.noReading}{data?.battery?.cycleCount !== null && data?.battery?.cycleCount !== undefined ? ` Â· ${data.battery.cycleCount} ${text.cycles}` : ''}</small>
          </div>
          <div>
            <span>{text.storageUsed} <b>{storagePercent !== null ? `${storagePercent}%` : text.restricted}</b></span>
            <i><em style={{ width: `${storagePercent || 0}%` }}/></i>
            <small>{profile.storageTotal ? `${formatGb(profile.storageUsed)} de ${formatGb(profile.storageTotal)}` : text.browserNoCapacity}</small>
          </div>
        </div>
      </section>

      <section className="health-card diagnostic-card">
        <div className="hardware-title"><Gauge size={20}/><h3>{text.testsAvailable}</h3></div>
        <p>{text.testsDesc}</p>
        <button onClick={runQuick} disabled={runningQuick || fullTestBusy}><Play size={16} fill="currentColor"/> {runningQuick ? progress : text.quickTest}</button>
        <button className="intensive-button" onClick={runFull} disabled={runningQuick || fullTestBusy || !data}><Thermometer size={16}/> {evaluation?.active ? progress : text.fullTest}</button>
        <small className="intensive-note">{text.fullNoteUi}</small>
        {latest && <div className="result-grid extended-grid">
          <div><span>{text.mode}</span><b>{latest.mode === 'full' ? text.full : text.quick}</b><small>{latest.coverage}% {text.coverage}</small></div>
          <div><span>CPU</span><b>{latest.cpuScore.toLocaleString()}</b><small>{text.operationsPerSec}</small></div>
          <div><span>GPU</span><b>{latest.gpuFps !== null ? latest.gpuFps : 'â€”'}</b><small>{text.testFps}</small></div>
          <div><span>RAM</span><b>{latest.memoryScore !== null ? latest.memoryScore : 'â€”'}</b><small>{text.loopsPerSec}</small></div>
          <div><span>DISK</span><b>{latest.storageReadMbps !== null ? `${latest.storageReadMbps}/${latest.storageWriteMbps} MB/s` : 'â€”'}</b><small>{text.readWrite}</small></div>
          <div><span>BATTERY</span><b>{latest.batteryHealthPercent !== null ? `${latest.batteryHealthPercent}%` : 'â€”'}</b><small>{text.estimatedHealth}</small></div>
        </div>}
      </section>

      <section className="health-card">
        <div className="hardware-title"><CheckCircle2 size={20}/><h3>{text.averageTrend}</h3></div>
        <div className="impact-values">
          <div><b>{averageScore ?? 'â€”'}</b><span>{text.storedAverage}</span></div>
          <div><b>{history.length}</b><span>{text.localTests}</span></div>
          <div><b>{retention ?? 'â€”'}{retention !== null ? '%' : ''}</b><span>{text.vsBaseline}</span></div>
          <div><b>{lastFull?.coverage ?? 'â€”'}{lastFull ? '%' : ''}</b><span>{text.lastFull}</span></div>
        </div>
        <p className="sensor-note">{text.comparativeNote}</p>
      </section>

      <section className="health-card report-export-card">
        <div className="hardware-title"><FileText size={20}/><h3>{text.reportTitle}</h3></div>
        <p>{text.reportDesc}</p>
        <button className="export-report-button" onClick={exportReport} disabled={exporting || !data || !testCompleted}>
          <Download size={16}/>
          {exporting ? text.generating : text.exportFull}
        </button>
        {!testCompleted
          ? <small className="intensive-note" style={{ color: 'var(--accent2)', marginTop: '0.5rem', display: 'block' }}>{text.testRequiredNote}</small>
          : <small className="intensive-note">{text.recommend}</small>
        }

        {testCompleted && lastFull && (
          <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(185,246,92,0.06)', border: '1px solid rgba(185,246,92,0.18)', borderRadius: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <span style={{ fontSize: '2.8rem', fontWeight: 900, letterSpacing: '-0.04em', color: 'var(--accent)', lineHeight: 1 }}>{lastFull.score}</span>
              <span style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{text.scoreLabel}</span>
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '0.6rem' }}>{lastFull.coverage}% {text.coverage}</div>
            {rankingResult && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', color: 'var(--text)', marginBottom: '0.4rem' }}>
                <Trophy size={14} style={{ color: 'var(--accent)' }}/>
                <span>
                  {text.rankPosition} <b style={{ color: 'var(--accent)' }}>#{rankingResult.rank}</b> {text.rankOf.replace('{total}', String(rankingResult.total))}
                  {' Â· '}{text.rankPercentile} <b style={{ color: 'var(--accent2)' }}>{rankingResult.percentile}%</b> {text.rankOfDevices}
                </span>
              </div>
            )}
            {submissionStatus === 'sending' && <p style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{text.rankSending}</p>}
            {submissionStatus === 'failed' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--danger)' }}>{text.rankFailed}</p>
                {lastDiagnostic && (
                  <button
                    onClick={() => void submitToRanking(lastDiagnostic)}
                    style={{ fontSize: '0.72rem', padding: '0.2rem 0.6rem', background: 'rgba(185,246,92,0.12)', border: '1px solid rgba(185,246,92,0.3)', color: 'var(--accent)', borderRadius: '5px', cursor: 'pointer' }}>
                    {text.rankRetry}
                  </button>
                )}
              </div>
            )}
            {submissionStatus === 'sent' && (
              <a href="http://localhost:3500" target="_blank" rel="noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', color: 'var(--accent2)', textDecoration: 'none', marginTop: '0.25rem' }}>
                <Globe size={12}/> {text.viewRanking}
              </a>
            )}
          </div>
        )}

        <div className="health-notice export-notice" style={{ marginTop: '0.75rem' }}>
          <ShieldAlert size={19}/>
          <span><b>{text.readyToSend}</b>{exportStatus}</span>
        </div>
      </section>

      {lastFull && <section className="health-card">
        <div className="hardware-title"><Thermometer size={20}/><h3>{text.latestFull}</h3></div>
        <div className="impact-values">
          <div><b>{lastFull.cpuPeakTemp !== null ? `${lastFull.cpuPeakTemp}Â°C` : 'â€”'}</b><span>{text.cpuPeak}</span></div>
          <div><b>{lastFull.gpuPeakTemp !== null ? `${lastFull.gpuPeakTemp}Â°C` : 'â€”'}</b><span>{text.gpuPeak}</span></div>
          <div><b>{lastFull.cpuPeakPower !== null ? `${lastFull.cpuPeakPower}W` : 'â€”'}</b><span>{text.cpuPowerPeak}</span></div>
          <div><b>{lastFull.gpuPeakPower !== null ? `${lastFull.gpuPeakPower}W` : 'â€”'}</b><span>{text.gpuPowerPeak}</span></div>
        </div>
      </section>}

      {data?.agent && <section className="health-card">
        <div className="hardware-title"><Zap size={20}/><h3>{text.impact}</h3></div>
        <div className="impact-values">
          <div><b>{data.agent.cpu.toFixed(1)}%</b><span>{text.serviceCpu}</span></div>
          <div><b>{data.agent.memoryMb.toFixed(0)} MB</b><span>{text.serviceRam}</span></div>
        </div>
        <p className="sensor-note">{text.serviceNote}</p>
      </section>}
    </div>
  </div>
}
