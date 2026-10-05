import { useState } from 'react'
import { Check, Hand, Plus, Trash2, Wand } from 'lucide-react'
import { cloneEffects, defaultEffects, type EffectSettings } from '@shared/effects'
import { LOOKS } from '@/engine/looks'
import { BUILT_IN_PRESETS, type Preset } from '@/lib/presets'
import { useStore } from '@/lib/store'
import { useThumbs } from '@/lib/thumbs'
import { Section, Slider, ToggleRow } from '@/components/ui'
import { PanelTitle, useFx } from './common'

/** Cheap stand-ins for what a look does beyond color (drawn with CSS on the live preview). */
function decorations(e: EffectSettings): string[] {
  const out: string[] = []
  if (e.lighting.spotlight) out.push('spot')
  if (e.retouch.faceLight > 0 || e.lighting.studio > 0) out.push('glow')
  if (e.filter.id === 'cinematic') out.push('bars')
  if (e.overlay.nameTag.enabled) out.push('tag')
  return out
}

function swatch(filterId: string): string {
  const l = LOOKS.find((x) => x.id === filterId)
  return l ? `linear-gradient(135deg, ${l.swatch[0]}, ${l.swatch[1]})` : 'var(--surface-3)'
}

function LookThumb({ preset, canvasRef }: { preset: Preset; canvasRef: (el: HTMLCanvasElement | null) => void }): React.JSX.Element {
  const e = preset.effects
  return (
    <span className="look-thumb">
      <span className="swatch" style={{ background: swatch(e.filter.id) }} />
      <canvas width={160} height={120} ref={canvasRef} style={e.framing.autoFrame ? { transform: 'scale(1.7)' } : undefined} />
      {decorations(e).map((d) => (
        <span key={d} className={`deco ${d}`} />
      ))}
    </span>
  )
}

function describe(p: Preset): string {
  const e = p.effects
  const parts = [
    LOOKS.find((l) => l.id === e.filter.id && l.id !== 'original')?.name,
    e.background.mode === 'blur' ? 'blur' : e.background.mode !== 'none' ? 'background' : null,
    e.framing.autoFrame ? 'follow me' : null,
    e.autoEnhance ? 'auto enhance' : null,
    e.overlay.nameTag.enabled ? 'name tag' : null
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'Your camera as it is'
}

export function LooksPanel(): React.JSX.Element {
  const [fx, update] = useFx()
  const activePreset = useStore((s) => s.activePreset)
  const userPresets = useStore((s) => s.userPresets)
  const handControl = useStore((s) => s.app.handControl)
  const replace = useStore((s) => s.replaceEffects)
  const save = useStore((s) => s.saveUserPreset)
  const remove = useStore((s) => s.deleteUserPreset)
  const set = useStore((s) => s.set)
  const [naming, setNaming] = useState<string | null>(null)
  const filterIds = [...new Set([...BUILT_IN_PRESETS, ...userPresets].map((p) => p.effects.filter.id))]
  const thumb = useThumbs(filterIds)
  const filterName = LOOKS.find((l) => l.id === fx.filter.id)?.name

  return (
    <>
      <PanelTitle title="Looks" onReset={() => replace(cloneEffects(defaultEffects), 'natural')} />
      <div className="look-grid">
        {BUILT_IN_PRESETS.map((p) => {
          const active = activePreset === p.id
          return (
            <button key={p.id} className={`look-card ${active ? 'active' : ''}`} onClick={() => replace(p.effects, p.id)} title={p.description}>
              <span style={{ position: 'relative', display: 'block' }}>
                <LookThumb preset={p} canvasRef={thumb(p.effects.filter.id)} />
                {active && (
                  <span className="check-badge">
                    <Check size={10} strokeWidth={3.5} />
                  </span>
                )}
              </span>
              <span className="look-name">{p.name}</span>
            </button>
          )
        })}
      </div>

      <Section title="Fine-tune">
        {fx.filter.id !== 'original' && (
          <Slider
            label={filterName ? `${filterName} strength` : 'Strength'}
            value={fx.filter.intensity}
            defaultValue={100}
            format={(v) => `${Math.round(v)}%`}
            onChange={(v) => update((e) => void (e.filter.intensity = v))}
          />
        )}
        <ToggleRow
          title="Auto enhance"
          hint="Balances light and color"
          icon={<Wand size={17} color="var(--accent)" />}
          value={fx.autoEnhance}
          onChange={(v) => update((e) => void (e.autoEnhance = v))}
        />
      </Section>

      <Section
        title="My looks"
        action={
          naming === null ? (
            <button className="link-btn" onClick={() => setNaming('')}>
              <Plus size={14} strokeWidth={2.5} /> Save current
            </button>
          ) : null
        }
      >
        {naming !== null && (
          <form
            style={{ display: 'flex', gap: 8, marginBottom: 10 }}
            onSubmit={(e) => {
              e.preventDefault()
              save(naming || 'My look')
              setNaming(null)
            }}
          >
            <input
              autoFocus
              className="text-input"
              placeholder="Name your look"
              value={naming}
              maxLength={32}
              onChange={(e) => setNaming(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setNaming(null)}
            />
            <button className="btn primary" type="submit">
              Save
            </button>
          </form>
        )}
        {userPresets.length === 0 && naming === null ? (
          <p className="hint">Tweak anything you like, then save it here to switch back with one click.</p>
        ) : (
          userPresets.map((p) => (
            <div key={p.id} className={`my-look ${activePreset === p.id ? 'active' : ''}`}>
              <button className="my-look-main" onClick={() => replace(p.effects, p.id)}>
                <span className="mthumb">
                  <canvas width={80} height={56} ref={thumb(p.effects.filter.id)} />
                </span>
                <span style={{ minWidth: 0 }}>
                  <b>{p.name}</b>
                  <small>{describe(p)}</small>
                </span>
              </button>
              <button className="icon-btn danger" title={`Delete “${p.name}”`} onClick={() => remove(p.id)}>
                <Trash2 size={15} />
              </button>
            </div>
          ))
        )}
      </Section>

      {handControl && (
        <div className="tip-card">
          <b>
            <Hand size={15} /> Hand control is on
          </b>
          <p>Point up for Follow me, peace sign for a snapshot, three fingers for Be right back.</p>
          <button className="link-btn" onClick={() => set({ page: 'controls', controlsTab: 'hands' })}>
            All gestures
          </button>
        </div>
      )}
    </>
  )
}
