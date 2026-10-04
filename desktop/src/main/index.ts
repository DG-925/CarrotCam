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
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join, normalize, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import log from 'electron-log/main'
import { IPC, GITHUB_REPO, type AppSettings, type TrayAction, type AppInfo } from '@shared/app'
import type { PcToPhone } from '@shared/protocol'
import { settings } from './settings'
import { driverStatus, ensureDriver, installDriver, senderDllPath, uninstallDriver, writeDriverFormat } from './driver'
import { PhoneServer } from './server'
import { checkForUpdates, downloadUpdate, initUpdater, installUpdate, setAutoDownload, updateState } from './updater'

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
  }
])

const startHidden = process.argv.includes('--hidden')
let win: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false
let trayHintShown = false
const server = new PhoneServer()

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => showWindow())
  app.whenReady().then(bootstrap).catch((err) => log.error('bootstrap failed', err))
}

function iconPath(): string {
  return app.isPackaged ? join(process.resourcesPath, 'icon.ico') : join(app.getAppPath(), 'build', 'icon.ico')
}

function titleBarColors(dark: boolean): { color: string; symbolColor: string; height: number } {
  return dark
    ? { color: '#0e0d0c', symbolColor: '#f5f1ec', height: 44 }
    : { color: '#f6f3ef', symbolColor: '#1d1a17', height: 44 }
}

function resolveDark(theme: AppSettings['theme']): boolean {
  return theme === 'dark' || (theme === 'system' && nativeTheme.shouldUseDarkColors)
}

function createWindow(): void {
  const dark = resolveDark(settings.get().theme)
  win = new BrowserWindow({
    width: 1400,
    height: 880,
    minWidth: 940,
    minHeight: 600,
    show: false,
    title: 'CarrotCam',
    icon: iconPath(),
    backgroundColor: dark ? '#0e0d0c' : '#f6f3ef',
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
    if (!url.startsWith('app://') && !url.startsWith('http://localhost')) e.preventDefault()
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
    'CommandOrControl+Alt+S': 'snapshot'
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
  const base = app.getPath(kind === 'photo' ? 'pictures' : 'videos')
  const dir = join(base, 'CarrotCam')
  mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').replace(/\..+/, '')
  let file = join(dir, `CarrotCam ${stamp}.${ext}`)
  for (let i = 2; existsSync(file); i++) file = join(dir, `CarrotCam ${stamp} (${i}).${ext}`)
  writeFileSync(file, Buffer.from(data))
  return file
}

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

  ipcMain.handle(IPC.driverStatus, () => driverStatus())
  ipcMain.handle(IPC.driverInstall, () => installDriver())
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
    win.setBackgroundColor(dark ? '#0e0d0c' : '#f6f3ef')
  })
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
      .then((status) => log.info('[driver] status', status))
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
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  void server.stop()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
