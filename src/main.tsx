import { Component, StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import './enhancements.css'

const isElectron = typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent)

function renderFatalScreen(message: string) {
  const root = document.getElementById('root')
  if (!root) return
  root.innerHTML = `
    <div style="min-height:100vh;display:grid;place-items:center;background:#080b0d;color:#e6ecee;font-family:Segoe UI,Arial,sans-serif;padding:24px">
      <div style="width:min(560px,92vw);padding:30px;border:1px solid #1d2529;background:linear-gradient(145deg,#12181b,#0f1417);box-shadow:0 18px 50px rgba(0,0,0,.35)">
        <p style="margin:0 0 10px;color:#42e6f5;font:600 12px monospace;letter-spacing:.14em;text-transform:uppercase">PulseGuard</p>
        <h1 style="margin:0 0 12px;font-size:28px">La interfaz encontró un problema</h1>
        <p style="margin:0 0 10px;color:#b9c6cb;line-height:1.7">${message}</p>
        <p style="margin:0;color:#8b989e;line-height:1.7">Cierra y vuelve a abrir la aplicación. Si vuelve a pasar, esta beta necesita corrección antes de seguir probando en más equipos.</p>
      </div>
    </div>
  `
}

class AppCrashBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    const reason = error instanceof Error ? error.message : 'Error desconocido del renderer.'
    console.error('PulseGuard renderer error:', error)
    renderFatalScreen(reason)
  }

  render() {
    if (this.state.hasError) return null
    return this.props.children
  }
}

window.addEventListener('error', event => {
  renderFatalScreen(event.error instanceof Error ? event.error.message : 'Se produjo un error inesperado al iniciar la interfaz.')
})

window.addEventListener('unhandledrejection', event => {
  const reason = event.reason instanceof Error ? event.reason.message : 'Se produjo una promesa rechazada sin controlar.'
  renderFatalScreen(reason)
})

async function prepareDesktopRuntime() {
  if (!isElectron) return
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map(registration => registration.unregister().catch(() => false)))
    }
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map(key => caches.delete(key).catch(() => false)))
    }
  } catch (error) {
    console.warn('No se pudo limpiar la caché local de escritorio:', error)
  }
}

await prepareDesktopRuntime()

createRoot(document.getElementById('root')!).render(<StrictMode><AppCrashBoundary><App /></AppCrashBoundary></StrictMode>)

if (!isElectron && 'serviceWorker' in navigator && location.port !== '5173') {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}
