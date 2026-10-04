import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import {
  Camera,
  Download,
  ExternalLink,
  Info,
  Keyboard,
  Monitor,
  Palette,
  RefreshCw,
  Settings2,
  Smartphone,
  Wrench,
  Loader2,
  ChevronDown,
  Gauge,
  Cpu
} from 'lucide-react'
import { IPC, type AppInfo, type AppSettings, type DriverStatus, type OutputFormat, type ThemeMode, type UpdateState } from '@shared/app'
import { invoke } from '@/lib/ipc'
import { selectSource, updateApp } from '@/lib/controller'
import { toast, useStore } from '@/lib/store'
import { Slider, ToggleRow, fadeUp, stagger } from '@/components/ui'
import { Dropdown, type DropdownOption } from '@/components/Dropdown'

function ThemeCards(): React.JSX.Element {
  const theme = useStore((s) => s.app.theme)
  const cards: { id: ThemeMode; label: string; bg: string; side: string; fg: string }[] = [
    { id: 'system', label: 'System', bg: 'linear-gradient(90deg,#f6f3ef 50%,#0e0d0c 50%)', side: '#ff7a1a', fg: '#888' },
    { id: 'light', label: 'Light', bg: '#f6f3ef', side: '#ece6df', fg: '#fff' },
    { id: 'dark', label: 'Dark', bg: '#0e0d0c', side: '#171513', fg: '#1e1b19' }
  ]
  return (
    <div className="theme-cards">
      {cards.map((c) => (
        <button key={c.id} className={`theme-card ${theme === c.id ? 'active' : ''}`} onClick={() => void updateApp({ theme: c.id })}>
          <div className="mini" style={{ background: c.bg }}>
            <div style={{ background: c.side }} />
            <div style={{ padding: 8, display: 'grid', gap: 5, alignContent: 'start' }}>
              <div style={{ height: 22, borderRadius: 5, background: c.fg, opacity: 0.9 }} />
              <div style={{ height: 6, width: '60%', borderRadius: 3, background: '#ff7a1a' }} />
            </div>
          </div>
          {c.label}
        </button>
      ))}
    </div>
  )
}

function UpdateCard({ info }: { info: AppInfo | null }): React.JSX.Element {
  const update = useStore((s) => s.update)
  const app = useStore((s) => s.app)
  const label = (u: UpdateState): string => {
    switch (u.state) {
      case 'checking':
        return 'Checking for updates…'
      case 'none':
        return 'You are up to date'
      case 'available':
        return `Version ${u.version} is available`
      case 'downloading':
        return `Downloading… ${Math.round(u.percent)}%`
      case 'ready':
        return `Version ${u.version} is ready to install`
      case 'error':
        return `Update error: ${u.message}`
      default:
        return 'Updates come straight from GitHub Releases'
    }
  }
  return (
    <motion.div className="settings-card" {...stagger(4)}>
      <h2>
        <Download size={18} /> Updates
      </h2>
      <div className="row">
        <div className="label">
          <b>CarrotCam {info?.version}</b>
          <small>{label(update)}</small>
        </div>
        {update.state === 'ready' ? (
          <button className="btn primary sm" onClick={() => void invoke(IPC.updateInstall)}>
            Restart & update
          </button>
        ) : update.state === 'available' && !app.autoUpdate ? (
          <button className="btn primary sm" onClick={() => void invoke(IPC.updateDownload)}>
            Download
          </button>
        ) : (
          <button className="btn sm" disabled={update.state === 'checking' || update.state === 'downloading'} onClick={() => void invoke(IPC.updateCheck)}>
            {update.state === 'checking' ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />} Check now
          </button>
        )}
      </div>
      {update.state === 'downloading' && (
        <div style={{ height: 6, borderRadius: 6, background: 'var(--surface-3)', overflow: 'hidden', margin: '10px 0' }}>
          <motion.div style={{ height: '100%', background: 'var(--accent-grad)' }} animate={{ width: `${update.percent}%` }} />
        </div>
      )}
      <ToggleRow
        title="Automatic updates"
        hint="Download new versions in the background"
        value={app.autoUpdate}
        onChange={(v) => void updateApp({ autoUpdate: v })}
      />
    </motion.div>
  )
}

const OUTPUT_FORMATS: Record<string, OutputFormat> = {
  '720p30': { width: 1280, height: 720, fps: 30 },
  '1080p30': { width: 1920, height: 1080, fps: 30 },
  '720p60': { width: 1280, height: 720, fps: 60 },
  '1080p60': { width: 1920, height: 1080, fps: 60 }
}
const OUTPUT_OPTIONS: DropdownOption<string>[] = [
  { value: '720p30', label: 'HD · 30 fps', description: 'Recommended for calls', icon: Monitor },
  { value: '1080p30', label: 'Full HD · 30 fps', description: 'Sharper, for streaming', icon: Monitor },
  { value: '720p60', label: 'HD · 60 fps', description: 'Extra smooth motion', icon: Monitor },
  { value: '1080p60', label: 'Full HD · 60 fps', description: 'Needs a fast PC and phone', icon: Monitor }
]

type Quality = 'smooth' | 'sharp' | 'fluid' | 'max' | 'custom'
const QUALITY: Record<Exclude<Quality, 'custom'>, Pick<AppSettings['stream'], 'resolution' | 'fps' | 'bitrate'>> = {
  smooth: { resolution: '720p', fps: 30, bitrate: 8000 },
  sharp: { resolution: '1080p', fps: 30, bitrate: 12000 },
  fluid: { resolution: '720p', fps: 60, bitrate: 12000 },
  max: { resolution: '4k', fps: 30, bitrate: 30000 }
}
const QUALITY_OPTIONS: DropdownOption<Quality>[] = [
  { value: 'smooth', label: 'Smooth', description: '720p · 30 fps · works on every phone', icon: Gauge },
  { value: 'sharp', label: 'Sharp', description: '1080p · 30 fps · most phones', icon: Gauge },
  { value: 'fluid', label: 'Ultra smooth', description: '720p · 60 fps · fast phones', icon: Gauge },
  { value: 'max', label: 'Maximum', description: '4K · 30 fps · flagship phones', icon: Gauge },
  { value: 'custom', label: 'Custom', description: 'Set in Advanced', icon: Gauge, disabled: true }
]
const CODEC_OPTIONS: DropdownOption<AppSettings['stream']['codec']>[] = [
  { value: 'h264', label: 'H.264', description: 'Recommended: uses the phone hardware', icon: Cpu },
  { value: 'vp8', label: 'VP8', description: 'Compatible, but heavier on the phone', icon: Cpu },
  { value: 'vp9', label: 'VP9', description: 'Efficient, heavy on older phones', icon: Cpu }
]

function qualityOf(s: AppSettings['stream']): Quality {
  for (const [k, q] of Object.entries(QUALITY)) {
    if (q.resolution === s.resolution && q.fps === s.fps) return k as Quality
  }
  return 'custom'
}

function restartPhone(): void {
  const src = useStore.getState().source
  if (src.kind === 'phone' && src.id) void selectSource(src.id)
}

async function setQuality(q: Quality): Promise<void> {
  if (q === 'custom') return
  const app = useStore.getState().app
  await updateApp({ stream: { ...app.stream, ...QUALITY[q] } })
  restartPhone()
}

export function SettingsPage(): React.JSX.Element {
  const app = useStore((s) => s.app)
  const driver = useStore((s) => s.driver)
  const vcam = useStore((s) => s.vcam)
  const gpu = useStore((s) => s.gpu)
  const ml = useStore((s) => s.ml)
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [advanced, setAdvanced] = useState(false)

  useEffect(() => {
    void invoke<AppInfo>(IPC.appInfo).then(setInfo)
    void invoke<DriverStatus>(IPC.driverStatus).then((driver) => useStore.setState({ driver }))
  }, [])

  const repair = async (): Promise<void> => {
    setBusy(true)
    const d = await invoke<DriverStatus>(IPC.driverInstall)
    useStore.setState({ driver: d })
    setBusy(false)
    toast(d.installed ? { kind: 'success', title: 'Virtual camera installed' } : { kind: 'error', title: 'Install failed', body: d.error })
  }

  return (
    <div className="page-inner">
      <motion.div className="page-head" {...fadeUp}>
        <div>
          <h1>Settings</h1>
          <p>Make CarrotCam yours.</p>
        </div>
      </motion.div>
      <div className="settings-grid">
        <motion.div className="settings-card" {...stagger(0)}>
          <h2>
            <Palette size={18} /> Appearance
          </h2>
          <ThemeCards />
        </motion.div>

        <motion.div className="settings-card" {...stagger(1)}>
          <h2>
            <Camera size={18} /> Virtual camera
          </h2>
          <div className="row">
            <div className="label">
              <b>CarrotCam camera is always on</b>
              <small>
                {driver?.installed
                  ? 'Installed automatically. Pick “CarrotCam” in Discord, Zoom, Teams, Meet, OBS or your browser.'
                  : 'Installing…'}
              </small>
            </div>
            <button className="btn sm" disabled={busy} onClick={() => void repair()} title="Re-install the camera driver">
              {busy ? <Loader2 size={14} className="spin" /> : <Wrench size={14} />} Repair
            </button>
          </div>
          {vcam.error && <p className="hint" style={{ color: 'var(--danger)' }}>{vcam.error}</p>}
          <div style={{ marginTop: 12 }}>
            <div className="side-label" style={{ marginLeft: 2 }}>Picture size</div>
            <Dropdown
              value={`${app.output.height}p${app.output.fps}`}
              options={OUTPUT_OPTIONS}
              onChange={(v) => {
                const o = OUTPUT_FORMATS[v]
                void updateApp({
                  output: o,
                  // keep the phone stream at least as sharp as the output
                  ...(o.height >= 1080 && app.stream.resolution === '720p' ? { stream: { ...app.stream, resolution: '1080p' as const } } : {})
                })
              }}
            />
            <p className="hint">Apps already using the camera may need to pick it again after a change.</p>
          </div>
        </motion.div>

        <motion.div className="settings-card" {...stagger(2)}>
          <h2>
            <Smartphone size={18} /> Phone video quality
          </h2>
          <Dropdown value={qualityOf(app.stream)} options={QUALITY_OPTIONS} onChange={(v) => void setQuality(v)} />
          <p className="hint">Changes apply right away. If the video stutters, pick Smooth.</p>
          <button className="btn ghost sm" style={{ marginTop: 4 }} onClick={() => setAdvanced(!advanced)}>
            <ChevronDown size={14} style={{ transform: advanced ? 'rotate(180deg)' : undefined, transition: 'transform .2s' }} />
            Advanced
          </button>
          {advanced && (
            <div style={{ marginTop: 8 }}>
              <div className="side-label" style={{ marginLeft: 2 }}>Video codec</div>
              <Dropdown
                compact
                value={app.stream.codec}
                options={CODEC_OPTIONS}
                onChange={(v) => void updateApp({ stream: { ...app.stream, codec: v } }).then(restartPhone)}
              />
              <Slider
                label="Bitrate"
                value={app.stream.bitrate / 1000}
                min={2}
                max={40}
                defaultValue={8}
                format={(v) => `${Math.round(v)} Mbps`}
                onChange={(v) => void updateApp({ stream: { ...app.stream, bitrate: Math.round(v) * 1000 } })}
              />
              <ToggleRow
                title="Low latency"
                hint="Smallest delay. Turn off on weak Wi-Fi."
                value={app.stream.lowLatency}
                onChange={(v) => void updateApp({ stream: { ...app.stream, lowLatency: v } })}
              />
            </div>
          )}
        </motion.div>

        <motion.div className="settings-card" {...stagger(3)}>
          <h2>
            <Settings2 size={18} /> General
          </h2>
          <ToggleRow title="Start with Windows" value={app.startAtLogin} onChange={(v) => void updateApp({ startAtLogin: v })} />
          <ToggleRow
            title="Start minimized"
            hint="Run quietly in the tray"
            value={app.startMinimized}
            onChange={(v) => void updateApp({ startMinimized: v })}
          />
          <ToggleRow
            title="Keep running in the tray"
            hint="Closing the window keeps the camera live"
            value={app.closeToTray}
            onChange={(v) => void updateApp({ closeToTray: v })}
          />
          <ToggleRow
            title="Record microphone"
            hint="Include your mic in recordings"
            value={app.recordAudio}
            onChange={(v) => void updateApp({ recordAudio: v })}
          />
        </motion.div>

        <UpdateCard info={info} />

        <motion.div className="settings-card" {...stagger(5)}>
          <h2>
            <Keyboard size={18} /> Global shortcuts
          </h2>
          {[
            ['Privacy blur', 'Ctrl + Alt + P'],
            ['Be right back', 'Ctrl + Alt + B'],
            ['Freeze frame', 'Ctrl + Alt + F'],
            ['Snapshot', 'Ctrl + Alt + S']
          ].map(([a, k]) => (
            <div className="row" key={a}>
              <span>{a}</span>
              <span className="kbd">{k}</span>
            </div>
          ))}
          <p className="hint">Works even when CarrotCam is in the background — perfect during calls.</p>
        </motion.div>

        <motion.div className="settings-card" {...stagger(6)} style={{ gridColumn: '1 / -1' }}>
          <h2>
            <Info size={18} /> About
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <span className="badge accent">v{info?.version}</span>
            <span className="badge">
              <Monitor size={11} /> {gpu || 'GPU'}
            </span>
            {ml && <span className="badge">AI: {ml.delegate}</span>}
            <span className="badge">Electron {info?.electron}</span>
            <span className="badge">Chromium {info?.chrome}</span>
          </div>
          <p className="hint" style={{ marginTop: 0 }}>
            CarrotCam is free and open source. The virtual camera driver is based on softcam (MIT), effects use MediaPipe
            (Apache 2.0). Carrot icon by Freepik from Flaticon.
          </p>
          <button className="btn sm" onClick={() => void invoke(IPC.openExternal, `https://github.com/${info?.repo ?? ''}`)}>
            <ExternalLink size={14} /> GitHub
          </button>
        </motion.div>
      </div>
    </div>
  )
}
