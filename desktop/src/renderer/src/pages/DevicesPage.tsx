import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import QRCode from 'qrcode'
import {
  BatteryCharging,
  Download,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Trash2,
  Unplug,
  Usb,
  Video,
  Wifi,
  X
} from 'lucide-react'
import { IPC, GITHUB_REPO, type ServerInfo } from '@shared/app'
import { invoke } from '@/lib/ipc'
import { selectSource } from '@/lib/controller'
import { isUsbDevice } from '@/lib/usb'
import { toast, useStore } from '@/lib/store'
import { fadeUp, stagger } from '@/components/ui'

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
        Open the CarrotCam app on your phone and tap <b>Scan QR code</b>
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
  const source = useStore((s) => s.source)
  if (!device) return null
  const active = source.id === `phone:${id}`
  const usb = isUsbDevice(device)
  return (
    <motion.div className="device-card" layout {...fadeUp}>
      <div className="phone-icon">{usb ? <Usb size={24} /> : <Smartphone size={24} />}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>{device.info.name}</div>
        <div className="device-meta">
          {active && <span className="badge ok">{source.state === 'live' ? 'In use' : 'Connecting'}</span>}
          <span className="badge">
            {usb ? <Usb size={11} /> : <Wifi size={11} />} {usb ? 'USB cable' : 'Wi-Fi'}
          </span>
          {status?.battery !== undefined && (
            <span className={`badge ${status.battery < 20 && !status.charging ? 'err' : ''}`}>
              {status.charging && <BatteryCharging size={11} />} {Math.round(status.battery)}%
            </span>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {!active && (
          <button className="btn primary sm" onClick={() => void selectSource(`phone:${id}`)}>
            <Video size={14} /> Use
          </button>
        )}
        <button className="btn sm danger" onClick={() => void invoke(IPC.serverKick, id)} title="Disconnect">
          <Unplug size={14} />
        </button>
      </div>
    </motion.div>
  )
}

export function DevicesPage({ onClose }: { onClose?: () => void }): React.JSX.Element {
  const devices = useStore((s) => s.devices)
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
    <div className="phones-inner">
      <div className="phones-head">
        <div>
          <h1>Connect a phone</h1>
          <p>Use your phone as a camera with Wi-Fi or a USB cable. Connect it once and it reconnects by itself.</p>
        </div>
        {onClose && (
          <button className="icon-btn" onClick={onClose} title="Close">
            <X size={20} />
          </button>
        )}
      </div>

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

          <motion.div className="settings-card" {...stagger(3)}>
            <h2>
              <Usb size={18} /> Connect with a USB cable
            </h2>
            <ol className="steps">
              <li>
                <span className="num">1</span>
                <div>
                  <b>Plug your phone into this PC</b>
                  <div className="hint">Any USB cable that charges and transfers data works.</div>
                </div>
              </li>
              <li>
                <span className="num">2</span>
                <div>
                  <b>Turn on USB tethering on the phone</b>
                  <div className="hint">
                    Android: tap <b>Turn on USB tethering</b> in the CarrotCam app. iPhone: turn on Personal
                    Hotspot.
                  </div>
                </div>
              </li>
              <li>
                <span className="num">3</span>
                <div>
                  <b>Pick this PC in the phone app</b>
                  <div className="hint">USB is used automatically when it is available: steady, low latency and the phone charges.</div>
                </div>
              </li>
            </ol>
          </motion.div>

          {trusted.length > 0 && (
            <motion.div className="settings-card" {...stagger(4)}>
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
