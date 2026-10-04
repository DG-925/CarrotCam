import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import QRCode from 'qrcode'
import { BatteryCharging, RefreshCw, ShieldCheck, Smartphone, Unplug, Usb, Wifi, Download, Video, Trash2, X } from 'lucide-react'
import { IPC, GITHUB_REPO, type ServerInfo } from '@shared/app'
import { invoke } from '@/lib/ipc'
import { selectSource } from '@/lib/controller'
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
  const source = useStore((s) => s.source)
  if (!device) return null
  const active = source.id === `phone:${id}`
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
          <span className="badge">
            {device.usb ? (
              <>
                <Usb size={11} /> USB cable
              </>
            ) : (
              <>
                <Wifi size={11} /> Wi-Fi
              </>
            )}
          </span>
          {status?.battery !== undefined && (
            <span className={`badge ${status.battery < 20 && !status.charging ? 'err' : ''}`}>
              {status.charging && <BatteryCharging size={11} />} {Math.round(status.battery)}%
            </span>
          )}
          {status?.thermal && status.thermal !== 'normal' && <span className="badge warn">🌡 {status.thermal}</span>}
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
    </motion.div>
  )
}

function UsbCard(): React.JSX.Element {
  const usb = useStore((s) => s.server?.usb ?? [])
  const viaUsb = useStore((s) => s.devices.some((d) => d.usb))
  return (
    <motion.div className="settings-card" {...stagger(2)}>
      <h2>
        <Usb size={18} /> Connect with a USB cable
      </h2>
      <div className="row" style={{ paddingTop: 0 }}>
        <div className="label">
          <b>{viaUsb ? 'Phone connected by cable' : usb.length ? 'Phone cable detected' : 'No phone plugged in yet'}</b>
          <small>
            {viaUsb
              ? 'Video goes over the cable — no Wi-Fi needed.'
              : usb.length
                ? `Open CarrotCam on the phone — it finds this PC (${usb[0]}) by itself.`
                : 'A cable gives the steadiest picture and charges your phone.'}
          </small>
        </div>
        <span className={`badge ${usb.length ? 'ok' : ''}`}>{usb.length ? '● USB' : 'Waiting'}</span>
      </div>
      <ol className="steps">
        <li>
          <span className="num">1</span>
          <div>
            <b>Plug your phone into this PC</b>
            <div className="hint">Any USB data cable works.</div>
          </div>
        </li>
        <li>
          <span className="num">2</span>
          <div>
            <b>Turn on USB tethering</b>
            <div className="hint">
              Android: in CarrotCam tap <b>USB cable</b> (or Settings → Hotspot &amp; tethering → USB tethering). iPhone: turn on
              Personal Hotspot.
            </div>
          </div>
        </li>
        <li>
          <span className="num">3</span>
          <div>
            <b>Open CarrotCam on the phone</b>
            <div className="hint">It connects over the cable automatically — Wi-Fi can stay off.</div>
          </div>
        </li>
      </ol>
    </motion.div>
  )
}

export function DevicesPopup({ onClose }: { onClose: () => void }): React.JSX.Element {
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

  useEffect(() => {
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  const fixFirewall = async (): Promise<void> => {
    const ok = await invoke<boolean>(IPC.firewallFix)
    toast(ok ? { kind: 'success', title: 'Firewall rule added' } : { kind: 'error', title: 'Firewall change was cancelled' })
  }

  return (
    <motion.div
      className="modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        className="modal wide"
        role="dialog"
        aria-label="Phones"
        initial={{ scale: 0.96, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 16, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 340, damping: 30 }}
      >
        <button className="icon-btn modal-close" onClick={onClose} title="Close (Esc)">
          <X size={18} />
        </button>
        <motion.div className="page-head" {...fadeUp} style={{ paddingRight: 44 }}>
          <div>
            <h1>Phones</h1>
            <p>Use your phone as a studio camera — connect over Wi-Fi or a USB cable.</p>
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
                  <div style={{ fontSize: 40, marginBottom: 6 }}>📱</div>
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

            <UsbCard />

            <motion.div className="settings-card" {...stagger(3)}>
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
                    <b>Join the same Wi-Fi as this PC — or plug in a USB cable</b>
                    <div className="hint">5 GHz Wi-Fi or a USB cable gives the smoothest picture.</div>
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
      </motion.div>
    </motion.div>
  )
}
