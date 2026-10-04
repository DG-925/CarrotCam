import { AnimatePresence, motion } from 'motion/react'
import { Crop, Image, Layers, Palette, ScanFace, SlidersHorizontal, Sparkles, SunMedium, Wand2 } from 'lucide-react'
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
import { Dropdown, type DropdownOption } from './Dropdown'

const VIEWS: Record<PanelTab, () => React.JSX.Element> = {
  looks: LooksPanel,
  adjust: AdjustPanel,
  filters: FiltersPanel,
  background: BackgroundPanel,
  retouch: RetouchPanel,
  lighting: LightingPanel,
  framing: FramingPanel,
  effects: EffectsPanel,
  overlays: OverlaysPanel
}

export const CATEGORIES: DropdownOption<PanelTab>[] = [
  { value: 'looks', label: 'Looks', description: 'One-tap styles', icon: Sparkles },
  { value: 'adjust', label: 'Adjust', description: 'Brightness, color and detail', icon: SlidersHorizontal },
  { value: 'filters', label: 'Filters', description: 'Color grades and LUTs', icon: Palette },
  { value: 'background', label: 'Background', description: 'Blur or replace it', icon: Image },
  { value: 'retouch', label: 'Retouch', description: 'Smooth skin, brighter eyes', icon: ScanFace },
  { value: 'lighting', label: 'Lighting', description: 'Spotlight and night boost', icon: SunMedium },
  { value: 'framing', label: 'Framing', description: 'Zoom, auto-frame, rotate', icon: Crop },
  { value: 'effects', label: 'Effects', description: 'Creative styles', icon: Wand2 },
  { value: 'overlays', label: 'Overlays', description: 'Name tag, clock, border', icon: Layers }
]

export function Panel(): React.JSX.Element {
  const tab = useStore((s) => s.tab)
  const setTab = useStore((s) => s.setTab)
  const View = VIEWS[tab] ?? LooksPanel

  return (
    <aside className="panel">
      <div className="panel-head">
        <div className="side-label">Effects</div>
        <Dropdown value={tab} options={CATEGORIES} onChange={setTab} />
      </div>
      <div className="panel-body">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            <View />
          </motion.div>
        </AnimatePresence>
      </div>
    </aside>
  )
}
