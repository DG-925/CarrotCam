import { BatteryCharging, Clapperboard, Download, Hand, Images, Plus, Settings, Smartphone, Usb, Video, VideoOff } from 'lucide-react'
import { IPC } from '@shared/app'
import { invoke } from '@/lib/ipc'
import { selectSource } from '@/lib/controller'
import { useStore, type Page } from '@/lib/store'
import { isUsbDevice } from '@/lib/usb'
import { Logo } from './ui'
import { Dropdown, type DropdownOption } from './Dropdown'

function CameraPicker(): React.JSX.Element {
  const devices = useStore((s) => s.devices)
  const cameras = useStore((s) => s.cameras)
  const source = useStore((s) => s.source)
  const phoneStatus = useStore((s) => s.phoneStatus)
  const set = useStore((s) => s.set)

  const options: DropdownOption<string>[] = [
    ...devices.map((d) => {
      const ps = phoneStatus[d.id]
      const usb = isUsbDevice(d)
      const parts = [usb ? 'Connected by USB' : 'Connected by Wi-Fi', ps?.battery !== undefined ? `${Math.round(ps.battery)}%` : null]
      return {
        value: `phone:${d.id}`,
        label: d.info.name,
        description: parts.filter(Boolean).join(' · '),
        icon: usb ? Usb : Smartphone,
        group: 'Phones',
        badge: usb ? <span className="usb-tag">USB</span> : undefined,
        right: ps?.charging ? <BatteryCharging size={15} color="var(--green)" /> : undefined
      }
    }),
    ...cameras.map((c) => ({ value: `cam:${c.id}`, label: c.label, description: 'Webcam', icon: Video, group: 'Webcams' })),
    { value: 'none', label: 'No camera', description: 'Show the standby screen', icon: VideoOff, group: devices.length || cameras.length ? ' ' : undefined }
  ]

  return (
    <Dropdown
      className="cam-picker"
      compact
      menuWidth={300}
      value={source.id ?? 'none'}
      options={options}
      placeholder="Pick a camera"
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
            <Plus size={16} />
          </span>
          <span className="dd-text">
            <span className="dd-label">Phones and connecting</span>
            <span className="dd-desc">Add a phone with Wi-Fi or a USB cable</span>
          </span>
        </button>
      )}
    />
  )
}

function VcamPill(): React.JSX.Element {
  const vcam = useStore((s) => s.vcam)
  const driver = useStore((s) => s.driver)
  const set = useStore((s) => s.set)
  let tone = 'ok'
  let text = 'Virtual camera on'
  let short = 'On'
  if (driver && !driver.supported) {
    tone = 'warn'
    text = 'Virtual camera needs Windows'
    short = 'Windows only'
  } else if (!driver || (!driver.installed && !driver.error)) {
    tone = 'warn'
    text = 'Setting up virtual camera'
    short = 'Setting up'
  } else if (vcam.error || driver.error || !vcam.running) {
    tone = 'err'
    text = 'Virtual camera needs attention'
    short = 'Problem'
  } else if (vcam.inUse) {
    text = 'Virtual camera in use'
    short = 'In use'
  }
  return (
    <button
      className={`pill ${tone}`}
      title={tone === 'ok' ? 'Pick “CarrotCam” as the camera in any app' : 'Open camera settings'}
      onClick={() => set({ page: 'settings', settingsSection: 'camera' })}
    >
      <span className="pdot" />
      <span className="ptext-long">{text}</span>
      <span className="ptext-short">{short}</span>
    </button>
  )
}

const TABS: { id: Page; label: string; icon: typeof Hand }[] = [
  { id: 'studio', label: 'Studio', icon: Clapperboard },
  { id: 'gallery', label: 'Gallery', icon: Images },
  { id: 'controls', label: 'Controls', icon: Hand }
]

export function TopBar(): React.JSX.Element {
  const page = useStore((s) => s.page)
  const update = useStore((s) => s.update)
  const set = useStore((s) => s.set)
  return (
    <header className="topbar">
      <div className="group">
        <div className="brand">
          <Logo size={24} />
          <span>CarrotCam</span>
        </div>
        <CameraPicker />
        <VcamPill />
      </div>
      <nav className="nav-tabs" aria-label="Pages">
        {TABS.map((t) => (
          <button key={t.id} className={`nav-tab ${page === t.id ? 'active' : ''}`} onClick={() => set({ page: t.id, viewer: null })} title={t.label}>
            <t.icon size={16} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
      <div className="group right">
        {update.state === 'ready' && (
          <button className="pill accent" onClick={() => void invoke(IPC.updateInstall)} title="Restart CarrotCam to update">
            <Download size={14} />
            <span className="ptext-long">Restart to update</span>
          </button>
        )}
        <button
          className={`square-btn ${page === 'settings' ? 'active' : ''}`}
          onClick={() => set({ page: page === 'settings' ? 'studio' : 'settings' })}
          title="Settings"
          aria-label="Settings"
        >
          <Settings size={18} />
          {(update.state === 'available' || update.state === 'ready') && <span className="badge-dot" />}
        </button>
      </div>
    </header>
  )
}
