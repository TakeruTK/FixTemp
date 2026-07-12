import { useState } from 'react'
import { ArrowDownToLine, Bell, Info, ListChecks, Menu, RefreshCw, ShieldCheck, X } from 'lucide-react'
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
        <ListChecks size={20}/>
        <h3>Guia rapida de uso</h3>
        <ol>
          <li>Abre Resumen para revisar CPU, GPU, RAM, red, discos y procesos en vivo.</li>
          <li>Si faltan temperatura o ventilador, usa Ajustes para activar los sensores avanzados.</li>
          <li>En Mi equipo revisa el inventario del PC antes de comparar o reparar.</li>
          <li>Usa Salud del dispositivo para una evaluacion general y Pruebas de estres solo cuando quieras exigir el equipo.</li>
          <li>En Actualizaciones busca nuevas versiones y deja que FixTemp descargue el instalador cuando haya una mejora disponible.</li>
        </ol>
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
