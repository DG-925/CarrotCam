// Runs the sources of the active scene: starts screen/window captures, video
// files, web pages, cameras and text when they are needed, stops them when
// they are not, and tells the render worker how to lay them out.
import { IPC, type CaptureSource } from '@shared/app'
import { isPlainCamera, type LayerSpec, type SceneSource, type TextStyle } from '@shared/scenes'
import { engine, startPhoneLayer, stopPhoneLayer } from './controller'
import { idb } from './idb'
import { invoke, on } from './ipc'
import { mixer } from './mixer'
import { layoutRect, mediaKey, useScenes } from './scenes'
import { useStore } from './store'

interface Running {
  sig: string
  stop: () => void
}

const running = new Map<string, Running>()
let started = false

const sc = () => useScenes.getState()
const outAspect = (): number => {
  const o = useStore.getState().app.output
  return o.width / o.height
}

function setStatus(sourceIds: string[], state: 'loading' | 'live' | 'error', message?: string): void {
  const status = { ...sc().status }
  for (const id of sourceIds) status[id] = { state, message }
  useScenes.setState({ status })
}

function setSize(key: string, w: number, h: number): void {
  if (!w || !h) return
  const prev = sc().sizes[key]
  if (prev && prev.w === w && prev.h === h) return
  useScenes.setState({ sizes: { ...sc().sizes, [key]: { w, h } } })
  // text: keep the height (its scale) and follow the new width, so it never stretches
  if (prev && key.startsWith('txt:')) {
    const id = key.slice(4)
    const src = sc().scenes.flatMap((x) => x.sources).find((x) => x.id === id)
    if (src && !sc().toFit.includes(id)) sc().updateSource(id, { rect: { ...src.rect, w: (src.rect.h * (w / h)) / outAspect() } })
  }
  fitPending()
}

/** New sources get a sensible first position once their size is known. */
function fitPending(): void {
  const { toFit, sizes } = sc()
  if (!toFit.length) return
  const left: string[] = []
  for (const id of toFit) {
    const src = sc().activeScene().sources.find((s) => s.id === id) ?? sc().scenes.flatMap((x) => x.sources).find((s) => s.id === id)
    if (!src) continue
    const key = mediaKey(src)
    const size = key ? sizes[key] : undefined
    if (!size) {
      left.push(id)
      continue
    }
    const aspect = size.w / size.h
    const where = src.kind === 'device' ? 'corner-br' : src.kind === 'image' ? 'center' : src.kind === 'text' ? 'corner-tl' : 'fit'
    let rect = layoutRect(where, aspect, outAspect())
    if (src.kind === 'text') {
      // text keeps its natural size (font size is in 720p pixels)
      const w = size.w / (720 * outAspect())
      const h = size.h / 720
      rect = { x: 0.04, y: 0.06, w, h }
    }
    sc().updateSource(id, { rect })
  }
  useScenes.setState({ toFit: left })
}

// ---- starting each kind -----------------------------------------------------------------

async function startCapture(key: string, src: SceneSource, ids: string[]): Promise<() => void> {
  const efficient = useStore.getState().efficient
  const open = (id: string): Promise<MediaStream> =>
    navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: id,
          maxWidth: 1920,
          maxHeight: 1080,
          maxFrameRate: efficient ? 15 : 30
        }
      }
    } as unknown as MediaStreamConstraints)
  let stream: MediaStream
  try {
    stream = await open(src.settings.captureId!)
  } catch (err) {
    // window ids change after a restart: find the window again by its name
    if (src.kind !== 'window' || !src.settings.captureName) throw err
    const list = await invoke<CaptureSource[]>(IPC.captureSources, 'window')
    const match = list.find((w) => w.name === src.settings.captureName)
    if (!match) throw new Error(`“${src.settings.captureName}” is not open`)
    for (const s of sc().scenes.flatMap((x) => x.sources)) {
      if (s.settings.captureName === src.settings.captureName) sc().updateSource(s.id, { settings: { captureId: match.id } })
    }
    throw new Error('restart') // the id changed: sync() starts the new key
  }
  const track = stream.getVideoTracks()[0]
  const s = track.getSettings()
  setSize(key, s.width ?? 1920, s.height ?? 1080)
  track.onended = () => setStatus(ids, 'error', src.kind === 'window' ? 'The window was closed' : 'Capture stopped')
  engine.setLayerTrack(key, track)
  return () => track.stop()
}

async function startImage(key: string, src: SceneSource): Promise<() => void> {
  const blob = await idb.get<Blob>(`src:${src.settings.fileId}`)
  if (!blob) throw new Error('The image file is missing')
  const bitmap = await createImageBitmap(blob, { resizeWidth: undefined })
  setSize(key, bitmap.width, bitmap.height)
  engine.setLayerImage(key, bitmap)
  return () => {}
}

async function startVideo(key: string, src: SceneSource): Promise<() => void> {
  const blob = await idb.get<Blob>(`src:${src.settings.fileId}`)
  if (!blob) throw new Error('The video file is missing')
  const url = URL.createObjectURL(blob)
  const el = document.createElement('video')
  el.src = url
  el.loop = src.settings.loop !== false
  el.playsInline = true
  el.preload = 'auto'
  const detach = mixer.attachMedia(el)
  await el.play()
  const stream = (el as HTMLVideoElement & { captureStream: () => MediaStream }).captureStream()
  const track = stream.getVideoTracks()[0]
  if (!track) throw new Error('This video has no picture')
  setSize(key, el.videoWidth, el.videoHeight)
  engine.setLayerTrack(key, track)
  return () => {
    el.pause()
    detach()
    track.stop()
    el.removeAttribute('src')
    el.load()
    URL.revokeObjectURL(url)
  }
}

async function startWeb(key: string, src: SceneSource): Promise<() => void> {
  const w = src.settings.width ?? 1280
  const h = src.settings.height ?? 720
  const ok = await invoke<boolean>(IPC.webOpen, key, src.settings.url ?? '', w, h, useStore.getState().efficient ? 15 : 30)
  if (!ok) throw new Error('That is not a web address')
  setSize(key, w, h)
  return () => void invoke(IPC.webClose, key)
}

export function renderText(t: TextStyle): ImageBitmap | null {
  const scale = useStore.getState().app.output.height / 720
  const size = Math.max(8, t.size) * scale
  const font = `${t.bold ? 700 : 500} ${size}px 'Segoe UI Variable Display', 'Segoe UI', Inter, system-ui, sans-serif`
  const lines = (t.text || ' ').split('\n').slice(0, 20)
  const measure = new OffscreenCanvas(1, 1).getContext('2d')!
  measure.font = font
  const pad = t.background ? size * 0.4 : size * 0.1
  const width = Math.ceil(Math.max(...lines.map((l) => measure.measureText(l).width), 1) + pad * 2)
  const lineH = size * 1.25
  const height = Math.ceil(lines.length * lineH + pad * 2)
  const canvas = new OffscreenCanvas(Math.min(4096, width), Math.min(4096, height))
  const ctx = canvas.getContext('2d')!
  if (t.background) {
    ctx.fillStyle = t.background
    ctx.beginPath()
    ctx.roundRect(0, 0, canvas.width, canvas.height, size * 0.25)
    ctx.fill()
  }
  ctx.font = font
  ctx.fillStyle = t.color
  ctx.textBaseline = 'middle'
  ctx.textAlign = t.align
  const x = t.align === 'left' ? pad : t.align === 'right' ? canvas.width - pad : canvas.width / 2
  if (!t.background) {
    ctx.shadowColor = 'rgba(0,0,0,0.45)'
    ctx.shadowBlur = size * 0.12
  }
  lines.forEach((l, i) => ctx.fillText(l, x, pad + lineH * (i + 0.5)))
  return canvas.transferToImageBitmap()
}

async function startText(key: string, src: SceneSource): Promise<() => void> {
  const bmp = src.settings.textStyle ? renderText(src.settings.textStyle) : null
  if (!bmp) throw new Error('Nothing to show')
  const scale = useStore.getState().app.output.height / 720
  setSize(key, bmp.width / scale, bmp.height / scale)
  engine.setLayerImage(key, bmp)
  return () => {}
}

async function startDevice(key: string, src: SceneSource): Promise<() => void> {
  const id = src.settings.deviceId ?? ''
  if (id.startsWith('phone:')) {
    const phone = id.slice(6)
    const track = await startPhoneLayer(phone)
    const s = track.getSettings()
    setSize(key, s.width ?? 1280, s.height ?? 720)
    engine.setLayerTrack(key, track)
    return () => stopPhoneLayer(phone)
  }
  if (useStore.getState().source.id === id) throw new Error('This camera is already the main camera')
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { deviceId: { exact: id.replace(/^cam:/, '') }, width: { ideal: 1280 }, height: { ideal: 720 } }
  })
  const track = stream.getVideoTracks()[0]
  const s = track.getSettings()
  setSize(key, s.width ?? 1280, s.height ?? 720)
  engine.setLayerTrack(key, track)
  return () => track.stop()
}

/** What makes a source need a restart when it changes. */
function signature(src: SceneSource): string {
  const s = src.settings
  switch (src.kind) {
    case 'web':
      return `${s.url}|${s.width}|${s.height}`
    case 'text':
      return JSON.stringify(s.textStyle)
    case 'video':
      return `${s.fileId}|${s.loop}`
    default:
      return mediaKey(src) ?? ''
  }
}

function start(key: string, src: SceneSource, ids: string[]): void {
  setStatus(ids, 'loading')
  let stopped = false
  let stopFn: () => void = () => {}
  const entry: Running = {
    sig: signature(src),
    stop: () => {
      stopped = true
      stopFn()
      engine.dropLayer(key)
    }
  }
  running.set(key, entry)
  const run =
    src.kind === 'screen' || src.kind === 'window'
      ? startCapture(key, src, ids)
      : src.kind === 'image'
        ? startImage(key, src)
        : src.kind === 'video'
          ? startVideo(key, src)
          : src.kind === 'web'
            ? startWeb(key, src)
            : src.kind === 'text'
              ? startText(key, src)
              : startDevice(key, src)
  run
    .then((fn) => {
      if (stopped) fn()
      else {
        stopFn = fn
        setStatus(ids, 'live')
      }
    })
    .catch((err) => {
      const message = String((err as Error)?.message ?? err)
      if (message === 'restart') {
        running.delete(key)
        return
      }
      if (running.get(key) === entry) setStatus(ids, 'error', message)
    })
}

// ---- syncing with the active scene ---------------------------------------------------------

let syncQueued = false
export function sync(): void {
  if (syncQueued) return
  syncQueued = true
  queueMicrotask(() => {
    syncQueued = false
    doSync()
  })
}

function hexToRgba(hex: string): [number, number, number, number] {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1]
}

function doSync(): void {
  if (!engine) return
  const scene = sc().activeScene()
  const wanted = new Map<string, { src: SceneSource; ids: string[] }>()
  for (const s of scene.sources) {
    if (!s.visible || s.kind === 'camera' || s.kind === 'color') continue
    const key = mediaKey(s)
    if (!key) continue
    const w = wanted.get(key)
    if (w) w.ids.push(s.id)
    else wanted.set(key, { src: s, ids: [s.id] })
  }
  // stop what is no longer needed or changed
  for (const [key, r] of running) {
    const w = wanted.get(key)
    if (!w || w.src && signature(w.src) !== r.sig) {
      r.stop()
      running.delete(key)
    }
  }
  for (const [key, w] of wanted) if (!running.has(key)) start(key, w.src, w.ids)

  const layers: LayerSpec[] = scene.sources
    .filter((s) => s.visible)
    .map((s) => ({
      key: s.kind === 'color' ? null : mediaKey(s),
      rect: s.rect,
      crop: s.crop,
      opacity: s.opacity,
      radius: s.radius,
      color: s.kind === 'color' ? hexToRgba(s.settings.color ?? '#000000') : undefined,
      bgra: s.kind === 'web'
    }))
  engine.setScene(isPlainCamera(scene) ? null : layers)
}

/** Starts following the scenes store (called once the engine exists). */
export function initSources(): void {
  if (started) return
  started = true
  useScenes.subscribe((s, p) => {
    if (s.scenes !== p.scenes || s.active !== p.active) sync()
  })
  useStore.subscribe((s, p) => {
    // a camera used as a source can become the main camera (and back)
    if (s.source.id !== p.source.id || s.devices !== p.devices) sync()
  })
  on(IPC.evWebFrame, (f: { key: string; fw: number; fh: number; x: number; y: number; w: number; h: number; data: Uint8Array }) => {
    if (!running.has(f.key)) return
    const data = f.data.byteOffset === 0 && f.data.byteLength === f.data.buffer.byteLength ? f.data.buffer : f.data.slice().buffer
    engine.setLayerPixels(f.key, { fw: f.fw, fh: f.fh, x: f.x, y: f.y, w: f.w, h: f.h, data: data as ArrayBuffer })
  })
  sync()
}

/** Restarts one source (e.g. "Reload" on a web page, "Try again" after an error). */
export function restartSource(src: SceneSource): void {
  const key = mediaKey(src)
  if (!key) return
  if (src.kind === 'web' && running.has(key)) {
    void invoke(IPC.webReload, key)
    return
  }
  running.get(key)?.stop()
  running.delete(key)
  sync()
}

// ---- scene switching (buttons, hotkeys, voice, phone) -----------------------------------------
export function switchScene(target: number | 'next' | 'prev' | string): boolean {
  const { scenes, active } = sc()
  let scene
  if (typeof target === 'number') scene = scenes[target - 1]
  else if (target === 'next' || target === 'prev') {
    const i = scenes.findIndex((s) => s.id === active)
    scene = scenes[(i + (target === 'next' ? 1 : -1) + scenes.length) % scenes.length]
  } else scene = scenes.find((s) => s.id === target)
  if (!scene) return false
  sc().setActive(scene.id)
  return true
}
