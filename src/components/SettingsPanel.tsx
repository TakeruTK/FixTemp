import { useEffect, useState } from 'react'
import { ArrowDownToLine, Check, Globe2, Languages, MonitorCog, RefreshCw, ShieldCheck } from 'lucide-react'
import { useI18n } from '../i18n'

const copy = {
  es: {
    eyebrow: 'AJUSTES DEL PROGRAMA',
    title: 'Preferencias de FixTemp',
    description: 'Desde aquí puedes controlar el idioma de toda la interfaz. El cambio se aplica al instante y queda guardado para futuras aperturas del programa.',
    current: 'Idioma actual',
    section: 'IDIOMA DE LA INTERFAZ',
    helper: 'Selecciona el idioma principal para paneles, pruebas, inventario, overlay y textos de apoyo.',
    immediate: 'Aplicación inmediata',
    immediateDetail: 'No necesitas reiniciar la aplicación.',
    coverage: 'Cobertura de traducción',
    coverageDetail: 'Se actualiza toda la interfaz principal del programa.',
    persistence: 'Guardado local',
    persistenceDetail: 'La preferencia queda guardada en este equipo.',
    selected: 'Seleccionado',
    cardTitle: 'Qué cambia con este ajuste',
    bullets: [
      'Panel principal y barra lateral',
      'Pruebas de estrés y salud del dispositivo',
      'Inventario de hardware y overlay',
      'Mensajes de ayuda, estados y etiquetas'
    ],
    updateSection: 'ACTUALIZACIONES',
    updateHelper: 'Comprueba si hay una nueva versión disponible y descárgala directamente desde aquí.',
    checkBtn: 'Buscar actualización',
    checking: 'Verificando...',
    upToDate: 'Ya tienes la versión más reciente.',
    updateAvailable: 'Nueva versión disponible:',
    currentVer: 'Tu versión',
    downloadBtn: 'Descargar actualización',
    downloading: 'Descargando...',
    installBtn: 'Instalar y reiniciar',
    installing: 'Lanzando instalador...',
    updateError: 'Error al verificar',
    downloadError: 'Error al descargar',
    noUrl: 'El servidor no proporcionó URL de descarga.',
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
    eyebrow: '程序设置',
    title: 'FixTemp 偏好设置',
    description: '你可以在这里控制整个界面的语言。切换会立即生效，并会保存到下次打开程序。',
    current: '当前语言',
    section: '界面语言',
    helper: '选择仪表板、测试、硬件信息、悬浮层和辅助文本使用的主要语言。',
    immediate: '即时生效',
    immediateDetail: '无需重新启动程序。',
    coverage: '翻译覆盖范围',
    coverageDetail: '程序主要界面都会更新。',
    persistence: '本地保存',
    persistenceDetail: '该偏好会保存在这台电脑上。',
    selected: '已选择',
    cardTitle: '此设置会影响的内容',
    bullets: [
      '主面板与侧边栏',
      '压力测试与设备健康',
      '硬件清单与悬浮层',
      '帮助文本、状态与标签'
    ],
    updateSection: '更新',
    updateHelper: '检查是否有新版本，并直接在此下载。',
    checkBtn: '检查更新',
    checking: '检查中...',
    upToDate: '你已经是最新版本。',
    updateAvailable: '有新版本可用：',
    currentVer: '当前版本',
    downloadBtn: '下载更新',
    downloading: '下载中...',
    installBtn: '安装并重启',
    installing: '正在启动安装程序...',
    updateError: '检查出错',
    downloadError: '下载出错',
    noUrl: '服务器未提供下载链接。',
    changelog: '更新内容'
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
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
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
          ✓ {text.upToDate} <b style={{ color: 'var(--accent)' }}>v{info.currentVersion}</b>
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
        directDetail: 'FixTemp ya está usando el lector avanzado.',
        limited: 'Lectura limitada',
        limitedDetail: 'El ventilador o la temperatura de CPU pueden seguir sin estar disponibles.',
        install: 'Habilitar sensores de placa',
        installing: 'Abriendo instalador...',
        refresh: 'Actualizar estado',
        ok: 'Se abrió el instalador con permisos elevados. Cuando termine, espera unos segundos y actualiza el estado.',
        error: 'No se pudo iniciar el instalador de sensores.'
      }
    : language === 'zh-CN'
      ? {
          section: '高级传感器',
          helper: '启用主板扩展传感器访问，以改进 CPU 温度和风扇读数。',
          direct: '直接读数已启用',
          directDetail: 'FixTemp 已经在使用高级传感器读取器。',
          limited: '读数受限',
          limitedDetail: 'CPU 风扇或温度可能仍不可用。',
          install: '启用主板传感器',
          installing: '正在打开安装程序...',
          refresh: '刷新状态',
          ok: '已打开提权安装程序。完成后请等待几秒再刷新状态。',
          error: '无法启动传感器安装程序。'
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
