import { AnimatePresence, motion } from 'motion/react'
import { Flashlight, Moon, Sun } from 'lucide-react'
import { Section, Slider, ToggleRow } from '@/components/ui'
import { FaceNote, PanelTitle, useFx } from './common'

export function LightingPanel(): React.JSX.Element {
  const [fx, update] = useFx()
  const l = fx.lighting
  const set = <K extends keyof typeof l>(k: K) => (v: (typeof l)[K]) =>
    update((e) => {
      e.lighting[k] = v
    })

  return (
    <>
      <PanelTitle
        title="Lighting"
        onReset={() =>
          update((e) => {
            e.lighting = { ...e.lighting, spotlight: false, studio: 0, keyLight: 0 }
            e.lowLight = 0
          })
        }
      />
      <Section title="Spotlight">
        <div className="card">
          <ToggleRow
            title="Spotlight"
            hint="A soft light that follows you"
            icon={<Flashlight size={18} color="var(--accent)" />}
            value={l.spotlight}
            onChange={set('spotlight')}
          />
          <AnimatePresence initial={false}>
            {l.spotlight && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden' }}>
                <div style={{ paddingTop: 8 }}>
                  <Slider label="Intensity" value={l.spotIntensity} onChange={set('spotIntensity')} defaultValue={60} />
                  <Slider label="Size" value={l.spotSize} onChange={set('spotSize')} defaultValue={55} />
                  <Slider label="Softness" value={l.spotSoftness} onChange={set('spotSoftness')} defaultValue={60} />
                  <Slider label="Warmth" value={l.spotWarmth} min={-100} max={100} bipolar onChange={set('spotWarmth')} />
                  <ToggleRow title="Follow my face" value={l.followFace} onChange={set('followFace')} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Section>
      <Section title="Studio light">
        <Slider label="Subject light (dims the room)" value={l.studio} onChange={set('studio')} />
        <Slider label="Key light" value={l.keyLight} onChange={set('keyLight')} />
        {l.keyLight > 0 && (
          <Slider
            label="Key light direction"
            value={l.keyAngle}
            min={-180}
            max={180}
            defaultValue={-40}
            onChange={set('keyAngle')}
            format={(v) => `${Math.round(v)}°`}
          />
        )}
      </Section>
      <Section title="Low light">
        <div className="card">
          <div className="row" style={{ marginBottom: 4 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {fx.lowLight > 0 ? <Moon size={18} color="var(--accent)" /> : <Sun size={18} color="var(--muted)" />}
              <div className="label">
                <b>Night boost</b>
                <small>Brightens dark rooms and removes noise</small>
              </div>
            </div>
          </div>
          <Slider label="Boost" value={fx.lowLight} onChange={(v) => update((e) => void (e.lowLight = v))} />
        </div>
      </Section>
      <FaceNote />
    </>
  )
}
