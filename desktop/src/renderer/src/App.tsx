import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { AlertTriangle, ArrowRight, CheckCircle2, Download, Info, MonitorPlay, Smartphone, X } from 'lucide-react'
import { IPC } from '@shared/app'
import { invoke } from '@/lib/ipc'
import { updateApp } from '@/lib/controller'
import { useStore } from '@/lib/store'
import { Logo } from '@/components/ui'
import { Preview } from '@/components/Preview'
import { LeftSidebar } from '@/components/LeftSidebar'
import { Panel } from '@/components/Panel'
import { DevicesPage } from '@/pages/DevicesPage'
import { SettingsPage } from '@/pages/SettingsPage'

function TitleBar(): React.JSX.Element {
  return (
    <header className="titlebar">
      <div className="brand">
        <Logo size={24} />
        CarrotCam
      </div>
    </header>
  )
}

function UpdateBanner(): React.JSX.Element | null {
  const update = useStore((s) => s.update)
  const [hidden, setHidden] = useState(false)
  if (hidden || update.state !== 'ready') return null
  return (
    <motion.div className="banner" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
      <Download size={16} color="var(--accent)" />
      <span className="grow">
        <b>CarrotCam {update.version}</b> is ready. Restart to update — it takes a few seconds.
      </span>
      <button className="btn primary sm" onClick={() => void invoke(IPC.updateInstall)}>
        Restart now
      </button>
      <button className="icon-btn" onClick={() => setHidden(true)}>
        <X size={15} />
      </button>
    </motion.div>
  )
}

function Studio(): React.JSX.Element {
  return (
    <div className="studio">
      <section className="stage">
        <UpdateBanner />
        <Preview />
      </section>
      <Panel />
    </div>
  )
}

function Toasts(): React.JSX.Element {
  const toasts = useStore((s) => s.toasts)
  const dismiss = useStore((s) => s.dismissToast)
  return (
    <div className="toasts">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            className={`toast ${t.kind}`}
            initial={{ opacity: 0, x: 40, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          >
            <span className="t-icon">
              {t.kind === 'success' ? <CheckCircle2 size={17} /> : t.kind === 'error' ? <AlertTriangle size={17} /> : <Info size={17} />}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
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
            <button className="icon-btn" style={{ width: 24, height: 24 }} onClick={() => dismiss(t.id)}>
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

const WELCOME: { icon: 'logo' | typeof Smartphone; title: string; body: string }[] = [
  {
    icon: 'logo',
    title: 'Welcome to CarrotCam',
    body: 'Turn your phone into a smooth, great-looking webcam, with lighting, touch-ups, filters and effects.'
  },
  {
    icon: Smartphone,
    title: 'Connect your phone',
    body: 'Install CarrotCam on your phone, join the same Wi-Fi and scan the QR code on the Phones page. Webcams work too.'
  },
  {
    icon: MonitorPlay,
    title: 'Use it everywhere',
    body: 'Choose “CarrotCam” as your camera in Discord, Zoom, Teams, Google Meet, OBS or your browser.'
  }
]

function Welcome(): React.JSX.Element | null {
  const welcomed = useStore((s) => s.app.welcomed)
  const ready = useStore((s) => s.ready)
  const [step, setStep] = useState(0)
  if (!ready || welcomed) return null
  const s = WELCOME[step]
  const last = step === WELCOME.length - 1
  return (
    <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <motion.div className="modal" initial={{ scale: 0.92, y: 20 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 26 }}>
        <div
          style={{
            position: 'absolute',
            inset: '-40% -20% auto auto',
            width: 360,
            height: 360,
            background: 'radial-gradient(circle, var(--accent-glow), transparent 65%)'
          }}
        />
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.25 }}>
            <div className="welcome-icon">
              {s.icon === 'logo' ? <Logo size={56} /> : <s.icon size={34} />}
            </div>
            <h1 style={{ fontFamily: 'var(--font-display)', margin: '0 0 8px', fontSize: 26 }}>{s.title}</h1>
            <p style={{ color: 'var(--text-2)', fontSize: 15, margin: 0, minHeight: 66 }}>{s.body}</p>
          </motion.div>
        </AnimatePresence>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 26 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {WELCOME.map((_, i) => (
              <motion.span
                key={i}
                animate={{ width: i === step ? 22 : 8, background: i === step ? 'var(--accent)' : 'var(--border-strong)' }}
                style={{ height: 8, borderRadius: 8, display: 'block' }}
              />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn ghost" onClick={() => void updateApp({ welcomed: true })}>
              Skip
            </button>
            <button
              className="btn primary"
              onClick={() => {
                if (last) {
                  void updateApp({ welcomed: true })
                  useStore.getState().set({ phonesOpen: true })
                } else setStep(step + 1)
              }}
            >
              {last ? 'Connect a phone' : 'Next'} <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

function PhonesModal(): React.JSX.Element {
  const open = useStore((s) => s.phonesOpen)
  const set = useStore((s) => s.set)
  const close = (): void => set({ phonesOpen: false })
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onPointerDown={(e) => e.target === e.currentTarget && close()}
        >
          <motion.div
            className="phones-modal"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          >
            <DevicesPage onClose={close} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Splash(): React.JSX.Element {
  return (
    <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        style={{ display: 'grid', justifyItems: 'center', gap: 14 }}
      >
        <motion.div animate={{ rotate: [0, -6, 6, 0] }} transition={{ repeat: Infinity, duration: 1.6 }}>
          <Logo size={64} />
        </motion.div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18 }}>CarrotCam</div>
      </motion.div>
    </div>
  )
}

export default function App(): React.JSX.Element {
  const page = useStore((s) => s.page)
  const ready = useStore((s) => s.ready)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.ctrlKey && e.key === '1') useStore.getState().setPage('studio')
      if (e.ctrlKey && e.key === '2') useStore.getState().setPage('settings')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!ready) return <Splash />

  return (
    <div className="app">
      <TitleBar />
      <div className="shell">
        <LeftSidebar />
        <main className="content">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={page}
              className="page"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              style={{ overflow: page === 'studio' ? 'hidden' : 'auto' }}
            >
              {page === 'studio' ? <Studio /> : <SettingsPage />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <PhonesModal />
      <Toasts />
      <AnimatePresence>
        <Welcome />
      </AnimatePresence>
    </div>
  )
}
