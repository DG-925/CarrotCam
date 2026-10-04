import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import QRCode from 'qrcode'
import {
  BatteryCharging,
  Flashlight,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  SwitchCamera,
  Unplug,
  Wifi,
  Download,
  Video,
  Trash2,
  Thermometer
} from 'lucide-react'
import { IPC, GITHUB_REPO, type ServerInfo } from '@shared/app'
import { invoke } from '@/lib/ipc'
import { phoneCommand, selectSource } from '@/lib/controller'
import { toast, useStore } from '@/lib/store'
import { Slider, fadeUp, stagger } from '@/components/ui'

function QrCard(): React.JSX.Element {
  const server = useStore((s) => s.server)
  const [qr, setQr] = useState<string>('')

  useEffect(() => {
    if (!server?.qr) return
    void QRCode.toDataURL(server.qr, {
      errorCorrectionLevel: 'M',
      margin: 0,
      width: 400,
      color: { dark: '#1a120d', light: '#ffffff' }
    }).then(setQr)
  }, [server?.qr])

  const newCode = async (): Promise<void> => {
    const info = await invoke<ServerInfo>(IPC.serverNewCode)
    useStore.setState({ server: { ...useStore.getState().server, ...info } })
  }

  const code = server?.pairCode ?? '------'
  return (
    <motion.div className="qr-card" {...fadeUp}>
      <h2 style={{ margin: '0 0 4px', fontFamily: 'var(--font-display)' }}>Scan with CarrotCam</h2>
      <p className="hint" style={{ margin: 0 }}>
        Open the CarrotCam app on your phone and tap <b>Scan QR</b>
      </p>
      <div className="qr-frame">
        <AnimatePresence mode="wait">
          {qr && (
            <motion.img
              key={qr}
              src={qr}
              alt="Pairing QR code"
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
            />
          )}
        </AnimatePresence>
      </div>
      <div className="hint">or enter this code</div>
      <div className="pair-code">
        {code.slice(0, 3)} {code.slice(3)}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 14 }}>
        <button className="btn sm" onClick={() => void newCode()}>
          <RefreshCw size={14} /> New code
        </button>
      </div>
      <div className="hint" style={{ marginTop: 16 }}>
        <Wifi size={12} /> {server?.pcName} · {server?.addresses?.[0] ?? 'no network'}:{server?.port}
      </div>
    </motion.div>
  )
}

function DeviceCard({ id }: { id: string }): React.JSX.Element | null {
  const device = useStore((s) => s.devices.find((d) => d.id === id))
  const status = useStore((s) => s.phoneStatus[id])
  const link = useStore((s) => s.linkStats[id])
  const source = useStore((s) => s.source)
  if (!device) return null
  const active = source.id === `phone:${id}`
  const zoom = status?.zoom ?? 1
  return (
    <motion.div className="device-card" layout {...fadeUp}>
      <div className="phone-icon">
        <Smartphone size={26} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>{device.info.name}</div>
        <div className="hint">
          {device.info.model} · {device.info.platform} · app {device.info.app}
        </div>
        <div className="device-meta">
          {active && <span className="badge ok">● {source.state === 'live' ? 'Live' : 'Connecting'}</span>}
          {status?.battery !== undefined && (
            <span className={`badge ${status.battery < 20 && !status.charging ? 'err' : ''}`}>
              {status.charging && <BatteryCharging size={11} />} {Math.round(status.battery)}%
            </span>
          )}
          {active && link?.width ? (
            <span className="badge">
              {link.width}×{link.height} · {link.fps} fps
            </span>
          ) : null}
          {active && link?.codec ? <span className="badge">{link.codec}</span> : null}
          {active && link?.bitrate ? <span className="badge">{(link.bitrate / 1000).toFixed(1)} Mbps</span> : null}
          {active && link?.rtt ? <span className="badge">{link.rtt} ms</span> : null}
          {status?.thermal && status.thermal !== 'normal' && <span className="badge warn">
              <Thermometer size={11} /> {status.thermal}
            </span>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {!active && (
          <button className="btn primary sm" onClick={() => void selectSource(`phone:${id}`)}>
            <Video size={14} /> Use camera
          </button>
        )}
        <button className="btn sm danger" onClick={() => void invoke(IPC.serverKick, id)} title="Disconnect">
          <Unplug size={14} />
        </button>
      </div>
      {active && (
        <div className="device-controls">
          <button className="btn sm" onClick={() => phoneCommand(id, 'switchCamera')}>
            <SwitchCamera size={14} /> {status?.facing === 'front' ? 'Back camera' : 'Front camera'}
          </button>
          <button className={`btn sm ${status?.torch ? 'primary' : ''}`} onClick={() => phoneCommand(id, 'torch', !status?.torch)}>
            <Flashlight size={14} /> Torch
          </button>
          {status?.cameras && status.cameras.length > 2 && (
            <select
              className="btn sm"
              value={status.cameraId}
              onChange={(e) => phoneCommand(id, 'camera', e.target.value)}
              style={{ paddingRight: 8 }}
            >
              {status.cameras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          )}
          <div style={{ flex: 1, minWidth: 180 }}>
            <Slider
              label="Phone zoom"
              value={zoom}
              min={1}
              max={Math.max(2, Math.min(10, status?.maxZoom ?? 4))}
              step={0.1}
              defaultValue={1}
              format={(v) => `${v.toFixed(1)}×`}
              onChange={(v) => {
                useStore.setState({ phoneStatus: { ...useStore.getState().phoneStatus, [id]: { ...status, zoom: v } } })
                phoneCommand(id, 'zoom', v)
              }}
            />
          </div>
        </div>
      )}
    </motion.div>
  )
}

export function DevicesPage(): React.JSX.Element {
  const devices = useStore((s) => s.devices)
  const server = useStore((s) => s.server)
  const [trusted, setTrusted] = useState<{ id: string; name: string; lastSeen: number }[]>([])

  const refresh = async (): Promise<void> => {
    const info = await invoke<ServerInfo & { trusted: { id: string; name: string; lastSeen: number }[] }>(IPC.serverInfo)
    useStore.setState({ server: info })
    setTrusted(info.trusted ?? [])
  }
  useEffect(() => {
    void refresh()
  }, [devices.length])

  const fixFirewall = async (): Promise<void> => {
    const ok = await invoke<boolean>(IPC.firewallFix)
    toast(ok ? { kind: 'success', title: 'Firewall rule added' } : { kind: 'error', title: 'Firewall change was cancelled' })
  }

  return (
    <div className="page-inner">
      <motion.div className="page-head" {...fadeUp}>
        <div>
          <h1>Phones</h1>
          <p>Use your phone as a wireless camera. Connect it once and it reconnects by itself.</p>
        </div>
        <span className={`badge ${server?.running ? 'ok' : 'err'}`}>
          {server?.running ? `Listening on port ${server.port}` : 'Server offline'}
        </span>
      </motion.div>

      <div className="connect-grid">
        <QrCard />
        <div style={{ display: 'grid', gap: 18 }}>
          <motion.div className="settings-card" {...stagger(1)}>
            <h2>
              <Smartphone size={18} /> Connected phones
            </h2>
            {devices.length === 0 ? (
              <div className="empty">
                <div className="empty-icon">
                  <Smartphone size={28} />
                </div>
                No phones connected yet.
                <br />
                Scan the code on the left with the CarrotCam app.
              </div>
            ) : (
              <AnimatePresence>
                {devices.map((d) => (
                  <DeviceCard key={d.id} id={d.id} />
                ))}
              </AnimatePresence>
            )}
          </motion.div>

          <motion.div className="settings-card" {...stagger(2)}>
            <h2>
              <Download size={18} /> Get the phone app
            </h2>
            <ol className="steps">
              <li>
                <span className="num">1</span>
                <div>
                  <b>Install CarrotCam on your phone</b>
                  <div className="hint">
                    Download the Android APK from the{' '}
                    <a
                      href="#"
                      style={{ color: 'var(--accent)' }}
                      onClick={(e) => {
                        e.preventDefault()
                        void invoke(IPC.openExternal, `https://github.com/${GITHUB_REPO}/releases/latest`)
                      }}
                    >
                      latest GitHub release
                    </a>
                    . It updates itself after that.
                  </div>
                </div>
              </li>
              <li>
                <span className="num">2</span>
                <div>
                  <b>Join the same Wi-Fi as this PC</b>
                  <div className="hint">5 GHz Wi-Fi or USB tethering gives the smoothest 1080p60.</div>
                </div>
              </li>
              <li>
                <span className="num">3</span>
                <div>
                  <b>Scan the QR code or pick this PC from the list</b>
                  <div className="hint">Paired phones reconnect automatically next time.</div>
                </div>
              </li>
            </ol>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
              <button className="btn sm" onClick={() => void fixFirewall()}>
                <ShieldCheck size={14} /> Allow through firewall
              </button>
            </div>
          </motion.div>

          {trusted.length > 0 && (
            <motion.div className="settings-card" {...stagger(3)}>
              <h2>
                <ShieldCheck size={18} /> Trusted phones
              </h2>
              {trusted.map((t) => (
                <div className="row" key={t.id}>
                  <div className="label">
                    <b>{t.name}</b>
                    <small>Last seen {new Date(t.lastSeen).toLocaleString()}</small>
                  </div>
                  <button
                    className="btn ghost sm danger"
                    onClick={async () => {
                      await invoke(IPC.serverForget, t.id)
                      void refresh()
                    }}
                  >
                    <Trash2 size={14} /> Forget
                  </button>
                </div>
              ))}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  )
}
