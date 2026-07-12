import { useState } from 'react'
import { ArrowDownToLine, Bell, ChevronDown, Menu, RefreshCw, Wifi, WifiOff, X } from 'lucide-react'
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
    live: 'En vivo',
    offline: 'Sin conexion',
    profile: 'PERFIL',
    defaultProfile: 'Predeterminado',
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
    live: 'Live',
    offline: 'Offline',
    profile: 'PROFILE',
    defaultProfile: 'Default',
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
    dashboard: { eyebrow: '控制中心', title: '系统状态' },
    stress: { eyebrow: '诊断', title: '测试工作台' },
    hardware: { eyebrow: '信息', title: '我的设备' },
    health: { eyebrow: '本地诊断', title: '设备健康' },
    overlay: { eyebrow: '屏幕显示', title: '悬浮层' },
    settings: { eyebrow: '偏好设置', title: '设置' },
    updates: { eyebrow: '维护', title: '更新' },
    live: '实时',
    offline: '离线',
    profile: '配置',
    defaultProfile: '默认',
    connecting: '正在连接设备...',
    reading: '正在读取传感器和进程',
    updateAvailable: '发现新版本',
    updateReady: '可以安装',
    updateChecking: '正在检查更新...',
    updateDownload: '下载',
    updateDownloading: '下载中',
    updateInstall: '安装并重启',
    updateLater: '稍后',
    updateOpen: '打开更新',
    updateError: '无法检查更新'
  }
} as const

function MainApp() {
  const { language } = useI18n()
  const text = titles[language]
  const [view, setView] = useState<View>(() => /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) ? 'health' : 'dashboard')
  const [menuOpen, setMenuOpen] = useState(false)
  const { data, connected, error } = useMetrics()
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
          <span className={`connection ${connected ? '' : 'offline'}`}>{connected ? <Wifi size={14}/> : <WifiOff size={14}/>} {connected ? text.live : text.offline}</span>
          <button className={`icon-button ${updateBadge ? 'has-alert' : ''}`} onClick={() => setView('updates')} title={text.updateOpen}><Bell size={17}/><i/></button>
          <button className="profile"><span>PG</span><div><small>{text.profile}</small><strong>{text.defaultProfile}</strong></div><ChevronDown size={14}/></button>
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

        {view === 'health' ? <DeviceHealth data={data}/> : view === 'settings' ? <SettingsPanel/> : view === 'updates' ? <UpdatePanel/> : !data
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
