import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import {
  Balloon,
  BatteryCharging,
  Camera,
  CircleDot,
  Clapperboard,
  CloudRain,
  Coffee,
  Eye,
  EyeOff,
  Heart,
  PartyPopper,
  Plus,
  Settings,
  Smartphone,
  Snowflake,
  Sparkles,
  Square,
  ThumbsUp,
  Usb,
  Video,
  VideoOff
} from 'lucide-react'
import type { PrivacyMode, Reaction } from '@shared/effects'
import { engine, selectSource, setPrivacy, takeSnapshot, toggleRecording } from '@/lib/controller'
import { useStore, type Page } from '@/lib/store'
import { isUsbDevice } from '@/lib/usb'
import { Dropdown, type DropdownOption } from './Dropdown'

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
  const set = useStore((s) => s.set)

  const options: DropdownOption<string>[] = [
    { value: 'none', label: 'No camera', description: 'Show the standby screen', icon: VideoOff },
    ...devices.map((d) => {
      const ps = phoneStatus[d.id]
      const usb = isUsbDevice(d)
      const parts = [usb ? 'USB' : 'Wi-Fi', ps?.battery !== undefined ? `${Math.round(ps.battery)}% battery` : null]
      return {
        value: `phone:${d.id}`,
        label: d.info.name,
        description: parts.filter(Boolean).join(' · '),
        icon: usb ? Usb : Smartphone,
        group: 'Phones',
        right: ps?.charging ? <BatteryCharging size={15} color="var(--success)" /> : undefined
      }
    }),
    ...cameras.map((c) => ({ value: `cam:${c.id}`, label: c.label, description: 'Webcam', icon: Video, group: 'Webcams' }))
  ]

  let status = 'Pick a phone or webcam above'
  let tone = 'muted'
  if (source.state === 'connecting') {
    status = 'Connecting…'
    tone = 'warn'
  } else if (source.state === 'error') {
    status = source.error ?? 'Something went wrong'
    tone = 'err'
  } else if (source.state === 'live') {
    status = 'Live'
    tone = 'ok'
  }

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
              set({ phonesOpen: true })
            }}
          >
            <span className="dd-icon">
              <Plus size={17} />
            </span>
            <span className="dd-text">
              <span className="dd-label">Connect a phone</span>
              <span className="dd-desc">With Wi-Fi or a USB cable</span>
            </span>
          </button>
        )}
      />
      <div className={`side-status ${tone}`}>
        <span className="dot" />
        <span>{status}</span>
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
      <div className="side-label" style={{ marginTop: 16 }}>
        Reactions
      </div>
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
  const update = useStore((s) => s.update)
  const items: { id: Page; label: string; icon: typeof Settings; badge?: string }[] = [
    { id: 'studio', label: 'Studio', icon: Clapperboard },
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
    </nav>
  )
}

export function LeftSidebar(): React.JSX.Element {
  return (
    <aside className="left-sidebar">
      <div className="left-scroll">
        <CameraPicker />
        <QuickActions />
      </div>
      <Nav />
    </aside>
  )
}
