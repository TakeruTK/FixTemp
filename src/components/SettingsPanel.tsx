import { useEffect, useState } from 'react'
import { ArrowDownToLine, Check, Globe2, Languages, MonitorCog, RefreshCw, ShieldCheck } from 'lucide-react'
import { useI18n } from '../i18n'

const copy = {
  es: {
    eyebrow: 'AJUSTES DEL PROGRAMA',
    title: 'Preferencias de FixTemp',
    description: 'Desde aquÃ­ puedes controlar el idioma de toda la interfaz. El cambio se aplica al instante y queda guardado para futuras aperturas del programa.',
    current: 'Idioma actual',
    section: 'IDIOMA DE LA INTERFAZ',
    helper: 'Selecciona el idioma principal para paneles, pruebas, inventario, overlay y textos de apoyo.',
    immediate: 'AplicaciÃ³n inmediata',
    immediateDetail: 'No necesitas reiniciar la aplicaciÃ³n.',
    coverage: 'Cobertura de traducciÃ³n',
    coverageDetail: 'Se actualiza toda la interfaz principal del programa.',
    persistence: 'Guardado local',
    persistenceDetail: 'La preferencia queda guardada en este equipo.',
    selected: 'Seleccionado',
    cardTitle: 'QuÃ© cambia con este ajuste',
    bullets: [
      'Panel principal y barra lateral',
      'Pruebas de estrÃ©s y salud del dispositivo',
      'Inventario de hardware y overlay',
      'Mensajes de ayuda, estados y etiquetas'
    ],
    updateSection: 'ACTUALIZACIONES',
    updateHelper: 'Comprueba si hay una nueva versiÃ³n disponible y descÃ¡rgala directamente desde aquÃ­.',
    checkBtn: 'Buscar actualizaciÃ³n',
    checking: 'Verificando...',
    upToDate: 'Ya tienes la versiÃ³n mÃ¡s reciente.',
    updateAvailable: 'Nueva versiÃ³n disponible:',
    currentVer: 'Tu versiÃ³n',
    downloadBtn: 'Descargar actualizaciÃ³n',
    downloading: 'Descargando...',
    installBtn: 'Instalar y reiniciar',
    installing: 'Lanzando instalador...',
    updateError: 'Error al verificar',
    downloadError: 'Error al descargar',
    noUrl: 'El servidor no proporcionÃ³ URL de descarga.',
    changelog: 'Novedades'
  },
  en: {
    eyebrow: 'APPLICATION SETTINGS',
    title: 'FixTemp preferences',
    description: 'Here you can control the language of the entire interface. The change is applied instantly and stays saved for future launches.',
    current: 'Current language',
    section: 'INTERFACE LANGUAGE',
    helper: 'Choose the main language for dashboards, tests, inventory, overlay, and supporting text.',
    immediate: 'Instant apply',
    immediateDetail: 'You do not need to restart the app.',
    coverage: 'Translation coverage',
    coverageDetail: 'The whole main interface is updated.',
    persistence: 'Local persistence',
    persistenceDetail: 'The preference is saved on this computer.',
    selected: 'Selected',
    cardTitle: 'What changes with this setting',
    bullets: [
      'Main dashboard and sidebar',
      'Stress tests and device health',
      'Hardware inventory and overlay',
      'Help text, states, and labels'
    ],
    updateSection: 'UPDATES',
    updateHelper: 'Check if a new version is available and download it directly from here.',
    checkBtn: 'Check for updates',
    checking: 'Checking...',
    upToDate: 'You already have the latest version.',
    updateAvailable: 'New version available:',
    currentVer: 'Your version',
    downloadBtn: 'Download update',
    downloading: 'Downloading...',
    installBtn: 'Install and restart',
    installing: 'Launching installer...',
    updateError: 'Error checking',
    downloadError: 'Download error',
    noUrl: 'The server did not provide a download URL.',
    changelog: 'What\'s new'
  },
  'zh-CN': {
    eyebrow: 'ç¨‹åºè®¾ç½®',
    title: 'FixTemp åå¥½è®¾ç½®',
    description: 'ä½ å¯ä»¥åœ¨è¿™é‡ŒæŽ§åˆ¶æ•´ä¸ªç•Œé¢çš„è¯­è¨€ã€‚åˆ‡æ¢ä¼šç«‹å³ç”Ÿæ•ˆï¼Œå¹¶ä¼šä¿å­˜åˆ°ä¸‹æ¬¡æ‰“å¼€ç¨‹åºã€‚',
    current: 'å½“å‰è¯­è¨€',
    section: 'ç•Œé¢è¯­è¨€',
    helper: 'é€‰æ‹©ä»ªè¡¨æ¿ã€æµ‹è¯•ã€ç¡¬ä»¶ä¿¡æ¯ã€æ‚¬æµ®å±‚å’Œè¾…åŠ©æ–‡æœ¬ä½¿ç”¨çš„ä¸»è¦è¯­è¨€ã€‚',
    immediate: 'å³æ—¶ç”Ÿæ•ˆ',
    immediateDetail: 'æ— éœ€é‡æ–°å¯åŠ¨ç¨‹åºã€‚',
    coverage: 'ç¿»è¯‘è¦†ç›–èŒƒå›´',
    coverageDetail: 'ç¨‹åºä¸»è¦ç•Œé¢éƒ½ä¼šæ›´æ–°ã€‚',
    persistence: 'æœ¬åœ°ä¿å­˜',
    persistenceDetail: 'è¯¥åå¥½ä¼šä¿å­˜åœ¨è¿™å°ç”µè„‘ä¸Šã€‚',
    selected: 'å·²é€‰æ‹©',
    cardTitle: 'æ­¤è®¾ç½®ä¼šå½±å“çš„å†…å®¹',
    bullets: [
      'ä¸»é¢æ¿ä¸Žä¾§è¾¹æ ',
      'åŽ‹åŠ›æµ‹è¯•ä¸Žè®¾å¤‡å¥åº·',
      'ç¡¬ä»¶æ¸…å•ä¸Žæ‚¬æµ®å±‚',
      'å¸®åŠ©æ–‡æœ¬ã€çŠ¶æ€ä¸Žæ ‡ç­¾'
    ],
    updateSection: 'æ›´æ–°',
    updateHelper: 'æ£€æŸ¥æ˜¯å¦æœ‰æ–°ç‰ˆæœ¬ï¼Œå¹¶ç›´æŽ¥åœ¨æ­¤ä¸‹è½½ã€‚',
    checkBtn: 'æ£€æŸ¥æ›´æ–°',
    checking: 'æ£€æŸ¥ä¸­...',
    upToDate: 'ä½ å·²ç»æ˜¯æœ€æ–°ç‰ˆæœ¬ã€‚',
    updateAvailable: 'æœ‰æ–°ç‰ˆæœ¬å¯ç”¨ï¼š',
    currentVer: 'å½“å‰ç‰ˆæœ¬',
    downloadBtn: 'ä¸‹è½½æ›´æ–°',
    downloading: 'ä¸‹è½½ä¸­...',
    installBtn: 'å®‰è£…å¹¶é‡å¯',
    installing: 'æ­£åœ¨å¯åŠ¨å®‰è£…ç¨‹åº...',
    updateError: 'æ£€æŸ¥å‡ºé”™',
    downloadError: 'ä¸‹è½½å‡ºé”™',
    noUrl: 'æœåŠ¡å™¨æœªæä¾›ä¸‹è½½é“¾æŽ¥ã€‚',
    changelog: 'æ›´æ–°å†…å®¹'
  }
} as const

interface UpdateInfo {
  currentVersion: string
  latestVersion: string
  hasUpdate: boolean
  downloadUrl: string | null
  changelog: string
}

export function UpdatePanel() {
  const { language } = useI18n()
  const text = copy[language]
  const [checking, setChecking] = useState(false)
  const [info, setInfo] = useState<UpdateInfo | null>(null)
  const [checkError, setCheckError] = useState<string | null>(null)
  const [downloadState, setDownloadState] = useState<'idle' | 'downloading' | 'ready' | 'error'>('idle')
  const [dlPercent, setDlPercent] = useState(0)
  const [dlError, setDlError] = useState<string | null>(null)
  const [installing, setInstalling] = useState(false)

  const checkUpdate = async () => {
    setChecking(true)
    setInfo(null)
    setCheckError(null)
    setDownloadState('idle')
    try {
      const res = await fetch('/api/update/check', { signal: AbortSignal.timeout(10000) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || data.error || `HTTP ${res.status}`)
      setInfo(data)
    } catch (err) {
      setCheckError(err instanceof Error ? err.message : String(err))
    } finally {
      setChecking(false)
    }
  }

  const startDownload = async () => {
    if (!info?.downloadUrl) return
    setDownloadState('downloading')
    setDlPercent(0)
    setDlError(null)
    try {
      const res = await fetch('/api/update/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ downloadUrl: info.downloadUrl })
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Error') }

      const poll = setInterval(async () => {
        try {
          const pr = await fetch('/api/update/progress')
          const pd = await pr.json()
          if (pd.error) { clearInterval(poll); setDownloadState('error'); setDlError(pd.error); return }
          if (pd.percent >= 0) setDlPercent(pd.percent)
          if (!pd.active && pd.filePath) { clearInterval(poll); setDownloadState('ready'); setDlPercent(100) }
          else if (!pd.active && !pd.filePath) { clearInterval(poll); setDownloadState('error'); setDlError('Descarga fallida') }
        } catch { /* ignore */ }
      }, 800)
    } catch (err) {
      setDownloadState('error')
      setDlError(err instanceof Error ? err.message : String(err))
    }
  }

  const install = async () => {
    setInstalling(true)
    try {
      await fetch('/api/update/install', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    } catch { /* server exits */ }
  }

  return (
    <section className="overlay-card">
      <p className="section-label">{text.updateSection}</p>
      <p className="settings-helper">{text.updateHelper}</p>

      <button
        className="export-report-button"
        onClick={checkUpdate}
        disabled={checking}
        style={{ marginBottom: '0.75rem' }}
      >
        <RefreshCw size={15} className={checking ? 'spin' : undefined}/>
        {checking ? text.checking : text.checkBtn}
      </button>

      {checkError && (
        <p style={{ fontSize: '0.8rem', color: 'var(--danger)', marginBottom: '0.5rem' }}>
          {text.updateError}: {checkError}
        </p>
      )}

      {info && !info.hasUpdate && (
        <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginBottom: '0.5rem' }}>
          âœ“ {text.upToDate} <b style={{ color: 'var(--accent)' }}>v{info.currentVersion}</b>
        </p>
      )}

      {info?.hasUpdate && (
        <div style={{ padding: '0.75rem', background: 'rgba(185,246,92,0.06)', border: '1px solid rgba(185,246,92,0.2)', borderRadius: '8px', marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.4rem', fontSize: '0.82rem' }}>
            <span style={{ color: 'var(--muted)' }}>{text.currentVer}: <b>v{info.currentVersion}</b></span>
            <span style={{ color: 'var(--accent)' }}>{text.updateAvailable} <b>v{info.latestVersion}</b></span>
          </div>
          {info.changelog && (
            <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '0.5rem' }}>
              <b>{text.changelog}:</b> {info.changelog}
            </p>
          )}
          {!info.downloadUrl && (
            <p style={{ fontSize: '0.75rem', color: 'var(--danger)' }}>{text.noUrl}</p>
          )}
          {info.downloadUrl && downloadState === 'idle' && (
            <button className="intensive-button" onClick={startDownload} style={{ marginTop: '0.25rem' }}>
              <ArrowDownToLine size={15}/> {text.downloadBtn}
            </button>
          )}
          {downloadState === 'downloading' && (
            <div style={{ marginTop: '0.5rem' }}>
              <div style={{ height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${dlPercent < 0 ? 40 : dlPercent}%`, background: 'var(--accent)', borderRadius: '3px', transition: 'width 0.4s' }}/>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.3rem' }}>
                {text.downloading} {dlPercent >= 0 ? `${dlPercent}%` : ''}
              </p>
            </div>
          )}
          {downloadState === 'error' && (
            <p style={{ fontSize: '0.78rem', color: 'var(--danger)', marginTop: '0.4rem' }}>
              {text.downloadError}: {dlError}
            </p>
          )}
          {downloadState === 'ready' && (
            <button
              className="intensive-button"
              onClick={install}
              disabled={installing}
              style={{ marginTop: '0.5rem', background: 'rgba(185,246,92,0.18)' }}
            >
              <ArrowDownToLine size={15}/>
              {installing ? text.installing : text.installBtn}
            </button>
          )}
        </div>
      )}
    </section>
  )
}

interface SensorStatus {
  helperAvailable: boolean
  installerAvailable: boolean
  directActive: boolean
  cpuFanAvailable: boolean
  cpuTempAvailable: boolean
  source: string | null
  error?: string | null
}

function SensorPanel() {
  const { language } = useI18n()
  const [status, setStatus] = useState<SensorStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [installing, setInstalling] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const labels = language === 'es'
    ? {
        section: 'SENSORES AVANZADOS',
        helper: 'Habilita el acceso ampliado a sensores de motherboard para mejorar la lectura de temperatura y ventilador de CPU.',
        direct: 'Lectura directa activa',
        directDetail: 'FixTemp ya estÃ¡ usando el lector avanzado.',
        limited: 'Lectura limitada',
        limitedDetail: 'El ventilador o la temperatura de CPU pueden seguir sin estar disponibles.',
        install: 'Habilitar sensores de placa',
        installing: 'Abriendo instalador...',
        refresh: 'Actualizar estado',
        ok: 'Se abriÃ³ el instalador con permisos elevados. Cuando termine, espera unos segundos y actualiza el estado.',
        error: 'No se pudo iniciar el instalador de sensores.'
      }
    : language === 'zh-CN'
      ? {
          section: 'é«˜çº§ä¼ æ„Ÿå™¨',
          helper: 'å¯ç”¨ä¸»æ¿æ‰©å±•ä¼ æ„Ÿå™¨è®¿é—®ï¼Œä»¥æ”¹è¿› CPU æ¸©åº¦å’Œé£Žæ‰‡è¯»æ•°ã€‚',
          direct: 'ç›´æŽ¥è¯»æ•°å·²å¯ç”¨',
          directDetail: 'FixTemp å·²ç»åœ¨ä½¿ç”¨é«˜çº§ä¼ æ„Ÿå™¨è¯»å–å™¨ã€‚',
          limited: 'è¯»æ•°å—é™',
          limitedDetail: 'CPU é£Žæ‰‡æˆ–æ¸©åº¦å¯èƒ½ä»ä¸å¯ç”¨ã€‚',
          install: 'å¯ç”¨ä¸»æ¿ä¼ æ„Ÿå™¨',
          installing: 'æ­£åœ¨æ‰“å¼€å®‰è£…ç¨‹åº...',
          refresh: 'åˆ·æ–°çŠ¶æ€',
          ok: 'å·²æ‰“å¼€ææƒå®‰è£…ç¨‹åºã€‚å®ŒæˆåŽè¯·ç­‰å¾…å‡ ç§’å†åˆ·æ–°çŠ¶æ€ã€‚',
          error: 'æ— æ³•å¯åŠ¨ä¼ æ„Ÿå™¨å®‰è£…ç¨‹åºã€‚'
        }
      : {
          section: 'ADVANCED SENSORS',
          helper: 'Enable extended motherboard sensor access to improve CPU temperature and fan readings.',
          direct: 'Direct readout active',
          directDetail: 'FixTemp is already using the advanced sensor reader.',
          limited: 'Limited readout',
          limitedDetail: 'CPU fan or temperature may still be unavailable.',
          install: 'Enable motherboard sensors',
          installing: 'Opening installer...',
          refresh: 'Refresh status',
          ok: 'The elevated installer was opened. When it finishes, wait a few seconds and refresh the status.',
          error: 'Could not start the sensor installer.'
        }

  const loadStatus = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/sensors/status', { signal: AbortSignal.timeout(7000) })
      const data = await res.json()
      setStatus(data)
      setMessage(null)
    } catch {
      setMessage(labels.error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadStatus() }, [language])

  const installSensors = async () => {
    setInstalling(true)
    try {
      const res = await fetch('/api/sensors/install', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || labels.error)
      setMessage(labels.ok)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : labels.error)
    } finally {
      setInstalling(false)
      void loadStatus()
    }
  }

  const limited = !status?.directActive || !status?.cpuFanAvailable || !status?.cpuTempAvailable

  return (
    <section className="overlay-card">
      <p className="section-label">{labels.section}</p>
      <p className="settings-helper">{labels.helper}</p>

      <div className="settings-info-list">
        <div className="overlay-info"><ShieldCheck size={17}/><span><b>{status?.directActive ? labels.direct : labels.limited}</b>{status?.directActive ? labels.directDetail : labels.limitedDetail}</span></div>
      </div>

      {status?.source ? <p className="settings-helper" style={{ marginTop: '0.75rem' }}>{status.source}</p> : null}
      {status?.error ? <p className="settings-helper" style={{ marginTop: '0.4rem', color: 'var(--danger)' }}>{status.error}</p> : null}

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1rem' }}>
        {status?.installerAvailable && limited ? (
          <button className="intensive-button" onClick={installSensors} disabled={installing}>
            <ShieldCheck size={15}/> {installing ? labels.installing : labels.install}
          </button>
        ) : null}

        <button className="export-report-button" onClick={loadStatus} disabled={loading}>
          <RefreshCw size={15} className={loading ? 'spin' : undefined}/> {labels.refresh}
        </button>
      </div>

      {message ? <p className="settings-helper" style={{ marginTop: '0.75rem' }}>{message}</p> : null}
    </section>
  )
}

export function SettingsPanel() {
  const { language, setLanguage, languageOptions } = useI18n()
  const text = copy[language]
  const current = languageOptions.find(option => option.code === language) || languageOptions[0]

  return <div className="overlay-page settings-page">
    <section className="overlay-hero">
      <div>
        <span className="hero-icon"><Globe2 size={23}/></span>
        <p className="eyebrow">{text.eyebrow}</p>
        <h2>{text.title}</h2>
        <p>{text.description}</p>
      </div>
      <div className="settings-current-language">
        <small>{text.current}</small>
        <strong>{current.nativeLabel}</strong>
        <span>{current.label}</span>
      </div>
    </section>

    <div className="overlay-settings-grid settings-grid">
      <section className="overlay-card">
        <p className="section-label">{text.section}</p>
        <p className="settings-helper">{text.helper}</p>
        <div className="settings-language-grid">
          {languageOptions.map(option => <button
            key={option.code}
            type="button"
            className={`settings-language-button ${language === option.code ? 'active' : ''}`}
            onClick={() => setLanguage(option.code)}
          >
            <span>
              <b>{option.nativeLabel}</b>
              <small>{option.label}</small>
            </span>
            {language === option.code ? <i><Check size={14}/>{text.selected}</i> : null}
          </button>)}
        </div>
      </section>

      <section className="overlay-card">
        <p className="section-label">{text.cardTitle}</p>
        <div className="settings-info-list">
          <div className="overlay-info"><Languages size={17}/><span><b>{text.immediate}</b>{text.immediateDetail}</span></div>
          <div className="overlay-info"><MonitorCog size={17}/><span><b>{text.coverage}</b>{text.coverageDetail}</span></div>
          <div className="overlay-info"><ShieldCheck size={17}/><span><b>{text.persistence}</b>{text.persistenceDetail}</span></div>
        </div>
        <div className="settings-bullets">
          {text.bullets.map(item => <div key={item}><i/><span>{item}</span></div>)}
        </div>
      </section>

      <UpdatePanel/>
      <SensorPanel/>
    </div>
  </div>
}
