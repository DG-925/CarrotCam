import { motion } from 'motion/react'
import { Gauge, Hand, Images, LayoutTemplate, Mic, Smartphone, X } from 'lucide-react'
import { updateApp } from '@/lib/controller'
import { useStore } from '@/lib/store'
import { WHATS_NEW } from '@/lib/whats-new'

const ICONS = { layout: LayoutTemplate, gallery: Images, mic: Mic, hand: Hand, gauge: Gauge, phone: Smartphone }

export function WhatsNew(): React.JSX.Element | null {
  const open = useStore((s) => s.whatsNewOpen)
  const version = useStore((s) => s.version)
  const welcomed = useStore((s) => s.app.welcomed)
  if (!open || !welcomed) return null
  const notes = WHATS_NEW.find((n) => n.version === version) ?? WHATS_NEW[0]
  const close = (): void => {
    useStore.setState({ whatsNewOpen: false })
    void updateApp({ lastSeenVersion: version })
  }
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <motion.div className="modal" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }} role="dialog" aria-label="What's new">
        <div className="modal-head">
          <div>
            <h2>What’s new in CarrotCam {notes.version}</h2>
            <p>Thanks for updating.</p>
          </div>
          <button className="icon-btn" onClick={close} title="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body news">
          {notes.items.map((it) => {
            const Icon = ICONS[it.icon]
            return (
              <div key={it.title} className="news-item">
                <span className="nicon">
                  <Icon size={18} />
                </span>
                <div>
                  <b>{it.title}</b>
                  <p>{it.body}</p>
                </div>
              </div>
            )
          })}
        </div>
        <div className="modal-foot">
          <span />
          <button className="btn primary" onClick={close}>
            Got it
          </button>
        </div>
      </motion.div>
    </div>
  )
}
