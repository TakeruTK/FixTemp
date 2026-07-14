import { app, BrowserWindow, dialog, screen, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
let mainWindow
let overlayWindow
let overlayTimer
const appUrl = 'http://127.0.0.1:4310'

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

  mainWindow.on('closed', () => {
    overlayWindow?.destroy()
    overlayWindow = null
    app.quit()
  })

  mainWindow.webContents.on('did-fail-load', async (_event, errorCode, errorDescription, _validatedURL, isMainFrame) => {
    if (!isMainFrame) return
    const ready = await waitForServerReady(10000)
    if (ready && !mainWindow.isDestroyed()) {
      try { await mainWindow.loadURL(appUrl) } catch {}
      return
    }
    dialog.showErrorBox('FixTemp no pudo iniciar', `La interfaz local no respondio (${errorCode}: ${errorDescription}). Cierra FixTemp y vuelve a intentarlo.`)
  })

  const ready = await waitForServerReady()
  if (!ready) {
    dialog.showErrorBox('FixTemp no pudo iniciar', 'El servicio interno tardo demasiado en responder. Cierra FixTemp y vuelve a intentarlo.')
    app.quit()
    return
  }

  await mainWindow.loadURL(appUrl)
  mainWindow.show()
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
