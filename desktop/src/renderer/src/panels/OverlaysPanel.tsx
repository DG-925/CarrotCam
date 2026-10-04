import { AnimatePresence, motion } from 'motion/react'
import { Clock, Frame, Hand, IdCard, Radio } from 'lucide-react'
import type { NameTagStyle, Reaction } from '@shared/effects'
import { engine } from '@/lib/controller'
import { Section, Segmented, Slider, ToggleRow } from '@/components/ui'
import { PanelTitle, useFx } from './common'

const REACTIONS: { kind: Reaction; emoji: string; gesture: string }[] = [
  { kind: 'thumbs', emoji: '👍', gesture: 'Thumbs up' },
  { kind: 'confetti', emoji: '🎊', gesture: 'Peace sign ✌️' },
  { kind: 'hearts', emoji: '❤️', gesture: 'Rock on 🤟' },
  { kind: 'fireworks', emoji: '🎆', gesture: 'Point up ☝️' },
  { kind: 'balloons', emoji: '🎈', gesture: 'Open palm ✋' },
  { kind: 'rain', emoji: '🌧️', gesture: 'Thumbs down' }
]
const BORDER_COLORS = ['#ff7a1a', '#ffffff', '#111111', '#22c55e', '#3b82f6', '#e11d48', '#a855f7']

export function OverlaysPanel(): React.JSX.Element {
  const [fx, update] = useFx()
  const o = fx.overlay
  return (
    <>
      <PanelTitle
        title="Overlays"
        onReset={() =>
          update((e) => {
            e.overlay.nameTag.enabled = false
            e.overlay.clock = false
            e.overlay.badge = 'none'
            e.overlay.border.enabled = false
          })
        }
      />
      <Section title="Name tag">
        <div className="card">
          <ToggleRow
            title="Lower third"
            hint="Show your name on stream"
            icon={<IdCard size={18} color="var(--accent)" />}
            value={o.nameTag.enabled}
            onChange={(v) => update((e) => void (e.overlay.nameTag.enabled = v))}
          />
          <AnimatePresence initial={false}>
            {o.nameTag.enabled && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden' }}>
                <div style={{ display: 'grid', gap: 8, paddingTop: 10 }}>
                  <input
                    className="text-input"
                    value={o.nameTag.name}
                    maxLength={40}
                    placeholder="Your name"
                    onChange={(ev) => update((e) => void (e.overlay.nameTag.name = ev.target.value))}
                  />
                  <input
                    className="text-input"
                    value={o.nameTag.title}
                    maxLength={60}
                    placeholder="Title or tagline"
                    onChange={(ev) => update((e) => void (e.overlay.nameTag.title = ev.target.value))}
                  />
                  <Segmented<NameTagStyle>
                    value={o.nameTag.style}
                    onChange={(v) => update((e) => void (e.overlay.nameTag.style = v))}
                    options={[
                      { value: 'carrot', label: 'Carrot' },
                      { value: 'glass', label: 'Glass' },
                      { value: 'minimal', label: 'Minimal' }
                    ]}
                  />
                  <Segmented<'left' | 'right'>
                    value={o.nameTag.right ? 'right' : 'left'}
                    onChange={(v) => update((e) => void (e.overlay.nameTag.right = v === 'right'))}
                    options={[
                      { value: 'left', label: 'Left' },
                      { value: 'right', label: 'Right' }
                    ]}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Section>

      <Section title="Badges">
        <div className="card">
          <ToggleRow
            title="Clock"
            icon={<Clock size={18} color="var(--accent)" />}
            value={o.clock}
            onChange={(v) => update((e) => void (e.overlay.clock = v))}
          />
          <div className="row">
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <Radio size={18} color="var(--accent)" />
              <div className="label">
                <b>Status badge</b>
              </div>
            </div>
          </div>
          <Segmented<'none' | 'live' | 'onair'>
            value={o.badge}
            onChange={(v) => update((e) => void (e.overlay.badge = v))}
            options={[
              { value: 'none', label: 'None' },
              { value: 'live', label: 'LIVE' },
              { value: 'onair', label: 'ON AIR' }
            ]}
          />
        </div>
      </Section>

      <Section title="Frame">
        <div className="card">
          <ToggleRow
            title="Rounded border"
            icon={<Frame size={18} color="var(--accent)" />}
            value={o.border.enabled}
            onChange={(v) => update((e) => void (e.overlay.border.enabled = v))}
          />
          {o.border.enabled && (
            <div style={{ paddingTop: 8 }}>
              <div className="swatches" style={{ marginBottom: 6 }}>
                {BORDER_COLORS.map((c) => (
                  <button
                    key={c}
                    className={`swatch-btn ${o.border.color === c ? 'active' : ''}`}
                    style={{ background: c }}
                    onClick={() => update((e) => void (e.overlay.border.color = c))}
                  />
                ))}
                <label className="swatch-btn picker">
                  <input type="color" value={o.border.color} onChange={(ev) => update((e) => void (e.overlay.border.color = ev.target.value))} />
                </label>
              </div>
              <Slider label="Thickness" value={o.border.width} min={0} max={40} defaultValue={6} onChange={(v) => update((e) => void (e.overlay.border.width = v))} />
              <Slider label="Corner radius" value={o.border.radius} min={0} max={120} defaultValue={28} onChange={(v) => update((e) => void (e.overlay.border.radius = v))} />
            </div>
          )}
        </div>
      </Section>

      <Section title="Reactions">
        <div className="grid-3" style={{ marginBottom: 10 }}>
          {REACTIONS.map((r) => (
            <button key={r.kind} className="tile" onClick={() => engine.react(r.kind)}>
              <span className="emoji">{r.emoji}</span>
              <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>{r.gesture}</span>
            </button>
          ))}
        </div>
        <div className="card">
          <ToggleRow
            title="Gesture reactions"
            hint="Show a hand gesture to trigger the effect"
            icon={<Hand size={18} color="var(--accent)" />}
            value={o.gestures}
            onChange={(v) => update((e) => void (e.overlay.gestures = v))}
          />
        </div>
      </Section>
    </>
  )
}
