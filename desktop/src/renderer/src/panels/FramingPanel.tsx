import { AnimatePresence, motion } from 'motion/react'
import { Hand, ScanFace } from 'lucide-react'
import type { FrameTightness } from '@shared/effects'
import { Section, Segmented, Slider, ToggleRow } from '@/components/ui'
import { toggleHandControl } from '@/lib/controller'
import { HAND_COMMANDS } from '@/lib/hands'
import { useStore } from '@/lib/store'
import { FaceNote, PanelTitle, useFx } from './common'

export function FramingPanel(): React.JSX.Element {
  const [fx, update] = useFx()
  const handControl = useStore((s) => s.app.handControl)
  const f = fx.framing
  const set = <K extends keyof typeof f>(k: K) => (v: (typeof f)[K]) =>
    update((e) => {
      e.framing[k] = v
    })

  return (
    <>
      <PanelTitle
        title="Framing"
        onReset={() =>
          update((e) => {
            e.framing = { ...e.framing, zoom: 1, panX: 0, panY: 0, rotate: 0, tilt: 0, flip: false, autoFrame: false }
          })
        }
      />
      <Section title="Hand control">
        <div className="card">
          <ToggleRow
            title="Control with your hands"
            hint="Zoom, move and run commands with hand gestures"
            icon={<Hand size={18} color="var(--accent)" />}
            value={handControl}
            onChange={() => void toggleHandControl()}
          />
          <AnimatePresence initial={false}>
            {handControl && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden' }}>
                <div className="gesture-list">
                  <div>
                    <span className="g-emoji">🤏🤏</span>
                    <span>
                      <b>Zoom</b> — pinch with both hands, pull apart or push together
                    </span>
                  </div>
                  <div>
                    <span className="g-emoji">🤏</span>
                    <span>
                      <b>Move</b> — pinch with one hand and drag (while zoomed)
                    </span>
                  </div>
                  {HAND_COMMANDS.map((c) => (
                    <div key={c.gesture}>
                      <span className="g-emoji">{c.emoji}</span>
                      <span>
                        <b>{c.label}</b> — hold
                      </span>
                    </div>
                  ))}
                </div>
                <p className="hint" style={{ margin: '8px 0 2px' }}>
                  Keep your hand in view and hold each gesture for about a second.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Section>
      <Section title="Center stage">
        <div className="card">
          <ToggleRow
            title="Auto framing"
            hint="Smoothly keeps you centered as you move"
            icon={<ScanFace size={18} color="var(--accent)" />}
            value={f.autoFrame}
            onChange={set('autoFrame')}
          />
          <AnimatePresence initial={false}>
            {f.autoFrame && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden' }}>
                <div style={{ paddingTop: 10 }}>
                  <Segmented<FrameTightness>
                    value={f.tightness}
                    onChange={set('tightness')}
                    options={[
                      { value: 'close', label: 'Close-up' },
                      { value: 'medium', label: 'Medium' },
                      { value: 'wide', label: 'Wide' }
                    ]}
                  />
                  <Slider label="Follow speed" value={f.speed} onChange={set('speed')} defaultValue={50} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Section>

      <Section title="Zoom & position">
        <div style={{ opacity: f.autoFrame ? 0.45 : 1, pointerEvents: f.autoFrame ? 'none' : undefined }}>
          <Slider
            label="Zoom"
            value={f.zoom}
            min={1}
            max={4}
            step={0.01}
            defaultValue={1}
            onChange={set('zoom')}
            format={(v) => `${v.toFixed(2)}×`}
          />
          <Slider label="Horizontal" value={Math.round(f.panX * 100)} min={-100} max={100} bipolar onChange={(v) => set('panX')(v / 100)} />
          <Slider label="Vertical" value={Math.round(f.panY * 100)} min={-100} max={100} bipolar onChange={(v) => set('panY')(v / 100)} />
          <p className="hint">Tip: scroll on the preview to zoom, drag to move.</p>
        </div>
      </Section>

      <Section title="Orientation">
        <Segmented<0 | 90 | 180 | 270>
          value={f.rotate}
          onChange={set('rotate')}
          options={[
            { value: 0, label: '0°' },
            { value: 90, label: '90°' },
            { value: 180, label: '180°' },
            { value: 270, label: '270°' }
          ]}
        />
        <Slider label="Straighten" value={f.tilt} min={-15} max={15} step={0.1} bipolar onChange={set('tilt')} format={(v) => `${v.toFixed(1)}°`} />
        <div className="card" style={{ marginTop: 8 }}>
          <ToggleRow title="Mirror" hint="Flip left and right" value={f.mirror} onChange={set('mirror')} />
          <ToggleRow title="Upside down" hint="For phones mounted upside down" value={f.flip} onChange={set('flip')} />
        </div>
      </Section>
      {f.autoFrame && <FaceNote />}
    </>
  )
}
