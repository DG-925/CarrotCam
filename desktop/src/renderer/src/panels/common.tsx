import { RotateCcw } from 'lucide-react'
import type { EffectSettings } from '@shared/effects'
import { useStore } from '@/lib/store'

export function useFx(): [EffectSettings, (fn: (e: EffectSettings) => void) => void] {
  const effects = useStore((s) => s.effects)
  const update = useStore((s) => s.updateEffects)
  return [effects, update]
}

const HINTS: Record<string, string> = {
  Looks: 'Pick a style, then fine-tune it',
  Sources: 'Your screen, windows, pictures and more',
  Adjust: 'Brightness, color and detail',
  Filters: 'Color styles that set the mood',
  Background: 'Blur your room or replace it',
  Retouch: 'Subtle touch-ups that follow your face',
  Lighting: 'Add light, even in a dark room',
  Framing: "Choose what's in the shot",
  Effects: 'Creative styles for streams and calls',
  Overlays: 'Name tag, logo, clock and frame'
}

/** Panel header: title, one line of help and a Reset button. */
export function PanelTitle({ title, onReset }: { title: string; onReset?: () => void }): React.JSX.Element {
  return (
    <div className="fx-head">
      <div>
        <h2>{title}</h2>
        <p>{HINTS[title] ?? ''}</p>
      </div>
      {onReset && (
        <button className="btn ghost sm" onClick={onReset} title="Reset this section">
          <RotateCcw size={14} /> Reset
        </button>
      )}
    </div>
  )
}

export function FaceNote(): React.JSX.Element {
  const ml = useStore((s) => s.ml)
  return (
    <p className="hint" style={{ marginTop: 14 }}>
      Uses on-device face tracking{ml?.delegate ? ` (${ml.delegate === 'GPU' ? 'GPU accelerated' : 'CPU'})` : ''}.
      Nothing leaves your PC.
    </p>
  )
}
