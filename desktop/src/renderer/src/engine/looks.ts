// Filter presets ("looks"). Each look is a small color grade evaluated on the
// GPU: white balance, lift/gamma/gain, saturation, contrast, split toning,
// black & white mix and fade.

type V3 = [number, number, number]

export interface Look {
  id: string
  name: string
  swatch: [string, string]
  tags?: string // extra words for search
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
  { id: 'original', name: 'Original', swatch: ['#8a8580', '#3b3734'], tags: 'none normal natural' },
  { id: 'carrot', name: 'Carrot', swatch: ['#ff9a3d', '#3a1f10'], tags: 'warm orange vibrant', temperature: 0.22, saturation: 1.14, contrast: 0.16, shadows: [-0.012, 0.004, 0.018], highlights: [0.045, 0.016, -0.02] },
  { id: 'vivid', name: 'Vivid', swatch: ['#ff4f81', '#2bc4ff'], tags: 'vibrant colorful bright saturated', exposure: 0.05, saturation: 1.38, contrast: 0.2 },
  { id: 'warm', name: 'Warm', swatch: ['#ffb36b', '#7a3b12'], tags: 'warm cozy', temperature: 0.36, gain: [1.03, 1, 0.96], saturation: 1.05 },
  { id: 'cool', name: 'Cool', swatch: ['#7cc8ff', '#13304a'], tags: 'cool blue cold', temperature: -0.34, tint: -0.04, saturation: 0.98 },
  { id: 'cinematic', name: 'Cinematic', swatch: ['#ffa45c', '#0f4c5c'], tags: 'movie film teal orange', saturation: 0.9, contrast: 0.26, shadows: [-0.03, 0.02, 0.055], highlights: [0.06, 0.02, -0.045], fade: 0.04, vignette: 0.25 },
  { id: 'film', name: 'Film', swatch: ['#e9c9a2', '#4a5a63'], tags: 'film analog grain', temperature: 0.08, lift: [0, 0.01, 0.035], saturation: 0.94, contrast: 0.1, fade: 0.07, grain: 0.25 },
  { id: 'golden', name: 'Golden Hour', swatch: ['#ffd36b', '#a23f12'], tags: 'warm sunset gold', temperature: 0.5, gain: [1.08, 1, 0.86], saturation: 1.12, highlights: [0.04, 0.025, -0.02] },
  { id: 'portrait', name: 'Portrait', swatch: ['#f6c7b0', '#6c4a3f'], tags: 'soft skin warm', temperature: 0.1, lift: [0.02, 0.012, 0.01], saturation: 0.96, contrast: -0.04, highlights: [0.025, 0.012, 0] },
  { id: 'arctic', name: 'Arctic', swatch: ['#dff6ff', '#4b7ca0'], tags: 'cool blue cold bright', exposure: 0.12, temperature: -0.45, saturation: 0.8, highlights: [-0.02, 0.02, 0.05] },
  { id: 'neon', name: 'Neon', swatch: ['#ff2fd6', '#2d0b6b'], tags: 'vibrant purple pink party', tint: 0.18, saturation: 1.55, contrast: 0.3, shadows: [0.03, -0.02, 0.08], highlights: [0.02, 0, 0.05] },
  { id: 'pastel', name: 'Pastel', swatch: ['#ffd6e7', '#b9d7ff'], tags: 'soft light faded', exposure: 0.1, saturation: 0.72, highlights: [0.03, 0, 0.03], fade: 0.14 },
  { id: 'vintage', name: 'Vintage', swatch: ['#e3b778', '#5b3a29'], tags: 'retro old faded warm grain', temperature: 0.2, saturation: 0.78, shadows: [0.04, 0.01, -0.02], highlights: [0.05, 0.035, -0.04], fade: 0.16, grain: 0.35, vignette: 0.35 },
  { id: 'dramatic', name: 'Dramatic', swatch: ['#9aa3ad', '#111214'], tags: 'dark moody contrast', exposure: -0.12, saturation: 0.82, contrast: 0.48, vignette: 0.45 },
  { id: 'rose', name: 'Rose', swatch: ['#ff9fb5', '#5c2232'], tags: 'pink warm soft', temperature: 0.12, tint: 0.16, saturation: 1.04, highlights: [0.04, 0, 0.02] },
  { id: 'matte', name: 'Matte', swatch: ['#b3aca4', '#4a4642'], tags: 'faded soft flat', saturation: 0.88, contrast: -0.08, fade: 0.2 },
  { id: 'cyber', name: 'Cyber', swatch: ['#00f0ff', '#ff00a8'], tags: 'vibrant teal pink futuristic', saturation: 1.25, contrast: 0.22, shadows: [0.04, -0.02, 0.07], highlights: [-0.04, 0.05, 0.05] },
  { id: 'noir', name: 'Noir', swatch: ['#f2f2f2', '#0b0b0b'], tags: 'black white bw dark contrast', contrast: 0.42, bw: [0.3, 0.6, 0.1], vignette: 0.4 },
  { id: 'mono', name: 'Mono', swatch: ['#d9d9d9', '#555555'], tags: 'black white bw gray', bw: [0.299, 0.587, 0.114], fade: 0.08 },
  { id: 'sepia', name: 'Sepia', swatch: ['#e6c79c', '#4d3319'], tags: 'old brown retro bw', shadows: [0.05, 0.02, -0.03], highlights: [0.08, 0.04, -0.03], bw: [0.3, 0.59, 0.11], fade: 0.06 },
  { id: 'kodak', name: 'Kodak Gold', swatch: ['#ffcf73', '#8a4b1f'], tags: 'film warm analog yellow', temperature: 0.28, saturation: 1.08, contrast: 0.12, highlights: [0.05, 0.035, -0.02], fade: 0.06, grain: 0.2 },
  { id: 'fuji', name: 'Fuji Green', swatch: ['#c6e3b8', '#2f4f3a'], tags: 'film green analog cool', temperature: -0.05, tint: -0.1, saturation: 0.95, shadows: [-0.01, 0.03, 0.02], fade: 0.05, grain: 0.2 },
  { id: 'polaroid', name: 'Polaroid', swatch: ['#f3dfbf', '#7d6a58'], tags: 'instant faded warm retro', temperature: 0.15, saturation: 0.85, highlights: [0.04, 0.03, 0], fade: 0.18, vignette: 0.25 },
  { id: 'moody', name: 'Moody', swatch: ['#6b7280', '#111827'], tags: 'dark contrast desaturated', exposure: -0.15, saturation: 0.75, contrast: 0.32, shadows: [-0.01, 0, 0.03], vignette: 0.35 },
  { id: 'bright', name: 'Bright', swatch: ['#fff7d6', '#f5b971'], tags: 'light airy happy', exposure: 0.25, lift: [0.03, 0.03, 0.03], saturation: 1.08, contrast: -0.05 },
  { id: 'clean', name: 'Clean', swatch: ['#e9f1f7', '#9fb3c8'], tags: 'soft natural professional', exposure: 0.06, saturation: 1.05, contrast: 0.08 },
  { id: 'sunset', name: 'Sunset', swatch: ['#ff9966', '#c2185b'], tags: 'warm pink orange evening', temperature: 0.35, tint: 0.12, saturation: 1.12, highlights: [0.06, 0.01, 0] },
  { id: 'lavender', name: 'Lavender', swatch: ['#d8c7ff', '#5b4b8a'], tags: 'purple soft pastel', temperature: -0.1, tint: 0.15, saturation: 0.9, highlights: [0.02, 0, 0.05], fade: 0.08 },
  { id: 'forest', name: 'Forest', swatch: ['#8fbf7f', '#1f3a2a'], tags: 'green nature', tint: -0.15, saturation: 1.05, contrast: 0.12, shadows: [-0.02, 0.03, 0] },
  { id: 'desert', name: 'Desert', swatch: ['#e6b980', '#7a4a24'], tags: 'warm dusty orange', temperature: 0.4, saturation: 0.8, contrast: 0.1, fade: 0.08 },
  { id: 'ocean', name: 'Ocean', swatch: ['#5ec8e5', '#0b3954'], tags: 'blue teal cool water', temperature: -0.3, saturation: 1.1, shadows: [-0.02, 0.02, 0.05] },
  { id: 'bleach', name: 'Bleach', swatch: ['#c8c8c8', '#3d3d3d'], tags: 'bleach bypass contrast desaturated gritty', exposure: 0.05, saturation: 0.55, contrast: 0.45 },
  { id: 'chrome', name: 'Chrome', swatch: ['#bcd4e6', '#1c2a3a'], tags: 'crisp contrast cool', temperature: -0.08, saturation: 1.12, contrast: 0.3 },
  { id: 'sakura', name: 'Sakura', swatch: ['#ffc6d9', '#b85a7a'], tags: 'pink soft spring', exposure: 0.08, tint: 0.2, saturation: 0.95, fade: 0.06 },
  { id: 'mint', name: 'Mint', swatch: ['#b8f2e6', '#2a7f6f'], tags: 'green fresh cool', temperature: -0.12, tint: -0.12, highlights: [-0.01, 0.03, 0.02], fade: 0.05 },
  { id: 'autumn', name: 'Autumn', swatch: ['#e07a3c', '#5a2d17'], tags: 'warm orange red fall', temperature: 0.3, saturation: 1.1, contrast: 0.12, shadows: [0.03, 0, -0.02] },
  { id: 'winter', name: 'Winter', swatch: ['#dbe9ff', '#3c5a80'], tags: 'cold blue snow', exposure: 0.1, temperature: -0.5, saturation: 0.75 },
  { id: 'cocoa', name: 'Cocoa', swatch: ['#b58463', '#3b2418'], tags: 'brown warm chocolate', temperature: 0.25, saturation: 0.8, contrast: 0.1, shadows: [0.03, 0.01, -0.01] },
  { id: 'velvet', name: 'Velvet', swatch: ['#c0392b', '#2c0b0e'], tags: 'red deep rich', tint: 0.08, saturation: 1.15, contrast: 0.22, shadows: [0.03, -0.01, 0], vignette: 0.3 },
  { id: 'electric', name: 'Electric', swatch: ['#4f46e5', '#ec4899'], tags: 'blue pink vibrant party', saturation: 1.35, contrast: 0.2, shadows: [0, -0.02, 0.07], highlights: [0.04, 0, 0.03] },
  { id: 'teal', name: 'Teal & Orange', swatch: ['#ff8c42', '#00798c'], tags: 'cinematic movie blockbuster', saturation: 1.05, contrast: 0.3, shadows: [-0.05, 0.03, 0.07], highlights: [0.08, 0.03, -0.06] },
  { id: 'dreamy', name: 'Dreamy', swatch: ['#ffe5f1', '#c9b6ff'], tags: 'soft glow light pastel', exposure: 0.15, saturation: 0.9, contrast: -0.1, fade: 0.15 },
  { id: 'lofi', name: 'Lo-fi', swatch: ['#9bb59a', '#3a4a3a'], tags: 'retro faded green chill grain', tint: -0.08, saturation: 0.8, fade: 0.2, grain: 0.4, vignette: 0.3 }
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
