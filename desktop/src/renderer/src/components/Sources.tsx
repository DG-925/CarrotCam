import { motion } from 'motion/react'
import { BatteryCharging, BatteryFull, BatteryLow, BatteryMedium, Loader2, Plus, Smartphone, Usb, Video, AlertTriangle } from 'lucide-react'
import { selectSource } from '@/lib/controller'
import { useStore } from '@/lib/store'
import { stagger } from './ui'

function Battery({ level, charging }: { level?: number; charging?: boolean }): React.JSX.Element | null {
  if (level === undefined) return null
  const Icon = charging ? BatteryCharging : level > 70 ? BatteryFull : level > 30 ? BatteryMedium : BatteryLow
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: level <= 15 && !charging ? 'var(--danger)' : undefined }}>
      <Icon size={13} /> {Math.round(level)}%
    </span>
  )
}

export function Sources(): React.JSX.Element {
  const devices = useStore((s) => s.devices)
  const cameras = useStore((s) => s.cameras)
  const source = useStore((s) => s.source)
  const phoneStatus = useStore((s) => s.phoneStatus)
  const set = useStore((s) => s.set)

  const status = (id: string): React.JSX.Element | string => {
    if (source.id !== id) return 'Tap to use'
    if (source.state === 'connecting')
      return (
        <>
          <Loader2 size={12} className="spin" /> Connecting…
        </>
      )
    if (source.state === 'error')
      return (
        <>
          <AlertTriangle size={12} /> {source.error ?? 'Error'}
        </>
      )
    return (
      <>
        <span style={{ width: 7, height: 7, borderRadius: 9, background: 'var(--success)' }} /> Live
      </>
    )
  }

  let i = 0
  return (
    <div className="sources">
      {devices.map((d) => {
        const id = `phone:${d.id}`
        const ps = phoneStatus[d.id]
        return (
          <motion.button key={id} {...stagger(i++)} className={`source-card ${source.id === id ? 'active' : ''}`} onClick={() => void selectSource(id)}>
            <div className="icon">
              <Smartphone size={19} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="title">{d.info.name}</div>
              <div className="sub">
                {status(id)}
                {d.usb && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <Usb size={12} /> USB
                  </span>
                )}
                <Battery level={ps?.battery} charging={ps?.charging} />
              </div>
            </div>
          </motion.button>
        )
      })}
      {cameras.map((c) => {
        const id = `cam:${c.id}`
        return (
          <motion.button key={id} {...stagger(i++)} className={`source-card ${source.id === id ? 'active' : ''}`} onClick={() => void selectSource(id)}>
            <div className="icon">
              <Video size={19} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="title">{c.label}</div>
              <div className="sub">{status(id)}</div>
            </div>
          </motion.button>
        )
      })}
      <motion.button {...stagger(i++)} className="source-card add" onClick={() => set({ devicesOpen: true })}>
        <div className="icon">
          <Plus size={19} />
        </div>
        <div>
          <div className="title">Connect phone</div>
          <div className="sub">Wi-Fi or USB cable</div>
        </div>
      </motion.button>
    </div>
  )
}
