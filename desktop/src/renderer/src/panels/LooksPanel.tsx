import { useState } from 'react'
import { motion } from 'motion/react'
import { Plus, Trash2, Wand } from 'lucide-react'
import { cloneEffects, defaultEffects } from '@shared/effects'
import { BUILT_IN_PRESETS } from '@/lib/presets'
import { useStore } from '@/lib/store'
import { Section, ToggleRow, stagger } from '@/components/ui'
import { PanelTitle, useFx } from './common'

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
      <Section title="One-tap looks">
        <div className="grid-4">
          {BUILT_IN_PRESETS.map((p, i) => (
            <motion.button
              key={p.id}
              {...stagger(i)}
              className={`tile ${activePreset === p.id ? 'active' : ''}`}
              onClick={() => replace(p.effects, p.id)}
            >
              <span className="emoji">{p.emoji}</span>
              {p.name}
            </motion.button>
          ))}
        </div>
      </Section>

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
          <p className="hint">Tweak anything you like, then save it here to switch back with one tap.</p>
        ) : (
          <div className="grid-2">
            {userPresets.map((p, i) => (
              <motion.div key={p.id} {...stagger(i)} style={{ position: 'relative' }}>
                <button
                  className={`tile ${activePreset === p.id ? 'active' : ''}`}
                  style={{ width: '100%', flexDirection: 'row', justifyContent: 'flex-start', padding: '10px 12px' }}
                  onClick={() => replace(p.effects, p.id)}
                >
                  <span>{p.emoji}</span> {p.name}
                </button>
                <button
                  className="icon-btn"
                  style={{ position: 'absolute', right: 4, top: 4 }}
                  title="Delete"
                  onClick={() => remove(p.id)}
                >
                  <Trash2 size={14} />
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Quick fixes">
        <div className="card">
          <ToggleRow
            title="Auto enhance"
            hint="Balances exposure and white balance live"
            icon={<Wand size={18} color="var(--accent)" />}
            value={fx.autoEnhance}
            onChange={(v) => update((e) => void (e.autoEnhance = v))}
          />
        </div>
      </Section>
    </>
  )
}
