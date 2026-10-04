// Filter presets ("looks"). Each look is a small color grade evaluated on the
// GPU: white balance, lift/gamma/gain, saturation, contrast, split toning,
// black & white mix and fade.

type V3 = [number, number, number]

export interface Look {
  id: string
  name: string
  swatch: [string, string]
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
  { id: 'original', name: 'Original', swatch: ['#8a8580', '#3b3734'] },
  {
    id: 'carrot',
    name: 'Carrot',
    swatch: ['#ff9a3d', '#3a1f10'],
    temperature: 0.22,
    saturation: 1.14,
    contrast: 0.16,
    shadows: [-0.012, 0.004, 0.018],
    highlights: [0.045, 0.016, -0.02]
  },
  { id: 'vivid', name: 'Vivid', swatch: ['#ff4f81', '#2bc4ff'], saturation: 1.38, contrast: 0.2, exposure: 0.05 },
  {
    id: 'warm',
    name: 'Warm',
    swatch: ['#ffb36b', '#7a3b12'],
    temperature: 0.36,
    gain: [1.03, 1.0, 0.96],
    saturation: 1.05
  },
  { id: 'cool', name: 'Cool', swatch: ['#7cc8ff', '#13304a'], temperature: -0.34, tint: -0.04, saturation: 0.98 },
  {
    id: 'cinematic',
    name: 'Cinematic',
    swatch: ['#ffa45c', '#0f4c5c'],
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
    temperature: 0.5,
    gain: [1.08, 1.0, 0.86],
    saturation: 1.12,
    highlights: [0.04, 0.025, -0.02]
  },
  {
    id: 'portrait',
    name: 'Portrait',
    swatch: ['#f6c7b0', '#6c4a3f'],
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
    temperature: -0.45,
    saturation: 0.8,
    exposure: 0.12,
    highlights: [-0.02, 0.02, 0.05]
  },
  {
    id: 'neon',
    name: 'Neon',
    swatch: ['#ff2fd6', '#2d0b6b'],
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
    saturation: 0.72,
    fade: 0.14,
    exposure: 0.1,
    highlights: [0.03, 0.0, 0.03]
  },
  {
    id: 'vintage',
    name: 'Vintage',
    swatch: ['#e3b778', '#5b3a29'],
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
    contrast: 0.48,
    saturation: 0.82,
    exposure: -0.12,
    vignette: 0.45
  },
  {
    id: 'rose',
    name: 'Rose',
    swatch: ['#ff9fb5', '#5c2232'],
    tint: 0.16,
    temperature: 0.12,
    saturation: 1.04,
    highlights: [0.04, 0.0, 0.02]
  },
  {
    id: 'matte',
    name: 'Matte',
    swatch: ['#b3aca4', '#4a4642'],
    fade: 0.2,
    contrast: -0.08,
    saturation: 0.88
  },
  {
    id: 'cyber',
    name: 'Cyber',
    swatch: ['#00f0ff', '#ff00a8'],
    saturation: 1.25,
    contrast: 0.22,
    shadows: [0.04, -0.02, 0.07],
    highlights: [-0.04, 0.05, 0.05]
  },
  {
    id: 'noir',
    name: 'Noir',
    swatch: ['#f2f2f2', '#0b0b0b'],
    bw: [0.3, 0.6, 0.1],
    contrast: 0.42,
    vignette: 0.4
  },
  { id: 'mono', name: 'Mono', swatch: ['#d9d9d9', '#555555'], bw: [0.299, 0.587, 0.114], fade: 0.08 },
  {
    id: 'sepia',
    name: 'Sepia',
    swatch: ['#e6c79c', '#4d3319'],
    bw: [0.3, 0.59, 0.11],
    shadows: [0.05, 0.02, -0.03],
    highlights: [0.08, 0.04, -0.03],
    fade: 0.06
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
