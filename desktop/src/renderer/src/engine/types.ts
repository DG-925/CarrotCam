import type { EffectSettings, Reaction } from '@shared/effects'

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
}

export type ToMl =
  | { t: 'config'; config: MlConfig; base: string }
  | { t: 'frame'; bitmap: ImageBitmap; ts: number; aspect: number }

export type FromMl =
  | { t: 'result'; ts: number; ms: number; mask?: { data: Uint8Array; w: number; h: number }; face?: FaceData | null }
  | { t: 'gesture'; name: string }
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

export type FromRender =
  | { t: 'ready'; gpu: string }
  | { t: 'vcamFrame'; buffer: ArrayBuffer; width: number; height: number }
  | { t: 'stats'; stats: EngineStats }
  | { t: 'snapshot'; blob: Blob }
  | { t: 'thumbs'; bitmap: ImageBitmap; ids: string[]; cellW: number; cellH: number; cols: number }
  | { t: 'gesture'; name: string }
  | { t: 'ml'; ready: boolean; delegate: string; error?: string }
  | { t: 'error'; message: string }
  | { t: 'log'; message: string }
