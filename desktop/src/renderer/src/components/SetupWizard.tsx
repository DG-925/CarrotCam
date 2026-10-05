import { useState } from 'react'
import { motion } from 'motion/react'
import { ArrowLeft, ArrowRight, Camera, Check, CheckCircle2, Hand, Loader2, Mic, Video } from 'lucide-react'
import { selectSource, updateApp } from '@/lib/controller'
import { useStore } from '@/lib/store'
import { HowToConnect, QrCard } from './PhonesDialog'
import { Logo, ToggleRow } from './ui'

const APPS = ['Zoom', 'Microsoft Teams', 'Discord', 'Google Meet', 'OBS Studio', 'Your browser']

function Welcome(): React.JSX.Element {
  return (
    <div className="wizard-hero">
      <Logo size={52} />
      <h2>Welcome to CarrotCam</h2>
      <p>Your phone becomes a sharp, great-looking webcam, with lighting, touch-ups, backgrounds and effects. This takes about a minute.</p>
    </div>
  )
}

function VirtualCameraStep(): React.JSX.Element {
  const driver = useStore((s) => s.driver)
  const vcam = useStore((s) => s.vcam)
  const ready = !!driver?.installed && vcam.running
  const unsupported = driver && !driver.supported
  return (
    <div className="wizard-hero">
      <span className="row-icon" style={{ width: 44, height: 44, borderRadius: 12 }}>
        <Camera size={22} />
      </span>
      <h2>The CarrotCam camera</h2>
      <p>CarrotCam adds a camera called “CarrotCam” to Windows. Pick it in any app and everyone sees your picture with all its effects.</p>
      <div className={`status-block ${ready ? 'ok' : unsupported ? 'err' : ''}`} style={{ width: '100%' }}>
        <span className="sicon">{ready ? <CheckCircle2 size={20} /> : unsupported ? <Camera size={20} /> : <Loader2 size={20} className="spin" />}</span>
        <div>
          <b>{ready ? 'Installed and on' : unsupported ? 'Needs Windows 10 or 11' : 'Setting it up…'}</b>
          <small>{ready ? 'It stays on, so it is there whenever you need it.' : unsupported ? 'You can still use the preview, snapshots and recording.' : 'This only happens once.'}</small>
        </div>
      </div>
      <div className="app-chips">
        {APPS.map((a) => (
          <span key={a} className="badge">
            {a}
          </span>
        ))}
      </div>
    </div>
  )
}

function CameraStep(): React.JSX.Element {
  const source = useStore((s) => s.source)
  const cameras = useStore((s) => s.cameras)
  const live = source.state === 'live'
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="wizard-hero">
        <h2>Connect your phone</h2>
        <p>Scan the code with the CarrotCam app on your phone. No phone at hand? Use a webcam for now.</p>
      </div>
      {live && (
        <div className="status-block ok">
          <span className="sicon">
            <CheckCircle2 size={20} />
          </span>
          <div>
            <b>{source.label} is connected</b>
            <small>{source.kind === 'phone' ? 'It reconnects by itself next time.' : 'You can still connect your phone: scan the code below.'}</small>
          </div>
        </div>
      )}
      {source.kind !== 'phone' || !live ? (
        <div className="connect-grid" style={{ padding: 0, gridTemplateColumns: '260px minmax(0, 1fr)' }}>
          <QrCard />
          <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
            <HowToConnect />
            {cameras.length > 0 && !live && (
              <div className="btn-row">
                {cameras.slice(0, 2).map((c) => (
                  <button key={c.id} className="btn sm" onClick={() => void selectSource(`cam:${c.id}`)}>
                    <Video size={14} /> Use {c.label.replace(/\s*\(.*\)$/, '')}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function HandsFreeStep(): React.JSX.Element {
  const app = useStore((s) => s.app)
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="wizard-hero">
        <h2>Hands-free, if you like</h2>
        <p>Both run on this PC. You can change them any time in Controls.</p>
      </div>
      <div className="card">
        <ToggleRow
          title="Hand control"
          hint="Point up for Follow me, peace sign for a snapshot, pinch to zoom"
          icon={
            <span className="row-icon">
              <Hand size={17} />
            </span>
          }
          value={app.handControl}
          onChange={(v) => void updateApp({ handControl: v })}
        />
        <ToggleRow
          title="Voice control"
          hint="Say “Carrot, take a photo” or “Carrot, blur background”"
          icon={
            <span className="row-icon">
              <Mic size={17} />
            </span>
          }
          value={app.voice.enabled}
          onChange={(v) => void updateApp({ voice: { ...app.voice, enabled: v } })}
        />
      </div>
    </div>
  )
}

function Done(): React.JSX.Element {
  return (
    <div className="wizard-hero">
      <span className="row-icon" style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--green-soft)', color: 'var(--green)' }}>
        <Check size={22} />
      </span>
      <h2>You’re all set</h2>
      <p>
        Pick a look on the right of the Studio, then choose “CarrotCam” as the camera in your call. Your snapshots and recordings are in the
        Gallery.
      </p>
    </div>
  )
}

const STEPS = [Welcome, VirtualCameraStep, CameraStep, HandsFreeStep, Done]

export function SetupWizard(): React.JSX.Element | null {
  const welcomed = useStore((s) => s.app.welcomed)
  const ready = useStore((s) => s.ready)
  const version = useStore((s) => s.version)
  const [step, setStep] = useState(0)
  if (!ready || welcomed) return null
  const Step = STEPS[step]
  const last = step === STEPS.length - 1
  const finish = (): void => {
    void updateApp({ welcomed: true, lastSeenVersion: version })
    setStep(0)
  }
  return (
    <div className="modal-backdrop">
      <motion.div className="modal wizard" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }} role="dialog" aria-label="Setup">
        <div className="modal-head" style={{ display: 'block' }}>
          <div className="wizard-steps" aria-hidden>
            {STEPS.map((_, i) => (
              <span key={i} className={i <= step ? 'done' : ''} />
            ))}
          </div>
        </div>
        <div className="modal-body" style={{ minHeight: 320 }}>
          <Step />
        </div>
        <div className="modal-foot">
          {last ? <span /> : (
            <button className="btn ghost" onClick={finish}>
              Skip setup
            </button>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            {step > 0 && (
              <button className="btn" onClick={() => setStep(step - 1)}>
                <ArrowLeft size={15} /> Back
              </button>
            )}
            <button className="btn primary" onClick={() => (last ? finish() : setStep(step + 1))}>
              {last ? 'Start using CarrotCam' : step === 0 ? 'Get started' : 'Next'} {!last && <ArrowRight size={15} />}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

