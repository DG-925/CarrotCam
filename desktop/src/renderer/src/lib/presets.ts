import { cloneEffects, defaultEffects, type EffectSettings } from '@shared/effects'

export interface Preset {
  id: string
  name: string
  emoji: string
  builtIn?: boolean
  effects: EffectSettings
}

function make(id: string, name: string, emoji: string, fn: (e: EffectSettings) => void): Preset {
  const e = cloneEffects(defaultEffects)
  fn(e)
  return { id, name, emoji, builtIn: true, effects: e }
}

export const BUILT_IN_PRESETS: Preset[] = [
  make('natural', 'Natural', '🌿', () => {}),
  make('studio', 'Studio Glow', '✨', (e) => {
    e.filter = { id: 'portrait', intensity: 80 }
    e.retouch.smooth = 45
    e.retouch.faceLight = 35
    e.retouch.eyes = 30
    e.lighting.studio = 35
    e.background = { ...e.background, mode: 'blur', blur: 45 }
    e.autoEnhance = true
  }),
  make('streamer', 'Streamer', '🎮', (e) => {
    e.filter = { id: 'carrot', intensity: 85 }
    e.background = { ...e.background, mode: 'blur', blur: 70 }
    e.framing.autoFrame = true
    e.adjust.sharpness = 25
    e.overlay.nameTag.enabled = true
  }),
  make('cinematic', 'Cinematic', '🎬', (e) => {
    e.filter = { id: 'cinematic', intensity: 100 }
    e.background = { ...e.background, mode: 'blur', blur: 85 }
    e.adjust.vignette = 30
    e.adjust.grain = 15
  }),
  make('spotlight', 'Spotlight', '🔦', (e) => {
    e.lighting.spotlight = true
    e.lighting.spotIntensity = 70
    e.lighting.spotSize = 45
    e.filter = { id: 'dramatic', intensity: 60 }
  }),
  make('meeting', 'Meeting', '💼', (e) => {
    e.autoEnhance = true
    e.retouch.smooth = 25
    e.retouch.faceLight = 20
    e.background = { ...e.background, mode: 'blur', blur: 55 }
    e.framing.autoFrame = true
    e.framing.tightness = 'medium'
  }),
  make('retro', 'Retro', '📼', (e) => {
    e.filter = { id: 'vintage', intensity: 100 }
    e.effect = { id: 'vhs', intensity: 55 }
  }),
  make('noir', 'Noir', '🎩', (e) => {
    e.filter = { id: 'noir', intensity: 100 }
    e.lighting.spotlight = true
    e.lighting.spotIntensity = 55
    e.adjust.grain = 20
  })
]
