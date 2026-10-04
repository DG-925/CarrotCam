import { AnimatePresence, motion } from 'motion/react'
import {
  Crop,
  Image,
  Layers,
  Palette,
  ScanFace,
  SlidersHorizontal,
  Sparkles,
  SunMedium,
  Wand2
} from 'lucide-react'
import { useStore, type PanelTab } from '@/lib/store'
import { LooksPanel } from '@/panels/LooksPanel'
import { AdjustPanel } from '@/panels/AdjustPanel'
import { FiltersPanel } from '@/panels/FiltersPanel'
import { EffectsPanel } from '@/panels/EffectsPanel'
import { BackgroundPanel } from '@/panels/BackgroundPanel'
import { RetouchPanel } from '@/panels/RetouchPanel'
import { LightingPanel } from '@/panels/LightingPanel'
import { FramingPanel } from '@/panels/FramingPanel'
import { OverlaysPanel } from '@/panels/OverlaysPanel'

const TABS: { id: PanelTab; label: string; icon: typeof Crop; view: () => React.JSX.Element }[] = [
  { id: 'looks', label: 'Looks', icon: Sparkles, view: LooksPanel },
  { id: 'adjust', label: 'Adjust', icon: SlidersHorizontal, view: AdjustPanel },
  { id: 'filters', label: 'Filters', icon: Palette, view: FiltersPanel },
  { id: 'background', label: 'Backdrop', icon: Image, view: BackgroundPanel },
  { id: 'retouch', label: 'Retouch', icon: ScanFace, view: RetouchPanel },
  { id: 'lighting', label: 'Lighting', icon: SunMedium, view: LightingPanel },
  { id: 'framing', label: 'Framing', icon: Crop, view: FramingPanel },
  { id: 'effects', label: 'Effects', icon: Wand2, view: EffectsPanel },
  { id: 'overlays', label: 'Overlays', icon: Layers, view: OverlaysPanel }
]

export function Panel(): React.JSX.Element {
  const tab = useStore((s) => s.tab)
  const setTab = useStore((s) => s.setTab)
  const current = TABS.find((t) => t.id === tab) ?? TABS[0]
  const View = current.view

  return (
    <aside className="panel">
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`tab ${t.id === tab ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.id === tab && (
              <motion.div layoutId="tab-bg" className="tab-bg" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />
            )}
            <t.icon size={18} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
      <div className="panel-body">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <View />
          </motion.div>
        </AnimatePresence>
      </div>
    </aside>
  )
}
