import type { EffectSettings, Reaction } from '@shared/effects'
import type { LayerSpec } from '@shared/scenes'

/** Face geometry in source uv coordinates (0..1, y down). */
export interface FaceData {
  box: [number, number, number, number]
  leftEye: [number, number]
  rightEye: [number, number]
  eyeRadius: number // in source height units
  mouth: [number, number]
  mouthW: number // half width, source height units
  mouthH: number
  center: [number, number]
  top: [number, number]
  chin: [number, number]
  jawL: [number, number]
  jawR: [number, number]
  faceW: number // half width, source height units
  roll: number // radians
}

export interface MlConfig {
  segmentation: boolean
  face: boolean
  gestures: boolean
  /** hand control: track both hands every frame and report pinches */
  hands: boolean
}

/** One tracked hand (source uv coordinates, 0..1, y down, not mirrored). */
export interface HandData {
  side: string // 'Left' | 'Right' as reported by MediaPipe
  gesture: string // MediaPipe gesture category ('None', 'Open_Palm', 'Victory', ...)
  score: number
  pinch: boolean // thumb and index finger tips touching
  x: number // pinch point (between thumb and index tips)
  y: number
  tip: [number, number] // index fingertip
  thumb: [number, number] // thumb tip
  wrist: [number, number]
  size: number // wrist -> middle knuckle, in source-height units
  fingers: [boolean, boolean, boolean, boolean, boolean] // extended: thumb, index, middle, ring, pinky
}

export type ToMl =
  | { t: 'config'; config: MlConfig; base: string }
  | { t: 'frame'; bitmap: ImageBitmap; ts: number; aspect: number }

export type FromMl =
  | { t: 'result'; ts: number; ms: number; mask?: { data: Uint8Array; w: number; h: number }; face?: FaceData | null }
  | { t: 'gesture'; name: string }
  | { t: 'hands'; hands: HandData[]; aspect: number }
  | { t: 'status'; ready: boolean; delegate: string; error?: string }

export interface EngineStats {
  fps: number
  inputFps: number
  procMs: number
  mlMs: number
  inW: number
  inH: number
  outW: number
  outH: number
  vcamFps: number
  gpu: string
}

export type ToRender =
  | {
      t: 'init'
      canvas: OffscreenCanvas
      width: number
      height: number
      mlPort: MessagePort
      base: string
    }
  | { t: 'source'; stream: ReadableStream<VideoFrame> | null; id: string | null }
  | { t: 'settings'; effects: EffectSettings }
  | { t: 'output'; width: number; height: number }
  | { t: 'vcam'; enabled: boolean }
  | { t: 'return'; buffer: ArrayBuffer | null }
  | { t: 'compare'; value: number }
  | { t: 'snapshot' }
  | { t: 'reaction'; kind: Reaction }
  | { t: 'lut'; size: number; data: Uint8Array | null }
  | { t: 'bgImage'; bitmap: ImageBitmap | null }
  | { t: 'thumbs'; ids: string[] }
  | { t: 'standbyText'; text: string }
  | { t: 'handControl'; enabled: boolean }
  | { t: 'ink'; pointer: [number, number] | null; drawing: boolean }
  | { t: 'inkClear' }
  /** Efficiency mode: lighter AI and thumbnail work for slower PCs */
  | { t: 'perf'; efficient: boolean }
  /** scenes: the active scene's layers (null = just the camera) */
  | { t: 'scene'; layers: LayerSpec[] | null }
  /** scenes: a source's pictures (video stream, still image or raw pixels) */
  | { t: 'layerStream'; key: string; stream: ReadableStream<VideoFrame> }
  | { t: 'layerImage'; key: string; bitmap: ImageBitmap }
  | { t: 'layerPixels'; key: string; fw: number; fh: number; x: number; y: number; w: number; h: number; data: ArrayBuffer }
  | { t: 'layerDrop'; key: string }
  /** live captions: a picture drawn over the whole output (null = none) */
  | { t: 'captions'; bitmap: ImageBitmap | null; rect: { x: number; y: number; w: number; h: number } }

export type FromRender =
  | { t: 'ready'; gpu: string }
  | { t: 'vcamFrame'; buffer: ArrayBuffer; width: number; height: number }
  | { t: 'stats'; stats: EngineStats }
  | { t: 'snapshot'; blob: Blob }
  | { t: 'thumbs'; bitmap: ImageBitmap; ids: string[]; cellW: number; cellH: number; cols: number }
  | { t: 'gesture'; name: string }
  | { t: 'hands'; hands: HandData[]; aspect: number }
  | { t: 'ml'; ready: boolean; delegate: string; error?: string }
  | { t: 'error'; message: string }
  | { t: 'log'; message: string }
