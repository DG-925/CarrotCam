import { contextBridge, ipcRenderer } from 'electron'
import { INVOKE_CHANNELS, EVENT_CHANNELS } from '@shared/app'

// ---- Virtual camera sender --------------------------------------------------
// Frames rendered on the GPU are handed to the CarrotCam DirectShow driver
// through shared memory (scSendFrame is a ~0.2 ms memcpy for 720p).

type Fn = (...args: unknown[]) => unknown
let vcamFns: { create: Fn; destroy: Fn; send: Fn; connected: Fn } | null = null
let vcamError: string | null = null
let camera: unknown = null
let cameraKey = ''

function loadVcam(): void {
  if (vcamFns || vcamError) return
  try {
    const arg = process.argv.find((a) => a.startsWith('--carrot-vcam-dll='))
    if (!arg) throw new Error('virtual camera path missing')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const koffi = require('koffi')
    const lib = koffi.load(arg.slice('--carrot-vcam-dll='.length))
    vcamFns = {
      create: lib.func('void *scCreateCamera(int width, int height, float framerate)'),
      destroy: lib.func('void scDeleteCamera(void *camera)'),
      send: lib.func('void scSendFrame(void *camera, const uint8_t *image)'),
      connected: lib.func('bool scIsConnected(void *camera)')
    }
  } catch (err) {
    vcamError = String((err as Error)?.message ?? err)
  }
}

const vcam = {
  available(): boolean {
    loadVcam()
    return !!vcamFns
  },
  error(): string | null {
    loadVcam()
    return vcamError
  },
  start(width: number, height: number, fps: number): boolean {
    loadVcam()
    if (!vcamFns) return false
    const key = `${width}x${height}@${fps}`
    if (camera && key === cameraKey) return true
    if (camera) vcamFns.destroy(camera)
    camera = vcamFns.create(width, height, fps) || null
    cameraKey = camera ? key : ''
    return !!camera
  },
  stop(): void {
    if (camera && vcamFns) vcamFns.destroy(camera)
    camera = null
    cameraKey = ''
  },
  send(frame: Uint8Array): void {
    if (camera && vcamFns) vcamFns.send(camera, frame)
  },
  isConnected(): boolean {
    return !!(camera && vcamFns && vcamFns.connected(camera))
  }
}

window.addEventListener('beforeunload', () => vcam.stop())

// ---- IPC bridge ---------------------------------------------------------------

const api = {
  platform: process.platform,
  invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
    if (!INVOKE_CHANNELS.includes(channel)) return Promise.reject(new Error(`blocked channel ${channel}`))
    return ipcRenderer.invoke(channel, ...args) as Promise<T>
  },
  on(channel: string, cb: (payload: unknown) => void): () => void {
    if (!EVENT_CHANNELS.includes(channel)) return () => {}
    const listener = (_e: Electron.IpcRendererEvent, payload: unknown): void => cb(payload)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },
  vcam
}

contextBridge.exposeInMainWorld('carrot', api)

export type CarrotApi = typeof api
