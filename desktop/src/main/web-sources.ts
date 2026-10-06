// Web page sources: each page renders in a hidden offscreen window and its
// pixels are sent to the renderer (only the part that changed), like a
// browser source in OBS. Pages are sandboxed and muted.
import { BrowserWindow } from 'electron'
import log from 'electron-log/main'

export interface WebFrame {
  key: string
  fw: number
  fh: number
  x: number
  y: number
  w: number
  h: number
  data: Uint8Array
}

const pages = new Map<string, BrowserWindow>()

function safeUrl(url: string): string | null {
  try {
    const u = new URL(url.includes('://') ? url : `https://${url}`)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null
  } catch {
    return null
  }
}

export function openWebSource(key: string, url: string, width: number, height: number, fps: number, send: (f: WebFrame) => void): boolean {
  closeWebSource(key)
  const target = safeUrl(url)
  if (!target) return false
  const w = Math.round(Math.min(3840, Math.max(160, width)))
  const h = Math.round(Math.min(2160, Math.max(90, height)))
  const win = new BrowserWindow({
    show: false,
    width: w,
    height: h,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: {
      offscreen: true,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      partition: 'persist:carrotcam-web'
    }
  })
  pages.set(key, win)
  win.webContents.setAudioMuted(true)
  win.webContents.setFrameRate(Math.min(60, Math.max(1, fps)))
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (e, next) => {
    if (!safeUrl(next)) e.preventDefault()
  })
  win.webContents.on('paint', (_e, dirty, image) => {
    if (pages.get(key) !== win) return
    const size = image.getSize()
    const x = Math.max(0, Math.min(size.width, dirty.x))
    const y = Math.max(0, Math.min(size.height, dirty.y))
    const dw = Math.min(size.width - x, dirty.width)
    const dh = Math.min(size.height - y, dirty.height)
    if (dw <= 0 || dh <= 0) return
    const part = dw === size.width && dh === size.height ? image : image.crop({ x, y, width: dw, height: dh })
    send({ key, fw: size.width, fh: size.height, x, y, w: dw, h: dh, data: part.toBitmap() })
  })
  win.webContents.on('did-fail-load', (_e, code, desc) => log.warn('[web source] load failed', target, code, desc))
  void win.loadURL(target).catch(() => {})
  return true
}

export function closeWebSource(key: string): void {
  const win = pages.get(key)
  pages.delete(key)
  if (win && !win.isDestroyed()) win.destroy()
}

export function reloadWebSource(key: string): void {
  pages.get(key)?.webContents.reloadIgnoringCache()
}

/** Asks for one full repaint (the renderer lost the picture, e.g. after a reload). */
export function repaintWebSource(key: string): void {
  pages.get(key)?.webContents.invalidate()
}

export function closeAllWebSources(): void {
  for (const key of [...pages.keys()]) closeWebSource(key)
}
