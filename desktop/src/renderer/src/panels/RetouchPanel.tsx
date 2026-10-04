import { motion } from 'motion/react'
import { Section, Slider } from '@/components/ui'
import { FaceNote, PanelTitle, useFx } from './common'

const QUICK = [
  { label: 'Off', v: { smooth: 0, eyes: 0, teeth: 0, faceLight: 0 } },
  { label: 'Subtle', v: { smooth: 25, eyes: 15, teeth: 15, faceLight: 15 } },
  { label: 'Glow', v: { smooth: 50, eyes: 35, teeth: 35, faceLight: 35 } },
  { label: 'Glam', v: { smooth: 75, eyes: 55, teeth: 50, faceLight: 45 } }
]

export function RetouchPanel(): React.JSX.Element {
  const [fx, update] = useFx()
  const r = fx.retouch
  const set = (k: keyof typeof r) => (v: number) =>
    update((e) => {
      e.retouch[k] = v
    })
  return (
    <>
      <PanelTitle
        title="Retouch"
        onReset={() => update((e) => void (e.retouch = { smooth: 0, eyes: 0, teeth: 0, faceLight: 0, slim: 0, eyeEnlarge: 0 }))}
      />
      <div className="grid-4" style={{ marginBottom: 18 }}>
        {QUICK.map((q, i) => {
          const active = q.v.smooth === r.smooth && q.v.eyes === r.eyes && q.v.teeth === r.teeth && q.v.faceLight === r.faceLight
          return (
            <motion.button
              key={q.label}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className={`tile ${active ? 'active' : ''}`}
              onClick={() => update((e) => void (e.retouch = { ...e.retouch, ...q.v }))}
            >
              {q.label}
            </motion.button>
          )
        })}
      </div>
      <Section title="Skin & face">
        <Slider label="Smooth skin" value={r.smooth} onChange={set('smooth')} />
        <Slider label="Face light" value={r.faceLight} onChange={set('faceLight')} />
        <Slider label="Brighten eyes" value={r.eyes} onChange={set('eyes')} />
        <Slider label="Whiten teeth" value={r.teeth} onChange={set('teeth')} />
      </Section>
      <Section title="Reshape">
        <Slider label="Slim face" value={r.slim} onChange={set('slim')} />
        <Slider label="Enlarge eyes" value={r.eyeEnlarge} onChange={set('eyeEnlarge')} />
      </Section>
      <FaceNote />
    </>
  )
}
