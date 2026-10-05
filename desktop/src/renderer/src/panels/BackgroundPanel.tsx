import { useEffect, useRef, useState } from 'react'
import { Ban, Droplet, ImagePlus, Lamp, Palette, Sparkle, Contrast, X } from 'lucide-react'
import type { BackgroundMode } from '@shared/effects'
import { BUILT_IN_BACKGROUNDS } from '@/lib/backgrounds'
import { deleteUserBackground, selectStoredBackground, setBackgroundImage, userBackgrounds } from '@/lib/controller'
import { useStore } from '@/lib/store'
import { Section, Slider } from '@/components/ui'
import { PanelTitle, useFx } from './common'

const MODES: { id: BackgroundMode; label: string; icon: typeof Ban }[] = [
  { id: 'none', label: 'None', icon: Ban },
  { id: 'blur', label: 'Blur', icon: Droplet },
  { id: 'image', label: 'Image', icon: ImagePlus },
  { id: 'studio', label: 'Studio', icon: Lamp },
  { id: 'color', label: 'Color', icon: Palette },
  { id: 'desaturate', label: 'Color pop', icon: Contrast }
]

const COLORS = ['#1b1714', '#0f172a', '#14532d', '#ffffff', '#ff7a1a', '#7c3aed', '#0ea5e9', '#e11d48', '#00b140']

export function BackgroundPanel(): React.JSX.Element {
  const [fx, update] = useFx()
  const ml = useStore((s) => s.ml)
  const [mine, setMine] = useState<{ id: string; url: string }[]>([])
  const file = useRef<HTMLInputElement>(null)
  const bg = fx.background

  useEffect(() => {
    let urls: string[] = []
    void userBackgrounds().then((list) => {
      urls = list.map((x) => x.url)
      setMine(list)
    })
    return () => urls.forEach((u) => URL.revokeObjectURL(u))
  }, [bg.imageId])

  const setMode = (mode: BackgroundMode): void => {
    if (mode === 'image' && !bg.imageId) {
      void setBackgroundImage({ builtIn: BUILT_IN_BACKGROUNDS[0].id })
      return
    }
    update((e) => void (e.background.mode = mode))
  }

  return (
    <>
      <PanelTitle title="Background" onReset={() => update((e) => void (e.background.mode = 'none'))} />
      <div className="grid-3" style={{ marginBottom: 18 }}>
        {MODES.map((m) => (
          <button key={m.id} className={`tile ${bg.mode === m.id ? 'active' : ''}`} onClick={() => setMode(m.id)}>
            <m.icon size={20} />
            {m.label}
          </button>
        ))}
      </div>

      {bg.mode !== 'none' && (
        <Section title="Edges">
          <Slider label="Edge softness" value={bg.feather} onChange={(v) => update((e) => void (e.background.feather = v))} defaultValue={40} />
          {ml?.error && <p className="hint" style={{ color: 'var(--danger)' }}>Segmentation unavailable: {ml.error}</p>}
        </Section>
      )}

      {bg.mode === 'blur' && (
        <Section title="Blur">
          <Slider label="Blur strength" value={bg.blur} onChange={(v) => update((e) => void (e.background.blur = v))} defaultValue={60} />
        </Section>
      )}

      {(bg.mode === 'image' || bg.mode === 'none' || bg.mode === 'blur') && (
        <Section title="Virtual backgrounds">
          <div className="grid-3">
            {BUILT_IN_BACKGROUNDS.map((b) => (
              <button
                key={b.id}
                className={`bg-tile ${bg.mode === 'image' && bg.imageId === b.id ? 'active' : ''}`}
                style={{ background: b.preview }}
                title={b.name}
                onClick={() => void setBackgroundImage({ builtIn: b.id })}
              />
            ))}
            {mine.map((b) => (
              <div key={b.id} className="bg-tile-wrap">
                <button
                  className={`bg-tile ${bg.mode === 'image' && bg.imageId === b.id ? 'active' : ''}`}
                  style={{ backgroundImage: `url(${b.url})` }}
                  onClick={() => void selectStoredBackground(b.id)}
                  title="Use this background"
                />
                <button
                  className="bg-delete"
                  title="Delete this background"
                  onClick={() => void deleteUserBackground(b.id).then(() => setMine((m) => m.filter((x) => x.id !== b.id)))}
                >
                  <X size={13} />
                </button>
              </div>
            ))}
            <button className="bg-tile add" onClick={() => file.current?.click()} title="Add your own image">
              <ImagePlus size={20} />
            </button>
          </div>
          <input
            ref={file}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void setBackgroundImage({ file: f })
              e.target.value = ''
            }}
          />
        </Section>
      )}

      {(bg.mode === 'color' || bg.mode === 'studio') && (
        <Section title={bg.mode === 'studio' ? 'Studio backdrop color' : 'Color'}>
          <div className="swatches">
            {COLORS.map((c) => (
              <button
                key={c}
                className={`swatch-btn ${bg.color === c ? 'active' : ''}`}
                style={{ background: c }}
                onClick={() => update((e) => void (e.background.color = c))}
              />
            ))}
            <label className="swatch-btn picker" title="Custom color">
              <input type="color" value={bg.color} onChange={(e) => update((x) => void (x.background.color = e.target.value))} />
            </label>
          </div>
          {bg.mode === 'color' && (
            <p className="hint" style={{ marginTop: 10 }}>
              <Sparkle size={12} /> Tip: pick green for a chroma-key background in OBS.
            </p>
          )}
        </Section>
      )}
    </>
  )
}
