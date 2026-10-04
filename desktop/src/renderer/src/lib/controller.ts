// Wires the engine, phones, local cameras, IPC and the store together.
import { IPC, type AppSettings, type ConnectedDevice, type DriverStatus, type ServerInfo, type UpdateState } from '@shared/app'
import type { EffectSettings, PrivacyMode, Reaction } from '@shared/effects'
import type { PhoneToPc, RemoteState, StreamConfig } from '@shared/protocol'
import { Engine } from '@/engine/host'
import { LOOKS } from '@/engine/looks'
import { PhoneLink } from '@/phone/link'
import { HandControl, type HandCommand } from './hands'
import { invoke, on } from './ipc'
import { idb } from './idb'
import { parseCube } from './cube'
import { renderBuiltIn } from './backgrounds'
import { BUILT_IN_PRESETS } from './presets'
import { toast, useStore } from './store'

export let engine: Engine
const links = new Map<string, PhoneLink>()
let localStream: MediaStream | null = null
let recorder: MediaRecorder | null = null
let recordChunks: Blob[] = []
let recordMic: MediaStream | null = null
let selectToken = 0
let remoteTimer: ReturnType<typeof setTimeout> | null = null
let hands: HandControl | null = null

const st = () => useStore.getState()

// ---- theme --------------------------------------------------------------------------
const media = window.matchMedia('(prefers-color-scheme: dark)')
function applyTheme(): void {
  const mode = st().app.theme
  const dark = mode === 'dark' || (mode === 'system' && media.matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  useStore.setState({ dark })
  void invoke(IPC.setTheme, dark)
}

// ---- settings -----------------------------------------------------------------------
export async function updateApp(patch: Partial<AppSettings>): Promise<void> {
  const next = await invoke<AppSettings>(IPC.settingsSet, patch)
  useStore.setState({ app: next })
  if (patch.theme) applyTheme()
  if (patch.output) engine.setOutput(next.output.width, next.output.height, next.output.fps)
  if (patch.handControl !== undefined) applyHandControl(next.handControl)
}

// ---- hand control -------------------------------------------------------------------
function applyHandControl(enabled: boolean): void {
  engine.setHandControl(enabled)
  if (!enabled) {
    hands?.reset()
    engine.setInk(null, false)
    useStore.setState({ handHint: null })
  }
}

/** Air drawing on/off (while on, the pointing finger draws). */
export function toggleDrawing(): void {
  const on = !st().inkMode
  useStore.setState({ inkMode: on })
  if (!on) clearDrawing() // drawing off also wipes the board
  if (on && !st().app.handControl) void updateApp({ handControl: true })
  toast(
    on
      ? { kind: 'info', title: 'Drawing on', body: 'Point with your index finger to draw. Hold an open palm to erase.' }
      : { kind: 'info', title: 'Drawing off', body: 'The drawing was cleared.' }
  )
}

export function clearDrawing(): void {
  engine.clearInk()
}

/** Phone: front/back camera. Webcam: next webcam. */
export function switchCamera(): void {
  const src = st().source
  if (src.kind === 'phone' && src.id) {
    phoneCommand(src.id.slice(6), 'switchCamera')
    toast({ kind: 'info', title: 'Switching phone camera' })
    return
  }
  const cams = st().cameras
  if (cams.length > 1) {
    const i = cams.findIndex((c) => `cam:${c.id}` === src.id)
    void selectSource(`cam:${cams[(i + 1) % cams.length].id}`)
    return
  }
  toast({ kind: 'info', title: 'No other camera to switch to', body: 'Connect your phone to switch between its front and back camera.' })
}

export async function toggleHandControl(): Promise<void> {
  const on = !st().app.handControl
  await updateApp({ handControl: on })
  toast(
    on
      ? { kind: 'info', title: 'Hand control on', body: 'Pinch with both hands and pull apart to zoom. Hold an open palm to reset.' }
      : { kind: 'info', title: 'Hand control off' }
  )
}

function cycleFilter(step: number): void {
  const i = LOOKS.findIndex((l) => l.id === st().effects.filter.id)
  const next = LOOKS[(i + step + LOOKS.length) % LOOKS.length]
  st().updateEffects((e) => {
    e.filter.id = next.id
  })
  toast({ kind: 'info', title: `Filter: ${next.name}` })
}

function onHandCommand(c: HandCommand): void {
  const { effects, updateEffects } = st()
  switch (c) {
    case 'reset':
      if (st().inkMode) {
        clearDrawing()
        toast({ kind: 'info', title: 'Drawing erased' })
        break
      }
      updateEffects((e) => {
        e.framing.zoom = 1
        e.framing.panX = 0
        e.framing.panY = 0
      })
      toast({ kind: 'info', title: 'View reset' })
      break
    case 'snapshot':
      toast({ kind: 'info', title: 'Smile! Snapshot in 2 seconds' })
      setTimeout(() => void takeSnapshot(), 2000)
      break
    case 'nextFilter':
      cycleFilter(1)
      break
    case 'prevFilter':
      cycleFilter(-1)
      break
    case 'follow':
      updateEffects((e) => {
        e.framing.autoFrame = !e.framing.autoFrame
      })
      toast({ kind: 'info', title: effects.framing.autoFrame ? 'Follow me off' : 'Follow me on' })
      break
    case 'brb':
      setPrivacy('brb')
      break
    case 'draw':
      toggleDrawing()
      break
    case 'blur':
      updateEffects((e) => {
        e.background.mode = e.background.mode === 'blur' ? 'none' : 'blur'
      })
      toast({ kind: 'info', title: effects.background.mode === 'blur' ? 'Background blur off' : 'Background blur on' })
      break
    case 'hearts':
      engine.react('hearts')
      break
  }
}

function createHandControl(): HandControl {
  return new HandControl({
    view: () => {
      const f = st().effects.framing
      return { zoom: f.zoom, panX: f.panX, panY: f.panY }
    },
    setView: (v) => {
      const wasFollowing = st().effects.framing.autoFrame
      st().updateEffects((e) => {
        e.framing.zoom = v.zoom
        e.framing.panX = v.panX
        e.framing.panY = v.panY
        e.framing.autoFrame = false // your hands are in charge now
      })
      if (wasFollowing) toast({ kind: 'info', title: 'Follow me paused', body: 'Hand zoom took over. Hold a point-up gesture to turn it back on.' })
    },
    command: onHandCommand,
    hint: (handHint) => useStore.setState({ handHint }),
    pointer: (p) => engine.setInk(p, st().inkMode),
    drawing: () => st().inkMode
  })
}

// ---- virtual camera -----------------------------------------------------------------
async function setVcam(enabled: boolean): Promise<void> {
  if (enabled) {
    const driver = await invoke<DriverStatus>(IPC.driverStatus)
    useStore.setState({ driver })
    if (driver.supported && !driver.upToDate) {
      const installed = await invoke<DriverStatus>(IPC.driverInstall)
      useStore.setState({ driver: installed })
    }
  }
  const running = engine.setVcam(enabled)
  useStore.setState({
    vcam: {
      ...st().vcam,
      running,
      available: window.carrot.vcam.available(),
      error: enabled && !running ? (window.carrot.vcam.error() ?? 'The virtual camera could not start.') : null
    }
  })
  pushRemoteState()
}

// ---- sources ------------------------------------------------------------------------
function streamConfig(): StreamConfig {
  const s = st().app.stream
  const dims = s.resolution === '4k' ? [3840, 2160] : s.resolution === '720p' ? [1280, 720] : [1920, 1080]
  return { width: dims[0], height: dims[1], fps: s.fps, bitrate: s.bitrate }
}

async function stopCurrentSource(): Promise<void> {
  const src = st().source
  if (src.kind === 'phone' && src.id) links.get(src.id.slice(6))?.stop()
  localStream?.getTracks().forEach((t) => t.stop())
  localStream = null
  engine.setSource(null)
}

export async function selectSource(id: string | null): Promise<void> {
  const token = ++selectToken
  await stopCurrentSource()
  if (!id) {
    useStore.setState({ source: { id: null, label: 'No camera', kind: null, state: 'idle' } })
    engine.setStandbyText('Connect your phone or pick a camera')
    pushRemoteState()
    return
  }
  void invoke(IPC.settingsSet, { lastSource: id })

  if (id.startsWith('phone:')) {
    const deviceId = id.slice(6)
    const device = st().devices.find((d) => d.id === deviceId)
    const label = device?.info.name ?? 'Phone'
    useStore.setState({ source: { id, label, kind: 'phone', state: 'connecting' } })
    engine.setStandbyText(`Connecting to ${label}…`)
    const link = links.get(deviceId)
    if (!link) {
      useStore.setState({ source: { id, label, kind: 'phone', state: 'error', error: 'Phone is not connected' } })
      return
    }
    try {
      const track = await link.start(streamConfig())
      if (token !== selectToken) return
      engine.setSource(track, id)
      useStore.setState({ source: { id, label, kind: 'phone', state: 'live' } })
    } catch (err) {
      if (token !== selectToken) return
      useStore.setState({ source: { id, label, kind: 'phone', state: 'error', error: String((err as Error).message) } })
      toast({ kind: 'error', title: `Couldn't start ${label}`, body: (err as Error).message })
    }
  } else if (id.startsWith('cam:')) {
    const deviceId = id.slice(4)
    const cam = st().cameras.find((c) => c.id === deviceId)
    const label = cam?.label ?? 'Camera'
    useStore.setState({ source: { id, label, kind: 'camera', state: 'connecting' } })
    try {
      const out = st().app.output
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: { exact: deviceId },
          width: { ideal: Math.max(1920, out.width) },
          height: { ideal: Math.max(1080, out.height) },
          frameRate: { ideal: Math.max(30, out.fps) }
        },
        audio: false
      })
      if (token !== selectToken) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      localStream = stream
      const track = stream.getVideoTracks()[0]
      track.onended = () => {
        if (st().source.id === id) {
          useStore.setState({ source: { id, label, kind: 'camera', state: 'error', error: 'Camera disconnected' } })
        }
      }
      engine.setSource(track, id)
      useStore.setState({ source: { id, label, kind: 'camera', state: 'live' } })
    } catch (err) {
      useStore.setState({ source: { id, label, kind: 'camera', state: 'error', error: String((err as Error).message) } })
      toast({ kind: 'error', title: `Couldn't open ${label}`, body: (err as Error).message })
    }
  }
  pushRemoteState()
}

export async function refreshCameras(): Promise<void> {
  try {
    const list = await navigator.mediaDevices.enumerateDevices()
    const cameras = list
      .filter((d) => d.kind === 'videoinput' && !/carrotcam/i.test(d.label))
      .map((d, i) => ({ id: d.deviceId, label: d.label || `Camera ${i + 1}` }))
    useStore.setState({ cameras })
  } catch {
    useStore.setState({ cameras: [] })
  }
}

function onDevices(devices: ConnectedDevice[]): void {
  const prev = st().devices
  useStore.setState({ devices })
  const { app } = st()
  // new phones get a link
  for (const d of devices) {
    if (!links.has(d.id)) {
      const link = new PhoneLink(d.id, { lowLatency: app.stream.lowLatency, codec: app.stream.codec })
      link.onStats = (s) => useStore.setState({ linkStats: { ...st().linkStats, [d.id]: s } })
      link.onEnded = () => {
        const src = st().source
        if (src.id === `phone:${d.id}` && src.state === 'live' && st().devices.some((x) => x.id === d.id)) {
          // media dropped but the phone is still around: renegotiate
          void selectSource(src.id)
        }
      }
      links.set(d.id, link)
      if (!prev.some((p) => p.id === d.id)) {
        toast({ kind: 'success', title: `${d.info.name} connected`, body: d.info.model || undefined })
      }
    }
  }
  // gone phones
  for (const [id, link] of links) {
    if (!devices.some((d) => d.id === id)) {
      link.dispose()
      links.delete(id)
      if (st().source.id === `phone:${id}`) {
        engine.setSource(null)
        engine.setStandbyText('Phone disconnected — waiting for it to come back…')
        useStore.setState({ source: { ...st().source, state: 'connecting' } })
      }
    }
  }
  // auto select a newly connected phone when it is the one we were using
  // (reconnect), when nothing is live, or when the current source failed
  const src = st().source
  // a phone that reconnected (new session, same id) needs a new stream
  const fresh = devices.filter((d) => !prev.some((p) => p.id === d.id && p.connectedAt === d.connectedAt))
  const pick =
    fresh.find((d) => src.id === `phone:${d.id}`) ??
    (src.state !== 'live' && src.state !== 'connecting' ? fresh.find((d) => app.lastSource === `phone:${d.id}`) ?? fresh[0] : undefined)
  if (pick) void selectSource(`phone:${pick.id}`)
  pushRemoteState()
}

// ---- phone messages -----------------------------------------------------------------
function onPhoneMessage({ deviceId, msg }: { deviceId: string; msg: PhoneToPc }): void {
  const link = links.get(deviceId)
  switch (msg.t) {
    case 'offer':
    case 'ice':
      void link?.handle(msg)
      break
    case 'status':
      useStore.setState({ phoneStatus: { ...st().phoneStatus, [deviceId]: { ...st().phoneStatus[deviceId], ...msg.status } } })
      break
    case 'remote':
      void onRemote(deviceId, msg.action, msg.value)
      break
    case 'bye':
      if (st().source.id === `phone:${deviceId}`) engine.setStandbyText('Phone paused')
      break
  }
}

export function phoneCommand(deviceId: string, action: string, value?: unknown): void {
  links.get(deviceId)?.command(action, value)
}

async function onRemote(deviceId: string, action: string, value: unknown): Promise<void> {
  const { updateEffects, effects } = st()
  switch (action) {
    case 'useMe':
      await selectSource(`phone:${deviceId}`)
      break
    case 'filter':
      updateEffects((e) => {
        e.filter.id = String(value)
      })
      break
    case 'nextFilter': {
      const i = LOOKS.findIndex((l) => l.id === effects.filter.id)
      updateEffects((e) => {
        e.filter.id = LOOKS[(i + 1) % LOOKS.length].id
      })
      break
    }
    case 'background':
      updateEffects((e) => {
        e.background.mode = value === 'blur' ? 'blur' : value === 'studio' ? 'studio' : 'none'
      })
      break
    case 'autoFrame':
      updateEffects((e) => {
        e.framing.autoFrame = !!value
      })
      break
    case 'spotlight':
      updateEffects((e) => {
        e.lighting.spotlight = !!value
      })
      break
    case 'retouch':
      updateEffects((e) => {
        e.retouch.smooth = value ? 45 : 0
        e.retouch.faceLight = value ? 30 : 0
        e.retouch.eyes = value ? 25 : 0
      })
      break
    case 'privacy':
      setPrivacy(String(value) as PrivacyMode)
      break
    case 'reaction':
      engine.react(String(value) as Reaction)
      break
    case 'snapshot':
      await takeSnapshot()
      break
    case 'record':
      await toggleRecording()
      break
    case 'preset': {
      const p = BUILT_IN_PRESETS.find((x) => x.id === value)
      if (p) st().replaceEffects(p.effects, p.id)
      break
    }
  }
}

function remoteState(): RemoteState {
  const { effects: e, recording } = st()
  return {
    active: false,
    vcam: true,
    filter: e.filter.id,
    background: e.background.mode,
    autoFrame: e.framing.autoFrame,
    spotlight: e.lighting.spotlight,
    retouch: e.retouch.smooth > 0,
    privacy: e.privacy,
    recording: recording.active
  }
}

function pushRemoteState(): void {
  if (remoteTimer) clearTimeout(remoteTimer)
  remoteTimer = setTimeout(() => {
    const base = remoteState()
    for (const d of st().devices) {
      const state = { ...base, active: st().source.id === `phone:${d.id}` }
      void invoke(IPC.serverSend, d.id, { t: 'state', state })
    }
  }, 120)
}

// ---- actions ------------------------------------------------------------------------
export function setPrivacy(mode: PrivacyMode): void {
  const current = st().effects.privacy
  const next = current === mode ? 'off' : mode
  st().updateEffects((e) => {
    e.privacy = next
  })
  const labels: Record<PrivacyMode, string> = {
    off: 'Privacy off',
    blur: 'Privacy blur on',
    brb: '"Be right back" on',
    freeze: 'Frame frozen'
  }
  toast({ kind: 'info', title: labels[next] })
}

export async function takeSnapshot(): Promise<void> {
  try {
    const blob = await engine.snapshot()
    const path = await invoke<string>(IPC.saveFile, 'photo', 'png', await blob.arrayBuffer())
    let copied = false
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      copied = true
    } catch {
      /* clipboard unavailable */
    }
    flash()
    toast({
      kind: 'success',
      title: copied ? 'Snapshot saved & copied' : 'Snapshot saved',
      body: path.split(/[\\/]/).pop(),
      action: { label: 'Show', run: () => void invoke(IPC.showItem, path) }
    })
  } catch (err) {
    toast({ kind: 'error', title: 'Snapshot failed', body: String((err as Error).message) })
  }
}

function flash(): void {
  const el = document.createElement('div')
  el.className = 'shutter-flash'
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 500)
}

export async function toggleRecording(): Promise<void> {
  if (recorder) {
    recorder.stop()
    return
  }
  const fps = st().app.output.fps
  const stream = engine.captureStream(fps)
  if (st().app.recordAudio) {
    try {
      recordMic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true } })
      recordMic.getAudioTracks().forEach((t) => stream.addTrack(t))
    } catch {
      toast({ kind: 'info', title: 'Recording without microphone' })
    }
  }
  const types = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1', 'video/webm;codecs=vp9,opus', 'video/webm']
  const mimeType = types.find((t) => MediaRecorder.isTypeSupported(t)) ?? ''
  recordChunks = []
  recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: st().app.output.height >= 1080 ? 12_000_000 : 8_000_000 })
  recorder.ondataavailable = (e) => e.data.size && recordChunks.push(e.data)
  recorder.onstop = async () => {
    const ext = mimeType.includes('mp4') ? 'mp4' : 'webm'
    const blob = new Blob(recordChunks, { type: mimeType || 'video/webm' })
    recordChunks = []
    recorder = null
    stream.getTracks().forEach((t) => t.stop())
    recordMic?.getTracks().forEach((t) => t.stop())
    recordMic = null
    useStore.setState({ recording: { active: false, startedAt: 0 } })
    pushRemoteState()
    try {
      const path = await invoke<string>(IPC.saveFile, 'video', ext, await blob.arrayBuffer())
      toast({
        kind: 'success',
        title: 'Recording saved',
        body: path.split(/[\\/]/).pop(),
        action: { label: 'Show', run: () => void invoke(IPC.showItem, path) }
      })
    } catch (err) {
      toast({ kind: 'error', title: 'Could not save recording', body: String(err) })
    }
  }
  recorder.start(1000)
  st().set({ compare: false })
  engine.setCompare(null)
  useStore.setState({ recording: { active: true, startedAt: Date.now() } })
  pushRemoteState()
}

export async function importLut(file: File): Promise<void> {
  try {
    const lut = parseCube(await file.text())
    await idb.set('lut', { name: lut.title || file.name.replace(/\.cube$/i, ''), size: lut.size, data: lut.data })
    engine.setLut(lut.size, lut.data.slice())
    st().updateEffects((e) => {
      e.lut = { enabled: true, name: lut.title || file.name.replace(/\.cube$/i, ''), intensity: 100 }
    })
    toast({ kind: 'success', title: 'LUT imported', body: `${lut.size}³ color grade` })
  } catch (err) {
    toast({ kind: 'error', title: 'Could not read LUT', body: String((err as Error).message) })
  }
}

export async function setBackgroundImage(source: { file?: File; builtIn?: string } | null): Promise<void> {
  if (!source) {
    await engine.setBackgroundImage(null)
    return
  }
  let blob: Blob | null = null
  let id: string
  if (source.builtIn) {
    blob = await renderBuiltIn(source.builtIn)
    id = source.builtIn
  } else {
    blob = source.file!
    id = `user:${Date.now().toString(36)}`
    await idb.set(`bg:${id}`, blob)
    const list = ((await idb.get<string[]>('bg:list')) ?? []).filter((x) => x !== id)
    await idb.set('bg:list', [id, ...list].slice(0, 8))
  }
  if (!blob) return
  await engine.setBackgroundImage(blob)
  st().updateEffects((e) => {
    e.background.mode = 'image'
    e.background.imageId = id
  })
}

export async function userBackgrounds(): Promise<{ id: string; url: string }[]> {
  const list = (await idb.get<string[]>('bg:list')) ?? []
  const out: { id: string; url: string }[] = []
  for (const id of list) {
    const blob = await idb.get<Blob>(`bg:${id}`)
    if (blob) out.push({ id, url: URL.createObjectURL(blob) })
  }
  return out
}

/** Deletes a background the user added; falls back to no background if it was in use. */
export async function deleteUserBackground(id: string): Promise<void> {
  await idb.del(`bg:${id}`)
  const list = ((await idb.get<string[]>('bg:list')) ?? []).filter((x) => x !== id)
  await idb.set('bg:list', list)
  if (st().effects.background.imageId === id) {
    await engine.setBackgroundImage(null)
    st().updateEffects((e) => {
      e.background.imageId = null
      if (e.background.mode === 'image') e.background.mode = 'none'
    })
  }
}

export async function selectStoredBackground(id: string): Promise<void> {
  if (id.startsWith('bi:')) return setBackgroundImage({ builtIn: id })
  const blob = await idb.get<Blob>(`bg:${id}`)
  if (!blob) return
  await engine.setBackgroundImage(blob)
  st().updateEffects((e) => {
    e.background.mode = 'image'
    e.background.imageId = id
  })
}

async function restoreAssets(e: EffectSettings): Promise<void> {
  const lut = await idb.get<{ size: number; data: Uint8Array }>('lut').catch(() => undefined)
  if (lut) engine.setLut(lut.size, lut.data.slice())
  if (e.background.imageId) {
    if (e.background.imageId.startsWith('bi:')) {
      const blob = await renderBuiltIn(e.background.imageId)
      if (blob) await engine.setBackgroundImage(blob)
    } else {
      const blob = await idb.get<Blob>(`bg:${e.background.imageId}`).catch(() => undefined)
      if (blob) await engine.setBackgroundImage(blob)
    }
  }
}

function onShortcut(action: string): void {
  switch (action) {
    case 'privacy-blur':
      setPrivacy('blur')
      break
    case 'privacy-brb':
      setPrivacy('brb')
      break
    case 'privacy-freeze':
      setPrivacy('freeze')
      break
    case 'privacy-off':
      if (st().effects.privacy !== 'off') setPrivacy(st().effects.privacy)
      break
    case 'snapshot':
      void takeSnapshot()
      break
  }
}

// ---- bootstrap ----------------------------------------------------------------------
export async function initController(): Promise<void> {
  const app = await invoke<AppSettings>(IPC.settingsGet)
  useStore.setState({ app })
  applyTheme()
  media.addEventListener('change', applyTheme)

  engine = new Engine(app.output.width, app.output.height)
  engine.events = {
    stats: (stats) => useStore.setState({ stats }),
    ready: (gpu) => useStore.setState({ gpu }),
    error: (message) => toast({ kind: 'error', title: 'Video engine', body: message }),
    ml: (ml) => {
      useStore.setState({ ml })
      if (ml.error) console.warn('[ml]', ml.error)
    },
    gesture: (name) => toast({ kind: 'info', title: `Gesture: ${name.replace(/_/g, ' ')}` }),
    hands: (list, aspect) => {
      if (st().app.handControl) hands?.update(list, aspect)
    }
  }
  hands = createHandControl()
  engine.setOutput(app.output.width, app.output.height, app.output.fps)
  engine.setEffects(st().effects)
  engine.setHandControl(app.handControl)
  useStore.subscribe((s, p) => {
    if (s.effects !== p.effects) {
      engine.setEffects(s.effects)
      pushRemoteState()
    }
  })
  void restoreAssets(st().effects)
  useStore.setState({ ready: true })

  // IPC events
  on(IPC.evDevices, (d: ConnectedDevice[]) => onDevices(d))
  on(IPC.evMessage, (m: { deviceId: string; msg: PhoneToPc }) => onPhoneMessage(m))
  on(IPC.evServer, (info: ServerInfo) => useStore.setState({ server: { ...st().server, ...info } }))
  on(IPC.evUpdate, (u: UpdateState) => useStore.setState({ update: u }))
  on(IPC.evShortcut, (a: string) => onShortcut(a))
  on(IPC.evTray, (a: string) => onShortcut(a))
  on(IPC.evSettings, () => applyTheme())

  const [server, devices, update] = await Promise.all([
    invoke<ServerInfo>(IPC.serverInfo),
    invoke<ConnectedDevice[]>(IPC.serverDevices),
    invoke<UpdateState>(IPC.updateGet)
  ])
  useStore.setState({ server, update })

  navigator.mediaDevices.addEventListener('devicechange', () => void refreshCameras())
  await refreshCameras()

  await setVcam(true)
  setInterval(() => {
    const inUse = window.carrot.vcam.isConnected()
    if (inUse !== st().vcam.inUse) useStore.setState({ vcam: { ...st().vcam, inUse } })
  }, 1500)

  onDevices(devices)
  // restore the last local camera if no phone is around
  if (!st().source.id && app.lastSource?.startsWith('cam:') && st().cameras.some((c) => `cam:${c.id}` === app.lastSource)) {
    void selectSource(app.lastSource)
  }
}
