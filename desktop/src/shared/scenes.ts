// Scenes and sources: what goes into the CarrotCam picture besides the camera.
// Positions are fractions of the output picture (0..1, y down).

export type SourceKind = 'camera' | 'screen' | 'window' | 'image' | 'video' | 'web' | 'text' | 'color' | 'device'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** Fraction cut from each edge of the source. */
export interface Crop {
  l: number
  t: number
  r: number
  b: number
}

export interface TextStyle {
  text: string
  size: number // px at 720p
  color: string
  background: string | null
  bold: boolean
  align: 'left' | 'center' | 'right'
}

export interface SourceSettings {
  /** screen / window: desktopCapturer id; window also matched by name after a restart */
  captureId?: string
  captureName?: string
  /** image / video: file stored in IndexedDB */
  fileId?: string
  fileName?: string
  loop?: boolean
  /** web page */
  url?: string
  width?: number
  height?: number
  /** text */
  textStyle?: TextStyle
  /** color */
  color?: string
  /** device: 'cam:<deviceId>' or 'phone:<id>' */
  deviceId?: string
  deviceLabel?: string
  /** video files: volume in recordings (0..1) */
  volume?: number
}

export interface SceneSource {
  id: string
  kind: SourceKind
  name: string
  visible: boolean
  locked: boolean
  rect: Rect
  crop: Crop
  opacity: number // 0..1
  radius: number // rounded corners, px at 720p
  settings: SourceSettings
}

export interface Scene {
  id: string
  name: string
  /** bottom first, the last one is in front */
  sources: SceneSource[]
}

export interface ScenesState {
  scenes: Scene[]
  active: string
}

export const FULL: Rect = { x: 0, y: 0, w: 1, h: 1 }
export const NO_CROP: Crop = { l: 0, t: 0, r: 0, b: 0 }

export const newId = (): string => Math.random().toString(36).slice(2, 10)

export function cameraSource(): SceneSource {
  return {
    id: newId(),
    kind: 'camera',
    name: 'CarrotCam camera',
    visible: true,
    locked: false,
    rect: { ...FULL },
    crop: { ...NO_CROP },
    opacity: 1,
    radius: 0,
    settings: {}
  }
}

export function defaultScenes(): ScenesState {
  const scene: Scene = { id: newId(), name: 'Camera', sources: [cameraSource()] }
  return { scenes: [scene], active: scene.id }
}

export const DEFAULT_TEXT: TextStyle = {
  text: 'Your text',
  size: 48,
  color: '#ffffff',
  background: null,
  bold: true,
  align: 'left'
}

/** A scene that is just the full camera can skip the scene pass entirely. */
export function isPlainCamera(scene: Scene | undefined): boolean {
  if (!scene) return true
  const visible = scene.sources.filter((s) => s.visible)
  if (visible.length !== 1 || visible[0].kind !== 'camera') return false
  const s = visible[0]
  const r = s.rect
  const c = s.crop
  return r.x === 0 && r.y === 0 && r.w === 1 && r.h === 1 && s.opacity >= 1 && s.radius === 0 && !c.l && !c.t && !c.r && !c.b
}

export function sanitizeScenes(raw: unknown): ScenesState {
  try {
    const s = raw as ScenesState
    if (!s || !Array.isArray(s.scenes) || !s.scenes.length) return defaultScenes()
    const num = (v: unknown, d: number, lo = 0, hi = 1): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d)
    const scenes = s.scenes.slice(0, 20).map((sc) => ({
      id: String(sc.id || newId()),
      name: String(sc.name || 'Scene').slice(0, 40),
      sources: (Array.isArray(sc.sources) ? sc.sources : []).slice(0, 30).map((src) => ({
        id: String(src.id || newId()),
        kind: src.kind,
        name: String(src.name || 'Source').slice(0, 60),
        visible: src.visible !== false,
        locked: !!src.locked,
        rect: {
          x: num(src.rect?.x, 0, -2, 3),
          y: num(src.rect?.y, 0, -2, 3),
          w: num(src.rect?.w, 1, 0.01, 4),
          h: num(src.rect?.h, 1, 0.01, 4)
        },
        crop: { l: num(src.crop?.l, 0, 0, 0.9), t: num(src.crop?.t, 0, 0, 0.9), r: num(src.crop?.r, 0, 0, 0.9), b: num(src.crop?.b, 0, 0, 0.9) },
        opacity: num(src.opacity, 1),
        radius: num(src.radius, 0, 0, 400),
        settings: typeof src.settings === 'object' && src.settings ? src.settings : {}
      }))
    }))
    for (const sc of scenes) if (!sc.sources.some((x) => x.kind === 'camera')) sc.sources.unshift(cameraSource())
    const active = scenes.some((x) => x.id === s.active) ? s.active : scenes[0].id
    return { scenes, active }
  } catch {
    return defaultScenes()
  }
}

/** Layer description sent to the render worker for the active scene. */
export interface LayerSpec {
  /** media key of the texture, 'camera' for the CarrotCam picture, null for a color */
  key: string | null
  rect: Rect
  crop: Crop
  opacity: number
  radius: number
  color?: [number, number, number, number]
  /** pixels come in BGRA order (web pages) */
  bgra?: boolean
}
