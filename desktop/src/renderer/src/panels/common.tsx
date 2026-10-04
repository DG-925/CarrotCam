import { RotateCcw } from 'lucide-react'
import type { EffectSettings } from '@shared/effects'
import { useStore } from '@/lib/store'

export function useFx(): [EffectSettings, (fn: (e: EffectSettings) => void) => void] {
  const effects = useStore((s) => s.effects)
  const update = useStore((s) => s.updateEffects)
  return [effects, update]
}

export function PanelTitle({ title, onReset }: { title: string; onReset?: () => void }): React.JSX.Element {
  return (
    <div className="panel-title">
      <h2>{title}</h2>
      {onReset && (
        <button className="btn ghost sm" onClick={onReset}>
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
