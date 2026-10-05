import { useMemo, useRef, useState } from 'react'
import { FileUp, Search, X } from 'lucide-react'
import { LOOKS } from '@/engine/looks'
import { engine, importLut } from '@/lib/controller'
import { idb } from '@/lib/idb'
import { useThumbs } from '@/lib/thumbs'
import { Section, Slider, Switch } from '@/components/ui'
import { PanelTitle, useFx } from './common'

export function FiltersPanel(): React.JSX.Element {
  const [fx, update] = useFx()
  const file = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return LOOKS
    return LOOKS.filter((l) => `${l.name} ${l.tags ?? ''}`.toLowerCase().includes(q))
  }, [query])

  // live previews, only for the filters that are visible
  const thumb = useThumbs(shown.map((l) => l.id))

  return (
    <>
      <PanelTitle title="Filters" onReset={() => update((e) => void (e.filter = { id: 'original', intensity: 100 }))} />
      {fx.filter.id !== 'original' && (
        <Slider
          label={`${LOOKS.find((l) => l.id === fx.filter.id)?.name ?? 'Filter'} strength`}
          value={fx.filter.intensity}
          defaultValue={100}
          format={(v) => `${Math.round(v)}%`}
          onChange={(v) => update((e) => void (e.filter.intensity = v))}
        />
      )}
      <div className="search-box" style={{ marginTop: 6 }}>
        <Search size={16} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${LOOKS.length} filters: warm, film, black and white…`}
        />
        {query && (
          <button className="icon-btn" style={{ width: 26, height: 26 }} onClick={() => setQuery('')} title="Clear the search">
            <X size={14} />
          </button>
        )}
      </div>
      {shown.length === 0 && <p className="hint" style={{ margin: '4px 2px 18px' }}>No filters match “{query}”.</p>}
      <div className="filter-grid">
        {shown.map((l) => (
          <button
            key={l.id}
            className={`filter-tile ${fx.filter.id === l.id ? 'active' : ''}`}
            onClick={() => update((e) => void (e.filter.id = l.id))}
          >
            <span className="fthumb">
              <span className="swatch" style={{ background: `linear-gradient(135deg, ${l.swatch[0]}, ${l.swatch[1]})` }} />
              <canvas width={192} height={108} ref={thumb(l.id)} />
            </span>
            <span className="name">{l.name}</span>
          </button>
        ))}
      </div>

      <Section title="Custom LUT (.cube)">
        <div className="card" style={{ padding: '10px 14px 12px' }}>
          {fx.lut.name ? (
            <>
              <div className="row">
                <div className="label">
                  <b>{fx.lut.name}</b>
                  <small>3D color lookup table</small>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <Switch value={fx.lut.enabled} onChange={(v) => update((e) => void (e.lut.enabled = v))} />
                  <button
                    className="icon-btn"
                    title="Remove LUT"
                    onClick={() => {
                      engine.setLut(2, null)
                      void idb.del('lut')
                      update((e) => void (e.lut = { enabled: false, name: null, intensity: 100 }))
                    }}
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
              <Slider
                label="LUT strength"
                value={fx.lut.intensity}
                defaultValue={100}
                onChange={(v) => update((e) => void (e.lut.intensity = v))}
              />
            </>
          ) : (
            <p className="hint" style={{ margin: '0 0 10px' }}>
              Import any 3D LUT from DaVinci Resolve, Premiere or the web to apply a pro color grade.
            </p>
          )}
          <button className="btn sm" style={{ marginTop: 6 }} onClick={() => file.current?.click()}>
            <FileUp size={14} /> Import .cube
          </button>
          <input
            ref={file}
            type="file"
            accept=".cube"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void importLut(f)
              e.target.value = ''
            }}
          />
        </div>
      </Section>
    </>
  )
}
