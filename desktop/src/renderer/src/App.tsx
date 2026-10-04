import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  AlertTriangle,
  CheckCircle2,
  Clapperboard,
  Info,
  Moon,
  Settings,
  Smartphone,
  Sun,
  X,
  ArrowRight,
  Download
} from 'lucide-react'
import { IPC } from '@shared/app'
import { invoke } from '@/lib/ipc'
import { toggleVcam, updateApp } from '@/lib/controller'
import { useStore, type Page } from '@/lib/store'
import { Logo } from '@/components/ui'
import { Preview } from '@/components/Preview'
import { Sources } from '@/components/Sources'
import { Panel } from '@/components/Panel'
import { DevicesPage } from '@/pages/DevicesPage'
import { SettingsPage } from '@/pages/SettingsPage'

function TitleBar(): React.JSX.Element {
  const vcam = useStore((s) => s.vcam)
  const source = useStore((s) => s.source)
  return (
    <header className="titlebar">
      <div className="brand">
        <Logo size={24} />
        CarrotCam
        <small>Studio</small>
      </div>
      <div className="center no-drag">
        <button className="chip" style={{ background: 'var(--surface-2)', color: 'var(--text)', borderColor: 'var(--border)' }} onClick={() => void toggleVcam()}>
          <span className={`dot ${vcam.running ? 'on' : ''}`} />
          {vcam.running ? (vcam.inUse ? 'Camera live in an app' : 'Virtual camera on') : 'Virtual camera off'}
        </button>
        {source.id && (
          <span className="chip" style={{ background: 'var(--surface-2)', color: 'var(--text-2)', borderColor: 'var(--border)' }}>
            {source.kind === 'phone' ? <Smartphone size={13} /> : <Clapperboard size={13} />}
            {source.label}
          </span>
        )}
      </div>
    </header>
  )
}

function Sidebar(): React.JSX.Element {
  const page = useStore((s) => s.page)
  const setPage = useStore((s) => s.setPage)
  const dark = useStore((s) => s.dark)
  const devices = useStore((s) => s.devices.length)
  const update = useStore((s) => s.update)
  const items: { id: Page; label: string; icon: typeof Settings; dot?: boolean }[] = [
    { id: 'studio', label: 'Studio', icon: Clapperboard },
    { id: 'devices', label: 'Devices', icon: Smartphone, dot: devices > 0 },
    { id: 'settings', label: 'Settings', icon: Settings, dot: update.state === 'ready' }
  ]
  return (
    <nav className="sidebar">
      {items.map((it) => (
        <button key={it.id} className={`nav-btn ${page === it.id ? 'active' : ''}`} onClick={() => setPage(it.id)} title={it.label}>
          {page === it.id && <motion.div layoutId="nav-pill" className="nav-pill" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
          <it.icon size={21} style={{ marginBottom: 10 }} />
          <span className="nav-label">{it.label}</span>
          {it.dot && <span className="badge-dot" />}
        </button>
      ))}
      <div className="spacer" />
      <button
        className="nav-btn"
        title={dark ? 'Switch to light theme' : 'Switch to dark theme'}
        onClick={() => void updateApp({ theme: dark ? 'light' : 'dark' })}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={dark ? 'moon' : 'sun'}
            initial={{ rotate: -90, opacity: 0, scale: 0.6 }}
            animate={{ rotate: 0, opacity: 1, scale: 1 }}
            exit={{ rotate: 90, opacity: 0, scale: 0.6 }}
            transition={{ duration: 0.25 }}
            style={{ display: 'grid' }}
          >
            {dark ? <Moon size={20} /> : <Sun size={20} />}
          </motion.span>
        </AnimatePresence>
      </button>
    </nav>
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
        <Sources />
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

const WELCOME = [
  {
    emoji: '🥕',
    title: 'Welcome to CarrotCam',
    body: 'Turn your phone into a beautiful, buttery-smooth webcam — with studio lighting, retouch, filters and effects running on your GPU.'
  },
  {
    emoji: '📱',
    title: 'Connect your phone',
    body: 'Install CarrotCam on your phone, join the same Wi-Fi and scan the QR code on the Devices page. Your webcams work too.'
  },
  {
    emoji: '🎥',
    title: 'Use it everywhere',
    body: 'Pick “CarrotCam” as your camera in Discord, Zoom, Teams, Google Meet, OBS or any browser. No admin rights needed.'
  }
]

function Welcome(): React.JSX.Element | null {
  const welcomed = useStore((s) => s.app.welcomed)
  const ready = useStore((s) => s.ready)
  const setPage = useStore((s) => s.setPage)
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
            <div style={{ fontSize: 56, marginBottom: 8 }}>{s.emoji}</div>
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
                  setPage('devices')
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
      if (e.ctrlKey && e.key === '2') useStore.getState().setPage('devices')
      if (e.ctrlKey && e.key === '3') useStore.getState().setPage('settings')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!ready) return <Splash />

  return (
    <div className="app">
      <TitleBar />
      <div className="shell">
        <Sidebar />
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
              {page === 'studio' ? <Studio /> : page === 'devices' ? <DevicesPage /> : <SettingsPage />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <Toasts />
      <AnimatePresence>
        <Welcome />
      </AnimatePresence>
    </div>
  )
}
