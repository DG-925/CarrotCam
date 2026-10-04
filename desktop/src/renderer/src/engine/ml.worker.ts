/// <reference lib="webworker" />
// CarrotCam ML worker: person segmentation, face landmarks and hand gestures
// (MediaPipe Tasks, WASM + GPU). Talks to the render worker directly through a
// MessagePort; it only ever works on the newest frame, so slow models never
// delay the video itself.
import {
  FaceLandmarker,
  FilesetResolver,
  GestureRecognizer,
  ImageSegmenter,
  type NormalizedLandmark
} from '@mediapipe/tasks-vision'
import type { FaceData, FromMl, MlConfig, ToMl } from './types'

const scope = self as unknown as DedicatedWorkerGlobalScope
let port: MessagePort | null = null
let base = ''
let config: MlConfig = { segmentation: false, face: false, gestures: false }

type Fileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>
let fileset: Promise<Fileset> | null = null
let segmenter: Promise<ImageSegmenter | null> | null = null
let landmarker: Promise<FaceLandmarker | null> | null = null
let gestures: Promise<GestureRecognizer | null> | null = null
// CPU (WASM SIMD) on purpose: these models are tiny, and keeping them off the
// GPU means they never stall camera capture or the render pipeline.
let delegate: 'GPU' | 'CPU' = 'CPU'
let frameNo = 0
let gestureRun: { name: string; count: number } = { name: '', count: 0 }

function send(msg: FromMl, transfer: Transferable[] = []): void {
  port?.postMessage(msg, transfer)
}

function files(): Promise<Fileset> {
  fileset ??= FilesetResolver.forVisionTasks(`${base}mediapipe`, true)
  return fileset
}

/** Creates a task on the GPU, falling back to the CPU if WebGL is unavailable. */
async function create<T>(factory: (d: 'GPU' | 'CPU') => Promise<T>, name: string): Promise<T | null> {
  try {
    const task = await factory(delegate)
    send({ t: 'status', ready: true, delegate })
    return task
  } catch (gpuErr) {
    if (delegate === 'GPU') {
      try {
        delegate = 'CPU'
        const task = await factory('CPU')
        send({ t: 'status', ready: true, delegate })
        return task
      } catch (err) {
        send({ t: 'status', ready: false, delegate, error: `${name}: ${String(err)}` })
        return null
      }
    }
    send({ t: 'status', ready: false, delegate, error: `${name}: ${String(gpuErr)}` })
    return null
  }
}

function getSegmenter(): Promise<ImageSegmenter | null> {
  segmenter ??= files().then((fs) =>
    create(
      (d) =>
        ImageSegmenter.createFromOptions(fs, {
          baseOptions: { modelAssetPath: `${base}models/selfie_segmenter_landscape.tflite`, delegate: d },
          runningMode: 'VIDEO',
          outputCategoryMask: false,
          outputConfidenceMasks: true,
          canvas: d === 'GPU' ? new OffscreenCanvas(1, 1) : undefined
        }),
      'segmentation'
    )
  )
  return segmenter
}

function getLandmarker(): Promise<FaceLandmarker | null> {
  landmarker ??= files().then((fs) =>
    create(
      (d) =>
        FaceLandmarker.createFromOptions(fs, {
          baseOptions: { modelAssetPath: `${base}models/face_landmarker.task`, delegate: d },
          runningMode: 'VIDEO',
          numFaces: 1,
          minFaceDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
          outputFaceBlendshapes: false,
          canvas: d === 'GPU' ? new OffscreenCanvas(1, 1) : undefined
        }),
      'face'
    )
  )
  return landmarker
}

function getGestures(): Promise<GestureRecognizer | null> {
  gestures ??= files().then((fs) =>
    create(
      (d) =>
        GestureRecognizer.createFromOptions(fs, {
          baseOptions: { modelAssetPath: `${base}models/gesture_recognizer.task`, delegate: d },
          runningMode: 'VIDEO',
          numHands: 1,
          canvas: d === 'GPU' ? new OffscreenCanvas(1, 1) : undefined
        }),
      'gestures'
    )
  )
  return gestures
}

function toFace(lm: NormalizedLandmark[], aspect: number): FaceData {
  const p = (i: number): [number, number] => [lm[i].x, lm[i].y]
  // distances in source-height units
  const dist = (a: [number, number], b: [number, number]): number => Math.hypot((a[0] - b[0]) * aspect, a[1] - b[1])
  const mid = (a: [number, number], b: [number, number]): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  let x0 = 1
  let y0 = 1
  let x1 = 0
  let y1 = 0
  for (const l of lm) {
    if (l.x < x0) x0 = l.x
    if (l.y < y0) y0 = l.y
    if (l.x > x1) x1 = l.x
    if (l.y > y1) y1 = l.y
  }
  const irisA = lm.length > 473 ? p(468) : mid(p(33), p(133))
  const irisB = lm.length > 473 ? p(473) : mid(p(362), p(263))
  const eyeW = (dist(p(33), p(133)) + dist(p(362), p(263))) / 2
  const top = p(10)
  const chin = p(152)
  return {
    box: [x0, y0, x1, y1],
    leftEye: irisA,
    rightEye: irisB,
    eyeRadius: eyeW * 0.62,
    mouth: mid(p(13), p(14)),
    mouthW: dist(p(61), p(291)) / 2,
    mouthH: dist(p(13), p(14)) / 2 + 0.004,
    center: mid(top, chin),
    top,
    chin,
    jawL: p(172),
    jawR: p(397),
    faceW: dist(p(234), p(454)) / 2,
    roll: Math.atan2(irisB[1] - irisA[1], (irisB[0] - irisA[0]) * aspect)
  }
}

async function onFrame(bitmap: ImageBitmap, ts: number, aspect: number): Promise<void> {
  const t0 = performance.now()
  frameNo++
  const result: Extract<FromMl, { t: 'result' }> = { t: 'result', ts, ms: 0 }
  const transfer: Transferable[] = []
  try {
    if (config.segmentation) {
      const seg = await getSegmenter()
      if (seg) {
        const res = seg.segmentForVideo(bitmap, ts)
        const mask = res.confidenceMasks?.[0]
        if (mask) {
          const f = mask.getAsFloat32Array()
          const data = new Uint8Array(f.length)
          for (let i = 0; i < f.length; i++) data[i] = f[i] * 255
          result.mask = { data, w: mask.width, h: mask.height }
          transfer.push(data.buffer)
        }
        res.close?.()
      }
    }
    if (config.face) {
      const fl = await getLandmarker()
      if (fl) {
        const res = fl.detectForVideo(bitmap, ts)
        const lm = res.faceLandmarks?.[0]
        result.face = lm && lm.length >= 468 ? toFace(lm, aspect) : null
      }
    }
    const busy = config.segmentation || config.face
    if (config.gestures && (!busy || frameNo % 3 === 0)) {
      const gr = await getGestures()
      if (gr) {
        const res = gr.recognizeForVideo(bitmap, ts)
        const g = res.gestures?.[0]?.[0]
        const name = g && g.score > 0.65 && g.categoryName !== 'None' ? g.categoryName : ''
        if (name && name === gestureRun.name) gestureRun.count++
        else gestureRun = { name, count: name ? 1 : 0 }
        if (name && gestureRun.count === 3) send({ t: 'gesture', name })
      }
    }
  } catch (err) {
    send({ t: 'status', ready: false, delegate, error: String(err) })
  } finally {
    bitmap.close()
  }
  result.ms = performance.now() - t0
  send(result, transfer)
}

function onPortMessage(e: MessageEvent<ToMl>): void {
  const msg = e.data
  if (msg.t === 'config') {
    config = msg.config
    base = msg.base
    // warm up models as soon as they are needed so the first frame is fast
    if (config.segmentation) void getSegmenter()
    if (config.face) void getLandmarker()
    if (config.gestures) void getGestures()
  } else if (msg.t === 'frame') {
    void onFrame(msg.bitmap, msg.ts, msg.aspect)
  }
}

scope.onmessage = (e: MessageEvent<{ t: 'port'; port: MessagePort }>) => {
  if (e.data?.t === 'port') {
    port = e.data.port
    port.onmessage = onPortMessage
  }
}
