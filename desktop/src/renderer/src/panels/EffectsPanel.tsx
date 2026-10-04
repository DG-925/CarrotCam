import { motion } from 'motion/react'
import type { StyleEffect } from '@shared/effects'
import { Section, Slider, stagger } from '@/components/ui'
import { PanelTitle, useFx } from './common'

const EFFECTS: { id: StyleEffect; label: string; emoji: string }[] = [
  { id: 'none', label: 'None', emoji: '⭕' },
  { id: 'glitch', label: 'Glitch', emoji: '👾' },
  { id: 'vhs', label: 'VHS', emoji: '📼' },
  { id: 'pixel', label: 'Pixel', emoji: '🟧' },
  { id: 'comic', label: 'Comic', emoji: '💥' },
  { id: 'sketch', label: 'Sketch', emoji: '✏️' },
  { id: 'halftone', label: 'Halftone', emoji: '🔘' },
  { id: 'thermal', label: 'Thermal', emoji: '🔥' },
  { id: 'night', label: 'Night vision', emoji: '🌙' },
  { id: 'posterize', label: 'Poster', emoji: '🎨' },
  { id: 'chroma', label: 'Chromatic', emoji: '🌈' },
  { id: 'mirror', label: 'Twin', emoji: '🪞' }
]

export function EffectsPanel(): React.JSX.Element {
  const [fx, update] = useFx()
  return (
    <>
      <PanelTitle title="Effects" onReset={() => update((e) => void (e.effect = { id: 'none', intensity: 70 }))} />
      <div className="grid-3" style={{ marginBottom: 18 }}>
        {EFFECTS.map((ef, i) => (
          <motion.button
            key={ef.id}
            {...stagger(i)}
            className={`tile ${fx.effect.id === ef.id ? 'active' : ''}`}
            onClick={() => update((e) => void (e.effect.id = ef.id))}
          >
            <span className="emoji">{ef.emoji}</span>
            {ef.label}
          </motion.button>
        ))}
      </div>
      {fx.effect.id !== 'none' && (
        <Section title="Strength">
          <Slider label="Intensity" value={fx.effect.intensity} defaultValue={70} onChange={(v) => update((e) => void (e.effect.intensity = v))} />
        </Section>
      )}
    </>
  )
}
