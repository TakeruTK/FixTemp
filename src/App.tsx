import { useState } from 'react'
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
        <p className="section-label">FIXPC</p>
        <h2>FixTemp</h2>
        <p>FixPC es el proyecto de herramientas para revisar, mantener y entender mejor el estado real de un equipo. FixTemp forma parte de ese proyecto y se enfoca en monitorear sensores, temperatura, carga, hardware y estabilidad desde una interfaz local.</p>
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
  const { state: updateState, visibleUpdate, installing, startDownload, install, dismiss } = useUpdates()
  const updateBadge = visibleUpdate || updateState.download.active || Boolean(updateState.download.filePath)

  return <div className="app-shell">
    <GpuStressEngine session={data?.stress || null}/>
    <div className={`sidebar-wrap ${menuOpen ? 'open' : ''}`}><Sidebar view={view} onChange={(next) => { setView(next); setMenuOpen(false) }}/></div>
    <main className="main-content">
      <header className="topbar">
        <button className="menu-button" onClick={() => setMenuOpen(value => !value)}><Menu size={20}/></button>
        <div><p>{text[view].eyebrow}</p><h1>{text[view].title}</h1></div>
        <div className="topbar__actions">
          <button className={`icon-button ${updateBadge ? 'has-alert' : ''}`} onClick={() => setView('updates')} title={text.updateOpen}><Bell size={17}/><i/></button>
        </div>
      </header>
      <div className="content-area">
        {visibleUpdate ? (
          <section className="update-banner">
            <div className="update-banner__copy">
              <p>{updateState.download.filePath ? text.updateReady : text.updateAvailable}</p>
              <strong>v{updateState.latestVersion}</strong>
              <span>{updateState.changelog || text.updateChecking}</span>
            </div>
            <div className="update-banner__actions">
              {!updateState.download.active && !updateState.download.filePath ? (
                <button className="intensive-button" onClick={() => void startDownload().catch(() => {})}>
                  <ArrowDownToLine size={15}/> {text.updateDownload}
                </button>
              ) : null}
              {updateState.download.active ? (
                <button className="export-report-button" disabled>
                  <RefreshCw size={15} className="spin"/> {text.updateDownloading} {updateState.download.percent >= 0 ? `${updateState.download.percent}%` : ''}
                </button>
              ) : null}
              {updateState.download.filePath ? (
                <button className="intensive-button" onClick={() => void install().catch(() => {})} disabled={installing}>
                  <ArrowDownToLine size={15}/> {text.updateInstall}
                </button>
              ) : null}
              <button className="icon-button" onClick={dismiss} title={text.updateLater}><X size={16}/></button>
            </div>
          </section>
        ) : null}

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
