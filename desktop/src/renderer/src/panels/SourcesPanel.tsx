import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  AppWindow,
  ArrowDown,
  ArrowUp,
  Camera,
  Copy,
  Eye,
  EyeOff,
  Film,
  Globe,
  Image as ImageIcon,
  Loader2,
  Lock,
  Monitor,
  Palette,
  Pencil,
  Plus,
  RefreshCw,
  Smartphone,
  Square,
  Trash2,
  Type,
  Unlock,
  Video,
  Volume2,
  VolumeX
} from 'lucide-react'
import { DEFAULT_TEXT, type SceneSource, type SourceKind } from '@shared/scenes'
import type { AppSettings } from '@shared/app'
import { updateApp } from '@/lib/controller'
import { idb } from '@/lib/idb'
import { mixer, type ChannelId } from '@/lib/mixer'
import { KIND_LABEL, layoutRect, mediaKey, useScenes } from '@/lib/scenes'
import { restartSource } from '@/lib/sources'
import { toast, useStore } from '@/lib/store'
import { Section, Segmented, Slider, Switch } from '@/components/ui'
import { CapturePicker, WebDialog } from '@/components/SourcePickers'
import { PanelTitle } from './common'

export const KIND_ICON: Record<SourceKind, typeof Monitor> = {
  camera: Video,
  screen: Monitor,
  window: AppWindow,
  image: ImageIcon,
  video: Film,
  web: Globe,
  text: Type,
  color: Square,
  device: Camera
}

// ---- scenes ------------------------------------------------------------------------------
function Scenes(): React.JSX.Element {
  const scenes = useScenes((s) => s.scenes)
  const active = useScenes((s) => s.active)
  const { setActive, addScene, renameScene, deleteScene, moveScene } = useScenes.getState()
  const [editing, setEditing] = useState<string | null>(null)
  return (
    <Section
      title="Scenes"
      action={
        <div style={{ display: 'flex', gap: 2 }}>
          <button className="icon-btn" title="Copy this scene" onClick={() => addScene(undefined, true)}>
            <Copy size={15} />
          </button>
          <button className="icon-btn" title="New scene" onClick={() => addScene()}>
            <Plus size={17} />
          </button>
        </div>
      }
    >
      <div className="list">
        {scenes.map((s, i) => (
          <div key={s.id} className={`list-row ${s.id === active ? 'active' : ''}`} onClick={() => setActive(s.id)}>
            <span className="num-badge" title={i < 9 ? `Ctrl + Alt + ${i + 1}` : undefined}>
              {i + 1}
            </span>
            {editing === s.id ? (
              <input
                className="row-input"
                autoFocus
                defaultValue={s.name}
                maxLength={40}
                onClick={(e) => e.stopPropagation()}
                onBlur={(e) => {
                  renameScene(s.id, e.target.value)
                  setEditing(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                  if (e.key === 'Escape') setEditing(null)
                }}
              />
            ) : (
              <span className="row-name" onDoubleClick={() => setEditing(s.id)}>
                {s.name}
              </span>
            )}
            <span className="row-actions" onClick={(e) => e.stopPropagation()}>
              <button className="icon-btn xs" title="Rename" onClick={() => setEditing(s.id)}>
                <Pencil size={13} />
              </button>
              <button className="icon-btn xs" title="Move up" disabled={i === 0} onClick={() => moveScene(s.id, -1)}>
                <ArrowUp size={13} />
              </button>
              <button className="icon-btn xs" title="Move down" disabled={i === scenes.length - 1} onClick={() => moveScene(s.id, 1)}>
                <ArrowDown size={13} />
              </button>
              {scenes.length > 1 && (
                <button className="icon-btn xs danger" title="Delete scene" onClick={() => deleteScene(s.id)}>
                  <Trash2 size={13} />
                </button>
              )}
            </span>
          </div>
        ))}
      </div>
      <p className="hint" style={{ marginTop: 8 }}>
        Switch with Ctrl + Alt + 1…9, from your phone, or say “Carrot, next scene”.
      </p>
    </Section>
  )
}

// ---- adding sources ------------------------------------------------------------------------
async function storeFile(file: File): Promise<string> {
  const id = Math.random().toString(36).slice(2, 10)
  await idb.set(`src:${id}`, file)
  return id
}

function AddMenu({ onClose, onPick }: { onClose: () => void; onPick: (k: string) => void }): React.JSX.Element {
  const cameras = useStore((s) => s.cameras)
  const devices = useStore((s) => s.devices)
  const main = useStore((s) => s.source.id)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDown = (e: PointerEvent): void => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [onClose])
  const items: { k: string; icon: typeof Monitor; label: string; hint: string }[] = [
    { k: 'screen', icon: Monitor, label: 'Full screen', hint: 'A whole monitor' },
    { k: 'window', icon: AppWindow, label: 'Window', hint: 'One app, like VS Code' },
    { k: 'image', icon: ImageIcon, label: 'Image', hint: 'Logo, picture, PNG with transparency' },
    { k: 'video', icon: Film, label: 'Video', hint: 'A video file, loops' },
    { k: 'web', icon: Globe, label: 'Web page', hint: 'Alerts, chat, any site' },
    { k: 'text', icon: Type, label: 'Text', hint: 'Titles and notes' },
    { k: 'color', icon: Palette, label: 'Color', hint: 'A solid box or background' }
  ]
  const others = [
    ...cameras.filter((c) => `cam:${c.id}` !== main).map((c) => ({ id: `cam:${c.id}`, label: c.label, icon: Camera })),
    ...devices.filter((d) => `phone:${d.id}` !== main).map((d) => ({ id: `phone:${d.id}`, label: d.info.name, icon: Smartphone }))
  ]
  return (
    <div className="add-menu" ref={ref} role="menu">
      {items.map((it) => (
        <button key={it.k} className="menu-item" role="menuitem" onClick={() => onPick(it.k)}>
          <it.icon size={17} />
          <span className="mi-text">
            <b>{it.label}</b>
            <small>{it.hint}</small>
          </span>
        </button>
      ))}
      <div className="menu-sep">Another camera</div>
      {others.length === 0 && <div className="menu-empty">Connect a second webcam or phone</div>}
      {others.map((o) => (
        <button key={o.id} className="menu-item" role="menuitem" onClick={() => onPick(`device|${o.id}|${o.label}`)}>
          <o.icon size={17} />
          <span className="mi-text">
            <b>{o.label}</b>
            <small>Picture in picture</small>
          </span>
        </button>
      ))}
    </div>
  )
}

// ---- the list --------------------------------------------------------------------------------
function SourceRow({ s }: { s: SceneSource }): React.JSX.Element {
  const selected = useScenes((x) => x.selected === s.id)
  const status = useScenes((x) => x.status[s.id])
  const { select, updateSource, removeSource, moveSource } = useScenes.getState()
  const Icon = KIND_ICON[s.kind]
  return (
    <div className={`list-row ${selected ? 'active' : ''} ${s.visible ? '' : 'dim'}`} onClick={() => select(s.id)}>
      <Icon size={15} className="row-icon-sm" />
      <span className="row-name">{s.name}</span>
      {s.visible && status?.state === 'loading' && <Loader2 size={13} className="spin" />}
      {s.visible && status?.state === 'error' && (
        <span title={status.message}>
          <AlertTriangle size={14} color="var(--amber)" />
        </span>
      )}
      <span className="row-actions always" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn xs" title={s.visible ? 'Hide' : 'Show'} onClick={() => updateSource(s.id, { visible: !s.visible })}>
          {s.visible ? <Eye size={14} /> : <EyeOff size={14} />}
        </button>
        <button className={`icon-btn xs ${s.locked ? 'on' : ''}`} title={s.locked ? 'Unlock' : 'Lock (no moving by accident)'} onClick={() => updateSource(s.id, { locked: !s.locked })}>
          {s.locked ? <Lock size={14} /> : <Unlock size={14} />}
        </button>
      </span>
      <span className="row-actions" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn xs" title="Bring forward" onClick={() => moveSource(s.id, 1)}>
          <ArrowUp size={13} />
        </button>
        <button className="icon-btn xs" title="Send backward" onClick={() => moveSource(s.id, -1)}>
          <ArrowDown size={13} />
        </button>
        {s.kind !== 'camera' && (
          <button className="icon-btn xs danger" title="Remove" onClick={() => removeSource(s.id)}>
            <Trash2 size={13} />
          </button>
        )}
      </span>
    </div>
  )
}

function Sources(): React.JSX.Element {
  const scene = useScenes((s) => s.scenes.find((x) => x.id === s.active))
  const [menu, setMenu] = useState(false)
  const [picker, setPicker] = useState<'screen' | 'window' | null>(null)
  const [web, setWeb] = useState(false)
  const imageInput = useRef<HTMLInputElement>(null)
  const videoInput = useRef<HTMLInputElement>(null)
  const { addSource } = useScenes.getState()

  const pick = (k: string): void => {
    setMenu(false)
    if (k === 'screen' || k === 'window') setPicker(k)
    else if (k === 'image') imageInput.current?.click()
    else if (k === 'video') videoInput.current?.click()
    else if (k === 'web') setWeb(true)
    else if (k === 'text') addSource('text', 'Text', { textStyle: { ...DEFAULT_TEXT } })
    else if (k === 'color') addSource('color', 'Color', { color: '#ff7a1a' }, { x: 0.35, y: 0.35, w: 0.3, h: 0.3 })
    else if (k.startsWith('device|')) {
      const [, id, label] = k.split('|')
      addSource('device', label, { deviceId: id, deviceLabel: label })
    }
  }

  const addFile = async (file: File | undefined, kind: 'image' | 'video'): Promise<void> => {
    if (!file) return
    if (file.size > 500 * 1024 * 1024) {
      toast({ kind: 'error', title: 'That file is too big', body: 'Pick a file under 500 MB.' })
      return
    }
    const fileId = await storeFile(file)
    addSource(kind, file.name.replace(/\.[^.]+$/, ''), { fileId, fileName: file.name, loop: true, volume: 1 })
  }

  // top of the list = in front
  const list = [...(scene?.sources ?? [])].reverse()
  return (
    <Section
      title="Sources"
      action={
        <div style={{ position: 'relative' }}>
          <button className="btn primary sm" onClick={() => setMenu(!menu)}>
            <Plus size={14} /> Add
          </button>
          {menu && <AddMenu onClose={() => setMenu(false)} onPick={pick} />}
        </div>
      }
    >
      <div className="list">
        {list.map((s) => (
          <SourceRow key={s.id} s={s} />
        ))}
      </div>
      <p className="hint" style={{ marginTop: 8 }}>
        Drag on the picture to move, pull the corners to resize (Shift: free shape). The top of the list is in front.
      </p>
      <input ref={imageInput} type="file" accept="image/*" hidden onChange={(e) => void addFile(e.target.files?.[0], 'image').then(() => (e.target.value = ''))} />
      <input ref={videoInput} type="file" accept="video/*" hidden onChange={(e) => void addFile(e.target.files?.[0], 'video').then(() => (e.target.value = ''))} />
      {picker && (
        <CapturePicker
          initial={picker}
          onClose={() => setPicker(null)}
          onPick={(c) => {
            setPicker(null)
            addSource(c.kind, c.kind === 'screen' ? c.name.replace(/^Entire screen$/i, 'Screen') : c.name, { captureId: c.id, captureName: c.name })
          }}
        />
      )}
      {web && (
        <WebDialog
          onClose={() => setWeb(false)}
          onDone={(v) => {
            setWeb(false)
            let host = v.url
            try {
              host = new URL(v.url.includes('://') ? v.url : `https://${v.url}`).hostname
            } catch {
              /* keep as typed */
            }
            addSource('web', host, { url: v.url, width: v.width, height: v.height })
          }}
        />
      )}
    </Section>
  )
}

// ---- properties of the selected source ---------------------------------------------------------
const PLACES: { id: Parameters<typeof layoutRect>[0]; label: string }[] = [
  { id: 'full', label: 'Fill' },
  { id: 'fit', label: 'Fit' },
  { id: 'left', label: 'Left' },
  { id: 'right', label: 'Right' },
  { id: 'corner-tl', label: '↖' },
  { id: 'corner-tr', label: '↗' },
  { id: 'corner-bl', label: '↙' },
  { id: 'corner-br', label: '↘' }
]
const TEXT_COLORS = ['#ffffff', '#111111', '#ff7a1a', '#ffd166', '#32d27c', '#5cb8ff', '#ff4d6d']

function Properties(): React.JSX.Element | null {
  const src = useScenes((s) => s.scenes.find((x) => x.id === s.active)?.sources.find((x) => x.id === s.selected))
  const sizes = useScenes((s) => s.sizes)
  const status = useScenes((s) => (src ? s.status[src.id] : undefined))
  const output = useStore((s) => s.app.output)
  const cameras = useStore((s) => s.cameras)
  const [picker, setPicker] = useState(false)
  const [web, setWeb] = useState(false)
  if (!src) return null
  const up = useScenes.getState().updateSource
  const key = mediaKey(src)
  const size = key && key !== 'camera' ? sizes[key] : { w: output.width, h: output.height }
  const aspect = size ? size.w / size.h : src.rect.w / src.rect.h
  const outAspect = output.width / output.height
  const t = src.settings.textStyle ?? DEFAULT_TEXT
  const setText = (patch: Partial<typeof t>): void => up(src.id, { settings: { textStyle: { ...t, ...patch } } })

  return (
    <Section title={`${KIND_LABEL[src.kind]} settings`}>
      <div className="card" style={{ padding: '10px 14px 12px' }}>
        <label className="field-label" style={{ marginTop: 0 }}>
          Name
        </label>
        <input className="text-input" value={src.name} maxLength={60} onChange={(e) => up(src.id, { name: e.target.value })} />

        {status?.state === 'error' && (
          <div className="inline-alert">
            <AlertTriangle size={15} />
            <span>{status.message}</span>
            <button className="btn sm" onClick={() => restartSource(src)}>
              <RefreshCw size={13} /> Try again
            </button>
          </div>
        )}

        {(src.kind === 'screen' || src.kind === 'window') && (
          <button className="btn sm block" style={{ marginTop: 10 }} onClick={() => setPicker(true)}>
            {src.kind === 'screen' ? <Monitor size={14} /> : <AppWindow size={14} />} Change {src.kind}
          </button>
        )}
        {src.kind === 'web' && (
          <div className="btn-row">
            <button className="btn sm" onClick={() => setWeb(true)}>
              <Globe size={14} /> Address and size
            </button>
            <button className="btn sm" onClick={() => restartSource(src)}>
              <RefreshCw size={14} /> Reload
            </button>
          </div>
        )}
        {src.kind === 'video' && (
          <div className="row" style={{ minHeight: 36 }}>
            <span>Loop</span>
            <Switch value={src.settings.loop !== false} onChange={(v) => up(src.id, { settings: { loop: v } })} />
          </div>
        )}
        {src.kind === 'color' && (
          <div className="swatches" style={{ marginTop: 10 }}>
            {['#000000', '#ffffff', '#ff7a1a', '#00b140', '#0f172a', '#7c3aed'].map((c) => (
              <button key={c} className={`swatch-btn ${src.settings.color === c ? 'active' : ''}`} style={{ background: c }} onClick={() => up(src.id, { settings: { color: c } })} />
            ))}
            <label className="swatch-btn picker" title="Custom color">
              <input type="color" value={src.settings.color ?? '#000000'} onChange={(e) => up(src.id, { settings: { color: e.target.value } })} />
            </label>
          </div>
        )}
        {src.kind === 'device' && (
          <p className="hint" style={{ marginTop: 8 }}>
            {src.settings.deviceId?.startsWith('phone:') ? 'A phone as picture in picture.' : 'A second webcam as picture in picture.'}{' '}
            {cameras.length === 0 && 'No webcams found right now.'}
          </p>
        )}
        {src.kind === 'text' && (
          <>
            <label className="field-label">Text</label>
            <textarea className="text-input textarea" rows={3} value={t.text} maxLength={400} onChange={(e) => setText({ text: e.target.value })} />
            <Slider label="Size" value={t.size} min={12} max={160} defaultValue={48} onChange={(v) => setText({ size: Math.round(v) })} />
            <div className="swatches">
              {TEXT_COLORS.map((c) => (
                <button key={c} className={`swatch-btn ${t.color === c ? 'active' : ''}`} style={{ background: c }} onClick={() => setText({ color: c })} />
              ))}
              <label className="swatch-btn picker" title="Custom color">
                <input type="color" value={t.color} onChange={(e) => setText({ color: e.target.value })} />
              </label>
            </div>
            <div className="row" style={{ minHeight: 36 }}>
              <span>Bold</span>
              <Switch value={t.bold} onChange={(v) => setText({ bold: v })} />
            </div>
            <div className="row" style={{ minHeight: 36 }}>
              <span>Background box</span>
              <Switch value={!!t.background} onChange={(v) => setText({ background: v ? 'rgba(10,10,12,0.75)' : null })} />
            </div>
            <Segmented<'left' | 'center' | 'right'>
              value={t.align}
              onChange={(v) => setText({ align: v })}
              options={[
                { value: 'left', label: 'Left' },
                { value: 'center', label: 'Center' },
                { value: 'right', label: 'Right' }
              ]}
            />
          </>
        )}

        <label className="field-label">Place</label>
        <div className="place-grid">
          {PLACES.map((p) => (
            <button key={p.id} className="tile" style={{ minHeight: 32 }} disabled={src.locked} onClick={() => up(src.id, { rect: layoutRect(p.id, aspect, outAspect) })}>
              {p.label}
            </button>
          ))}
        </div>
        <Slider label="Opacity" value={Math.round(src.opacity * 100)} defaultValue={100} format={(v) => `${Math.round(v)}%`} onChange={(v) => up(src.id, { opacity: v / 100 })} />
        <Slider label="Rounded corners" value={src.radius} min={0} max={120} defaultValue={0} onChange={(v) => up(src.id, { radius: Math.round(v) })} />
        <details className="crop">
          <summary>Crop</summary>
          {(['l', 't', 'r', 'b'] as const).map((k) => (
            <Slider
              key={k}
              label={{ l: 'Left', t: 'Top', r: 'Right', b: 'Bottom' }[k]}
              value={Math.round(src.crop[k] * 100)}
              min={0}
              max={45}
              defaultValue={0}
              format={(v) => `${Math.round(v)}%`}
              onChange={(v) => up(src.id, { crop: { ...src.crop, [k]: v / 100 } })}
            />
          ))}
        </details>
      </div>
      {picker && (src.kind === 'screen' || src.kind === 'window') && (
        <CapturePicker
          initial={src.kind}
          onClose={() => setPicker(false)}
          onPick={(c) => {
            setPicker(false)
            up(src.id, { kind: c.kind, name: c.name, settings: { captureId: c.id, captureName: c.name } })
          }}
        />
      )}
      {web && (
        <WebDialog
          initial={{ url: src.settings.url ?? '', width: src.settings.width ?? 1280, height: src.settings.height ?? 720 }}
          onClose={() => setWeb(false)}
          onDone={(v) => {
            setWeb(false)
            up(src.id, { settings: { url: v.url, width: v.width, height: v.height } })
          }}
        />
      )}
    </Section>
  )
}

// ---- audio mixer (recordings) -------------------------------------------------------------------
const CHANNELS: { id: ChannelId; label: string }[] = [
  { id: 'desktop', label: 'Desktop audio' },
  { id: 'mic', label: 'Microphone' },
  { id: 'media', label: 'Videos' }
]

function toDb(v: number): string {
  return v <= 0.001 ? '-∞ dB' : `${(20 * Math.log10(v)).toFixed(1)} dB`
}

function AudioMixer(): React.JSX.Element {
  const settings = useStore((s) => s.app.mixer)
  const [levels, setLevels] = useState<Record<ChannelId, number>>({ mic: -60, desktop: -60, media: -60 })
  const [, refresh] = useState(0)

  // meters run only while the mixer is on screen
  useEffect(() => {
    let raf = 0
    let last = 0
    mixer.onChange = () => refresh((x) => x + 1)
    void mixer.hold('mixer-ui').then(() => refresh((x) => x + 1))
    const tick = (t: number): void => {
      if (t - last > 66) {
        last = t
        setLevels(mixer.levels())
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      mixer.release('mixer-ui')
    }
  }, [])

  const set = (id: ChannelId, patch: Partial<AppSettings['mixer'][ChannelId]>): void => {
    const next = { ...settings, [id]: { ...settings[id], ...patch } }
    void updateApp({ mixer: next, ...(id === 'mic' && patch.on !== undefined ? { recordAudio: patch.on } : {}) })
  }

  return (
    <Section title="Audio mixer">
      <p className="hint" style={{ marginBottom: 8 }}>
        What your recordings hear. Calls keep using your normal microphone.
      </p>
      {CHANNELS.map((c) => {
        const s = settings[c.id]
        const db = s.on ? levels[c.id] : -60
        const err = s.on ? mixer.error(c.id) : null
        return (
          <div key={c.id} className="mixer-ch">
            <div className="mixer-top">
              <b>{c.label}</b>
              <span className="hint">{err ?? (s.on ? toDb(s.volume) : 'Off')}</span>
            </div>
            <div className="meter" aria-hidden>
              <span style={{ width: `${Math.max(0, Math.min(100, ((db + 60) / 60) * 100))}%` }} />
            </div>
            <div className="mixer-bottom">
              <div
                className="mixer-fader"
                role="slider"
                aria-label={`${c.label} volume`}
                aria-valuemin={0}
                aria-valuemax={150}
                aria-valuenow={Math.round(s.volume * 100)}
              >
                <input
                  type="range"
                  min={0}
                  max={150}
                  value={Math.round(s.volume * 100)}
                  onChange={(e) => set(c.id, { volume: Number(e.target.value) / 100 })}
                  disabled={!s.on}
                />
              </div>
              <button className={`icon-btn xs ${s.on ? '' : 'muted'}`} title={s.on ? 'Mute' : 'Unmute'} onClick={() => set(c.id, { on: !s.on })}>
                {s.on ? <Volume2 size={15} /> : <VolumeX size={15} />}
              </button>
            </div>
          </div>
        )
      })}
    </Section>
  )
}

export function SourcesPanel(): React.JSX.Element {
  return (
    <>
      <PanelTitle title="Sources" />
      <Scenes />
      <Sources />
      <Properties />
      <AudioMixer />
    </>
  )
}
