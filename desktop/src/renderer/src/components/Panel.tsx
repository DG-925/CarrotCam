import { Crop, Image, Layers, MonitorPlay, Palette, ScanFace, SlidersHorizontal, Sparkles, SunMedium, WandSparkles } from 'lucide-react'
import type { EffectSettings } from '@shared/effects'
import { isPlainCamera } from '@shared/scenes'
import { useScenes } from '@/lib/scenes'
import { useStore, type PanelTab } from '@/lib/store'
import { LooksPanel } from '@/panels/LooksPanel'
import { SourcesPanel } from '@/panels/SourcesPanel'
import { AdjustPanel } from '@/panels/AdjustPanel'
import { FiltersPanel } from '@/panels/FiltersPanel'
import { EffectsPanel } from '@/panels/EffectsPanel'
import { BackgroundPanel } from '@/panels/BackgroundPanel'
import { RetouchPanel } from '@/panels/RetouchPanel'
import { LightingPanel } from '@/panels/LightingPanel'
import { FramingPanel } from '@/panels/FramingPanel'
import { OverlaysPanel } from '@/panels/OverlaysPanel'

const VIEWS: Record<PanelTab, () => React.JSX.Element> = {
  looks: LooksPanel,
  sources: SourcesPanel,
  adjust: AdjustPanel,
  filters: FiltersPanel,
  background: BackgroundPanel,
  retouch: RetouchPanel,
  lighting: LightingPanel,
  framing: FramingPanel,
  effects: EffectsPanel,
  overlays: OverlaysPanel
}

export const CATEGORIES: { value: PanelTab; label: string; icon: typeof Sparkles }[] = [
  { value: 'looks', label: 'Looks', icon: Sparkles },
  { value: 'sources', label: 'Sources', icon: MonitorPlay },
  { value: 'adjust', label: 'Adjust', icon: SlidersHorizontal },
  { value: 'filters', label: 'Filters', icon: Palette },
  { value: 'background', label: 'Background', icon: Image },
  { value: 'retouch', label: 'Retouch', icon: ScanFace },
  { value: 'lighting', label: 'Lighting', icon: SunMedium },
  { value: 'framing', label: 'Framing', icon: Crop },
  { value: 'effects', label: 'Effects', icon: WandSparkles },
  { value: 'overlays', label: 'Overlays', icon: Layers }
]

/** Sections with something switched on get a dot on the rail. */
function inUse(tab: PanelTab, e: EffectSettings): boolean {
  switch (tab) {
    case 'adjust':
      return e.autoEnhance || Object.values(e.adjust).some((v) => v !== 0)
    case 'filters':
      return e.filter.id !== 'original' || (e.lut.enabled && !!e.lut.name)
    case 'background':
      return e.background.mode !== 'none'
    case 'retouch':
      return Object.values(e.retouch).some((v) => v > 0)
    case 'lighting':
      return e.lighting.spotlight || e.lighting.studio > 0 || e.lighting.keyLight > 0 || e.lowLight > 0
    case 'framing':
      return e.framing.autoFrame || e.framing.zoom > 1.01 || e.framing.rotate !== 0 || e.framing.flip || Math.abs(e.framing.tilt) > 0.05
    case 'effects':
      return e.effect.id !== 'none'
    case 'overlays':
      return e.overlay.nameTag.enabled || e.overlay.clock || e.overlay.badge !== 'none' || e.overlay.border.enabled || e.overlay.watermark.enabled
    default:
      return false
  }
}

function sceneInUse(): boolean {
  const sc = useScenes.getState()
  return !isPlainCamera(sc.activeScene())
}

export function Panel(): React.JSX.Element {
  const tab = useStore((s) => s.tab)
  // panels (and their live previews) only run while the Studio is shown
  const visible = useStore((s) => s.page === 'studio')
  const View = VIEWS[tab] ?? LooksPanel
  return (
    <aside className="fx-panel">
      <div className="fx-body" key={tab}>
        {visible && <View />}
      </div>
    </aside>
  )
}

export function Rail(): React.JSX.Element {
  const tab = useStore((s) => s.tab)
  const setTab = useStore((s) => s.setTab)
  const effects = useStore((s) => s.effects)
  useScenes((s) => s.scenes)
  return (
    <nav className="rail" aria-label="Effects">
      {CATEGORIES.map((c) => (
        <button key={c.value} className={`rail-item ${tab === c.value ? 'active' : ''}`} onClick={() => setTab(c.value)} title={c.label}>
          <c.icon size={20} />
          <span>{c.label}</span>
          {tab !== c.value && (c.value === 'sources' ? sceneInUse() : inUse(c.value, effects)) && <span className="rail-dot" />}
        </button>
      ))}
    </nav>
  )
}
