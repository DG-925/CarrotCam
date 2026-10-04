import { useState } from 'react'
import { motion } from 'motion/react'
import { Briefcase, Film, Flashlight, Gamepad2, Leaf, Moon, Plus, ScanFace, Sparkles, Star, Trash2, Tv, Wand } from 'lucide-react'
import { cloneEffects, defaultEffects } from '@shared/effects'
import { BUILT_IN_PRESETS } from '@/lib/presets'
import { useStore } from '@/lib/store'
import { Section, ToggleRow, stagger } from '@/components/ui'
import { PanelTitle, useFx } from './common'

const ICONS: Record<string, typeof Leaf> = {
  leaf: Leaf,
  sparkles: Sparkles,
  gamepad: Gamepad2,
  film: Film,
  flashlight: Flashlight,
  briefcase: Briefcase,
  tv: Tv,
  moon: Moon,
  star: Star,
  scan: ScanFace
}

export function LooksPanel(): React.JSX.Element {
  const [fx, update] = useFx()
  const activePreset = useStore((s) => s.activePreset)
  const userPresets = useStore((s) => s.userPresets)
  const replace = useStore((s) => s.replaceEffects)
  const save = useStore((s) => s.saveUserPreset)
  const remove = useStore((s) => s.deleteUserPreset)
  const [naming, setNaming] = useState<string | null>(null)

  return (
    <>
      <PanelTitle title="Looks" onReset={() => replace(cloneEffects(defaultEffects), 'natural')} />
      <div className="look-grid">
        {BUILT_IN_PRESETS.map((p, i) => {
          const Icon = ICONS[p.icon] ?? Star
          return (
            <motion.button
              key={p.id}
              {...stagger(i)}
              className={`look-card ${activePreset === p.id ? 'active' : ''}`}
              onClick={() => replace(p.effects, p.id)}
            >
              <span className="look-icon">
                <Icon size={18} />
              </span>
              <span className="look-name">{p.name}</span>
              <span className="look-desc">{p.description}</span>
            </motion.button>
          )
        })}
      </div>

      <Section
        title="My looks"
        action={
          naming === null ? (
            <button className="btn ghost sm" onClick={() => setNaming('')}>
              <Plus size={14} /> Save current
            </button>
          ) : null
        }
      >
        {naming !== null && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
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
          </motion.form>
        )}
        {userPresets.length === 0 && naming === null ? (
          <p className="hint">Tweak anything you like, then save it here to switch back with one click.</p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {userPresets.map((p, i) => (
              <motion.div key={p.id} {...stagger(i)} className={`my-look ${activePreset === p.id ? 'active' : ''}`}>
                <button className="my-look-main" onClick={() => replace(p.effects, p.id)}>
                  <Star size={16} /> {p.name}
                </button>
                <button className="icon-btn" title="Delete" onClick={() => remove(p.id)}>
                  <Trash2 size={14} />
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </Section>

      <div className="card">
        <ToggleRow
          title="Auto enhance"
          hint="Fixes brightness and color automatically"
          icon={<Wand size={18} color="var(--accent)" />}
          value={fx.autoEnhance}
          onChange={(v) => update((e) => void (e.autoEnhance = v))}
        />
      </div>
    </>
  )
}
