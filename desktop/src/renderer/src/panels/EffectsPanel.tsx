import {
  Ban,
  CircleDot,
  Columns2,
  Grid3x3,
  Moon,
  Palette,
  PencilLine,
  Rainbow,
  Sticker,
  Thermometer,
  Tv,
  Zap
} from 'lucide-react'
import type { StyleEffect } from '@shared/effects'
import { Section, Slider } from '@/components/ui'
import { PanelTitle, useFx } from './common'

const EFFECTS: { id: StyleEffect; label: string; icon: typeof Ban }[] = [
  { id: 'none', label: 'None', icon: Ban },
  { id: 'glitch', label: 'Glitch', icon: Zap },
  { id: 'vhs', label: 'VHS', icon: Tv },
  { id: 'pixel', label: 'Pixel', icon: Grid3x3 },
  { id: 'comic', label: 'Comic', icon: Sticker },
  { id: 'sketch', label: 'Sketch', icon: PencilLine },
  { id: 'halftone', label: 'Halftone', icon: CircleDot },
  { id: 'thermal', label: 'Thermal', icon: Thermometer },
  { id: 'night', label: 'Night vision', icon: Moon },
  { id: 'posterize', label: 'Poster', icon: Palette },
  { id: 'chroma', label: 'Chromatic', icon: Rainbow },
  { id: 'mirror', label: 'Twin', icon: Columns2 }
]

export function EffectsPanel(): React.JSX.Element {
  const [fx, update] = useFx()
  return (
    <>
      <PanelTitle title="Effects" onReset={() => update((e) => void (e.effect = { id: 'none', intensity: 70 }))} />
      <div className="grid-3" style={{ marginBottom: 18 }}>
        {EFFECTS.map((ef) => (
          <button
            key={ef.id}
            className={`tile ${fx.effect.id === ef.id ? 'active' : ''}`}
            onClick={() => update((e) => void (e.effect.id = ef.id))}
          >
            <ef.icon size={20} />
            {ef.label}
          </button>
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
