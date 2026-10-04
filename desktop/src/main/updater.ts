// Auto updates from GitHub Releases (electron-updater + the NSIS installer).
import { app } from 'electron'
import electronUpdater from 'electron-updater'
import log from 'electron-log/main'
import type { UpdateState } from '@shared/app'

const { autoUpdater } = electronUpdater

let current: UpdateState = { state: 'idle' }
let listener: (s: UpdateState) => void = () => {}
let initialized = false

function set(s: UpdateState): void {
  current = s
  listener(s)
}

export function updateState(): UpdateState {
  return current
}

export function initUpdater(onChange: (s: UpdateState) => void, autoDownload: boolean): void {
  listener = onChange
  if (initialized) return
  initialized = true
  autoUpdater.logger = log
  autoUpdater.autoDownload = autoDownload
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowPrerelease = false

  autoUpdater.on('checking-for-update', () => set({ state: 'checking' }))
  autoUpdater.on('update-not-available', () => set({ state: 'none', version: app.getVersion() }))
  autoUpdater.on('update-available', (info) =>
    set({
      state: 'available',
      version: info.version,
      notes: typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined
    })
  )
  autoUpdater.on('download-progress', (p) =>
    set({ state: 'downloading', percent: p.percent, bytesPerSecond: p.bytesPerSecond })
  )
  autoUpdater.on('update-downloaded', (info) => set({ state: 'ready', version: info.version }))
  autoUpdater.on('error', (err) => {
    const message = err?.message ?? String(err)
    // no release published yet (or offline): nothing to update to
    if (/No published versions|net::ERR_INTERNET_DISCONNECTED|ENOTFOUND/i.test(message)) {
      set({ state: 'none', version: app.getVersion() })
      return
    }
    set({ state: 'error', message })
  })
}

export function setAutoDownload(value: boolean): void {
  autoUpdater.autoDownload = value
}

export async function checkForUpdates(): Promise<UpdateState> {
  if (!app.isPackaged) {
    set({ state: 'none', version: app.getVersion() })
    return current
  }
  try {
    await autoUpdater.checkForUpdates()
  } catch {
    /* reported through the 'error' event */
  }
  return current
}

export async function downloadUpdate(): Promise<void> {
  try {
    await autoUpdater.downloadUpdate()
  } catch (err) {
    set({ state: 'error', message: (err as Error)?.message ?? String(err) })
  }
}

export function installUpdate(): void {
  autoUpdater.quitAndInstall(false, true)
}
