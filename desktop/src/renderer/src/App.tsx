import { useEffect } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { useStore } from '@/lib/store'
import { Logo } from '@/components/ui'
import { TopBar } from '@/components/TopBar'
import { StatusBar } from '@/components/StatusBar'
import { Preview } from '@/components/Preview'
import { ControlBar } from '@/components/ControlBar'
import { StudioCards } from '@/components/StudioCards'
import { Panel, Rail } from '@/components/Panel'
import { PhonesDialog } from '@/components/PhonesDialog'
import { SetupWizard } from '@/components/SetupWizard'
import { WhatsNew } from '@/components/WhatsNew'
import { GalleryPage } from '@/pages/GalleryPage'
import { ControlsPage } from '@/pages/ControlsPage'
import { SettingsPage } from '@/pages/SettingsPage'

function Studio(): React.JSX.Element {
  return (
    <div className="studio">
      <section className="stage">
        <Preview />
        <ControlBar />
        <StudioCards />
      </section>
      <Panel />
      <Rail />
    </div>
  )
}

function Toasts(): React.JSX.Element {
  const toasts = useStore((s) => s.toasts)
  const dismiss = useStore((s) => s.dismissToast)
  return (
    <div className="toasts" role="status" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            className={`toast ${t.kind}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.16 }}
          >
            <span className="t-icon">
              {t.kind === 'success' ? <CheckCircle2 size={17} /> : t.kind === 'error' ? <AlertTriangle size={17} /> : <Info size={17} />}
            </span>
            <div className="t-body">
              <b>{t.title}</b>
              {t.body && <small>{t.body}</small>}
            </div>
            {t.action && (
              <button
                className="btn sm"
                onClick={() => {
                  t.action!.run()
                  dismiss(t.id)
                }}
              >
                {t.action.label}
              </button>
            )}
            <button className="icon-btn" style={{ width: 26, height: 26 }} onClick={() => dismiss(t.id)} title="Dismiss">
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

function PhonesModal(): React.JSX.Element | null {
  const open = useStore((s) => s.phonesOpen)
  const set = useStore((s) => s.set)
  const close = (): void => set({ phonesOpen: false })
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') set({ phonesOpen: false })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, set])
  if (!open) return null
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <motion.div
        className="modal phones-modal"
        role="dialog"
        aria-label="Phones"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.16 }}
      >
        <PhonesDialog onClose={close} />
      </motion.div>
    </div>
  )
}

function Splash(): React.JSX.Element {
  return (
    <div className="splash">
      <div>
        <Logo size={56} />
        CarrotCam
      </div>
    </div>
  )
}

const PAGE_KEYS: Record<string, 'studio' | 'gallery' | 'controls' | 'settings'> = {
  '1': 'studio',
  '2': 'gallery',
  '3': 'controls',
  ',': 'settings'
}

export default function App(): React.JSX.Element {
  const page = useStore((s) => s.page)
  const ready = useStore((s) => s.ready)
  const efficient = useStore((s) => s.efficient)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      const target = e.ctrlKey && !e.altKey ? PAGE_KEYS[e.key] : undefined
      if (target) {
        e.preventDefault()
        useStore.setState({ page: target, viewer: null })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!ready) return <Splash />

  return (
    <MotionConfig reducedMotion={efficient ? 'always' : 'user'}>
      <div className="app">
        <TopBar />
        <main style={{ minHeight: 0 }}>
          {/* the Studio stays mounted: the preview canvas lives in it */}
          <div className="page" style={{ display: page === 'studio' ? undefined : 'none', overflow: 'hidden' }}>
            <Studio />
          </div>
          {page === 'gallery' && <GalleryPage />}
          {page === 'controls' && <ControlsPage />}
          {page === 'settings' && <SettingsPage />}
        </main>
        <StatusBar />
        <PhonesModal />
        <Toasts />
        <SetupWizard />
        <WhatsNew />
      </div>
    </MotionConfig>
  )
}
