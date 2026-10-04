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
  Loader2
} from 'lucide-react'
import { IPC, type AppInfo, type DriverStatus, type ThemeMode, type UpdateState } from '@shared/app'
import { invoke } from '@/lib/ipc'
import { updateApp } from '@/lib/controller'
import { toast, useStore } from '@/lib/store'
import { Segmented, Slider, ToggleRow, fadeUp, stagger } from '@/components/ui'

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

export function SettingsPage(): React.JSX.Element {
  const app = useStore((s) => s.app)
  const driver = useStore((s) => s.driver)
  const vcam = useStore((s) => s.vcam)
  const gpu = useStore((s) => s.gpu)
  const ml = useStore((s) => s.ml)
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [busy, setBusy] = useState(false)

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

  const res = app.output.height >= 1080 ? '1080p' : '720p'
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
              <small>Pick “CarrotCam” in Discord, Zoom, Teams, Meet, OBS or any browser</small>
            </div>
            <span className={`badge ${vcam.running ? 'ok' : 'err'}`}>{vcam.running ? '● On' : 'Unavailable'}</span>
          </div>
          <div className="row">
            <div className="label">
              <b>Driver</b>
              <small>
                {driver?.installed
                  ? driver.upToDate
                    ? 'Installed automatically and up to date'
                    : 'Installed (updating…)'
                  : 'Installing automatically…'}
              </small>
            </div>
            <button className="btn sm" disabled={busy} onClick={() => void repair()}>
              {busy ? <Loader2 size={14} className="spin" /> : <Wrench size={14} />} Repair
            </button>
          </div>
          {vcam.error && <p className="hint" style={{ color: 'var(--danger)' }}>{vcam.error}</p>}
          <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
            <Segmented
              value={res}
              onChange={(v) =>
                void updateApp({
                  output: { ...app.output, width: v === '1080p' ? 1920 : 1280, height: v === '1080p' ? 1080 : 720 },
                  // keep the phone stream at least as sharp as the output
                  ...(v === '1080p' && app.stream.resolution === '720p' ? { stream: { ...app.stream, resolution: '1080p' as const } } : {})
                })
              }
              options={[
                { value: '720p', label: '720p HD' },
                { value: '1080p', label: '1080p Full HD' }
              ]}
            />
            <Segmented
              value={app.output.fps}
              onChange={(v) => void updateApp({ output: { ...app.output, fps: v } })}
              options={[
                { value: 30, label: '30 fps' },
                { value: 60, label: '60 fps' }
              ]}
            />
            <p className="hint">Apps that are already using the camera may need to re-select it after changing the resolution.</p>
          </div>
        </motion.div>

        <motion.div className="settings-card" {...stagger(2)}>
          <h2>
            <Smartphone size={18} /> Phone stream
          </h2>
          <div style={{ display: 'grid', gap: 10 }}>
            <Segmented
              value={app.stream.resolution}
              onChange={(v) => void updateApp({ stream: { ...app.stream, resolution: v } })}
              options={[
                { value: '720p', label: '720p' },
                { value: '1080p', label: '1080p' },
                { value: '4k', label: '4K' }
              ]}
            />
            <Segmented
              value={app.stream.fps}
              onChange={(v) => void updateApp({ stream: { ...app.stream, fps: v } })}
              options={[
                { value: 30, label: '30 fps' },
                { value: 60, label: '60 fps' }
              ]}
            />
            <Segmented
              value={app.stream.codec}
              onChange={(v) => void updateApp({ stream: { ...app.stream, codec: v } })}
              options={[
                { value: 'h264', label: 'H.264' },
                { value: 'vp8', label: 'VP8' },
                { value: 'vp9', label: 'VP9' }
              ]}
            />
          </div>
          <Slider
            label="Bitrate"
            value={app.stream.bitrate / 1000}
            min={2}
            max={40}
            defaultValue={10}
            format={(v) => `${Math.round(v)} Mbps`}
            onChange={(v) => void updateApp({ stream: { ...app.stream, bitrate: Math.round(v) * 1000 } })}
          />
          <ToggleRow
            title="Low latency"
            hint="Smallest delay; turn off on weak Wi-Fi for extra smoothness"
            value={app.stream.lowLatency}
            onChange={(v) => void updateApp({ stream: { ...app.stream, lowLatency: v } })}
          />
          <p className="hint">Changes apply the next time the phone starts streaming.</p>
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
            (Apache 2.0).
          </p>
          <button className="btn sm" onClick={() => void invoke(IPC.openExternal, `https://github.com/${info?.repo ?? ''}`)}>
            <ExternalLink size={14} /> GitHub
          </button>
        </motion.div>
      </div>
    </div>
  )
}
