// Dialogs for adding sources: pick a screen or window, or type a web address.
import { useEffect, useState } from 'react'
import { Globe, Loader2, Monitor, RefreshCw, AppWindow, X } from 'lucide-react'
import { IPC, type CaptureSource } from '@shared/app'
import { invoke } from '@/lib/ipc'
import { Segmented } from './ui'

export function CapturePicker({
  initial,
  onPick,
  onClose
}: {
  initial: 'screen' | 'window'
  onPick: (s: CaptureSource) => void
  onClose: () => void
}): React.JSX.Element {
  const [kind, setKind] = useState<'screen' | 'window'>(initial)
  const [list, setList] = useState<CaptureSource[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = (): void => {
    setList(null)
    setError(null)
    invoke<CaptureSource[]>(IPC.captureSources, kind)
      .then(setList)
      .catch((e) => setError(String(e?.message ?? e)))
  }
  useEffect(load, [kind])
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal picker-modal" role="dialog" aria-label="Pick what to capture">
        <div className="modal-head">
          <div>
            <h2>Add {kind === 'screen' ? 'a screen' : 'a window'}</h2>
            <p>{kind === 'screen' ? 'Everything on a monitor.' : 'One app. It keeps showing even when other windows cover it.'}</p>
          </div>
          <button className="icon-btn" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
            <div style={{ width: 260 }}>
              <Segmented<'screen' | 'window'>
                value={kind}
                onChange={setKind}
                options={[
                  {
                    value: 'screen',
                    label: (
                      <>
                        <Monitor size={14} /> Full screen
                      </>
                    )
                  },
                  {
                    value: 'window',
                    label: (
                      <>
                        <AppWindow size={14} /> Window
                      </>
                    )
                  }
                ]}
              />
            </div>
            <button className="btn sm" onClick={load} title="Refresh the list">
              <RefreshCw size={14} />
            </button>
          </div>
          {error && <p className="hint err-text">{error}</p>}
          {!list && !error && (
            <p className="hint">
              <Loader2 size={14} className="spin" /> Looking…
            </p>
          )}
          {list && list.length === 0 && <p className="hint">Nothing to capture right now.</p>}
          <div className="capture-grid">
            {list?.map((s) => (
              <button key={s.id} className="capture-option" onClick={() => onPick(s)} title={s.name}>
                <span className="co-thumb">{s.thumbnail ? <img src={s.thumbnail} alt="" draggable={false} /> : <Monitor size={24} />}</span>
                <span className="co-name">
                  {s.icon && <img src={s.icon} width={16} height={16} alt="" />}
                  <span>{s.name}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

const SIZES: { label: string; w: number; h: number }[] = [
  { label: 'HD 1280 × 720', w: 1280, h: 720 },
  { label: 'Full HD 1920 × 1080', w: 1920, h: 1080 },
  { label: 'Tall 400 × 700 (chat)', w: 400, h: 700 },
  { label: 'Banner 1280 × 200', w: 1280, h: 200 }
]

export function WebDialog({
  initial,
  onDone,
  onClose
}: {
  initial?: { url: string; width: number; height: number }
  onDone: (v: { url: string; width: number; height: number }) => void
  onClose: () => void
}): React.JSX.Element {
  const [url, setUrl] = useState(initial?.url ?? '')
  const [size, setSize] = useState({ w: initial?.width ?? 1280, h: initial?.height ?? 720 })
  const valid = /^(https?:\/\/)?[\w-]+(\.[\w-]+)+/i.test(url.trim()) || /^https?:\/\/localhost/i.test(url.trim())
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="modal"
        role="dialog"
        aria-label="Web page source"
        onSubmit={(e) => {
          e.preventDefault()
          if (valid) onDone({ url: url.trim(), width: size.w, height: size.h })
        }}
      >
        <div className="modal-head">
          <div>
            <h2>
              <Globe size={18} style={{ verticalAlign: -3, marginRight: 8, color: 'var(--accent)' }} />
              Web page
            </h2>
            <p>Show a web page in your picture: stream alerts, chat, a clock, a slide deck. Transparent pages blend in.</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">
          <label className="field-label">Web address</label>
          <input className="text-input" autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
          <label className="field-label">Page size</label>
          <div className="grid-2">
            {SIZES.map((s) => (
              <button
                type="button"
                key={s.label}
                className={`tile ${size.w === s.w && size.h === s.h ? 'active' : ''}`}
                style={{ minHeight: 40 }}
                onClick={() => setSize({ w: s.w, h: s.h })}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
            <input
              className="text-input"
              type="number"
              min={160}
              max={3840}
              value={size.w}
              onChange={(e) => setSize({ ...size, w: Number(e.target.value) || 1280 })}
              aria-label="Width"
            />
            <span className="hint">×</span>
            <input
              className="text-input"
              type="number"
              min={90}
              max={2160}
              value={size.h}
              onChange={(e) => setSize({ ...size, h: Number(e.target.value) || 720 })}
              aria-label="Height"
            />
          </div>
        </div>
        <div className="modal-foot">
          <span className="hint">Pages run muted and can’t open other windows.</span>
          <button className="btn primary" type="submit" disabled={!valid}>
            {initial ? 'Save' : 'Add web page'}
          </button>
        </div>
      </form>
    </div>
  )
}
