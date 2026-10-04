/// <reference lib="webworker" />
// CarrotCam render worker. Owns the WebGL2 pipeline:
//   source frame -> framing/reshape -> denoise -> mask -> blur -> look
//   -> stylize -> overlays -> preview canvas + virtual camera readback.
// Everything runs off the UI thread so the camera stays smooth even when the
// window is busy, hidden or minimized.
import { defaultEffects, type EffectSettings, type StyleEffect } from '@shared/effects'
import { lookUniforms, whiteBalance } from './looks'
import { AsyncReader, program, Target, texture, type Program } from './gl'
import { Framer, affineToMat3, applyAffine, invertAffine, type Affine } from './framing'
import { OverlayLayer, StandbyScreen } from './overlay'
import * as S from './shaders'
import type { EngineStats, FaceData, FromMl, FromRender, MlConfig, ToRender } from './types'

const scope = self as unknown as DedicatedWorkerGlobalScope
const post = (msg: FromRender, transfer: Transferable[] = []): void => scope.postMessage(msg, transfer)

const STYLE_INDEX: Record<StyleEffect, number> = {
  none: 0,
  glitch: 1,
  vhs: 2,
  pixel: 3,
  comic: 4,
  sketch: 5,
  thermal: 6,
  night: 7,
  posterize: 8,
  chroma: 9,
  mirror: 10,
  halftone: 11
}
const BG_INDEX = { none: 0, blur: 1, image: 2, color: 3, studio: 4, desaturate: 5 } as const
const GESTURE_REACTIONS: Record<string, Parameters<OverlayLayer['react']>[0]> = {
  Thumb_Up: 'thumbs',
  Victory: 'confetti',
  ILoveYou: 'hearts',
  Pointing_Up: 'fireworks',
  Thumb_Down: 'rain',
  Open_Palm: 'balloons'
}

// ---- state -------------------------------------------------------------------
let gl: WebGL2RenderingContext
let canvas: OffscreenCanvas
let W = 1280
let H = 720
let effects: EffectSettings = defaultEffects
let mlPort: MessagePort | null = null
let assetBase = ''

let P: Record<string, Program> = {}
let srcTex: WebGLTexture
let rawMask: WebGLTexture
let overlayTex: WebGLTexture
let bgImgTex: WebGLTexture
let lutTex: WebGLTexture
let lutSize = 2
let hasLut = false
let bgImg: { w: number; h: number } | null = null

let base: Target
let den: [Target, Target]
let denIdx = 0
let denValid = false
let maskT: [Target, Target]
let maskIdx = 0
let maskValid = false
let hasRawMask = false
let comp: Target
let styled: Target
let finalT: Target
let packT: Target
let statsT: Target
let thumbsT: Target | null = null
const down: Target[] = []
const up: Target[] = []

let vcamEnabled = false
let vcamReader: AsyncReader | null = null
let statsReader: AsyncReader | null = null
const pool: ArrayBuffer[] = []
let allocated = 0

let overlay: OverlayLayer
let standby: StandbyScreen
let framer = new Framer()

let srcW = 0
let srcH = 0
let sourceActive = false
let readerToken = 0
let currentReader: ReadableStreamDefaultReader<VideoFrame> | null = null
let lastFrameAt = 0
let lastRenderAt = performance.now()
let hasFinal = false

let compare = -1
let snapshotPending = false
let thumbIds: string[] | null = null
let lastThumbsAt = 0
let thumbCursor = 0

let face: FaceData | null = null
let faceAt = 0
let mlBusy = false
let mlSentAt = 0
let mlConfigKey = ''
let lastGestureAt = 0
let handControl = false
// air drawing (source uv, so it stays on your finger when zooming)
let inkTarget: [number, number] | null = null
let inkPointer: [number, number] | null = null
let inkDrawing = false
let strokes: [number, number][][] = []
let penDown = false

let autoGain: [number, number, number] = [1, 1, 1]
let autoTarget: [number, number, number] = [1, 1, 1]
let frameCount = 0

// stats
let statFrames = 0
let statInput = 0
let statVcam = 0
let statProc = 0
let statMl = 0
let statMlN = 0
let statAt = performance.now()
let gpuName = 'WebGL2'

// ---- setup ---------------------------------------------------------------------
function init(msg: Extract<ToRender, { t: 'init' }>): void {
  canvas = msg.canvas
  W = msg.width
  H = msg.height
  assetBase = msg.base
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance',
    desynchronized: true
  } as WebGLContextAttributes)
  if (!ctx) {
    post({ t: 'error', message: 'WebGL2 is not available on this GPU.' })
    return
  }
  gl = ctx
  try {
    const dbg = gl.getExtension('WEBGL_debug_renderer_info')
    if (dbg) gpuName = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL))
  } catch {
    /* ignore */
  }
  gl.disable(gl.DEPTH_TEST)
  gl.disable(gl.BLEND)
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)

  P = {
    frame: program(gl, S.FS_FRAME),
    denoise: program(gl, S.FS_DENOISE),
    mask: program(gl, S.FS_MASK),
    down: program(gl, S.FS_DOWN),
    up: program(gl, S.FS_UP),
    composite: program(gl, S.FS_COMPOSITE),
    style: program(gl, S.FS_STYLE),
    final: program(gl, S.FS_FINAL),
    display: program(gl, S.FS_DISPLAY),
    pack: program(gl, S.FS_PACK_BGR),
    copy: program(gl, S.FS_COPY),
    thumbs: program(gl, S.FS_THUMBS)
  }

  srcTex = texture(gl, 2, 2)
  rawMask = texture(gl, 1, 1, { internal: gl.R8, format: gl.RED })
  overlayTex = texture(gl, 2, 2)
  bgImgTex = texture(gl, 2, 2)
  lutTex = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_3D, lutTex)
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE)
  const identity = new Uint8Array([0, 0, 0, 255, 0, 0, 0, 255, 0, 255, 255, 0, 0, 0, 255, 255, 0, 255, 0, 255, 255, 255, 255, 255])
  gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGB8, 2, 2, 2, 0, gl.RGB, gl.UNSIGNED_BYTE, identity)

  overlay = new OverlayLayer(W, H)
  standby = new StandbyScreen(W, H)
  fetch(`${assetBase}logo.png`)
    .then((r) => r.blob())
    .then((b) => createImageBitmap(b))
    .then((bmp) => {
      standby.logo = bmp
      overlay.setLogo(bmp)
    })
    .catch(() => {})
  overlay.configure(effects.overlay, effects.privacy)
  allocateTargets()

  mlPort = msg.mlPort
  mlPort.onmessage = (e: MessageEvent<FromMl>) => onMl(e.data)

  canvas.addEventListener('webglcontextlost', () => post({ t: 'error', message: 'GPU context lost' }))
  setInterval(tickStandby, 1000 / 30)
  post({ t: 'ready', gpu: gpuName })
}

function allocateTargets(): void {
  ;[base, den?.[0], den?.[1], maskT?.[0], maskT?.[1], comp, styled, finalT, packT, statsT, ...down, ...up].forEach((t) =>
    t?.dispose()
  )
  down.length = 0
  up.length = 0
  base = new Target(gl, W, H)
  den = [new Target(gl, W, H), new Target(gl, W, H)]
  maskT = [new Target(gl, W >> 1, H >> 1), new Target(gl, W >> 1, H >> 1)]
  comp = new Target(gl, W, H)
  styled = new Target(gl, W, H)
  finalT = new Target(gl, W, H, gl.NEAREST)
  packT = new Target(gl, (W * 3) / 4, H, gl.NEAREST)
  statsT = new Target(gl, 32, 18)
  let w = W
  let h = H
  for (let i = 0; i < 5; i++) {
    w = Math.max(1, w >> 1)
    h = Math.max(1, h >> 1)
    down.push(new Target(gl, w, h))
    up.push(new Target(gl, w, h))
  }
  vcamReader?.dispose()
  vcamReader = new AsyncReader(gl, W * H * 3, 3)
  statsReader?.dispose()
  statsReader = new AsyncReader(gl, 32 * 18 * 4, 2)
  pool.length = 0
  allocated = 0
  denValid = false
  maskValid = false
  hasFinal = false
  overlay?.resize(W, H)
  standby?.resize(W, H)
  canvas.width = W
  canvas.height = H
  framer.reset()
}

// ---- helpers ------------------------------------------------------------------------
function use(p: Program): Program {
  gl.useProgram(p.prog)
  return p
}

function bindTex(unit: number, tex: WebGLTexture, loc: WebGLUniformLocation | null, target: number = gl.TEXTURE_2D): void {
  gl.activeTexture(gl.TEXTURE0 + unit)
  gl.bindTexture(target, tex)
  gl.uniform1i(loc, unit)
}

function draw(): void {
  gl.drawArrays(gl.TRIANGLES, 0, 3)
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return [0.1, 0.09, 0.08]
  const n = parseInt(m[1], 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

function mlConfig(): MlConfig {
  const e = effects
  const r = e.retouch
  const needsMask =
    e.privacy !== 'blur' &&
    (e.background.mode !== 'none' || e.lighting.studio > 0 || e.lighting.keyLight > 0)
  const needsFace =
    e.framing.autoFrame ||
    (e.lighting.spotlight && e.lighting.followFace) ||
    e.lighting.keyLight > 0 ||
    r.smooth > 0 ||
    r.eyes > 0 ||
    r.teeth > 0 ||
    r.faceLight > 0 ||
    r.slim > 0 ||
    r.eyeEnlarge > 0
  return { segmentation: needsMask, face: needsFace, gestures: e.overlay.gestures, hands: handControl }
}

function syncMlConfig(): void {
  const cfg = mlConfig()
  const key = JSON.stringify(cfg)
  if (key === mlConfigKey) return
  mlConfigKey = key
  mlPort?.postMessage({ t: 'config', config: cfg, base: assetBase })
  if (!cfg.segmentation) {
    hasRawMask = false
    maskValid = false
  }
  if (!cfg.face) face = null
}

function feedMl(frame: VideoFrame, now: number): void {
  if (!mlPort || mlBusy) return
  const cfg = mlConfig()
  if (!cfg.segmentation && !cfg.face && !cfg.gestures && !cfg.hands) return
  const minGap = cfg.segmentation || cfg.face ? 0 : cfg.hands ? 60 : 90
  if (now - mlSentAt < minGap) return
  mlBusy = true
  mlSentAt = now
  const aspect = frame.displayWidth / frame.displayHeight
  const tw = aspect >= 1 ? 512 : Math.round(512 * aspect)
  const th = aspect >= 1 ? Math.round(512 / aspect) : 512
  const clone = frame.clone()
  createImageBitmap(clone, { resizeWidth: tw, resizeHeight: th, resizeQuality: 'medium' })
    .then((bitmap) => {
      clone.close()
      mlPort!.postMessage({ t: 'frame', bitmap, ts: now, aspect }, [bitmap])
    })
    .catch(() => {
      clone.close()
      mlBusy = false
    })
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function smoothFace(next: FaceData): FaceData {
  if (!face || performance.now() - faceAt > 500) return next
  const k = 0.55
  const p = (a: [number, number], b: [number, number]): [number, number] => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)]
  return {
    box: [lerp(face.box[0], next.box[0], k), lerp(face.box[1], next.box[1], k), lerp(face.box[2], next.box[2], k), lerp(face.box[3], next.box[3], k)],
    leftEye: p(face.leftEye, next.leftEye),
    rightEye: p(face.rightEye, next.rightEye),
    eyeRadius: lerp(face.eyeRadius, next.eyeRadius, k),
    mouth: p(face.mouth, next.mouth),
    mouthW: lerp(face.mouthW, next.mouthW, k),
    mouthH: lerp(face.mouthH, next.mouthH, k),
    center: p(face.center, next.center),
    top: p(face.top, next.top),
    chin: p(face.chin, next.chin),
    jawL: p(face.jawL, next.jawL),
    jawR: p(face.jawR, next.jawR),
    faceW: lerp(face.faceW, next.faceW, k),
    roll: lerp(face.roll, next.roll, k)
  }
}

function onMl(msg: FromMl): void {
  if (msg.t === 'status') {
    post({ t: 'ml', ready: msg.ready, delegate: msg.delegate, error: msg.error })
    if (!msg.ready) mlBusy = false
    return
  }
  if (msg.t === 'hands') {
    if (handControl) post({ t: 'hands', hands: msg.hands, aspect: msg.aspect })
    return
  }
  if (msg.t === 'gesture') {
    const now = performance.now()
    const reaction = GESTURE_REACTIONS[msg.name]
    // with hand control on, gestures are commands (handled on the main thread)
    if (effects.overlay.gestures && !handControl && reaction && now - lastGestureAt > 2500) {
      lastGestureAt = now
      overlay.react(reaction)
      post({ t: 'gesture', name: msg.name })
    }
    return
  }
  mlBusy = false
  statMl += msg.ms
  statMlN++
  if (msg.mask) {
    gl.bindTexture(gl.TEXTURE_2D, rawMask)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, msg.mask.w, msg.mask.h, 0, gl.RED, gl.UNSIGNED_BYTE, msg.mask.data)
    hasRawMask = true
  }
  if (msg.face !== undefined) {
    if (msg.face) {
      face = smoothFace(msg.face)
      faceAt = performance.now()
    } else if (performance.now() - faceAt > 400) {
      face = null
    }
  }
}

// ---- air drawing ------------------------------------------------------
function onInk(pointer: [number, number] | null, drawing: boolean): void {
  inkTarget = pointer
  inkDrawing = drawing
  if (!pointer) inkPointer = null
  if (!pointer || !drawing) {
    penDown = false
    return
  }
  if (!penDown) {
    strokes.push([])
    penDown = true
  }
  const st = strokes[strokes.length - 1]
  const last = st[st.length - 1]
  if (!last || Math.hypot(last[0] - pointer[0], last[1] - pointer[1]) > 0.002) st.push(pointer)
  if (st.length > 2000) penDown = false // very long stroke: start a new one
  if (strokes.length > 200) strokes.shift()
}

function updateInk(toOut: (p: [number, number]) => [number, number]): void {
  // hand positions arrive ~15x a second: glide the pen between them
  if (inkTarget) {
    inkPointer = inkPointer
      ? [inkPointer[0] + (inkTarget[0] - inkPointer[0]) * 0.6, inkPointer[1] + (inkTarget[1] - inkPointer[1]) * 0.6]
      : inkTarget
  }
  const px = (p: [number, number]): [number, number] => {
    const [u, v] = toOut(p)
    return [u * W, v * H]
  }
  overlay.setInk(inkDrawing && inkPointer ? px(inkPointer) : null, strokes.map((st) => st.map(px)))
}

// ---- source handling ---------------------------------------------------------------
async function runSource(stream: ReadableStream<VideoFrame>): Promise<void> {
  const token = ++readerToken
  try {
    await currentReader?.cancel()
  } catch {
    /* ignore */
  }
  const reader = stream.getReader()
  currentReader = reader
  sourceActive = true
  framer.reset()
  denValid = false
  maskValid = false
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      if (token !== readerToken) {
        value.close()
        break
      }
      processFrame(value)
    }
  } catch {
    /* stream errored (camera unplugged / phone gone) */
  } finally {
    if (token === readerToken) {
      sourceActive = false
      currentReader = null
    }
  }
}

function stopSource(): void {
  readerToken++
  sourceActive = false
  const r = currentReader
  currentReader = null
  r?.cancel().catch(() => {})
}

function processFrame(frame: VideoFrame): void {
  const t0 = performance.now()
  statInput++
  const fw = frame.displayWidth
  const fh = frame.displayHeight
  gl.bindTexture(gl.TEXTURE_2D, srcTex)
  try {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frame)
  } catch {
    frame.close()
    return
  }
  srcW = fw
  srcH = fh
  feedMl(frame, t0)
  frame.close()
  lastFrameAt = t0
  render(t0)
  statProc += performance.now() - t0
}

function tickStandby(): void {
  if (!gl) return
  const now = performance.now()
  if (sourceActive && now - lastFrameAt < 1500) return
  if (effects.privacy === 'freeze' && hasFinal) {
    present(now)
    return
  }
  standby.draw(now / 1000)
  gl.bindTexture(gl.TEXTURE_2D, srcTex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, standby.canvas)
  // standby goes straight to the output (no effects)
  finalT.bind()
  const p = use(P.copy)
  bindTex(0, srcTex, p.u.uTex)
  draw()
  base.bind()
  draw()
  hasFinal = false
  present(now, base.tex)
}

// ---- the pipeline ----------------------------------------------------------------------
function render(now: number): void {
  const dt = Math.min(0.1, Math.max(0.001, (now - lastRenderAt) / 1000))
  lastRenderAt = now
  frameCount++
  const e = effects
  syncMlConfig()

  if (e.privacy === 'freeze' && hasFinal) {
    present(now)
    return
  }

  const faceFresh = face && now - faceAt < 700 ? face : null
  const M: Affine = framer.update(srcW, srcH, W, H, e.framing.rotate, e.framing, faceFresh, dt, now)
  const Minv = invertAffine(M)
  const mat = affineToMat3(M)
  const aspect = W / H

  // face geometry in output space
  const toOut = (p: [number, number]): [number, number] => applyAffine(Minv, p[0], p[1])
  const len = (l: number): number => Math.hypot(Minv.b * l * aspect, Minv.d * l)
  let fo: {
    c: [number, number]
    le: [number, number]
    re: [number, number]
    eyeR: number
    mouth: [number, number]
    mouthR: [number, number]
    ell: [number, number, number]
    jawL: [number, number]
    jawR: [number, number]
    jawRad: number
  } | null = null
  if (faceFresh) {
    const le = toOut(faceFresh.leftEye)
    const re = toOut(faceFresh.rightEye)
    const top = toOut(faceFresh.top)
    const chin = toOut(faceFresh.chin)
    const c: [number, number] = [(top[0] + chin[0]) / 2, (top[1] + chin[1]) / 2]
    const angle = Math.atan2(re[1] - le[1], (re[0] - le[0]) * aspect)
    const halfH = Math.hypot((chin[0] - top[0]) * aspect, chin[1] - top[1]) / 2
    fo = {
      c,
      le,
      re,
      eyeR: len(faceFresh.eyeRadius),
      mouth: toOut(faceFresh.mouth),
      mouthR: [len(faceFresh.mouthW), len(faceFresh.mouthH)],
      ell: [len(faceFresh.faceW), halfH, angle],
      jawL: toOut(faceFresh.jawL),
      jawR: toOut(faceFresh.jawR),
      jawRad: len(faceFresh.faceW) * 0.95
    }
  }

  // 1. framing + reshape
  base.bind()
  let p = use(P.frame)
  bindTex(0, srcTex, p.u.uSrc)
  gl.uniformMatrix3fv(p.u.uM, false, mat)
  gl.uniform1f(p.u.uAspect, aspect)
  const reshape = fo && (e.retouch.eyeEnlarge > 0 || e.retouch.slim > 0)
  gl.uniform1f(p.u.uEnlarge, reshape ? e.retouch.eyeEnlarge / 100 : 0)
  gl.uniform1f(p.u.uSlim, reshape ? e.retouch.slim / 100 : 0)
  if (fo) {
    gl.uniform4f(p.u.uEyes, fo.le[0], fo.le[1], fo.re[0], fo.re[1])
    gl.uniform1f(p.u.uEyeR, fo.eyeR * 1.9)
    gl.uniform4f(p.u.uJaw, fo.jawL[0], fo.jawL[1], fo.jawR[0], fo.jawR[1])
    gl.uniform2f(p.u.uFaceC, fo.c[0], fo.c[1])
    gl.uniform1f(p.u.uJawR, fo.jawRad)
  }
  draw()
  let baseTex = base.tex

  // 2. low-light temporal denoise
  if (e.lowLight > 0) {
    const cur = den[denIdx]
    const prev = den[1 - denIdx]
    cur.bind()
    p = use(P.denoise)
    bindTex(0, base.tex, p.u.uCur)
    bindTex(1, denValid ? prev.tex : base.tex, p.u.uPrev)
    gl.uniform1f(p.u.uStrength, Math.min(1, e.lowLight / 70))
    draw()
    baseTex = cur.tex
    denValid = true
    denIdx = 1 - denIdx
  } else {
    denValid = false
  }

  // 3. person mask (output space)
  const cfg = mlConfig()
  const useMask = cfg.segmentation && hasRawMask
  if (useMask) {
    const cur = maskT[maskIdx]
    const prev = maskT[1 - maskIdx]
    cur.bind()
    p = use(P.mask)
    bindTex(0, rawMask, p.u.uRaw)
    bindTex(1, prev.tex, p.u.uPrev)
    gl.uniformMatrix3fv(p.u.uM, false, mat)
    const f = e.background.feather / 100
    gl.uniform2f(p.u.uEdge, 0.45 - f * 0.3, 0.55 + f * 0.25)
    gl.uniform1f(p.u.uLerp, 0.62)
    gl.uniform1f(p.u.uHasPrev, maskValid ? 1 : 0)
    draw()
    maskValid = true
    maskIdx = 1 - maskIdx
  }
  const maskTex = maskT[1 - maskIdx].tex

  // 4. blur chain (background blur / privacy blur)
  const privacyBlur = e.privacy === 'blur' || e.privacy === 'brb'
  const bgBlur = !privacyBlur && e.background.mode === 'blur' && useMask
  let blurTex: WebGLTexture = baseTex
  if (privacyBlur || bgBlur) {
    const levels = privacyBlur ? 5 : 2 + Math.round((e.background.blur / 100) * 3)
    const offset = privacyBlur ? 1.6 : 1 + (e.background.blur / 100) * 0.7
    p = use(P.down)
    let src = baseTex
    let srcSize: [number, number] = [W, H]
    for (let i = 0; i < levels; i++) {
      down[i].bind()
      bindTex(0, src, p.u.uTex)
      bindTex(1, maskTex, p.u.uMask)
      gl.uniform2f(p.u.uTexel, 1 / srcSize[0], 1 / srcSize[1])
      gl.uniform1f(p.u.uOffset, offset)
      gl.uniform1f(p.u.uFirst, i === 0 ? 1 : 0)
      gl.uniform1f(p.u.uUseMask, bgBlur ? 1 : 0)
      draw()
      src = down[i].tex
      srcSize = [down[i].w, down[i].h]
    }
    p = use(P.up)
    for (let i = levels - 2; i >= 0; i--) {
      up[i].bind()
      bindTex(0, src, p.u.uTex)
      gl.uniform2f(p.u.uTexel, 1 / srcSize[0], 1 / srcSize[1])
      gl.uniform1f(p.u.uOffset, offset)
      draw()
      src = up[i].tex
      srcSize = [up[i].w, up[i].h]
    }
    blurTex = src
  }

  // 5. composite / look
  comp.bind()
  p = use(P.composite)
  bindTex(0, baseTex, p.u.uBase)
  bindTex(1, maskTex, p.u.uMask)
  bindTex(2, blurTex, p.u.uBlur)
  bindTex(3, bgImgTex, p.u.uBgImg)
  bindTex(4, lutTex, p.u.uLut, gl.TEXTURE_3D)
  setCompositeUniforms(p, now, useMask, privacyBlur, fo, aspect)
  draw()
  let outTex = comp.tex

  // 6. stylize
  if (e.effect.id !== 'none' && !privacyBlur) {
    styled.bind()
    p = use(P.style)
    bindTex(0, comp.tex, p.u.uTex)
    gl.uniform2f(p.u.uRes, W, H)
    gl.uniform1f(p.u.uTime, now / 1000)
    gl.uniform1i(p.u.uMode, STYLE_INDEX[e.effect.id] ?? 0)
    gl.uniform1f(p.u.uAmount, e.effect.intensity / 100)
    draw()
    outTex = styled.tex
  }

  // 7. overlays + border
  updateInk(toOut)
  if (overlay.update(dt)) {
    gl.bindTexture(gl.TEXTURE_2D, overlayTex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, overlay.canvas)
  }
  finalT.bind()
  p = use(P.final)
  bindTex(0, outTex, p.u.uTex)
  bindTex(1, overlayTex, p.u.uOverlay)
  gl.uniform1f(p.u.uHasOverlay, overlay.hasContent ? 1 : 0)
  gl.uniform2f(p.u.uRes, W, H)
  const b = e.overlay.border
  gl.uniform1f(p.u.uBorderOn, b.enabled ? 1 : 0)
  const bc = hexToRgb(b.color)
  gl.uniform3f(p.u.uBorderColor, bc[0], bc[1], bc[2])
  gl.uniform1f(p.u.uBorderW, (b.width * H) / 720)
  gl.uniform1f(p.u.uBorderR, (b.radius * H) / 720)
  draw()
  hasFinal = true

  // auto enhance statistics (every 8th frame)
  if (e.autoEnhance && frameCount % 8 === 0) {
    statsT.bind()
    p = use(P.copy)
    bindTex(0, baseTex, p.u.uTex)
    draw()
    statsReader?.read(32, 18)
  }
  if (e.autoEnhance) {
    for (let i = 0; i < 3; i++) autoGain[i] += (autoTarget[i] - autoGain[i]) * 0.06
  } else {
    autoGain = [1, 1, 1]
  }

  if (thumbIds && now - lastThumbsAt > 300) {
    lastThumbsAt = now
    renderThumbs(baseTex)
  }

  present(now, baseTex)
}

function setCompositeUniforms(
  p: Program,
  now: number,
  useMask: boolean,
  privacyBlur: boolean,
  fo: {
    c: [number, number]
    le: [number, number]
    re: [number, number]
    eyeR: number
    mouth: [number, number]
    mouthR: [number, number]
    ell: [number, number, number]
  } | null,
  aspect: number
): void {
  const e = effects
  const a = e.adjust
  const u = p.u
  gl.uniform2f(u.uRes, W, H)
  gl.uniform1f(u.uAspect, aspect)
  gl.uniform1f(u.uTime, now / 1000)

  let bgMode: number = BG_INDEX[e.background.mode] ?? 0
  if (bgMode !== 0 && !useMask) bgMode = 0
  if (privacyBlur) bgMode = 6
  gl.uniform1i(u.uBgMode, bgMode)
  gl.uniform1f(u.uHasMask, useMask ? 1 : 0)
  const bg = hexToRgb(e.background.color)
  gl.uniform3f(u.uBgColor, bg[0], bg[1], bg[2])
  if (bgImg) {
    const ia = bgImg.w / bgImg.h
    const oa = W / H
    if (oa > ia) gl.uniform2f(u.uBgImgScale, 1, ia / oa)
    else gl.uniform2f(u.uBgImgScale, oa / ia, 1)
  }
  gl.uniform1f(u.uBgImgReady, bgImg ? 1 : 0)

  const r = e.retouch
  gl.uniform1f(u.uHasFace, fo ? 1 : 0)
  if (fo) {
    gl.uniform2f(u.uFaceC, fo.c[0], fo.c[1])
    gl.uniform3f(u.uFaceEllipse, fo.ell[0], fo.ell[1], fo.ell[2])
    gl.uniform4f(u.uEyes, fo.le[0], fo.le[1], fo.re[0], fo.re[1])
    gl.uniform1f(u.uEyeR, fo.eyeR)
    gl.uniform2f(u.uMouth, fo.mouth[0], fo.mouth[1])
    gl.uniform2f(u.uMouthR, fo.mouthR[0] * 1.15, fo.mouthR[1] * 1.6)
  }
  gl.uniform1f(u.uSmooth, r.smooth / 100)
  gl.uniform1f(u.uEyeBright, r.eyes / 100)
  gl.uniform1f(u.uTeeth, r.teeth / 100)
  gl.uniform1f(u.uFaceLight, r.faceLight / 100)
  gl.uniform1f(u.uSharp, a.sharpness / 100)

  const l = e.lighting
  gl.uniform1f(u.uSpotOn, l.spotlight ? 1 : 0)
  const spotC: [number, number] = l.followFace && fo ? [fo.c[0], fo.c[1] - fo.ell[1] * 0.15] : [0.5, 0.45]
  gl.uniform2f(u.uSpotC, spotC[0], spotC[1])
  gl.uniform1f(u.uSpotI, l.spotIntensity / 100)
  gl.uniform1f(u.uSpotSize, l.spotSize / 100)
  gl.uniform1f(u.uSpotSoft, l.spotSoftness / 100)
  const w = l.spotWarmth / 100
  gl.uniform3f(u.uSpotTint, 1 + 0.12 * w, 1 + 0.02 * w, 1 - 0.14 * w)
  gl.uniform1f(u.uStudio, useMask ? l.studio / 100 : 0)
  gl.uniform1f(u.uKey, useMask && fo ? l.keyLight / 100 : 0)
  const ka = (l.keyAngle * Math.PI) / 180
  gl.uniform2f(u.uKeyDir, Math.cos(ka), Math.sin(ka))

  gl.uniform3f(u.uAutoGain, autoGain[0], autoGain[1], autoGain[2])
  gl.uniform1f(u.uLowLight, e.lowLight / 100)
  gl.uniform1f(u.uExposure, (a.exposure / 100) * 1.5)
  const wb = whiteBalance(a.temperature / 100, a.tint / 100)
  gl.uniform3f(u.uWB, wb[0], wb[1], wb[2])
  gl.uniform1f(u.uBrightness, a.brightness / 100)
  gl.uniform1f(u.uContrast, a.contrast / 100)
  gl.uniform1f(u.uHighlights, a.highlights / 100)
  gl.uniform1f(u.uShadows, a.shadows / 100)
  gl.uniform1f(u.uHue, (a.hue * Math.PI) / 180)
  gl.uniform1f(u.uSaturation, a.saturation / 100)
  gl.uniform1f(u.uVibrance, a.vibrance / 100)
  gl.uniform1f(u.uFade, a.fade / 100)

  const look = lookUniforms(e.filter.id)
  const lookMix = e.filter.id === 'original' ? 0 : e.filter.intensity / 100
  gl.uniform1f(u.uVignette, Math.min(1, a.vignette / 100 + look.vignette * lookMix))
  gl.uniform1f(u.uGrain, Math.min(1, a.grain / 100 + look.grain * lookMix))
  gl.uniform1f(u.uLookMix, lookMix)
  gl.uniform1f(u.uLExposure, look.exposure)
  gl.uniform3fv(u.uLWB, look.wb)
  gl.uniform3fv(u.uLLift, look.lift)
  gl.uniform3fv(u.uLGamma, look.gamma)
  gl.uniform3fv(u.uLGain, look.gain)
  gl.uniform1f(u.uLSat, look.saturation)
  gl.uniform1f(u.uLContrast, look.contrast)
  gl.uniform3fv(u.uLShadows, look.shadows)
  gl.uniform3fv(u.uLHighlights, look.highlights)
  gl.uniform3fv(u.uLBw, look.bw)
  gl.uniform1f(u.uLBwOn, look.bwOn)
  gl.uniform1f(u.uLFade, look.fade)

  gl.uniform1f(u.uLutOn, hasLut && e.lut.enabled ? 1 : 0)
  gl.uniform1f(u.uLutMix, e.lut.intensity / 100)
  gl.uniform1f(u.uLutSize, lutSize)
}

/** Shows the frame in the preview and feeds the virtual camera. */
function present(now: number, origTex?: WebGLTexture): void {
  // preview
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  gl.viewport(0, 0, W, H)
  let p = use(P.display)
  bindTex(0, finalT.tex, p.u.uTex)
  bindTex(1, origTex ?? finalT.tex, p.u.uOrig)
  gl.uniform2f(p.u.uRes, W, H)
  const showCompare = compare >= 0 && !snapshotPending && !!origTex
  gl.uniform1f(p.u.uCompare, showCompare ? compare : -1)
  draw()
  statFrames++

  if (snapshotPending) {
    snapshotPending = false
    canvas
      .convertToBlob({ type: 'image/png' })
      .then((blob) => post({ t: 'snapshot', blob }))
      .catch((err) => post({ t: 'error', message: `Snapshot failed: ${err}` }))
  }

  // virtual camera readback (async, never stalls the GPU)
  if (vcamEnabled && vcamReader) {
    packT.bind()
    p = use(P.pack)
    bindTex(0, finalT.tex, p.u.uTex)
    draw()
    vcamReader.read(packT.w, packT.h)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }
  collectReadbacks()
  schedulePoll()
  maybePostStats(now)
}

// Poll finished GPU readbacks every few ms so the virtual camera gets each
// frame as soon as the GPU is done with it (instead of one frame later).
let pollTimer: ReturnType<typeof setTimeout> | null = null
function schedulePoll(): void {
  if (pollTimer || !(vcamReader?.pending() || statsReader?.pending())) return
  pollTimer = setTimeout(() => {
    pollTimer = null
    collectReadbacks()
    schedulePoll()
  }, 2)
}

function collectReadbacks(): void {
  if (vcamReader) {
    const bytes = W * H * 3
    vcamReader.collect(
      () => {
        const b = pool.pop()
        if (b && b.byteLength === bytes) return b
        if (allocated < 4) {
          allocated++
          return new ArrayBuffer(bytes)
        }
        return null
      },
      (buffer) => {
        statVcam++
        post({ t: 'vcamFrame', buffer, width: W, height: H }, [buffer])
      }
    )
  }
  if (statsReader) {
    statsReader.collect(
      () => new ArrayBuffer(32 * 18 * 4),
      (buf) => {
        const px = new Uint8Array(buf)
        let r = 0
        let g = 0
        let b = 0
        const n = 32 * 18
        for (let i = 0; i < n; i++) {
          r += px[i * 4]
          g += px[i * 4 + 1]
          b += px[i * 4 + 2]
        }
        r /= n * 255
        g /= n * 255
        b /= n * 255
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
        const exp = Math.min(1.7, Math.max(0.75, Math.pow(0.46 / Math.max(lum, 0.02), 0.6)))
        const avg = (r + g + b) / 3
        const wb = [avg / Math.max(r, 0.01), avg / Math.max(g, 0.01), avg / Math.max(b, 0.01)].map((v) =>
          Math.min(1.12, Math.max(0.88, 1 + (v - 1) * 0.55))
        )
        autoTarget = [exp * wb[0], exp * wb[1], exp * wb[2]]
      }
    )
  }
}

function maybePostStats(now: number): void {
  const elapsed = now - statAt
  if (elapsed < 1000) return
  const s = elapsed / 1000
  const stats: EngineStats = {
    fps: Math.round(statFrames / s),
    inputFps: Math.round(statInput / s),
    procMs: statInput ? +(statProc / statInput).toFixed(1) : 0,
    mlMs: statMlN ? +(statMl / statMlN).toFixed(1) : 0,
    inW: srcW,
    inH: srcH,
    outW: W,
    outH: H,
    vcamFps: Math.round(statVcam / s),
    gpu: gpuName
  }
  post({ t: 'stats', stats })
  statFrames = statInput = statVcam = statMlN = 0
  statProc = statMl = 0
  statAt = now
}

function renderThumbs(baseTex: WebGLTexture): void {
  if (!thumbIds) return
  // the shader takes 24 looks per pass: rotate through longer lists
  if (thumbCursor >= thumbIds.length) thumbCursor = 0
  const ids = thumbIds.slice(thumbCursor, thumbCursor + 24)
  thumbCursor += 24
  const cols = 4
  const rows = Math.ceil(ids.length / cols)
  const cw = 192
  const ch = 108
  if (!thumbsT || thumbsT.w !== cols * cw || thumbsT.h !== rows * ch) {
    thumbsT?.dispose()
    thumbsT = new Target(gl, cols * cw, rows * ch)
  }
  thumbsT.bind()
  const p = use(P.thumbs)
  bindTex(0, baseTex, p.u.uTex)
  gl.uniform2f(p.u.uGrid, cols, rows)
  const wb = new Float32Array(72)
  const pp = new Float32Array(96)
  const sh = new Float32Array(72)
  const hi = new Float32Array(72)
  const bw = new Float32Array(96)
  const lift = new Float32Array(72)
  const gain = new Float32Array(72)
  ids.forEach((id, i) => {
    const l = lookUniforms(id)
    wb.set(l.wb, i * 3)
    pp.set([l.exposure, l.saturation, l.contrast, l.fade], i * 4)
    sh.set(l.shadows, i * 3)
    hi.set(l.highlights, i * 3)
    bw.set([...l.bw, l.bwOn], i * 4)
    lift.set(l.lift, i * 3)
    gain.set(l.gain, i * 3)
  })
  gl.uniform3fv(p.u.uWB, wb)
  gl.uniform4fv(p.u.uP, pp)
  gl.uniform3fv(p.u.uSh, sh)
  gl.uniform3fv(p.u.uHi, hi)
  gl.uniform4fv(p.u.uBw, bw)
  gl.uniform3fv(p.u.uLift, lift)
  gl.uniform3fv(p.u.uGain, gain)
  draw()
  const pixels = new Uint8ClampedArray(thumbsT.w * thumbsT.h * 4)
  gl.readPixels(0, 0, thumbsT.w, thumbsT.h, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
  const image = new ImageData(pixels, thumbsT.w, thumbsT.h)
  createImageBitmap(image).then((bitmap) =>
    post({ t: 'thumbs', bitmap, ids, cellW: cw, cellH: ch, cols }, [bitmap])
  )
}

// ---- messages ------------------------------------------------------------------------
scope.onmessage = (e: MessageEvent<ToRender>) => {
  const msg = e.data
  switch (msg.t) {
    case 'init':
      init(msg)
      break
    case 'source':
      if (msg.stream) void runSource(msg.stream)
      else stopSource()
      break
    case 'settings': {
      const prevPrivacy = effects.privacy
      effects = msg.effects
      if (overlay) overlay.configure(effects.overlay, effects.privacy)
      if (prevPrivacy === 'freeze' && effects.privacy !== 'freeze') lastRenderAt = performance.now()
      if (gl) syncMlConfig()
      break
    }
    case 'output':
      if (msg.width !== W || msg.height !== H) {
        W = msg.width
        H = msg.height
        if (gl) allocateTargets()
      }
      break
    case 'vcam':
      vcamEnabled = msg.enabled
      break
    case 'return':
      if (msg.buffer && msg.buffer.byteLength === W * H * 3 && pool.length < 4) pool.push(msg.buffer)
      else allocated = Math.max(0, allocated - 1)
      break
    case 'compare':
      compare = msg.value
      break
    case 'snapshot':
      snapshotPending = true
      if (!sourceActive) tickStandby()
      break
    case 'reaction':
      overlay?.react(msg.kind)
      break
    case 'lut':
      if (!gl) break
      if (msg.data) {
        gl.bindTexture(gl.TEXTURE_3D, lutTex)
        gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGB8, msg.size, msg.size, msg.size, 0, gl.RGB, gl.UNSIGNED_BYTE, msg.data)
        lutSize = msg.size
        hasLut = true
      } else {
        hasLut = false
      }
      break
    case 'bgImage':
      if (!gl) break
      if (msg.bitmap) {
        gl.bindTexture(gl.TEXTURE_2D, bgImgTex)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, msg.bitmap)
        bgImg = { w: msg.bitmap.width, h: msg.bitmap.height }
        msg.bitmap.close()
      } else {
        bgImg = null
      }
      break
    case 'thumbs':
      thumbIds = msg.ids.length ? msg.ids : null
      thumbCursor = 0
      lastThumbsAt = 0
      break
    case 'ink':
      onInk(msg.pointer, msg.drawing)
      break
    case 'inkClear':
      strokes = []
      penDown = false
      break
    case 'handControl':
      handControl = msg.enabled
      if (gl) syncMlConfig()
      break
    case 'standbyText':
      if (standby) standby.text = msg.text
      break
  }
}

