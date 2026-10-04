import { RotateCcw } from 'lucide-react'
import type { EffectSettings } from '@shared/effects'
import { useStore } from '@/lib/store'

export function useFx(): [EffectSettings, (fn: (e: EffectSettings) => void) => void] {
  const effects = useStore((s) => s.effects)
  const update = useStore((s) => s.updateEffects)
  return [effects, update]
}

const HINTS: Record<string, string> = {
  Looks: 'Pick a style to start. You can fine-tune everything afterwards.',
  Adjust: 'Make the picture brighter, warmer or punchier.',
  Filters: 'Color styles that set the mood. The slider controls the strength.',
  Backdrop: 'Hide your room: blur it or swap in a background.',
  Retouch: 'Subtle touch-ups that follow your face.',
  Lighting: 'Add light where you need it, even in a dark room.',
  Framing: "Choose what's in the shot. Tip: scroll on the preview to zoom.",
  Effects: 'Fun styles for streams and calls.',
  Overlays: 'Show your name, a clock or a frame on top of the video.'
}

export function PanelTitle({ title, onReset }: { title: string; onReset?: () => void }): React.JSX.Element {
  return (
    <div className="panel-intro">
      <p>{HINTS[title] ?? title}</p>
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
    <p className="hint" style={{ marginTop: 4 }}>
      Uses on-device face tracking{ml?.delegate ? ` (${ml.delegate === 'GPU' ? 'GPU accelerated' : 'CPU'})` : ''}.
      Nothing leaves your PC.
    </p>
  )
}
