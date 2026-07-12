import { app, BrowserWindow, dialog, screen, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
let mainWindow
let overlayWindow
let overlayTimer
const appUrl = 'http://127.0.0.1:4310'

function bootHtml(message) {
  return `data:text/html;charset=UTF-8,${encodeURIComponent(`<!doctype html><html lang="es"><head><meta charset="utf-8"/><title>FixTemp</title><style>html,body{margin:0;height:100%;background:#080b0d;color:#e6ecee;font-family:Segoe UI,Arial,sans-serif}body{display:grid;place-items:center}.card{width:min(520px,88vw);padding:28px 30px;border:1px solid #1d2529;background:linear-gradient(145deg,#12181b,#0f1417);box-shadow:0 18px 50px rgba(0,0,0,.35)}.eyebrow{margin:0 0 10px;color:#42e6f5;font:600 12px monospace;letter-spacing:.14em;text-transform:uppercase}.title{margin:0 0 10px;font-size:28px}.text{margin:0;color:#8b989e;line-height:1.7}.bar{height:8px;margin:18px 0 0;background:#1a2327;border:1px solid #243136;overflow:hidden}.bar i{display:block;width:35%;height:100%;background:linear-gradient(90deg,#42e6f5,#b9f65c);animation:move 1.2s ease-in-out infinite}@keyframes move{0%{transform:translateX(-120%)}100%{transform:translateX(320%)}}</style></head><body><div class="card"><p class="eyebrow">FixTemp</p><h1 class="title">Iniciando el monitor</h1><p class="text">${message}</p><div class="bar"><i></i></div></div></body></html>`) }`
}

async function waitForServerReady(timeoutMs = 20000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${appUrl}/api/health`)
      if (response.ok) return true
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  return false
}

const singleInstance = app.requestSingleInstanceLock()
if (!singleInstance) app.quit()

app.setName('FixTemp')
app.commandLine.appendSwitch('disable-background-networking')
app.commandLine.appendSwitch('disable-component-update')
app.commandLine.appendSwitch('disable-domain-reliability')
app.commandLine.appendSwitch('disable-features', 'ServiceWorker,MediaRouter,OptimizationHints,AutofillServerCommunication')
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=128')

async function createWindow() {
  const serverEntry = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'build-server', 'server.cjs')
    : path.join(__dirname, '../server/server.mjs')
  await import(pathToFileURL(serverEntry).href)
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 640,
    show: false,
    backgroundColor: '#080b0d',
    icon: path.join(__dirname, '../assets/icon.ico'),
    title: 'FixTemp',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      enableWebSQL: false,
      backgroundThrottling: false
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.on('closed', () => { overlayWindow?.destroy(); overlayWindow = null; app.quit() })
  await mainWindow.loadURL(bootHtml('Estamos iniciando el servicio local y preparando la interfaz. Esto puede tardar unos segundos según el equipo.'))
  mainWindow.show()

  let navigated = false
  mainWindow.webContents.on('did-fail-load', async (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || validatedURL.startsWith('data:text/html')) return
    await mainWindow.loadURL(bootHtml(`La interfaz aún no responde (${errorCode}: ${errorDescription}). Reintentando automáticamente…`))
    const ready = await waitForServerReady(10000)
    if (ready && !mainWindow.isDestroyed()) {
      try { await mainWindow.loadURL(appUrl); navigated = true } catch {}
    }
  })

  const ready = await waitForServerReady()
  if (!ready) {
    await mainWindow.loadURL(bootHtml('El servicio interno tardó demasiado en responder. Cierra esta ventana y vuelve a intentar. Si persiste, avísame para dejarlo corregido en la beta.'))
    return
  }
  await mainWindow.loadURL(appUrl)
  navigated = true
  startOverlaySync()
}

function createOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed()) return overlayWindow
  overlayWindow = new BrowserWindow({
    width: 360,
    height: 330,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: false
    }
  })
  overlayWindow.setIgnoreMouseEvents(true, { forward: true })
  overlayWindow.setAlwaysOnTop(true, 'screen-saver')
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  void overlayWindow.loadURL(`${appUrl}/?overlay=1`)
  overlayWindow.on('closed', () => { overlayWindow = null })
  return overlayWindow
}

function startOverlaySync() {
  const syncOverlay = async () => {
    try {
      const config = await (await fetch(`${appUrl}/api/overlay/config`)).json()
      if (!config.enabled) {
        if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.hide()
        return
      }
      const overlay = createOverlayWindow()
      if (!overlay || overlay.isDestroyed()) return
      const area = screen.getPrimaryDisplay().workArea
      const width = config.scale === 'compact' ? 300 : 360
      const height = config.scale === 'compact' ? 260 : 330
      const margin = 18
      const left = config.position.endsWith('left')
      const top = config.position.startsWith('top')
      overlay.setBounds({
        x: left ? area.x + margin : area.x + area.width - width - margin,
        y: top ? area.y + margin : area.y + area.height - height - margin,
        width,
        height
      })
      overlay.showInactive()
    } catch {
      if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.hide()
    }
  }
  overlayTimer = setInterval(syncOverlay, 3000)
  overlayTimer.unref()
  void syncOverlay()
}

app.on('second-instance', () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
})

if (singleInstance) app.whenReady().then(createWindow).catch((error) => {
  console.error('No se pudo iniciar FixTemp:', error)
  dialog.showErrorBox('FixTemp no pudo iniciar', error.message)
  app.quit()
})
app.on('before-quit', () => { if (overlayTimer) clearInterval(overlayTimer) })
app.on('window-all-closed', () => app.quit())
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
