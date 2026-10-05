import { useEffect, useState } from 'react'
import {
  Bug,
  Camera,
  ChevronDown,
  Copy,
  Cpu,
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  Gauge,
  HelpCircle,
  Info,
  Keyboard,
  Loader2,
  Monitor,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Smartphone,
  Video,
  Wand2,
  Wrench
} from 'lucide-react'
import {
  IPC,
  type AppInfo,
  type AppSettings,
  type Diagnostics,
  type DriverStatus,
  type EfficiencyMode,
  type OutputFormat,
  type ThemeMode,
  type UpdateState
} from '@shared/app'
import { invoke } from '@/lib/ipc'
import { isLowEndPc, selectSource, updateApp } from '@/lib/controller'
import { toast, useStore, type SettingsSection } from '@/lib/store'
import { Keys, Slider, ToggleRow } from '@/components/ui'
import { Dropdown, type DropdownOption } from '@/components/Dropdown'

const SECTIONS: { id: SettingsSection; label: string; icon: typeof Info }[] = [
  { id: 'general', label: 'General', icon: Settings2 },
  { id: 'camera', label: 'Virtual camera', icon: Camera },
  { id: 'phone', label: 'Phone', icon: Smartphone },
  { id: 'performance', label: 'Performance', icon: Gauge },
  { id: 'recording', label: 'Recording', icon: Video },
  { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
  { id: 'updates', label: 'Updates', icon: Download },
  { id: 'help', label: 'Help', icon: HelpCircle },
  { id: 'about', label: 'About', icon: Info }
]

// ---- general ---------------------------------------------------------------------------
function ThemeCards(): React.JSX.Element {
  const theme = useStore((s) => s.app.theme)
  const mini = (bg: string, side: string, block: string): React.JSX.Element => (
    <div className="mini" style={{ background: bg }}>
      <div style={{ padding: 8, display: 'grid', gap: 5, alignContent: 'start' }}>
        <div style={{ height: 30, borderRadius: 4, background: block }} />
        <div style={{ height: 6, width: '55%', borderRadius: 3, background: '#ff7a1a' }} />
      </div>
      <div style={{ background: side }} />
    </div>
  )
  const cards: { id: ThemeMode; label: string; preview: React.JSX.Element }[] = [
    {
      id: 'system',
      label: 'Match Windows',
      preview: (
        <div className="mini" style={{ background: 'linear-gradient(90deg, #f6f6f8 50%, #0e0e10 50%)' }}>
          <div />
          <div style={{ background: '#151518' }} />
        </div>
      )
    },
    { id: 'light', label: 'Light', preview: mini('#f6f6f8', '#ffffff', '#e5e5ea') },
    { id: 'dark', label: 'Dark', preview: mini('#0e0e10', '#151518', '#26262c') }
  ]
  return (
    <div className="theme-cards">
      {cards.map((c) => (
        <button key={c.id} className={`theme-card ${theme === c.id ? 'active' : ''}`} onClick={() => void updateApp({ theme: c.id })}>
          {c.preview}
          {c.label}
        </button>
      ))}
    </div>
  )
}

function General({ app }: { app: AppSettings }): React.JSX.Element {
  return (
    <>
      <div className="settings-card">
        <h2>Appearance</h2>
        <ThemeCards />
      </div>
      <div className="settings-card">
        <h2>Startup</h2>
        <ToggleRow title="Start with Windows" hint="Your camera is ready before your first call" value={app.startAtLogin} onChange={(v) => void updateApp({ startAtLogin: v })} />
        <ToggleRow title="Start minimized" hint="Run quietly in the tray" value={app.startMinimized} onChange={(v) => void updateApp({ startMinimized: v })} />
        <ToggleRow
          title="Keep running in the tray"
          hint="Closing the window keeps the virtual camera going"
          value={app.closeToTray}
          onChange={(v) => void updateApp({ closeToTray: v })}
        />
      </div>
    </>
  )
}

// ---- virtual camera ----------------------------------------------------------------
const OUTPUT_FORMATS: Record<string, OutputFormat> = {
  '720p30': { width: 1280, height: 720, fps: 30 },
  '1080p30': { width: 1920, height: 1080, fps: 30 },
  '720p60': { width: 1280, height: 720, fps: 60 },
  '1080p60': { width: 1920, height: 1080, fps: 60 }
}
const OUTPUT_OPTIONS: DropdownOption<string>[] = [
  { value: '720p30', label: 'HD, 30 fps', description: 'Recommended for calls, light on your PC', icon: Monitor },
  { value: '1080p30', label: 'Full HD, 30 fps', description: 'Sharper, for streaming and recording', icon: Monitor },
  { value: '720p60', label: 'HD, 60 fps', description: 'Extra smooth motion', icon: Monitor },
  { value: '1080p60', label: 'Full HD, 60 fps', description: 'Needs a fast PC and phone', icon: Monitor }
]

function VirtualCamera({ app }: { app: AppSettings }): React.JSX.Element {
  const driver = useStore((s) => s.driver)
  const vcam = useStore((s) => s.vcam)
  const [busy, setBusy] = useState(false)

  const repair = async (): Promise<void> => {
    setBusy(true)
    const d = await invoke<DriverStatus>(IPC.driverInstall)
    useStore.setState({ driver: d })
    setBusy(false)
    toast(d.installed ? { kind: 'success', title: 'Virtual camera repaired' } : { kind: 'error', title: 'Repair failed', body: d.error })
  }

  const state = !driver
    ? { badge: 'warn', label: 'Checking', text: 'Checking the virtual camera…' }
    : !driver.supported
      ? { badge: 'warn', label: 'Windows only', text: 'The CarrotCam virtual camera works on Windows 10 and 11.' }
      : driver.installed && vcam.running
        ? {
            badge: 'ok',
            label: vcam.inUse ? 'In use' : 'On',
            text: vcam.inUse ? 'An app is using the CarrotCam camera right now.' : 'Pick “CarrotCam” as your camera in Zoom, Teams, Discord, Meet, OBS or your browser.'
          }
        : { badge: 'err', label: 'Problem', text: vcam.error ?? driver.error ?? 'The virtual camera is not installed. Repair installs it again.' }

  return (
    <>
      <div className="settings-card">
        <h2>
          <Camera size={17} /> CarrotCam camera
        </h2>
        <div className="row">
          <div className="label">
            <b style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              Always on <span className={`badge ${state.badge}`}>{state.label}</span>
            </b>
            <small>{state.text}</small>
          </div>
          {driver?.supported && (
            <button className="btn sm" disabled={busy} onClick={() => void repair()} title="Install the camera driver again">
              {busy ? <Loader2 size={14} className="spin" /> : <Wrench size={14} />} Repair
            </button>
          )}
        </div>
      </div>
      <div className="settings-card">
        <h2>Picture size</h2>
        <p className="sub">What apps receive from the CarrotCam camera.</p>
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
        <p className="hint" style={{ marginTop: 8 }}>
          Apps already using the camera may need to pick it again after a change.
        </p>
      </div>
    </>
  )
}

// ---- phone ---------------------------------------------------------------------------
type Quality = 'smooth' | 'sharp' | 'fluid' | 'max' | 'custom'
const QUALITY: Record<Exclude<Quality, 'custom'>, Pick<AppSettings['stream'], 'resolution' | 'fps' | 'bitrate'>> = {
  smooth: { resolution: '720p', fps: 30, bitrate: 8000 },
  sharp: { resolution: '1080p', fps: 30, bitrate: 12000 },
  fluid: { resolution: '720p', fps: 60, bitrate: 12000 },
  max: { resolution: '4k', fps: 30, bitrate: 30000 }
}
const QUALITY_OPTIONS: DropdownOption<Quality>[] = [
  { value: 'smooth', label: 'Smooth', description: 'Works on every phone and Wi-Fi', icon: Gauge },
  { value: 'sharp', label: 'Sharp', description: 'Most phones, good Wi-Fi or USB', icon: Gauge },
  { value: 'fluid', label: 'Ultra smooth', description: 'Fast phones, for motion', icon: Gauge },
  { value: 'max', label: 'Maximum', description: 'Flagship phones over USB', icon: Gauge },
  { value: 'custom', label: 'Custom', description: 'Set below in Advanced', icon: Gauge, disabled: true }
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

function Phone({ app }: { app: AppSettings }): React.JSX.Element {
  const [advanced, setAdvanced] = useState(false)
  const set = useStore((s) => s.set)
  const setQuality = async (q: Quality): Promise<void> => {
    if (q === 'custom') return
    await updateApp({ stream: { ...app.stream, ...QUALITY[q] } })
    restartPhone()
  }
  const fixFirewall = async (): Promise<void> => {
    const ok = await invoke<boolean>(IPC.firewallFix)
    toast(ok ? { kind: 'success', title: 'Firewall rule added' } : { kind: 'error', title: 'The firewall change was cancelled' })
  }
  return (
    <>
      <div className="settings-card">
        <h2>
          <Smartphone size={17} /> Phones
        </h2>
        <p className="sub">Connect a phone with Wi-Fi or a USB cable. Paired phones reconnect by themselves.</p>
        <div className="btn-row" style={{ marginTop: 4 }}>
          <button className="btn primary sm" onClick={() => set({ phonesOpen: true })}>
            <Smartphone size={14} /> Phones and connecting
          </button>
          <button className="btn sm" onClick={() => void fixFirewall()}>
            <ShieldCheck size={14} /> Allow through the firewall
          </button>
        </div>
      </div>
      <div className="settings-card">
        <h2>Phone video quality</h2>
        <p className="sub">Changes apply right away. If the video stutters, pick Smooth.</p>
        <Dropdown value={qualityOf(app.stream)} options={QUALITY_OPTIONS} onChange={(v) => void setQuality(v)} />
        <button className="btn ghost sm" style={{ marginTop: 10 }} onClick={() => setAdvanced(!advanced)}>
          <ChevronDown size={14} style={{ transform: advanced ? 'rotate(180deg)' : undefined }} />
          Advanced
        </button>
        {advanced && (
          <div style={{ marginTop: 4 }}>
            <label className="field-label">Video codec</label>
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
              onChange={(v) => void updateApp({ stream: { ...app.stream, lowLatency: v } }).then(restartPhone)}
            />
          </div>
        )}
      </div>
    </>
  )
}

// ---- performance -----------------------------------------------------------------------
function Performance({ app }: { app: AppSettings }): React.JSX.Element {
  const efficient = useStore((s) => s.efficient)
  const gpu = useStore((s) => s.gpu)
  const ml = useStore((s) => s.ml)
  const stats = useStore((s) => s.stats)
  const lowEnd = isLowEndPc()
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  const choices: { id: EfficiencyMode; label: string; text: string }[] = [
    { id: 'auto', label: 'Automatic', text: lowEnd ? 'On for this PC' : 'Off for this PC' },
    { id: 'on', label: 'Always on', text: 'Lighter on any PC' },
    { id: 'off', label: 'Off', text: 'Full quality effects' }
  ]
  return (
    <>
      <div className="settings-card">
        <h2>
          <Gauge size={17} /> Efficiency mode
        </h2>
        <p className="sub">
          For slower PCs: background and face effects update less often, effect previews refresh slowly and animations are turned off. Your
          video stays smooth.
        </p>
        <div className="choice-cards">
          {choices.map((c) => (
            <button key={c.id} className={`choice ${app.efficiency === c.id ? 'active' : ''}`} onClick={() => void updateApp({ efficiency: c.id })}>
              <b>{c.label}</b>
              <small>{c.text}</small>
            </button>
          ))}
        </div>
        <p className="hint" style={{ marginTop: 12 }}>
          Efficiency mode is <b>{efficient ? 'on' : 'off'}</b> right now.
        </p>
      </div>
      <div className="settings-card">
        <h2>This PC</h2>
        <dl className="facts">
          <dt>Processor</dt>
          <dd>
            {navigator.hardwareConcurrency} threads{lowEnd ? ' (counts as a slower PC)' : ''}
          </dd>
          {memory && (
            <>
              <dt>Memory</dt>
              <dd>{memory >= 8 ? '8 GB or more' : `${memory} GB`}</dd>
            </>
          )}
          <dt>Graphics</dt>
          <dd>{gpu || 'WebGL2'}</dd>
          <dt>Face and background AI</dt>
          <dd>{ml ? (ml.error ? `Unavailable: ${ml.error}` : ml.delegate === 'GPU' ? 'Runs on the graphics card' : 'Runs on the processor') : 'Starts when an effect needs it'}</dd>
          {stats && (
            <>
              <dt>Video</dt>
              <dd>
                {Math.round(stats.fps)} frames a second, {stats.procMs.toFixed(1)} ms per frame
              </dd>
            </>
          )}
        </dl>
        <p className="hint">Tip: “HD, 30 fps” in Virtual camera is the lightest picture size.</p>
      </div>
    </>
  )
}

// ---- recording -------------------------------------------------------------------------
function Recording({ app }: { app: AppSettings }): React.JSX.Element {
  return (
    <div className="settings-card">
      <h2>
        <Video size={17} /> Snapshots and recordings
      </h2>
      <ToggleRow title="Record the microphone" hint="Include your voice in recordings" value={app.recordAudio} onChange={(v) => void updateApp({ recordAudio: v })} />
      <div className="row">
        <div className="label">
          <b>Snapshots</b>
          <small>Pictures\CarrotCam (also copied to the clipboard)</small>
        </div>
        <button className="btn sm" onClick={() => void invoke(IPC.capturesFolder, 'photo')}>
          <FolderOpen size={14} /> Open
        </button>
      </div>
      <div className="row">
        <div className="label">
          <b>Recordings</b>
          <small>Videos\CarrotCam, saved while you record</small>
        </div>
        <button className="btn sm" onClick={() => void invoke(IPC.capturesFolder, 'video')}>
          <FolderOpen size={14} /> Open
        </button>
      </div>
    </div>
  )
}

// ---- shortcuts -------------------------------------------------------------------------
function Shortcuts(): React.JSX.Element {
  const global: [string, string[]][] = [
    ['Privacy blur', ['Ctrl', 'Alt', 'P']],
    ['Be right back', ['Ctrl', 'Alt', 'B']],
    ['Freeze the picture', ['Ctrl', 'Alt', 'F']],
    ['Snapshot', ['Ctrl', 'Alt', 'S']],
    ['Voice: listen for one command', ['Ctrl', 'Alt', 'Space']]
  ]
  const local: [string, string[]][] = [
    ['Studio', ['Ctrl', '1']],
    ['Gallery', ['Ctrl', '2']],
    ['Controls', ['Ctrl', '3']],
    ['Settings', ['Ctrl', ',']],
    ['Full screen preview', ['Double-click the picture']]
  ]
  return (
    <>
      <div className="settings-card">
        <h2>
          <Keyboard size={17} /> Anywhere in Windows
        </h2>
        <p className="sub">These work even while another app is in front, perfect during calls.</p>
        {global.map(([a, k]) => (
          <div className="row" key={a}>
            <span>{a}</span>
            <Keys keys={k} />
          </div>
        ))}
      </div>
      <div className="settings-card">
        <h2>In CarrotCam</h2>
        {local.map(([a, k]) => (
          <div className="row" key={a}>
            <span>{a}</span>
            <Keys keys={k} />
          </div>
        ))}
      </div>
    </>
  )
}

// ---- updates ---------------------------------------------------------------------------
function updateLabel(u: UpdateState): string {
  switch (u.state) {
    case 'checking':
      return 'Checking for updates…'
    case 'none':
      return 'You have the latest version'
    case 'available':
      return `Version ${u.version} is available`
    case 'downloading':
      return `Downloading… ${Math.round(u.percent)}%`
    case 'ready':
      return `Version ${u.version} is ready. Restart CarrotCam to update.`
    case 'error':
      return `Could not update: ${u.message}`
    default:
      return 'Updates come straight from GitHub'
  }
}

function Updates({ app }: { app: AppSettings }): React.JSX.Element {
  const update = useStore((s) => s.update)
  const version = useStore((s) => s.version)
  return (
    <div className="settings-card">
      <h2>
        <Download size={17} /> Updates
      </h2>
      <div className="row">
        <div className="label">
          <b>CarrotCam {version}</b>
          <small>{updateLabel(update)}</small>
        </div>
        {update.state === 'ready' ? (
          <button className="btn primary sm" onClick={() => void invoke(IPC.updateInstall)}>
            Restart and update
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
        <div className="progress">
          <span style={{ width: `${update.percent}%` }} />
        </div>
      )}
      <ToggleRow title="Automatic updates" hint="Download new versions in the background" value={app.autoUpdate} onChange={(v) => void updateApp({ autoUpdate: v })} />
      <div className="btn-row">
        <button className="btn ghost sm" onClick={() => useStore.setState({ whatsNewOpen: true })}>
          <Wand2 size={14} /> What’s new
        </button>
      </div>
    </div>
  )
}

// ---- help ------------------------------------------------------------------------------
function diagnosticsText(d: Diagnostics, extra: Record<string, string>): string {
  return [
    `CarrotCam ${d.version}`,
    `OS: ${d.os}`,
    `CPU: ${d.cpu} (${d.cores} threads), ${d.memoryGb} GB RAM`,
    `Server: ${d.server.running ? `running on port ${d.server.port}` : 'not running'} (${d.server.addresses.join(', ') || 'no network'})`,
    `Virtual camera: ${d.driver.supported ? (d.driver.installed ? (d.driver.upToDate ? 'installed' : 'installed, outdated') : 'not installed') : 'unsupported'}${d.driver.error ? ` (${d.driver.error})` : ''}`,
    ...Object.entries(extra).map(([k, v]) => `${k}: ${v}`)
  ].join('\n')
}

function Help(): React.JSX.Element {
  const [diag, setDiag] = useState<Diagnostics | null>(null)
  const gpu = useStore((s) => s.gpu)
  const ml = useStore((s) => s.ml)
  const source = useStore((s) => s.source)
  const efficient = useStore((s) => s.efficient)
  useEffect(() => {
    void invoke<Diagnostics>(IPC.diagnostics).then(setDiag)
  }, [])
  const extra = {
    Graphics: gpu || 'unknown',
    AI: ml ? (ml.error ? `error: ${ml.error}` : ml.delegate) : 'idle',
    Camera: `${source.kind ?? 'none'} (${source.state})`,
    'Efficiency mode': efficient ? 'on' : 'off'
  }
  const copy = async (): Promise<void> => {
    if (!diag) return
    await navigator.clipboard.writeText(diagnosticsText(diag, extra))
    toast({ kind: 'success', title: 'Diagnostics copied', body: 'Paste them into your bug report.' })
  }
  const fixFirewall = async (): Promise<void> => {
    const ok = await invoke<boolean>(IPC.firewallFix)
    toast(ok ? { kind: 'success', title: 'Firewall rule added' } : { kind: 'error', title: 'The firewall change was cancelled' })
  }
  return (
    <>
      <div className="settings-card">
        <h2>
          <HelpCircle size={17} /> Common fixes
        </h2>
        <div className="row">
          <div className="label">
            <b>My phone can’t find this PC</b>
            <small>Join the same Wi-Fi, or use a USB cable. Windows Firewall may be blocking CarrotCam.</small>
          </div>
          <button className="btn sm" onClick={() => void fixFirewall()}>
            <ShieldCheck size={14} /> Allow
          </button>
        </div>
        <div className="row">
          <div className="label">
            <b>Apps don’t show the CarrotCam camera</b>
            <small>Repair the virtual camera, then restart the app you are calling from.</small>
          </div>
          <button className="btn sm" onClick={() => useStore.setState({ settingsSection: 'camera' })}>
            <Wrench size={14} /> Repair
          </button>
        </div>
        <div className="row">
          <div className="label">
            <b>Video is choppy</b>
            <small>Pick Smooth phone quality and turn on Efficiency mode.</small>
          </div>
          <button className="btn sm" onClick={() => useStore.setState({ settingsSection: 'performance' })}>
            <Gauge size={14} /> Performance
          </button>
        </div>
        <div className="row">
          <div className="label">
            <b>Show the setup guide again</b>
            <small>Walks you through connecting a phone and the virtual camera</small>
          </div>
          <button className="btn sm" onClick={() => void updateApp({ welcomed: false })}>
            Open
          </button>
        </div>
      </div>
      <div className="settings-card">
        <h2>
          <Bug size={17} /> Report a problem
        </h2>
        {diag ? (
          <dl className="facts">
            <dt>Version</dt>
            <dd>{diag.version}</dd>
            <dt>Windows</dt>
            <dd>{diag.os}</dd>
            <dt>Processor</dt>
            <dd>
              {diag.cpu}, {diag.cores} threads, {diag.memoryGb} GB
            </dd>
            <dt>Graphics</dt>
            <dd>{extra.Graphics}</dd>
            <dt>Phone server</dt>
            <dd>{diag.server.running ? `Port ${diag.server.port} on ${diag.server.addresses.join(', ') || 'no network'}` : 'Not running'}</dd>
          </dl>
        ) : (
          <p className="hint">Collecting…</p>
        )}
        <div className="btn-row">
          <button className="btn sm" disabled={!diag} onClick={() => void copy()}>
            <Copy size={14} /> Copy diagnostics
          </button>
          <button className="btn sm" onClick={() => void invoke(IPC.openLogs)}>
            <FileText size={14} /> Open logs
          </button>
          <button className="btn sm" onClick={() => void invoke(IPC.openExternal, 'https://github.com/DG-925/CarrotCam/issues/new')}>
            <ExternalLink size={14} /> Report on GitHub
          </button>
        </div>
      </div>
    </>
  )
}

// ---- about -----------------------------------------------------------------------------
function About(): React.JSX.Element {
  const [info, setInfo] = useState<AppInfo | null>(null)
  useEffect(() => {
    void invoke<AppInfo>(IPC.appInfo).then(setInfo)
  }, [])
  return (
    <div className="settings-card">
      <h2 style={{ gap: 12 }}>
        <img src="logo.png" width={28} height={28} alt="" /> CarrotCam {info?.version}
      </h2>
      <p className="sub">Your phone as a studio webcam, with effects and a virtual camera.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '10px 0 14px' }}>
        <span className="badge">Electron {info?.electron}</span>
        <span className="badge">Chromium {info?.chrome}</span>
      </div>
      <p className="hint">
        CarrotCam is free and open source (MIT). The virtual camera is based on softcam (MIT). Effects use MediaPipe (Apache 2.0) and voice
        control uses Vosk (Apache 2.0). Carrot icon by Freepik from Flaticon.
      </p>
      <div className="btn-row">
        <button className="btn sm" onClick={() => void invoke(IPC.openExternal, `https://github.com/${info?.repo ?? 'DG-925/CarrotCam'}`)}>
          <ExternalLink size={14} /> GitHub
        </button>
      </div>
    </div>
  )
}

export function SettingsPage(): React.JSX.Element {
  const app = useStore((s) => s.app)
  const section = useStore((s) => s.settingsSection)
  const update = useStore((s) => s.update)
  const driver = useStore((s) => s.driver)
  const vcam = useStore((s) => s.vcam)

  useEffect(() => {
    void invoke<DriverStatus>(IPC.driverStatus).then((driver) => useStore.setState({ driver }))
  }, [])

  const dots: Partial<Record<SettingsSection, boolean>> = {
    updates: update.state === 'available' || update.state === 'ready',
    camera: !!driver?.supported && (!driver.installed || !!vcam.error)
  }
  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0]

  return (
    <div className="settings-layout">
      <nav className="settings-nav" aria-label="Settings sections">
        <h1>Settings</h1>
        {SECTIONS.map((s) => (
          <button key={s.id} className={section === s.id ? 'active' : ''} onClick={() => useStore.setState({ settingsSection: s.id })}>
            <s.icon size={16} />
            {s.label}
            {dots[s.id] && <span className="nav-dot" />}
          </button>
        ))}
      </nav>
      <div className="settings-content">
        <div className="page-inner">
          <div className="page-head">
            <h1>{current.label}</h1>
          </div>
          {section === 'general' && <General app={app} />}
          {section === 'camera' && <VirtualCamera app={app} />}
          {section === 'phone' && <Phone app={app} />}
          {section === 'performance' && <Performance app={app} />}
          {section === 'recording' && <Recording app={app} />}
          {section === 'shortcuts' && <Shortcuts />}
          {section === 'updates' && <Updates app={app} />}
          {section === 'help' && <Help />}
          {section === 'about' && <About />}
        </div>
      </div>
    </div>
  )
}
