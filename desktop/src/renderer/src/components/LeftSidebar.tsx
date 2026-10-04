import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  BatteryCharging,
  Camera,
  CircleDot,
  Clapperboard,
  CloudRain,
  Coffee,
  Balloon,
  EyeOff,
  Flashlight,
  Heart,
  Moon,
  PartyPopper,
  Plus,
  Settings,
  Smartphone,
  Snowflake,
  Sparkles,
  Square,
  Sun,
  SwitchCamera,
  ThumbsUp,
  Video,
  VideoOff,
  Eye
} from 'lucide-react'
import type { PrivacyMode, Reaction } from '@shared/effects'
import { engine, phoneCommand, selectSource, setPrivacy, takeSnapshot, toggleRecording, toggleVcam, updateApp } from '@/lib/controller'
import { useStore, type Page } from '@/lib/store'
import { Dropdown, type DropdownOption } from './Dropdown'
import { Switch } from './ui'

function useElapsed(since: number): string {
  const [, tick] = useState(0)
  useEffect(() => {
    if (!since) return
    const t = setInterval(() => tick((x) => x + 1), 500)
    return () => clearInterval(t)
  }, [since])
  if (!since) return ''
  const s = Math.floor((Date.now() - since) / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

const REACTIONS: { kind: Reaction; icon: typeof Heart; label: string }[] = [
  { kind: 'hearts', icon: Heart, label: 'Hearts' },
  { kind: 'thumbs', icon: ThumbsUp, label: 'Thumbs up' },
  { kind: 'confetti', icon: PartyPopper, label: 'Confetti' },
  { kind: 'balloons', icon: Balloon, label: 'Balloons' },
  { kind: 'fireworks', icon: Sparkles, label: 'Fireworks' },
  { kind: 'rain', icon: CloudRain, label: 'Rain' }
]

const PRIVACY: DropdownOption<PrivacyMode>[] = [
  { value: 'off', label: 'Privacy off', description: 'Everyone sees your camera', icon: Eye },
  { value: 'blur', label: 'Blur everything', description: 'Ctrl + Alt + P', icon: EyeOff },
  { value: 'brb', label: 'Be right back', description: 'Ctrl + Alt + B', icon: Coffee },
  { value: 'freeze', label: 'Freeze frame', description: 'Ctrl + Alt + F', icon: Snowflake }
]

function CameraPicker(): React.JSX.Element {
  const devices = useStore((s) => s.devices)
  const cameras = useStore((s) => s.cameras)
  const source = useStore((s) => s.source)
  const phoneStatus = useStore((s) => s.phoneStatus)
  const linkStats = useStore((s) => s.linkStats)
  const stats = useStore((s) => s.stats)
  const setPage = useStore((s) => s.setPage)

  const options: DropdownOption<string>[] = [
    { value: 'none', label: 'No camera', description: 'Show the standby screen', icon: VideoOff },
    ...devices.map((d) => {
      const ps = phoneStatus[d.id]
      const battery = ps?.battery !== undefined ? `${Math.round(ps.battery)}% battery` : 'Phone'
      return {
        value: `phone:${d.id}`,
        label: d.info.name,
        description: battery,
        icon: Smartphone,
        group: 'Phones',
        right: ps?.charging ? <BatteryCharging size={15} color="var(--success)" /> : undefined
      }
    }),
    ...cameras.map((c) => ({ value: `cam:${c.id}`, label: c.label, description: 'Webcam', icon: Video, group: 'Webcams' }))
  ]

  let status: React.ReactNode = 'Pick a phone or webcam above'
  let tone = 'muted'
  if (source.state === 'connecting') {
    status = 'Connecting…'
    tone = 'warn'
  } else if (source.state === 'error') {
    status = source.error ?? 'Something went wrong'
    tone = 'err'
  } else if (source.state === 'live') {
    const l = source.kind === 'phone' && source.id ? linkStats[source.id.slice(6)] : undefined
    status = `Live · ${stats?.inH ? `${stats.inH}p` : ''} ${stats?.inputFps ? `· ${stats.inputFps} fps` : ''}${l?.bitrate ? ` · ${(l.bitrate / 1000).toFixed(1)} Mbps` : ''}`
    tone = 'ok'
  }

  const phoneId = source.kind === 'phone' && source.id ? source.id.slice(6) : null
  const ps = phoneId ? phoneStatus[phoneId] : undefined

  return (
    <div className="side-section">
      <div className="side-label">Camera</div>
      <Dropdown
        value={source.id ?? 'none'}
        options={options}
        onChange={(v) => void selectSource(v === 'none' ? null : v)}
        footer={(close) => (
          <button
            className="dd-option dd-action"
            onClick={() => {
              close()
              setPage('devices')
            }}
          >
            <span className="dd-icon">
              <Plus size={17} />
            </span>
            <span className="dd-text">
              <span className="dd-label">Connect a phone</span>
              <span className="dd-desc">Scan a QR code with the CarrotCam app</span>
            </span>
          </button>
        )}
      />
      <div className={`side-status ${tone}`}>
        <span className="dot" />
        <span>{status}</span>
      </div>
      <AnimatePresence initial={false}>
        {phoneId && source.state === 'live' && (
          <motion.div
            className="side-row"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <button className="btn sm" onClick={() => phoneCommand(phoneId, 'switchCamera')}>
              <SwitchCamera size={15} /> Flip
            </button>
            <button className={`btn sm ${ps?.torch ? 'primary' : ''}`} onClick={() => phoneCommand(phoneId, 'torch', !ps?.torch)}>
              <Flashlight size={15} /> Light
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function VirtualCamera(): React.JSX.Element {
  const vcam = useStore((s) => s.vcam)
  const enabled = useStore((s) => s.app.vcamEnabled)
  return (
    <div className="side-section">
      <div className="side-label">Virtual camera</div>
      <div className={`vcam-card ${vcam.running ? 'on' : ''}`}>
        <div className="vcam-icon">
          <img src="logo.png" alt="" width={26} height={26} />
        </div>
        <div className="vcam-text">
          <b>CarrotCam</b>
          <small>{!vcam.running ? 'Turned off' : vcam.inUse ? 'In use by an app' : 'Ready to use'}</small>
        </div>
        <Switch value={enabled} onChange={() => void toggleVcam()} label="Virtual camera" />
      </div>
      <p className="side-hint">In Discord, Zoom, Teams or your browser, choose “CarrotCam” as your camera.</p>
    </div>
  )
}

function QuickActions(): React.JSX.Element {
  const recording = useStore((s) => s.recording)
  const privacy = useStore((s) => s.effects.privacy)
  const elapsed = useElapsed(recording.startedAt)
  return (
    <div className="side-section">
      <div className="side-label">Quick actions</div>
      <div className="quick-grid">
        <button className="quick-btn" onClick={() => void takeSnapshot()}>
          <Camera size={18} />
          <span>Photo</span>
        </button>
        <button className={`quick-btn ${recording.active ? 'rec' : ''}`} onClick={() => void toggleRecording()}>
          {recording.active ? <Square size={16} fill="currentColor" /> : <CircleDot size={18} />}
          <span>{recording.active ? elapsed : 'Record'}</span>
        </button>
      </div>
      <Dropdown
        compact
        value={privacy}
        options={PRIVACY}
        onChange={(v) => (v === 'off' ? privacy !== 'off' && setPrivacy(privacy) : setPrivacy(v))}
      />
      <div className="reaction-row">
        {REACTIONS.map((r) => (
          <button key={r.kind} className="reaction-btn" title={r.label} onClick={() => engine.react(r.kind)}>
            <r.icon size={17} />
          </button>
        ))}
      </div>
    </div>
  )
}

function Nav(): React.JSX.Element {
  const page = useStore((s) => s.page)
  const setPage = useStore((s) => s.setPage)
  const dark = useStore((s) => s.dark)
  const devices = useStore((s) => s.devices.length)
  const update = useStore((s) => s.update)
  const items: { id: Page; label: string; icon: typeof Settings; badge?: string }[] = [
    { id: 'studio', label: 'Studio', icon: Clapperboard },
    { id: 'devices', label: 'Phones', icon: Smartphone, badge: devices ? String(devices) : undefined },
    { id: 'settings', label: 'Settings', icon: Settings, badge: update.state === 'ready' ? '1' : undefined }
  ]
  return (
    <nav className="side-nav">
      {items.map((it) => (
        <button key={it.id} className={`side-nav-item ${page === it.id ? 'active' : ''}`} onClick={() => setPage(it.id)}>
          {page === it.id && (
            <motion.span layoutId="side-nav-bg" className="side-nav-bg" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />
          )}
          <it.icon size={18} />
          <span>{it.label}</span>
          {it.badge && <span className="side-badge">{it.badge}</span>}
        </button>
      ))}
      <button className="side-nav-item" onClick={() => void updateApp({ theme: dark ? 'light' : 'dark' })}>
        {dark ? <Sun size={18} /> : <Moon size={18} />}
        <span>{dark ? 'Light mode' : 'Dark mode'}</span>
      </button>
    </nav>
  )
}

export function LeftSidebar(): React.JSX.Element {
  return (
    <aside className="left-sidebar">
      <div className="left-scroll">
        <CameraPicker />
        <VirtualCamera />
        <QuickActions />
      </div>
      <Nav />
    </aside>
  )
}
