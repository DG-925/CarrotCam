// Types shared between the Electron main process, preload and renderer.
import type { PhoneInfo } from './protocol'

export type ThemeMode = 'system' | 'dark' | 'light'

export interface OutputFormat {
  width: number
  height: number
  fps: number
}

export interface AppSettings {
  theme: ThemeMode
  closeToTray: boolean
  startAtLogin: boolean
  startMinimized: boolean
  autoUpdate: boolean
  port: number
  output: OutputFormat
  vcamEnabled: boolean
  stream: {
    resolution: '720p' | '1080p' | '4k'
    fps: 30 | 60
    bitrate: number
    lowLatency: boolean
    codec: 'h264' | 'vp8' | 'vp9'
  }
  recordAudio: boolean
  lastSource: string | null
  welcomed: boolean
}

export const defaultAppSettings: AppSettings = {
  theme: 'system',
  closeToTray: true,
  startAtLogin: false,
  startMinimized: false,
  autoUpdate: true,
  port: 47820,
  output: { width: 1280, height: 720, fps: 30 },
  vcamEnabled: true,
  stream: { resolution: '720p', fps: 30, bitrate: 8000, lowLatency: true, codec: 'h264' },
  recordAudio: true,
  lastSource: null,
  welcomed: false
}

export interface DriverStatus {
  supported: boolean
  installed: boolean
  upToDate: boolean
  path: string | null
  error?: string
}

export interface ServerInfo {
  running: boolean
  port: number
  pcName: string
  pcId: string
  addresses: string[]
  /** this PC's addresses on phones connected by USB cable (USB tethering) */
  usb: string[]
  pairCode: string
  qr: string // payload encoded in the QR code
}

export interface ConnectedDevice {
  id: string
  info: PhoneInfo
  address: string
  /** connected through a USB cable rather than Wi-Fi */
  usb: boolean
  connectedAt: number
}

export type UpdateState =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'none'; version: string }
  | { state: 'available'; version: string; notes?: string }
  | { state: 'downloading'; percent: number; bytesPerSecond: number }
  | { state: 'ready'; version: string }
  | { state: 'error'; message: string }

export type TrayAction = 'privacy-blur' | 'privacy-brb' | 'privacy-off' | 'snapshot'

/** IPC channels exposed by the preload bridge. */
export const IPC = {
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  driverStatus: 'driver:status',
  driverInstall: 'driver:install',
  driverUninstall: 'driver:uninstall',
  driverFormat: 'driver:format',
  serverInfo: 'server:info',
  serverNewCode: 'server:new-code',
  serverSend: 'server:send',
  serverKick: 'server:kick',
  serverForget: 'server:forget',
  serverDevices: 'server:devices',
  updateCheck: 'update:check',
  updateDownload: 'update:download',
  updateInstall: 'update:install',
  updateGet: 'update:get',
  openExternal: 'app:open-external',
  saveFile: 'app:save-file',
  showItem: 'app:show-item',
  setTheme: 'app:set-theme',
  firewallFix: 'app:firewall-fix',
  appInfo: 'app:info',
  quit: 'app:quit',
  // events (main -> renderer)
  evDevices: 'ev:devices',
  evMessage: 'ev:message',
  evServer: 'ev:server',
  evUpdate: 'ev:update',
  evTray: 'ev:tray',
  evShortcut: 'ev:shortcut',
  evSettings: 'ev:settings'
} as const

export const INVOKE_CHANNELS: string[] = [
  IPC.settingsGet,
  IPC.settingsSet,
  IPC.driverStatus,
  IPC.driverInstall,
  IPC.driverUninstall,
  IPC.driverFormat,
  IPC.serverInfo,
  IPC.serverNewCode,
  IPC.serverSend,
  IPC.serverKick,
  IPC.serverForget,
  IPC.serverDevices,
  IPC.updateCheck,
  IPC.updateDownload,
  IPC.updateInstall,
  IPC.updateGet,
  IPC.openExternal,
  IPC.saveFile,
  IPC.showItem,
  IPC.setTheme,
  IPC.firewallFix,
  IPC.appInfo,
  IPC.quit
]

export const EVENT_CHANNELS: string[] = [
  IPC.evDevices,
  IPC.evMessage,
  IPC.evServer,
  IPC.evUpdate,
  IPC.evTray,
  IPC.evShortcut,
  IPC.evSettings
]

export interface AppInfo {
  version: string
  electron: string
  chrome: string
  platform: string
  userData: string
  repo: string
}

export const GITHUB_REPO = 'DG-925/CarrotCam'
