// Effect settings shared by the UI, the render worker and the phone remote.

export type BackgroundMode = 'none' | 'blur' | 'image' | 'color' | 'studio' | 'desaturate'
export type StyleEffect =
  | 'none'
  | 'glitch'
  | 'vhs'
  | 'pixel'
  | 'comic'
  | 'sketch'
  | 'thermal'
  | 'night'
  | 'posterize'
  | 'chroma'
  | 'mirror'
  | 'halftone'
export type PrivacyMode = 'off' | 'blur' | 'brb' | 'freeze'
export type NameTagStyle = 'carrot' | 'glass' | 'minimal'
export type FrameTightness = 'close' | 'medium' | 'wide'
export type Reaction = 'hearts' | 'thumbs' | 'balloons' | 'confetti' | 'fireworks' | 'rain'

export interface AdjustSettings {
  exposure: number // -100..100
  brightness: number
  contrast: number
  highlights: number
  shadows: number
  saturation: number
  vibrance: number
  temperature: number
  tint: number
  hue: number // -180..180
  sharpness: number // 0..100
  vignette: number // 0..100
  grain: number // 0..100
  fade: number // 0..100
}

export interface EffectSettings {
  adjust: AdjustSettings
  autoEnhance: boolean
  lowLight: number // 0..100, gain + temporal denoise
  filter: { id: string; intensity: number }
  lut: { enabled: boolean; name: string | null; intensity: number }
  background: {
    mode: BackgroundMode
    blur: number // 0..100
    color: string
    imageId: string | null
    feather: number // 0..100
  }
  retouch: {
    smooth: number
    eyes: number
    teeth: number
    faceLight: number
    slim: number
    eyeEnlarge: number
  }
  lighting: {
    spotlight: boolean
    spotIntensity: number
    spotSize: number
    spotSoftness: number
    spotWarmth: number // -100..100
    followFace: boolean
    studio: number
    keyLight: number
    keyAngle: number // -180..180
  }
  effect: { id: StyleEffect; intensity: number }
  framing: {
    zoom: number // 1..4
    panX: number // -1..1
    panY: number
    rotate: 0 | 90 | 180 | 270
    tilt: number // -15..15
    mirror: boolean
    flip: boolean
    autoFrame: boolean
    tightness: FrameTightness
    speed: number // 0..100
  }
  overlay: {
    nameTag: { enabled: boolean; name: string; title: string; style: NameTagStyle; right: boolean }
    clock: boolean
    badge: 'none' | 'live' | 'onair'
    border: { enabled: boolean; color: string; width: number; radius: number }
    gestures: boolean
  }
  privacy: PrivacyMode
}

export const defaultAdjust: AdjustSettings = {
  exposure: 0,
  brightness: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  saturation: 0,
  vibrance: 0,
  temperature: 0,
  tint: 0,
  hue: 0,
  sharpness: 0,
  vignette: 0,
  grain: 0,
  fade: 0
}

export const defaultEffects: EffectSettings = {
  adjust: { ...defaultAdjust },
  autoEnhance: false,
  lowLight: 0,
  filter: { id: 'original', intensity: 100 },
  lut: { enabled: false, name: null, intensity: 100 },
  background: { mode: 'none', blur: 60, color: '#1b1714', imageId: null, feather: 40 },
  retouch: { smooth: 0, eyes: 0, teeth: 0, faceLight: 0, slim: 0, eyeEnlarge: 0 },
  lighting: {
    spotlight: false,
    spotIntensity: 60,
    spotSize: 55,
    spotSoftness: 60,
    spotWarmth: 20,
    followFace: true,
    studio: 0,
    keyLight: 0,
    keyAngle: -40
  },
  effect: { id: 'none', intensity: 70 },
  framing: {
    zoom: 1,
    panX: 0,
    panY: 0,
    rotate: 0,
    tilt: 0,
    mirror: false,
    flip: false,
    autoFrame: false,
    tightness: 'medium',
    speed: 50
  },
  overlay: {
    nameTag: { enabled: false, name: 'Your Name', title: 'Streaming with CarrotCam', style: 'carrot', right: false },
    clock: false,
    badge: 'none',
    border: { enabled: false, color: '#ff7a1a', width: 6, radius: 28 },
    gestures: false
  },
  privacy: 'off'
}

export function cloneEffects(e: EffectSettings): EffectSettings {
  return JSON.parse(JSON.stringify(e)) as EffectSettings
}

/** Deep-merges persisted settings into the defaults so new fields always exist. */
export function mergeEffects(saved: unknown): EffectSettings {
  const base = cloneEffects(defaultEffects)
  const merge = (target: Record<string, unknown>, src: unknown): void => {
    if (!src || typeof src !== 'object') return
    for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
      if (!(k in target)) continue
      const t = target[k]
      if (t && typeof t === 'object' && !Array.isArray(t)) merge(t as Record<string, unknown>, v)
      else if (typeof v === typeof t || (t === null && (typeof v === 'string' || v === null))) target[k] = v
    }
  }
  merge(base as unknown as Record<string, unknown>, saved)
  return base
}
