import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { BatteryCharging, Download, RefreshCw, ShieldCheck, Smartphone, Trash2, Unplug, Usb, Video, Wifi, X } from 'lucide-react'
import { IPC, GITHUB_REPO, type ServerInfo } from '@shared/app'
import { invoke } from '@/lib/ipc'
import { selectSource } from '@/lib/controller'
import { isUsbDevice } from '@/lib/usb'
import { toast, useStore } from '@/lib/store'
import { Segmented } from './ui'

type Trusted = { id: string; name: string; lastSeen: number }

export function QrCard(): React.JSX.Element {
  const server = useStore((s) => s.server)
  const [qr, setQr] = useState('')

  useEffect(() => {
    if (!server?.qr) return
    void QRCode.toDataURL(server.qr, { errorCorrectionLevel: 'M', margin: 0, width: 360, color: { dark: '#111114', light: '#ffffff' } }).then(setQr)
  }, [server?.qr])

  const newCode = async (): Promise<void> => {
    const info = await invoke<ServerInfo>(IPC.serverNewCode)
    useStore.setState({ server: { ...useStore.getState().server, ...info } })
  }

  const code = server?.pairCode ?? '------'
  return (
    <div className="qr-card">
      <h3>Scan with the CarrotCam app</h3>
      <p className="hint">
        Open CarrotCam on your phone and tap <b>Scan QR code</b>
      </p>
      <div className="qr-frame">{qr && <img src={qr} alt="Pairing QR code" />}</div>
      <span className="hint">or type this code</span>
      <div className="pair-code">
        {code.slice(0, 3)} {code.slice(3)}
      </div>
      <button className="btn ghost sm" onClick={() => void newCode()}>
        <RefreshCw size={14} /> New code
      </button>
      <span className="hint" style={{ marginTop: 4 }}>
        <Wifi size={12} /> {server?.pcName} · {server?.addresses?.[0] ?? 'no network'}
      </span>
    </div>
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
    <div className={`device-card ${active ? 'active' : ''}`}>
      <div className="phone-icon">{usb ? <Usb size={20} /> : <Smartphone size={20} />}</div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="dname">{device.info.name}</div>
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
      {!active && (
        <button className="btn primary sm" onClick={() => void selectSource(`phone:${id}`)}>
          <Video size={14} /> Use
        </button>
      )}
      <button className="icon-btn danger" onClick={() => void invoke(IPC.serverKick, id)} title="Disconnect">
        <Unplug size={16} />
      </button>
    </div>
  )
}

export function HowToConnect(): React.JSX.Element {
  const [how, setHow] = useState<'wifi' | 'usb'>('wifi')
  return (
    <>
      <div className="how-tabs">
        <Segmented<'wifi' | 'usb'>
          value={how}
          onChange={setHow}
          options={[
            {
              value: 'wifi',
              label: (
                <>
                  <Wifi size={14} /> Wi-Fi
                </>
              )
            },
            {
              value: 'usb',
              label: (
                <>
                  <Usb size={14} /> USB cable
                </>
              )
            }
          ]}
        />
      </div>
      {how === 'wifi' ? (
        <ol className="steps">
          <li>
            <span className="num">1</span>
            <div>
              <b>Install CarrotCam on your phone</b>
              <span className="hint">
                Get the Android app from the{' '}
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    void invoke(IPC.openExternal, `https://github.com/${GITHUB_REPO}/releases/latest`)
                  }}
                >
                  latest release
                </a>
                . It updates itself after that.
              </span>
            </div>
          </li>
          <li>
            <span className="num">2</span>
            <div>
              <b>Join the same Wi-Fi as this PC</b>
              <span className="hint">5 GHz Wi-Fi gives the smoothest picture.</span>
            </div>
          </li>
          <li>
            <span className="num">3</span>
            <div>
              <b>Scan the code, or pick this PC in the app</b>
              <span className="hint">The phone reconnects by itself next time.</span>
            </div>
          </li>
        </ol>
      ) : (
        <ol className="steps">
          <li>
            <span className="num">1</span>
            <div>
              <b>Plug your phone into this PC</b>
              <span className="hint">Any cable that charges and transfers data.</span>
            </div>
          </li>
          <li>
            <span className="num">2</span>
            <div>
              <b>Turn on USB tethering</b>
              <span className="hint">
                Android: tap <b style={{ display: 'inline' }}>Turn on USB tethering</b> in the CarrotCam app. iPhone: turn on Personal Hotspot.
              </span>
            </div>
          </li>
          <li>
            <span className="num">3</span>
            <div>
              <b>Pick this PC in the phone app</b>
              <span className="hint">USB is used whenever it is plugged in: steady, low delay, and the phone charges.</span>
            </div>
          </li>
        </ol>
      )}
    </>
  )
}

export function PhonesDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  const devices = useStore((s) => s.devices)
  const [trusted, setTrusted] = useState<Trusted[]>([])

  const refresh = async (): Promise<void> => {
    const info = await invoke<ServerInfo & { trusted: Trusted[] }>(IPC.serverInfo)
    useStore.setState({ server: info })
    setTrusted(info.trusted ?? [])
  }
  useEffect(() => {
    void refresh()
  }, [devices.length])

  const fixFirewall = async (): Promise<void> => {
    const ok = await invoke<boolean>(IPC.firewallFix)
    toast(ok ? { kind: 'success', title: 'Firewall rule added' } : { kind: 'error', title: 'The firewall change was cancelled' })
  }
  const offline = trusted.filter((t) => !devices.some((d) => d.id === t.id))

  return (
    <>
      <div className="modal-head">
        <div>
          <h2>Phones</h2>
          <p>Use your phone as the camera, over Wi-Fi or a USB cable.</p>
        </div>
        <button className="icon-btn" onClick={onClose} title="Close (Esc)">
          <X size={18} />
        </button>
      </div>
      <div className="connect-grid">
        <QrCard />
        <div className="connect-side">
          <div className="settings-card">
            <h2>
              <Smartphone size={16} /> Connected
            </h2>
            {devices.length === 0 ? (
              <p className="hint" style={{ marginTop: 6 }}>
                No phone connected yet. Scan the code with the CarrotCam app.
              </p>
            ) : (
              <div style={{ marginTop: 10 }}>
                {devices.map((d) => (
                  <DeviceCard key={d.id} id={d.id} />
                ))}
              </div>
            )}
            {offline.length > 0 && (
              <>
                <label className="field-label">Paired before</label>
                {offline.map((t) => (
                  <div className="row" key={t.id} style={{ minHeight: 38, padding: '4px 0' }}>
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
              </>
            )}
          </div>
          <div className="settings-card">
            <h2>
              <Download size={16} /> How to connect
            </h2>
            <div style={{ marginTop: 10 }}>
              <HowToConnect />
            </div>
            <div className="btn-row">
              <button className="btn sm" onClick={() => void fixFirewall()}>
                <ShieldCheck size={14} /> Phone can’t find this PC? Allow through the firewall
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
