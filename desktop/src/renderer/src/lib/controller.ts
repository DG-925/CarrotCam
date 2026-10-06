// Wires the engine, phones, local cameras, IPC and the store together.
import {
  IPC,
  type AppInfo,
  type AppSettings,
  type CaptureItem,
  type ConnectedDevice,
  type DriverStatus,
  type ServerInfo,
  type UpdateState
} from '@shared/app'
import type { EffectSettings, PrivacyMode, Reaction } from '@shared/effects'
import type { PhoneToPc, RemoteState, StreamConfig } from '@shared/protocol'
import { Engine } from '@/engine/host'
import { LOOKS } from '@/engine/looks'
import { PhoneLink } from '@/phone/link'
import { HandControl, type HandCommand } from './hands'
import { invoke, on } from './ipc'
import { onThumbs } from './thumbs'
import { VoiceControl } from './voice'
import { VOICE_COMMANDS, type Heard, type VoiceCommand } from './voice-commands'
import { WHATS_NEW } from './whats-new'
import { mixer } from './mixer'
import { useScenes } from './scenes'
import { initSources, switchScene } from './sources'
import { idb } from './idb'
import { parseCube } from './cube'
import { renderBuiltIn } from './backgrounds'
import { BUILT_IN_PRESETS } from './presets'
import { toast, useStore } from './store'

export let engine: Engine
const links = new Map<string, PhoneLink>()
let localStream: MediaStream | null = null
let recorder: MediaRecorder | null = null
let selectToken = 0
let remoteTimer: ReturnType<typeof setTimeout> | null = null
let hands: HandControl | null = null
let voice: VoiceControl | null = null

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
  if (patch.efficiency) applyEfficiency()
  if (patch.voice) applyVoice(next.voice, prevVoice)
  if (patch.mixer || patch.voice) mixer.configure(next.mixer, next.voice.micId)
}
let prevVoice: AppSettings['voice'] | null = null

// ---- efficiency mode ----------------------------------------------------------------
/** A slower PC: few cores or little memory. */
export function isLowEndPc(): boolean {
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8
  return navigator.hardwareConcurrency <= 4 || memory <= 4
}

function applyEfficiency(): void {
  const mode = st().app.efficiency
  const efficient = mode === 'on' || (mode === 'auto' && isLowEndPc())
  useStore.setState({ efficient })
  document.documentElement.dataset.efficient = efficient ? 'on' : 'off'
  engine.setEfficient(efficient)
}

// ---- voice --------------------------------------------------------------------------
const LISTEN_MS = 6000
const SILENT_COMMANDS = new Set<VoiceCommand>(['blurOn', 'blurOff', 'followOn', 'followOff', 'zoomIn', 'zoomOut', 'zoomReset', 'mirror', 'noFilter', 'drawClear'])

function applyVoice(v: AppSettings['voice'], prev: AppSettings['voice'] | null): void {
  prevVoice = { ...v }
  if (!v.enabled) {
    if (voice?.running || st().voice.status !== 'off') voice?.stop()
    return
  }
  if (!voice) {
    voice = new VoiceControl({
      status: (status, error) => useStore.setState({ voice: { ...st().voice, status, error, level: 0 } }),
      heard: onHeard,
      level: (level) => {
        if (st().page === 'controls') useStore.setState({ voice: { ...st().voice, level } })
      }
    })
  }
  // (re)start when turned on or when the microphone changed
  if (!voice.running || !prev?.enabled || prev.micId !== v.micId) void voice.start(v.micId)
}

/** Ctrl + Alt + Space: listen for one command without saying "Carrot" first. */
export function listenOnce(): void {
  if (!st().app.voice.enabled) {
    toast({
      kind: 'info',
      title: 'Voice control is off',
      body: 'Turn it on to control CarrotCam with your voice.',
      action: { label: 'Turn on', run: () => void updateApp({ voice: { ...st().app.voice, enabled: true } }) }
    })
    return
  }
  useStore.setState({ voice: { ...st().voice, listenUntil: Date.now() + LISTEN_MS } })
  setTimeout(() => {
    if (st().voice.listenUntil && st().voice.listenUntil <= Date.now()) useStore.setState({ voice: { ...st().voice, listenUntil: 0 } })
  }, LISTEN_MS + 50)
}

function onHeard(h: Heard): void {
  const v = st().voice
  const listening = v.listenUntil > Date.now()
  const app = st().app.voice
  // with the wake word required, plain commands only count right after Ctrl + Alt + Space
  const run = !!h.command && (h.wake || listening || !app.wakeWord)
  // keep the log useful: skip stray single words from background talk
  const worthLogging = !!h.command || h.wake || h.text.split(' ').length >= 2
  useStore.setState({
    voice: {
      ...v,
      listenUntil: run ? 0 : v.listenUntil,
      heard: worthLogging ? [{ ...h, at: Date.now(), ran: run }, ...v.heard].slice(0, 8) : v.heard
    }
  })
  if (h.wake && !h.command) {
    // "Carrot" on its own: listen for the command that follows
    useStore.setState({ voice: { ...st().voice, listenUntil: Date.now() + LISTEN_MS } })
    return
  }
  if (run && h.command) {
    runVoiceCommand(h.command)
    // commands that don't already show their own message or animation
    const info = VOICE_COMMANDS.find((c) => c.command === h.command)
    if (info && SILENT_COMMANDS.has(h.command)) toast({ kind: 'info', title: info.label })
  }
}

function runVoiceCommand(c: VoiceCommand): void {
  const rec = st().recording.active
  switch (c) {
    case 'snapshot':
      void takeSnapshot()
      break
    case 'recordStart':
      if (!rec) void toggleRecording()
      break
    case 'recordStop':
      if (rec) void toggleRecording()
      break
    case 'brb':
      setPrivacy('brb')
      break
    case 'privacyOn':
      if (st().effects.privacy !== 'blur') setPrivacy('blur')
      break
    case 'freeze':
      if (st().effects.privacy !== 'freeze') setPrivacy('freeze')
      break
    case 'privacyOff':
      if (st().effects.privacy !== 'off') setPrivacy(st().effects.privacy)
      break
    case 'blurOn':
      setBlur(true)
      break
    case 'blurOff':
      setBlur(false)
      break
    case 'followOn':
      setFollow(true)
      break
    case 'followOff':
      setFollow(false)
      break
    case 'zoomIn':
      zoomBy(1.4)
      break
    case 'zoomOut':
      zoomBy(1 / 1.4)
      break
    case 'zoomReset':
      zoomBy(0)
      break
    case 'mirror':
      st().updateEffects((e) => void (e.framing.mirror = !e.framing.mirror))
      break
    case 'switchCamera':
      switchCamera()
      break
    case 'nextFilter':
      cycleFilter(1)
      break
    case 'prevFilter':
      cycleFilter(-1)
      break
    case 'noFilter':
      st().updateEffects((e) => void (e.filter.id = 'original'))
      break
    case 'hearts':
    case 'confetti':
    case 'fireworks':
    case 'balloons':
    case 'thumbs':
    case 'rain':
      engine.react(c)
      break
    case 'drawOn':
      if (!st().inkMode) toggleDrawing()
      break
    case 'drawOff':
      if (st().inkMode) toggleDrawing()
      break
    case 'drawClear':
      clearDrawing()
      break
    case 'sceneNext':
    case 'scenePrev':
    case 'scene1':
    case 'scene2':
    case 'scene3':
    case 'scene4':
    case 'scene5':
      if (switchScene(c === 'sceneNext' ? 'next' : c === 'scenePrev' ? 'prev' : Number(c.slice(5)))) {
        toast({ kind: 'info', title: `Scene: ${useScenes.getState().activeScene().name}` })
      }
      break
  }
}

// ---- shared camera actions (buttons, hands and voice) --------------------------------
export function setFollow(on: boolean): void {
  if (st().effects.framing.autoFrame === on) return
  st().updateEffects((e) => {
    e.framing.autoFrame = on
  })
}

export function setBlur(on: boolean): void {
  st().updateEffects((e) => {
    if (on) e.background.mode = 'blur'
    else if (e.background.mode === 'blur') e.background.mode = 'none'
  })
}

/** Multiplies the zoom (0 resets it). Turns Follow me off: you are framing by hand. */
export function zoomBy(factor: number): void {
  st().updateEffects((e) => {
    const z = factor === 0 ? 1 : Math.min(4, Math.max(1, e.framing.zoom * factor))
    e.framing.zoom = Number(z.toFixed(3))
    if (z <= 1.001) {
      e.framing.panX = 0
      e.framing.panY = 0
    }
    if (factor !== 0) e.framing.autoFrame = false
  })
}

// ---- hand control -------------------------------------------------------------------
function applyHandControl(enabled: boolean): void {
  engine.setHandControl(enabled)
  if (!enabled) {
    hands?.reset()
    engine.setInk(null, false)
    useStore.setState({ handHint: null, handProgress: null })
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
      setFollow(!effects.framing.autoFrame)
      toast({ kind: 'info', title: effects.framing.autoFrame ? 'Follow me off' : 'Follow me on' })
      break
    case 'brb':
      setPrivacy('brb')
      break
    case 'draw':
      toggleDrawing()
      break
    case 'blur':
      setBlur(effects.background.mode !== 'blur')
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
    hint: (handHint, handProgress) => useStore.setState({ handHint, handProgress }),
    pointer: (p) => engine.setInk(p, st().inkMode),
    drawing: () => st().inkMode,
    options: () => st().app.gestures
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
      if (token !== selectToken) return // another camera was picked meanwhile
      const e = err as Error
      const message =
        e.name === 'NotReadableError'
          ? 'Another app is using this camera. Close it and try again.'
          : e.name === 'NotAllowedError'
            ? 'Camera access was blocked.'
            : e.message
      useStore.setState({ source: { id, label, kind: 'camera', state: 'error', error: message } })
      toast({ kind: 'error', title: `Couldn't open ${label}`, body: message })
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
      const link = new PhoneLink(d.id, () => ({ lowLatency: st().app.stream.lowLatency, codec: st().app.stream.codec }))
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

/** Scenes: a second phone as a picture-in-picture source. */
export async function startPhoneLayer(deviceId: string): Promise<MediaStreamTrack> {
  if (st().source.id === `phone:${deviceId}`) throw new Error('This phone is already the main camera')
  const link = links.get(deviceId)
  if (!link) throw new Error('The phone is not connected')
  return link.start(streamConfig())
}

export function stopPhoneLayer(deviceId: string): void {
  if (st().source.id !== `phone:${deviceId}`) links.get(deviceId)?.stop()
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
    case 'scene':
      switchScene(Number(value) + 1)
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
    recording: recording.active,
    scenes: useScenes.getState().scenes.map((s) => s.name),
    scene: useScenes.getState().scenes.findIndex((s) => s.id === useScenes.getState().active)
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
    void refreshCaptures()
    toast({
      kind: 'success',
      title: copied ? 'Snapshot saved and copied' : 'Snapshot saved',
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
    if (recorder.state !== 'inactive') recorder.stop()
    return
  }
  const fps = st().app.output.fps
  const stream = engine.captureStream(fps)
  // sound: the mixer (microphone, desktop audio, video sources)
  await mixer.hold('record')
  const audio = mixer.track()
  if (audio) stream.addTrack(audio)
  if (st().app.mixer.mic.on && mixer.error('mic')) toast({ kind: 'info', title: 'Recording without the microphone', body: mixer.error('mic') ?? undefined })
  const types = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1', 'video/webm;codecs=vp9,opus', 'video/webm']
  const mimeType = types.find((t) => MediaRecorder.isTypeSupported(t)) ?? ''
  const ext = mimeType.includes('mp4') ? 'mp4' : 'webm'
  // every chunk goes straight to the file: memory stays flat on long recordings
  const fileId = await invoke<number>(IPC.recordOpen, ext)
  let writes: Promise<unknown> = Promise.resolve()
  let failed = false
  const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: st().app.output.height >= 1080 ? 12_000_000 : 8_000_000 })
  recorder = rec
  rec.ondataavailable = (e) => {
    if (!e.data.size) return
    writes = writes
      .then(async () => {
        const ok = await invoke<boolean>(IPC.recordWrite, fileId, await e.data.arrayBuffer())
        if (!ok) throw new Error('The recording file is closed')
      })
      .catch((err) => {
        if (!failed) toast({ kind: 'error', title: 'Recording could not be saved', body: String((err as Error).message ?? err) })
        failed = true
      })
  }
  rec.onstop = async () => {
    recorder = null
    stream.getTracks().forEach((t) => t.stop())
    mixer.release('record')
    useStore.setState({ recording: { active: false, startedAt: 0 } })
    pushRemoteState()
    await writes
    const path = await invoke<string | null>(IPC.recordClose, fileId)
    void refreshCaptures()
    if (path && !failed) {
      toast({
        kind: 'success',
        title: 'Recording saved',
        body: path.split(/[\\/]/).pop(),
        action: { label: 'Show', run: () => void invoke(IPC.showItem, path) }
      })
    }
  }
  rec.start(1000)
  st().set({ compare: false })
  engine.setCompare(null)
  useStore.setState({ recording: { active: true, startedAt: Date.now() } })
  pushRemoteState()
}

/** Newest snapshots and recordings, for the Studio and the Gallery. */
export async function refreshCaptures(): Promise<void> {
  try {
    useStore.setState({ captures: await invoke<CaptureItem[]>(IPC.capturesList) })
  } catch {
    /* folder unavailable */
  }
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
    case 'voice-listen':
      listenOnce()
      break
    default:
      if (action.startsWith('scene-')) {
        const n = Number(action.slice(6))
        if (switchScene(n)) toast({ kind: 'info', title: `Scene: ${useScenes.getState().activeScene().name}` })
      }
  }
}

// ---- bootstrap ----------------------------------------------------------------------
export async function initController(): Promise<void> {
  const [app, info] = await Promise.all([invoke<AppSettings>(IPC.settingsGet), invoke<AppInfo>(IPC.appInfo)])
  useStore.setState({ app, version: info.version })
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
    },
    thumbs: onThumbs
  }
  hands = createHandControl()
  engine.setOutput(app.output.width, app.output.height, app.output.fps)
  engine.setEffects(st().effects)
  engine.setHandControl(app.handControl)
  applyEfficiency()
  mixer.configure(app.mixer, app.voice.micId)
  initSources()
  useScenes.subscribe((s, p) => {
    if (s.active !== p.active || s.scenes !== p.scenes) pushRemoteState()
  })
  useStore.subscribe((s, p) => {
    if (s.effects !== p.effects) {
      engine.setEffects(s.effects)
      pushRemoteState()
    }
  })
  void restoreAssets(st().effects)
  // What's new after an update (new installs see the setup guide instead)
  const whatsNew = app.welcomed && app.lastSeenVersion !== info.version
  if (whatsNew && !WHATS_NEW.some((n) => n.version === info.version)) void invoke(IPC.settingsSet, { lastSeenVersion: info.version })
  useStore.setState({ ready: true, whatsNewOpen: whatsNew && WHATS_NEW.some((n) => n.version === info.version) })

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
  void refreshCaptures()
  applyVoice(app.voice, null)
  // restore the last local camera if no phone is around
  if (!st().source.id && app.lastSource?.startsWith('cam:') && st().cameras.some((c) => `cam:${c.id}` === app.lastSource)) {
    void selectSource(app.lastSource)
  }
}
