import { useEffect, useState } from 'react'
import { ArrowDownToLine, Bell, BookOpen, Info, Menu, RefreshCw, ShieldCheck, X } from 'lucide-react'
import { Dashboard } from './components/Dashboard'
import { DeviceHealth } from './components/DeviceHealth'
import { GpuStressEngine } from './components/GpuStressEngine'
import { Hardware } from './components/Hardware'
import { OverlaySettings } from './components/OverlaySettings'
import { OverlayWindow } from './components/OverlayWindow'
import { SettingsPanel, UpdatePanel } from './components/SettingsPanel'
import { Sidebar, type View } from './components/Sidebar'
import { StressLab } from './components/StressLab'
import { useMetrics } from './hooks/useMetrics'
import { useUpdates } from './hooks/useUpdates'
import { I18nProvider, useI18n } from './i18n'

const titles = {
  es: {
    dashboard: { eyebrow: 'CENTRO DE CONTROL', title: 'Estado del sistema' },
    stress: { eyebrow: 'DIAGNOSTICO', title: 'Banco de pruebas' },
    hardware: { eyebrow: 'INFORMACION', title: 'Mi equipo' },
    health: { eyebrow: 'DIAGNOSTICO LOCAL', title: 'Salud del dispositivo' },
    overlay: { eyebrow: 'EN PANTALLA', title: 'Overlay' },
    settings: { eyebrow: 'PREFERENCIAS', title: 'Ajustes' },
    updates: { eyebrow: 'MANTENIMIENTO', title: 'Actualizaciones' },
    about: { eyebrow: 'INFORMACION', title: 'Acerca de' },
    connecting: 'Conectando con el equipo...',
    reading: 'Leyendo sensores y procesos',
    updateAvailable: 'Nueva version disponible',
    updateReady: 'Lista para instalar',
    updateChecking: 'Buscando actualizaciones...',
    updateDownload: 'Descargar',
    updateDownloading: 'Descargando',
    updateInstall: 'Instalar y reiniciar',
    updateLater: 'Mas tarde',
    updateOpen: 'Abrir actualizaciones',
    updateError: 'No se pudo comprobar la actualizacion'
  },
  en: {
    dashboard: { eyebrow: 'CONTROL CENTER', title: 'System status' },
    stress: { eyebrow: 'DIAGNOSTICS', title: 'Test bench' },
    hardware: { eyebrow: 'INFORMATION', title: 'My device' },
    health: { eyebrow: 'LOCAL DIAGNOSTICS', title: 'Device health' },
    overlay: { eyebrow: 'ON SCREEN', title: 'Overlay' },
    settings: { eyebrow: 'PREFERENCES', title: 'Settings' },
    updates: { eyebrow: 'MAINTENANCE', title: 'Updates' },
    about: { eyebrow: 'INFORMATION', title: 'About' },
    connecting: 'Connecting to the device...',
    reading: 'Reading sensors and processes',
    updateAvailable: 'Update available',
    updateReady: 'Ready to install',
    updateChecking: 'Checking for updates...',
    updateDownload: 'Download',
    updateDownloading: 'Downloading',
    updateInstall: 'Install and restart',
    updateLater: 'Later',
    updateOpen: 'Open updates',
    updateError: 'Could not check for updates'
  },
  'zh-CN': {
    dashboard: { eyebrow: 'CONTROL CENTER', title: 'System status' },
    stress: { eyebrow: 'DIAGNOSTICS', title: 'Test bench' },
    hardware: { eyebrow: 'INFORMATION', title: 'My device' },
    health: { eyebrow: 'LOCAL DIAGNOSTICS', title: 'Device health' },
    overlay: { eyebrow: 'ON SCREEN', title: 'Overlay' },
    settings: { eyebrow: 'PREFERENCES', title: 'Settings' },
    updates: { eyebrow: 'MAINTENANCE', title: 'Updates' },
    about: { eyebrow: 'INFORMATION', title: 'About' },
    connecting: 'Connecting to the device...',
    reading: 'Reading sensors and processes',
    updateAvailable: 'Update available',
    updateReady: 'Ready to install',
    updateChecking: 'Checking for updates...',
    updateDownload: 'Download',
    updateDownloading: 'Downloading',
    updateInstall: 'Install and restart',
    updateLater: 'Later',
    updateOpen: 'Open updates',
    updateError: 'Could not check for updates'
  }
} as const

function AboutPanel() {
  return <section className="about-page">
    <div className="about-hero">
      <Info size={24}/>
      <div>
        <p className="section-label">FIXTEMP</p>
        <h2>FixTemp</h2>
        <p>FixTemp es una herramienta para revisar, mantener y entender mejor el estado real de un equipo. Se enfoca en monitorear sensores, temperatura, carga, hardware y estabilidad desde una interfaz local.</p>
      </div>
    </div>
    <div className="about-grid">
      <article className="about-card">
        <ShieldCheck size={20}/>
        <h3>Para que sirve</h3>
        <p>Sirve para ver el comportamiento del PC en vivo, comprobar temperatura de CPU y GPU cuando el equipo entrega sensores reales, revisar memoria, discos, red y procesos principales.</p>
      </article>
      <article className="about-card">
        <RefreshCw size={20}/>
        <h3>Uso principal</h3>
        <p>Ayuda a detectar si el equipo esta trabajando normal, si faltan sensores, si hay carga alta o si conviene hacer pruebas antes de mantenimiento, reparacion o comparacion entre equipos.</p>
      </article>
      <article className="about-card about-guide">
        <BookOpen size={20}/>
        <h3>Manual de uso</h3>
        <div className="manual-grid">
          <div>
            <b>1. Primer inicio</b>
            <p>Instala FixTemp como administrador y espera unos segundos mientras carga sensores, discos, red y procesos. Si Windows pregunta permisos, aceptalos para que el lector pueda acceder al hardware.</p>
          </div>
          <div>
            <b>2. Resumen</b>
            <p>Usa Resumen para mirar el estado diario del equipo: carga de CPU y GPU, temperatura, reloj, ventilador, RAM, red, almacenamiento y procesos principales.</p>
          </div>
          <div>
            <b>3. Sensores avanzados</b>
            <p>Si la temperatura o el ventilador aparecen como no disponibles, entra en Ajustes y activa los sensores avanzados. Algunas placas o notebooks pueden ocultar datos aunque el equipo funcione bien.</p>
          </div>
          <div>
            <b>4. Mi equipo</b>
            <p>Revisa el inventario antes de reparar, vender, comparar o actualizar un PC. Aqui puedes ver procesador, placa, BIOS, RAM, GPU, discos, red, audio y pantallas detectadas.</p>
          </div>
          <div>
            <b>5. Salud del dispositivo</b>
            <p>Sirve para una lectura general: rendimiento visible, cobertura de sensores, estado de memoria, almacenamiento y datos disponibles. Es una referencia, no un diagnostico medico del hardware.</p>
          </div>
          <div>
            <b>6. Pruebas de estres</b>
            <p>Usalas solo cuando quieras exigir el equipo. Antes de iniciar, cierra juegos o programas pesados, vigila temperaturas y detiene la prueba si notas apagones, congelamientos o calor excesivo.</p>
          </div>
          <div>
            <b>7. Overlay</b>
            <p>Activa el overlay cuando quieras ver datos mientras usas otra aplicacion. Puedes elegir que metricas mostrar para no llenar la pantalla con informacion innecesaria.</p>
          </div>
          <div>
            <b>8. Actualizaciones</b>
            <p>En Actualizaciones puedes buscar nuevas versiones. Cuando haya una mejora, FixTemp descarga el instalador, lo ejecuta y vuelve a abrir el programa al terminar.</p>
          </div>
        </div>
        <p className="manual-note">Consejo: para pruebas en otros equipos, instala una version anterior y luego usa Actualizaciones para confirmar que descarga, instala y vuelve a abrir FixTemp correctamente.</p>
      </article>
    </div>
  </section>
}

function MainApp() {
  const { language } = useI18n()
  const text = titles[language]
  const [view, setView] = useState<View>(() => /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) ? 'health' : 'dashboard')
  const [menuOpen, setMenuOpen] = useState(false)
  const { data, error } = useMetrics()
  const { state: updateState, visibleUpdate, installing, startDownload, install, dismiss, check } = useUpdates()
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [autoInstallUpdate, setAutoInstallUpdate] = useState(false)
  const updateBadge = visibleUpdate || updateState.download.active || Boolean(updateState.download.filePath)
  const updateActionDisabled = updateState.download.active || installing

  useEffect(() => {
    if (!autoInstallUpdate || !updateState.download.filePath || updateState.download.active) return
    setAutoInstallUpdate(false)
    void install().catch(() => {})
  }, [autoInstallUpdate, install, updateState.download.active, updateState.download.filePath])

  const runNotificationUpdate = async () => {
    if (updateState.download.filePath) {
      await install()
      return
    }
    setAutoInstallUpdate(true)
    await startDownload()
  }

  return <div className="app-shell">
    <GpuStressEngine session={data?.stress || null}/>
    <div className={`sidebar-wrap ${menuOpen ? 'open' : ''}`}><Sidebar view={view} onChange={(next) => { setView(next); setMenuOpen(false) }}/></div>
    <main className="main-content">
      <header className="topbar">
        <button className="menu-button" onClick={() => setMenuOpen(value => !value)}><Menu size={20}/></button>
        <div><p>{text[view].eyebrow}</p><h1>{text[view].title}</h1></div>
        <div className="topbar__actions">
          <button className={`icon-button ${updateBadge ? 'has-alert' : ''}`} onClick={() => setNotificationsOpen(value => !value)} title={text.updateOpen}><Bell size={17}/><i/></button>
          {notificationsOpen ? (
            <section className="notification-popover">
              <div className="notification-popover__head">
                <div>
                  <p>{text.updateOpen}</p>
                  <strong>{visibleUpdate ? `v${updateState.latestVersion}` : text.updateChecking}</strong>
                </div>
                <button className="icon-button" onClick={() => setNotificationsOpen(false)} title={text.updateLater}><X size={15}/></button>
              </div>
              {visibleUpdate ? (
                <>
                  <span>{updateState.changelog || text.updateAvailable}</span>
                  {updateState.download.active ? (
                    <div className="notification-progress">
                      <i style={{ width: `${Math.max(4, updateState.download.percent)}%` }}/>
                    </div>
                  ) : null}
                  <button className="intensive-button" onClick={() => void runNotificationUpdate().catch(() => setAutoInstallUpdate(false))} disabled={updateActionDisabled}>
                    {updateState.download.active ? <RefreshCw size={15} className="spin"/> : <ArrowDownToLine size={15}/>}
                    {updateState.download.active
                      ? `${text.updateDownloading} ${updateState.download.percent >= 0 ? `${updateState.download.percent}%` : ''}`
                      : updateState.download.filePath
                        ? text.updateInstall
                        : `${text.updateDownload} e instalar`}
                  </button>
                  <button className="notification-link" onClick={() => { dismiss(); setNotificationsOpen(false) }}>{text.updateLater}</button>
                </>
              ) : updateState.error ? (
                <>
                  <span className="notification-error">{updateState.error}</span>
                  <button className="export-report-button" onClick={() => void check(true).catch(() => {})}><RefreshCw size={15}/> {text.updateChecking}</button>
                </>
              ) : (
                <>
                  <span>FixTemp esta al dia. Version actual: v{updateState.currentVersion}</span>
                  <button className="export-report-button" onClick={() => void check(true).catch(() => {})}><RefreshCw size={15}/> {text.updateChecking}</button>
                </>
              )}
            </section>
          ) : null}
        </div>
      </header>
      <div className="content-area">
        {!visibleUpdate && updateState.error && updateState.checkedAt > 0 && view === 'updates' ? (
          <section className="update-banner update-banner--error">
            <div className="update-banner__copy">
              <p>{text.updateError}</p>
              <span>{updateState.error}</span>
            </div>
          </section>
        ) : null}

        {view === 'health' ? <DeviceHealth data={data}/> : view === 'settings' ? <SettingsPanel/> : view === 'updates' ? <UpdatePanel/> : view === 'about' ? <AboutPanel/> : !data
          ? <div className="loading"><RefreshCw className="spin" size={25}/><strong>{text.connecting}</strong><span>{error || text.reading}</span></div>
          : view === 'dashboard' ? <Dashboard data={data}/>
            : view === 'stress' ? <StressLab data={data}/>
              : view === 'overlay' ? <OverlaySettings data={data}/>
                : <Hardware data={data}/>}
      </div>
    </main>
  </div>
}

function AppBody() {
  return new URLSearchParams(window.location.search).has('overlay') ? <OverlayWindow/> : <MainApp/>
}

export default function App() {
  return <I18nProvider><AppBody/></I18nProvider>
}
