// Filter presets ("looks"). Each look is a small color grade evaluated on the
// GPU: white balance, lift/gamma/gain, saturation, contrast, split toning,
// black & white mix and fade.

type V3 = [number, number, number]

export interface Look {
  id: string
  name: string
  swatch: [string, string]
  /** search keywords */
  tags?: string[]
  exposure?: number // stops
  temperature?: number // -1..1
  tint?: number // -1..1 (+ = magenta)
  lift?: V3
  gamma?: V3
  gain?: V3
  saturation?: number
  contrast?: number // -1..1
  shadows?: V3 // split toning added to shadows
  highlights?: V3 // split toning added to highlights
  bw?: V3 | null // channel mixer weights for black & white
  fade?: number // 0..1
  grain?: number // 0..1 extra grain
  vignette?: number // 0..1 extra vignette
}

export const LOOKS: Look[] = [
  { id: 'original', name: 'Original', swatch: ['#8a8580', '#3b3734'], tags: ['natural', 'none', 'clean'] },
  {
    id: 'carrot',
    name: 'Carrot',
    swatch: ['#ff9a3d', '#3a1f10'],
    tags: ['warm', 'orange', 'creative'],
    temperature: 0.22,
    saturation: 1.14,
    contrast: 0.16,
    shadows: [-0.012, 0.004, 0.018],
    highlights: [0.045, 0.016, -0.02]
  },
  {
    id: 'vivid',
    name: 'Vivid',
    swatch: ['#ff4f81', '#2bc4ff'],
    tags: ['bright', 'colorful', 'saturated'],
    saturation: 1.38,
    contrast: 0.2,
    exposure: 0.05
  },
  {
    id: 'warm',
    name: 'Warm',
    swatch: ['#ffb36b', '#7a3b12'],
    tags: ['warm'],
    temperature: 0.36,
    gain: [1.03, 1.0, 0.96],
    saturation: 1.05
  },
  {
    id: 'cool',
    name: 'Cool',
    swatch: ['#7cc8ff', '#13304a'],
    tags: ['cool', 'blue'],
    temperature: -0.34,
    tint: -0.04,
    saturation: 0.98
  },
  {
    id: 'cinematic',
    name: 'Cinematic',
    swatch: ['#ffa45c', '#0f4c5c'],
    tags: ['film', 'movie', 'teal', 'orange'],
    contrast: 0.26,
    saturation: 0.9,
    shadows: [-0.03, 0.02, 0.055],
    highlights: [0.06, 0.02, -0.045],
    fade: 0.04,
    vignette: 0.25
  },
  {
    id: 'film',
    name: 'Film',
    swatch: ['#e9c9a2', '#4a5a63'],
    tags: ['film', 'analog', 'grain'],
    temperature: 0.08,
    lift: [0.0, 0.01, 0.035],
    saturation: 0.94,
    contrast: 0.1,
    fade: 0.07,
    grain: 0.25
  },
  {
    id: 'golden',
    name: 'Golden Hour',
    swatch: ['#ffd36b', '#a23f12'],
    tags: ['warm', 'sunset', 'sun'],
    temperature: 0.5,
    gain: [1.08, 1.0, 0.86],
    saturation: 1.12,
    highlights: [0.04, 0.025, -0.02]
  },
  {
    id: 'portrait',
    name: 'Portrait',
    swatch: ['#f6c7b0', '#6c4a3f'],
    tags: ['skin', 'soft', 'warm'],
    temperature: 0.1,
    saturation: 0.96,
    contrast: -0.04,
    lift: [0.02, 0.012, 0.01],
    highlights: [0.025, 0.012, 0.0]
  },
  {
    id: 'arctic',
    name: 'Arctic',
    swatch: ['#dff6ff', '#4b7ca0'],
    tags: ['cool', 'blue', 'cold'],
    temperature: -0.45,
    saturation: 0.8,
    exposure: 0.12,
    highlights: [-0.02, 0.02, 0.05]
  },
  {
    id: 'neon',
    name: 'Neon',
    swatch: ['#ff2fd6', '#2d0b6b'],
    tags: ['creative', 'pink', 'purple'],
    saturation: 1.55,
    contrast: 0.3,
    tint: 0.18,
    shadows: [0.03, -0.02, 0.08],
    highlights: [0.02, 0.0, 0.05]
  },
  {
    id: 'pastel',
    name: 'Pastel',
    swatch: ['#ffd6e7', '#b9d7ff'],
    tags: ['soft', 'light', 'pink'],
    saturation: 0.72,
    fade: 0.14,
    exposure: 0.1,
    highlights: [0.03, 0.0, 0.03]
  },
  {
    id: 'vintage',
    name: 'Vintage',
    swatch: ['#e3b778', '#5b3a29'],
    tags: ['film', 'retro', 'old', 'warm'],
    temperature: 0.2,
    saturation: 0.78,
    fade: 0.16,
    shadows: [0.04, 0.01, -0.02],
    highlights: [0.05, 0.035, -0.04],
    grain: 0.35,
    vignette: 0.35
  },
  {
    id: 'dramatic',
    name: 'Dramatic',
    swatch: ['#9aa3ad', '#111214'],
    tags: ['moody', 'dark', 'contrast'],
    contrast: 0.48,
    saturation: 0.82,
    exposure: -0.12,
    vignette: 0.45
  },
  {
    id: 'rose',
    name: 'Rose',
    swatch: ['#ff9fb5', '#5c2232'],
    tags: ['pink', 'warm'],
    tint: 0.16,
    temperature: 0.12,
    saturation: 1.04,
    highlights: [0.04, 0.0, 0.02]
  },
  {
    id: 'matte',
    name: 'Matte',
    swatch: ['#b3aca4', '#4a4642'],
    tags: ['film', 'soft', 'faded'],
    fade: 0.2,
    contrast: -0.08,
    saturation: 0.88
  },
  {
    id: 'cyber',
    name: 'Cyber',
    swatch: ['#00f0ff', '#ff00a8'],
    tags: ['creative', 'neon', 'cool'],
    saturation: 1.25,
    contrast: 0.22,
    shadows: [0.04, -0.02, 0.07],
    highlights: [-0.04, 0.05, 0.05]
  },
  {
    id: 'noir',
    name: 'Noir',
    swatch: ['#f2f2f2', '#0b0b0b'],
    tags: ['bw', 'black', 'white', 'mono'],
    bw: [0.3, 0.6, 0.1],
    contrast: 0.42,
    vignette: 0.4
  },
  {
    id: 'mono',
    name: 'Mono',
    swatch: ['#d9d9d9', '#555555'],
    tags: ['bw', 'black', 'white', 'grey'],
    bw: [0.299, 0.587, 0.114],
    fade: 0.08
  },
  {
    id: 'sepia',
    name: 'Sepia',
    swatch: ['#e6c79c', '#4d3319'],
    tags: ['bw', 'brown', 'old', 'retro'],
    bw: [0.3, 0.59, 0.11],
    shadows: [0.05, 0.02, -0.03],
    highlights: [0.08, 0.04, -0.03],
    fade: 0.06
  },
  // ---- more looks ----
  {
    id: 'tealorange',
    name: 'Teal & Orange',
    swatch: ['#ff9b54', '#0b6e75'],
    tags: ['film', 'movie', 'cinematic', 'warm', 'cool'],
    contrast: 0.2,
    saturation: 1.08,
    shadows: [-0.05, 0.025, 0.07],
    highlights: [0.07, 0.025, -0.05]
  },
  {
    id: 'moody',
    name: 'Moody',
    swatch: ['#6b7280', '#1f2933'],
    tags: ['dark', 'cool', 'film', 'contrast'],
    exposure: -0.1,
    contrast: 0.22,
    saturation: 0.72,
    shadows: [-0.01, 0.01, 0.03],
    fade: 0.05,
    vignette: 0.3
  },
  {
    id: 'sunset',
    name: 'Sunset',
    swatch: ['#ff7e5f', '#6a1b4d'],
    tags: ['warm', 'pink', 'orange', 'sun'],
    temperature: 0.4,
    tint: 0.1,
    saturation: 1.15,
    highlights: [0.06, 0.01, 0.0],
    shadows: [0.02, -0.01, 0.04]
  },
  {
    id: 'forest',
    name: 'Forest',
    swatch: ['#6fbf73', '#173d22'],
    tags: ['green', 'nature', 'cool'],
    tint: -0.14,
    saturation: 1.02,
    contrast: 0.12,
    shadows: [-0.01, 0.025, 0.0],
    highlights: [0.02, 0.03, -0.01]
  },
  {
    id: 'tokyo',
    name: 'Tokyo Night',
    swatch: ['#7f5af0', '#0b132b'],
    tags: ['creative', 'neon', 'cool', 'night', 'purple'],
    temperature: -0.25,
    tint: 0.12,
    saturation: 1.2,
    contrast: 0.25,
    shadows: [0.02, -0.01, 0.08],
    highlights: [0.05, 0.0, 0.04],
    vignette: 0.2
  },
  {
    id: 'bleach',
    name: 'Bleach Bypass',
    swatch: ['#c9c6c0', '#2e2b28'],
    tags: ['film', 'movie', 'contrast', 'desaturated'],
    contrast: 0.45,
    saturation: 0.5,
    exposure: 0.04,
    vignette: 0.2
  },
  {
    id: 'cross',
    name: 'Cross Process',
    swatch: ['#d8f06b', '#1b5e7a'],
    tags: ['film', 'creative', 'retro', 'green'],
    contrast: 0.22,
    saturation: 1.2,
    lift: [0.0, 0.02, 0.06],
    gain: [1.04, 1.04, 0.88],
    tint: -0.06
  },
  {
    id: 'lomo',
    name: 'Lomo',
    swatch: ['#f3d36b', '#3b1d4a'],
    tags: ['film', 'retro', 'vignette', 'warm'],
    contrast: 0.32,
    saturation: 1.3,
    temperature: 0.12,
    shadows: [0.0, -0.01, 0.04],
    vignette: 0.6
  },
  {
    id: 'instant',
    name: 'Instant',
    swatch: ['#f4e1c1', '#5e7d7e'],
    tags: ['film', 'retro', 'faded', 'polaroid'],
    temperature: 0.1,
    saturation: 0.86,
    fade: 0.12,
    lift: [0.01, 0.025, 0.04],
    highlights: [0.03, 0.02, -0.02],
    vignette: 0.15
  },
  {
    id: 'seventies',
    name: 'Seventies',
    swatch: ['#d9a441', '#6b3e1e'],
    tags: ['retro', 'film', 'warm', 'old', '70s'],
    temperature: 0.3,
    saturation: 0.85,
    fade: 0.1,
    shadows: [0.04, 0.02, -0.03],
    highlights: [0.05, 0.03, -0.05],
    grain: 0.3
  },
  {
    id: 'desert',
    name: 'Desert',
    swatch: ['#e8b77d', '#7a4a24'],
    tags: ['warm', 'brown', 'nature'],
    temperature: 0.3,
    saturation: 0.9,
    contrast: 0.1,
    highlights: [0.04, 0.02, -0.03]
  },
  {
    id: 'ocean',
    name: 'Ocean',
    swatch: ['#4fc3f7', '#0d3b66'],
    tags: ['cool', 'blue', 'nature'],
    temperature: -0.25,
    tint: -0.05,
    saturation: 1.1,
    shadows: [-0.02, 0.01, 0.05]
  },
  {
    id: 'lavender',
    name: 'Lavender',
    swatch: ['#c9b6ff', '#4b3a7a'],
    tags: ['purple', 'soft', 'pink', 'pastel'],
    tint: 0.12,
    temperature: -0.08,
    saturation: 0.9,
    fade: 0.06,
    highlights: [0.03, 0.0, 0.05]
  },
  {
    id: 'mint',
    name: 'Mint',
    swatch: ['#b8f2d3', '#2d6a4f'],
    tags: ['green', 'soft', 'cool', 'pastel'],
    tint: -0.1,
    temperature: -0.1,
    saturation: 0.88,
    exposure: 0.06,
    fade: 0.06
  },
  {
    id: 'peach',
    name: 'Peach',
    swatch: ['#ffc4a3', '#8c4a3a'],
    tags: ['warm', 'skin', 'soft', 'pink'],
    temperature: 0.18,
    tint: 0.06,
    saturation: 1.0,
    exposure: 0.05,
    lift: [0.02, 0.01, 0.0]
  },
  {
    id: 'cocoa',
    name: 'Cocoa',
    swatch: ['#a47551', '#2b1a12'],
    tags: ['warm', 'brown', 'dark'],
    temperature: 0.25,
    saturation: 0.8,
    contrast: 0.18,
    exposure: -0.06,
    shadows: [0.03, 0.01, -0.02]
  },
  {
    id: 'autumn',
    name: 'Autumn',
    swatch: ['#e07a2f', '#5a2a0c'],
    tags: ['warm', 'orange', 'nature', 'fall'],
    temperature: 0.32,
    tint: -0.04,
    saturation: 1.18,
    contrast: 0.12,
    highlights: [0.05, 0.02, -0.04]
  },
  {
    id: 'spring',
    name: 'Spring',
    swatch: ['#a8e6a1', '#f7a1c4'],
    tags: ['bright', 'green', 'pink', 'colorful'],
    exposure: 0.1,
    saturation: 1.15,
    tint: -0.03,
    lift: [0.015, 0.02, 0.01]
  },
  {
    id: 'airy',
    name: 'Bright & Airy',
    swatch: ['#fdf6ec', '#c9d6df'],
    tags: ['bright', 'light', 'soft', 'clean'],
    exposure: 0.18,
    contrast: -0.1,
    saturation: 0.92,
    lift: [0.03, 0.03, 0.035]
  },
  {
    id: 'clean',
    name: 'Clean',
    swatch: ['#e5e7eb', '#6b7280'],
    tags: ['natural', 'subtle', 'clean', 'meeting'],
    exposure: 0.04,
    contrast: 0.08,
    saturation: 1.05
  },
  {
    id: 'velvet',
    name: 'Velvet',
    swatch: ['#b5179e', '#3a0ca3'],
    tags: ['creative', 'purple', 'dark', 'pink'],
    tint: 0.18,
    saturation: 1.1,
    contrast: 0.2,
    shadows: [0.03, -0.02, 0.06],
    vignette: 0.3
  },
  {
    id: 'midnight',
    name: 'Midnight',
    swatch: ['#3a506b', '#0b0c10'],
    tags: ['dark', 'cool', 'blue', 'night'],
    temperature: -0.4,
    exposure: -0.15,
    saturation: 0.85,
    contrast: 0.2,
    vignette: 0.4
  },
  {
    id: 'silver',
    name: 'Silver',
    swatch: ['#f5f5f5', '#8d8d8d'],
    tags: ['bw', 'black', 'white', 'bright'],
    bw: [0.25, 0.6, 0.15],
    exposure: 0.1,
    contrast: -0.05,
    fade: 0.1
  },
  {
    id: 'ink',
    name: 'Ink',
    swatch: ['#ffffff', '#000000'],
    tags: ['bw', 'black', 'white', 'contrast', 'dark'],
    bw: [0.35, 0.55, 0.1],
    contrast: 0.7,
    exposure: -0.05
  },
  {
    id: 'selenium',
    name: 'Selenium',
    swatch: ['#d6d1e6', '#2f2a3d'],
    tags: ['bw', 'purple', 'old', 'toned'],
    bw: [0.3, 0.59, 0.11],
    contrast: 0.2,
    shadows: [0.01, -0.01, 0.04],
    highlights: [0.02, 0.01, 0.0]
  }
]

export const LOOK_INDEX = new Map(LOOKS.map((l) => [l.id, l]))

/** Flattened uniforms for the shader. */
export interface LookUniforms {
  exposure: number
  wb: V3
  lift: V3
  gamma: V3
  gain: V3
  saturation: number
  contrast: number
  shadows: V3
  highlights: V3
  bw: V3
  bwOn: number
  fade: number
  grain: number
  vignette: number
}

export function whiteBalance(temperature: number, tint: number): V3 {
  // simple and smooth: warm = more red, less blue; tint = less green (magenta)
  return [1 + 0.16 * temperature + 0.03 * tint, 1 - 0.1 * tint, 1 - 0.18 * temperature + 0.03 * tint]
}

export function lookUniforms(id: string): LookUniforms {
  const l = LOOK_INDEX.get(id) ?? LOOKS[0]
  return {
    exposure: l.exposure ?? 0,
    wb: whiteBalance(l.temperature ?? 0, l.tint ?? 0),
    lift: l.lift ?? [0, 0, 0],
    gamma: l.gamma ?? [1, 1, 1],
    gain: l.gain ?? [1, 1, 1],
    saturation: l.saturation ?? 1,
    contrast: l.contrast ?? 0,
    shadows: l.shadows ?? [0, 0, 0],
    highlights: l.highlights ?? [0, 0, 0],
    bw: l.bw ?? [0.299, 0.587, 0.114],
    bwOn: l.bw ? 1 : 0,
    fade: l.fade ?? 0,
    grain: l.grain ?? 0,
    vignette: l.vignette ?? 0
  }
}
