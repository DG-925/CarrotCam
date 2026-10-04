import { defaultAdjust, type AdjustSettings } from '@shared/effects'
import { Section, Slider, ToggleRow } from '@/components/ui'
import { PanelTitle, useFx } from './common'

const LIGHT: [keyof AdjustSettings, string][] = [
  ['exposure', 'Exposure'],
  ['brightness', 'Brightness'],
  ['contrast', 'Contrast'],
  ['highlights', 'Highlights'],
  ['shadows', 'Shadows']
]
const COLOR: [keyof AdjustSettings, string][] = [
  ['temperature', 'Temperature'],
  ['tint', 'Tint'],
  ['saturation', 'Saturation'],
  ['vibrance', 'Vibrance']
]

export function AdjustPanel(): React.JSX.Element {
  const [fx, update] = useFx()
  const a = fx.adjust
  const set = (k: keyof AdjustSettings) => (v: number) =>
    update((e) => {
      e.adjust[k] = v
    })

  return (
    <>
      <PanelTitle
        title="Adjust"
        onReset={() =>
          update((e) => {
            e.adjust = { ...defaultAdjust }
            e.autoEnhance = false
          })
        }
      />
      <div className="card" style={{ marginBottom: 18 }}>
        <ToggleRow
          title="Auto enhance"
          hint="Smart exposure & white balance"
          value={fx.autoEnhance}
          onChange={(v) => update((e) => void (e.autoEnhance = v))}
        />
      </div>
      <Section title="Light">
        {LIGHT.map(([k, label]) => (
          <Slider key={k} label={label} value={a[k]} min={-100} max={100} bipolar onChange={set(k)} />
        ))}
      </Section>
      <Section title="Color">
        {COLOR.map(([k, label]) => (
          <Slider key={k} label={label} value={a[k]} min={-100} max={100} bipolar onChange={set(k)} />
        ))}
        <Slider label="Hue" value={a.hue} min={-180} max={180} bipolar onChange={set('hue')} format={(v) => `${Math.round(v)}°`} />
      </Section>
      <Section title="Detail & finish">
        <Slider label="Sharpness" value={a.sharpness} onChange={set('sharpness')} />
        <Slider label="Vignette" value={a.vignette} onChange={set('vignette')} />
        <Slider label="Film grain" value={a.grain} onChange={set('grain')} />
        <Slider label="Fade" value={a.fade} onChange={set('fade')} />
      </Section>
    </>
  )
}
