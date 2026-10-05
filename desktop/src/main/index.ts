import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  net,
  protocol,
  session,
  shell,
  Tray
} from 'electron'
import { execFile } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { cpus, totalmem, release as osRelease } from 'node:os'
import { dirname, join, normalize, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import log from 'electron-log/main'
import { IPC, GITHUB_REPO, type AppSettings, type TrayAction, type AppInfo, type CaptureItem, type Diagnostics } from '@shared/app'
import type { PcToPhone } from '@shared/protocol'
import { settings } from './settings'
import { driverStatus, ensureDriver, installDriver, senderDllPath, uninstallDriver, writeDriverFormat } from './driver'
import { PhoneServer } from './server'
import { checkForUpdates, downloadUpdate, initUpdater, installUpdate, setAutoDownload, updateState } from './updater'
import {
  MEDIA_SCHEME,
  closeAllRecordings,
  deleteCapture,
  listCaptures,
  newCaptureFile,
  openCapture,
  openCaptureFolder,
  recordClose,
  recordOpen,
  recordWrite,
  serveMedia
} from './captures'

log.initialize()
log.transports.file.level = 'info'

// ---- Chromium tuning -------------------------------------------------------
// Real LAN IPs in WebRTC candidates (instead of mDNS names) for instant,
// reliable phone connections; prefer the discrete GPU on laptops.
app.commandLine.appendSwitch('disable-features', 'WebRtcHideLocalIpsWithMdns,CalculateNativeWinOcclusion')
app.commandLine.appendSwitch('force_high_performance_gpu')
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-background-timer-throttling')
app.setAppUserModelId('com.carrotcam.desktop')

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
  },
  MEDIA_SCHEME
])

const startHidden = process.argv.includes('--hidden')
// Run by the installer: register the virtual camera for this user, then exit.
const installDriverOnly = process.argv.includes('--install-driver')
let win: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false
let trayHintShown = false
const server = new PhoneServer()

if (installDriverOnly) {
  // never keep the installer waiting
  setTimeout(() => app.exit(0), 30_000).unref()
  app
    .whenReady()
    .then(() => (process.platform === 'win32' ? installDriver() : null))
    .then((status) => log.info('[driver] installer registration', status))
    .catch((err) => log.error('[driver] installer registration failed', err))
    .finally(() => app.exit(0))
} else if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => showWindow())
  app.whenReady().then(bootstrap).catch((err) => log.error('bootstrap failed', err))
}

function iconPath(): string {
  return app.isPackaged ? join(process.resourcesPath, 'icon.ico') : join(app.getAppPath(), 'build', 'icon.ico')
}

// keep in sync with --title / --bg in global.css
const DARK_TITLE = '#0b0b0d'
const LIGHT_TITLE = '#f3f3f5'
function titleBarColors(dark: boolean): { color: string; symbolColor: string; height: number } {
  return dark
    ? { color: DARK_TITLE, symbolColor: '#c7c7cf', height: 48 }
    : { color: LIGHT_TITLE, symbolColor: '#3a3a42', height: 48 }
}

function resolveDark(theme: AppSettings['theme']): boolean {
  return theme === 'dark' || (theme === 'system' && nativeTheme.shouldUseDarkColors)
}

function createWindow(): void {
  const dark = resolveDark(settings.get().theme)
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    title: 'CarrotCam',
    icon: iconPath(),
    backgroundColor: dark ? DARK_TITLE : LIGHT_TITLE,
    titleBarStyle: 'hidden',
    titleBarOverlay: titleBarColors(dark),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      spellcheck: false,
      additionalArguments: [`--carrot-vcam-dll=${senderDllPath()}`]
    }
  })

  win.once('ready-to-show', () => {
    if (!(startHidden || settings.get().startMinimized)) win?.show()
  })

  win.on('close', (e) => {
    if (!quitting && settings.get().closeToTray) {
      e.preventDefault()
      win?.hide()
      if (!trayHintShown && tray) {
        trayHintShown = true
        tray.displayBalloon({
          iconType: 'info',
          title: 'CarrotCam is still running',
          content: 'Your virtual camera stays live. Open CarrotCam from the tray icon.'
        })
      }
    }
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    // the dev server only exists in development; the packaged app never leaves app://
    const allowed = url.startsWith('app://') || (!app.isPackaged && url.startsWith('http://localhost'))
    if (!allowed) e.preventDefault()
  })

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadURL('app://carrotcam/index.html')
  }

  if (!app.isPackaged) {
    // development aids: renderer console in the terminal + optional screenshots
    win.webContents.on('console-message', (e) => {
      if (!e.message.includes('performance warning')) log.info(`[renderer:${e.level}] ${e.message}`)
    })
    const script = process.env.CARROTCAM_EVAL
    if (script) {
      win.webContents.once('did-finish-load', () => {
        setTimeout(() => void win?.webContents.executeJavaScript(script).catch((err) => log.warn('[dev] eval', err)), 2500)
      })
    }
    const shot = process.env.CARROTCAM_SCREENSHOT
    if (shot) {
      const delay = Number(process.env.CARROTCAM_SCREENSHOT_DELAY ?? 6000)
      setTimeout(async () => {
        const img = await win?.webContents.capturePage()
        if (img) writeFileSync(shot, img.toPNG())
        log.info('[dev] screenshot saved', shot)
      }, delay)
    }
  }
}

function showWindow(): void {
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function send(channel: string, payload: unknown): void {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
}

function serveRenderer(): void {
  const root = join(__dirname, '../renderer')
  protocol.handle('app', (request) => {
    const { pathname } = new URL(request.url)
    const file = normalize(join(root, decodeURIComponent(pathname)))
    if (!file.startsWith(root + sep) && file !== root) {
      return new Response('Forbidden', { status: 403 })
    }
    return net.fetch(pathToFileURL(file).toString())
  })
}

function setupPermissions(): void {
  const allowed = new Set(['media', 'mediaKeySystem', 'clipboard-sanitized-write', 'fullscreen', 'notifications'])
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(allowed.has(permission)))
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowed.has(permission))
}

function buildTray(): void {
  tray = new Tray(nativeImage.createFromPath(iconPath()))
  tray.setToolTip('CarrotCam')
  tray.on('click', () => showWindow())
  refreshTray()
}

function trayAction(action: TrayAction): void {
  send(IPC.evTray, action)
}

function refreshTray(): void {
  if (!tray) return
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open CarrotCam', click: () => showWindow() },
      { type: 'separator' },
      {
        label: 'Privacy',
        submenu: [
          { label: 'Off', click: () => trayAction('privacy-off') },
          { label: 'Blur everything', click: () => trayAction('privacy-blur') },
          { label: 'Be right back', click: () => trayAction('privacy-brb') }
        ]
      },
      { label: 'Take snapshot', click: () => trayAction('snapshot') },
      { type: 'separator' },
      { label: 'Check for updates', click: () => checkForUpdates() },
      {
        label: 'Quit CarrotCam',
        click: () => {
          quitting = true
          app.quit()
        }
      }
    ])
  )
}

function registerShortcuts(): void {
  const shortcuts: Record<string, string> = {
    'CommandOrControl+Alt+P': 'privacy-blur',
    'CommandOrControl+Alt+B': 'privacy-brb',
    'CommandOrControl+Alt+F': 'privacy-freeze',
    'CommandOrControl+Alt+S': 'snapshot',
    // voice: listen for one command without the wake word
    'CommandOrControl+Alt+Space': 'voice-listen'
  }
  for (const [accel, action] of Object.entries(shortcuts)) {
    try {
      globalShortcut.register(accel, () => send(IPC.evShortcut, action))
    } catch (err) {
      log.warn('shortcut unavailable', accel, err)
    }
  }
}

function saveFile(kind: 'photo' | 'video', ext: string, data: ArrayBuffer): string {
  const file = newCaptureFile(kind, ext || (kind === 'photo' ? 'png' : 'webm'))
  writeFileSync(file, Buffer.from(data))
  return file
}

function diagnostics(): Diagnostics {
  const info = server.info()
  const c = cpus()
  return {
    version: app.getVersion(),
    os: `${process.platform} ${osRelease()} ${process.arch}`,
    cpu: c[0]?.model?.trim() ?? 'unknown',
    cores: c.length,
    memoryGb: Math.round((totalmem() / 1024 ** 3) * 10) / 10,
    server: { running: info.running, port: info.port, addresses: info.addresses },
    driver: lastDriver,
    logs: log.transports.file.getFile().path
  }
}
let lastDriver: Diagnostics['driver'] = { supported: process.platform === 'win32', installed: false, upToDate: false, path: null }

function firewallFix(): Promise<boolean> {
  const exe = process.execPath.replace(/'/g, "''")
  const rule =
    `netsh advfirewall firewall delete rule name='CarrotCam'; ` +
    `netsh advfirewall firewall add rule name='CarrotCam' dir=in action=allow program='${exe}' enable=yes profile=any`
  const cmd = `Start-Process powershell -Verb RunAs -WindowStyle Hidden -Wait -ArgumentList '-NoProfile','-Command',"${rule.replace(/"/g, '`"')}"`
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-Command', cmd], (err) => resolve(!err))
  })
}

function registerIpc(): void {
  ipcMain.handle(IPC.settingsGet, () => settings.get())
  ipcMain.handle(IPC.settingsSet, (_e, patch: Partial<AppSettings>) => {
    const prev = settings.get()
    const next = settings.set(patch)
    if (patch.startAtLogin !== undefined && process.platform === 'win32') {
      app.setLoginItemSettings({ openAtLogin: next.startAtLogin, args: ['--hidden'] })
    }
    if (patch.autoUpdate !== undefined) setAutoDownload(next.autoUpdate)
    if (patch.output) void writeDriverFormat(next.output)
    if (patch.theme !== undefined) refreshTray()
    if (patch.theme && patch.theme !== prev.theme) nativeTheme.themeSource = next.theme
    return next
  })

  ipcMain.handle(IPC.driverStatus, async () => (lastDriver = await driverStatus()))
  ipcMain.handle(IPC.driverInstall, async () => (lastDriver = await installDriver()))
  ipcMain.handle(IPC.driverUninstall, () => uninstallDriver())
  ipcMain.handle(IPC.driverFormat, () => writeDriverFormat(settings.get().output))

  ipcMain.handle(IPC.serverInfo, () => ({ ...server.info(), trusted: server.trustedDevices() }))
  ipcMain.handle(IPC.serverNewCode, () => server.regenerateCode())
  ipcMain.handle(IPC.serverSend, (_e, deviceId: string, msg: PcToPhone) => server.send(deviceId, msg))
  ipcMain.handle(IPC.serverKick, (_e, deviceId: string) => server.kick(deviceId))
  ipcMain.handle(IPC.serverForget, (_e, deviceId: string) => server.forget(deviceId))
  ipcMain.handle(IPC.serverDevices, () => server.devices())

  ipcMain.handle(IPC.updateCheck, () => checkForUpdates())
  ipcMain.handle(IPC.updateDownload, () => downloadUpdate())
  ipcMain.handle(IPC.updateInstall, () => {
    quitting = true
    installUpdate()
  })
  ipcMain.handle(IPC.updateGet, () => updateState())

  ipcMain.handle(IPC.openExternal, (_e, url: string) => {
    if (/^https:\/\//.test(url)) return shell.openExternal(url)
    return undefined
  })
  ipcMain.handle(IPC.saveFile, (_e, kind: 'photo' | 'video', ext: string, data: ArrayBuffer) =>
    saveFile(kind, ext.replace(/[^a-z0-9]/gi, ''), data)
  )
  ipcMain.handle(IPC.showItem, (_e, path: string) => shell.showItemInFolder(path))
  ipcMain.handle(IPC.setTheme, (_e, dark: boolean) => {
    if (!win) return
    win.setTitleBarOverlay(titleBarColors(dark))
    win.setBackgroundColor(dark ? DARK_TITLE : LIGHT_TITLE)
  })
  ipcMain.handle(IPC.capturesList, (): CaptureItem[] => listCaptures())
  ipcMain.handle(IPC.capturesDelete, (_e, kind: CaptureItem['kind'], name: string) => deleteCapture(kind, name))
  ipcMain.handle(IPC.capturesOpen, (_e, kind: CaptureItem['kind'], name: string) => openCapture(kind, name))
  ipcMain.handle(IPC.capturesFolder, (_e, kind: CaptureItem['kind']) => openCaptureFolder(kind === 'video' ? 'video' : 'photo'))
  ipcMain.handle(IPC.recordOpen, (_e, ext: string) => recordOpen(String(ext)))
  ipcMain.handle(IPC.recordWrite, (_e, id: number, data: ArrayBuffer) => recordWrite(id, data))
  ipcMain.handle(IPC.recordClose, (_e, id: number) => recordClose(id))
  ipcMain.handle(IPC.diagnostics, () => diagnostics())
  ipcMain.handle(IPC.openLogs, () => shell.openPath(dirname(log.transports.file.getFile().path)))
  ipcMain.handle(IPC.firewallFix, () => firewallFix())
  ipcMain.handle(
    IPC.appInfo,
    (): AppInfo => ({
      version: app.getVersion(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      platform: `${process.platform} ${process.arch}`,
      userData: app.getPath('userData'),
      repo: GITHUB_REPO
    })
  )
  ipcMain.handle(IPC.quit, () => {
    quitting = true
    app.quit()
  })
}

async function bootstrap(): Promise<void> {
  const s = settings.load()
  nativeTheme.themeSource = s.theme
  setupPermissions()
  serveRenderer()
  serveMedia()
  registerIpc()
  createWindow()
  buildTray()
  registerShortcuts()

  nativeTheme.on('updated', () => send(IPC.evSettings, settings.get()))

  server.on('devices', () => send(IPC.evDevices, server.devices()))
  server.on('message', (deviceId: string, msg: unknown) => send(IPC.evMessage, { deviceId, msg }))
  server.on('info', () => send(IPC.evServer, server.info()))
  try {
    await server.start(s.port)
  } catch (err) {
    log.error('[server] failed to start', err)
  }

  if (process.platform === 'win32') {
    void writeDriverFormat(s.output)
    ensureDriver()
      .then((status) => {
        lastDriver = status
        log.info('[driver] status', status)
      })
      .catch((err) => log.error('[driver] ensure failed', err))
  }

  initUpdater((state) => send(IPC.evUpdate, state), s.autoUpdate)
  if (s.autoUpdate && app.isPackaged) {
    setTimeout(() => void checkForUpdates(), 8_000)
    setInterval(() => void checkForUpdates(), 4 * 60 * 60 * 1000)
  }
}

app.on('before-quit', () => {
  quitting = true
  settings.flush()
  closeAllRecordings()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  void server.stop()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
