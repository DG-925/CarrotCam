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
  /** control the camera with hand gestures (pinch to zoom, hold a gesture for commands) */
  handControl: boolean
  /** hand gesture options: how long to hold a pose, and poses switched off */
  gestures: { holdMs: number; disabled: string[] }
  /** offline voice commands ("Carrot, take a photo") */
  voice: { enabled: boolean; wakeWord: boolean; micId: string | null }
  /** lighter processing for slower PCs; 'auto' turns it on for low-end hardware */
  efficiency: EfficiencyMode
  lastSource: string | null
  welcomed: boolean
  /** last version whose "What's new" was shown */
  lastSeenVersion: string
  settingsVersion: number
}

export type EfficiencyMode = 'auto' | 'on' | 'off'

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
  handControl: false,
  gestures: { holdMs: 700, disabled: [] },
  voice: { enabled: false, wakeWord: true, micId: null },
  efficiency: 'auto',
  lastSource: null,
  welcomed: false,
  lastSeenVersion: '',
  settingsVersion: 2
}

/** A snapshot or recording in the CarrotCam folders. */
export interface CaptureItem {
  name: string
  kind: 'photo' | 'video'
  size: number
  mtime: number
  /** media://capture/<kind>/<name>, served by the main process */
  url: string
  path: string
}

/** Facts for the Help page and "Copy diagnostics". */
export interface Diagnostics {
  version: string
  os: string
  cpu: string
  cores: number
  memoryGb: number
  server: { running: boolean; port: number; addresses: string[] }
  driver: DriverStatus
  logs: string
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
  pairCode: string
  qr: string // payload encoded in the QR code
}

export interface ConnectedDevice {
  id: string
  info: PhoneInfo
  address: string
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

export type TrayAction = 'toggle-vcam' | 'privacy-blur' | 'privacy-brb' | 'privacy-off' | 'snapshot'

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
  capturesList: 'captures:list',
  capturesDelete: 'captures:delete',
  capturesOpen: 'captures:open',
  capturesFolder: 'captures:folder',
  recordOpen: 'record:open',
  recordWrite: 'record:write',
  recordClose: 'record:close',
  diagnostics: 'app:diagnostics',
  openLogs: 'app:open-logs',
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
  IPC.quit,
  IPC.capturesList,
  IPC.capturesDelete,
  IPC.capturesOpen,
  IPC.capturesFolder,
  IPC.recordOpen,
  IPC.recordWrite,
  IPC.recordClose,
  IPC.diagnostics,
  IPC.openLogs
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
