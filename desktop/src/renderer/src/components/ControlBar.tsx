import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  Camera,
  Captions,
  Check,
  ChevronDown,
  Coffee,
  Columns2,
  Eye,
  EyeOff,
  FlipHorizontal2,
  Hand,
  Maximize2,
  Mic,
  PenLine,
  RotateCw,
  Snowflake,
  SwitchCamera
} from 'lucide-react'
import type { PrivacyMode } from '@shared/effects'
import { setPrivacy, switchCamera, takeSnapshot, toggleCaptions, toggleDrawing, toggleHandControl, toggleRecording, updateApp } from '@/lib/controller'
import { useElapsed } from '@/hooks/useElapsed'
import { useStore } from '@/lib/store'

const PRIVACY: { mode: PrivacyMode; label: string; keys: string; icon: typeof Eye }[] = [
  { mode: 'off', label: 'Privacy off', keys: 'Everyone sees your camera', icon: Eye },
  { mode: 'blur', label: 'Blur everything', keys: 'Ctrl + Alt + P', icon: EyeOff },
  { mode: 'brb', label: 'Be right back', keys: 'Ctrl + Alt + B', icon: Coffee },
  { mode: 'freeze', label: 'Freeze the picture', keys: 'Ctrl + Alt + F', icon: Snowflake }
]

function Tool({
  icon: Icon,
  label,
  on = false,
  title,
  onClick,
  children
}: {
  icon: typeof Eye
  label: string
  on?: boolean
  title?: string
  onClick: () => void
  children?: React.ReactNode
}): React.JSX.Element {
  return (
    <button className={`tool ${on ? 'on' : ''}`} onClick={onClick} title={title ?? label} aria-pressed={on}>
      <Icon size={18} />
      <span className="tlabel">{label}</span>
      {children}
    </button>
  )
}

function PrivacyTool(): React.JSX.Element {
  const privacy = useStore((s) => s.effects.privacy)
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent): void => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])
  const current = PRIVACY.find((p) => p.mode === privacy) ?? PRIVACY[0]
  return (
    <div ref={root} style={{ position: 'relative' }}>
      <Tool
        icon={privacy === 'off' ? EyeOff : current.icon}
        label={privacy === 'off' ? 'Privacy' : privacy === 'brb' ? 'Away' : privacy === 'freeze' ? 'Frozen' : 'Hidden'}
        on={privacy !== 'off'}
        title="Privacy: hide your camera for a moment"
        onClick={() => setOpen(!open)}
      >
        <ChevronDown size={11} strokeWidth={2.5} className="caret" />
      </Tool>
      <AnimatePresence>
        {open && (
          <motion.div
            className="menu"
            role="menu"
            initial={{ opacity: 0, y: 4, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 4, x: '-50%' }}
            transition={{ duration: 0.12 }}
          >
            {PRIVACY.map((p) => (
              <button
                key={p.mode}
                role="menuitemradio"
                aria-checked={privacy === p.mode}
                className={`menu-item ${privacy === p.mode ? 'selected' : ''}`}
                onClick={() => {
                  setOpen(false)
                  if (p.mode === 'off') {
                    if (privacy !== 'off') setPrivacy(privacy)
                  } else if (p.mode !== privacy) setPrivacy(p.mode)
                }}
              >
                <p.icon size={17} />
                <span className="mi-text">
                  <b>{p.label}</b>
                  <small>{p.keys}</small>
                </span>
                {privacy === p.mode && <Check size={15} />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function ControlBar(): React.JSX.Element {
  const framing = useStore((s) => s.effects.framing)
  const updateEffects = useStore((s) => s.updateEffects)
  const compare = useStore((s) => s.compare)
  const handControl = useStore((s) => s.app.handControl)
  const voice = useStore((s) => s.app.voice)
  const voiceStatus = useStore((s) => s.voice.status)
  const inkMode = useStore((s) => s.inkMode)
  const captionsOn = useStore((s) => s.app.captions.enabled)
  const captionsStatus = useStore((s) => s.captions.status)
  const recording = useStore((s) => s.recording)
  const set = useStore((s) => s.set)
  const elapsed = useElapsed(recording.startedAt)

  return (
    <div className="controlbar">
      <Tool icon={Columns2} label="Compare" on={compare} title="Before and after" onClick={() => set({ compare: !compare })} />
      <Tool
        icon={FlipHorizontal2}
        label="Mirror"
        on={framing.mirror}
        onClick={() => updateEffects((e) => void (e.framing.mirror = !e.framing.mirror))}
      />
      <Tool
        icon={RotateCw}
        label="Rotate"
        title={`Rotate${framing.rotate ? ` (now ${framing.rotate}°)` : ''}`}
        onClick={() => updateEffects((e) => void (e.framing.rotate = (((e.framing.rotate + 90) % 360) as 0 | 90 | 180 | 270)))}
      />
      <Tool icon={SwitchCamera} label="Switch" title="Switch camera (phone: front and back)" onClick={() => switchCamera()} />
      <span className="divider" />
      <Tool
        icon={Hand}
        label="Hands"
        on={handControl}
        title={handControl ? 'Hand control is on' : 'Control the camera with your hands'}
        onClick={() => void toggleHandControl()}
      />
      <Tool icon={PenLine} label="Draw" on={inkMode} title={inkMode ? 'Drawing on: point to draw' : 'Draw in the air'} onClick={() => toggleDrawing()} />
      <Tool
        icon={Mic}
        label="Voice"
        on={voice.enabled}
        title={voice.enabled ? 'Voice control is on: say “Carrot, take a photo”' : 'Control CarrotCam with your voice'}
        onClick={() => void updateApp({ voice: { ...voice, enabled: !voice.enabled } })}
      >
        {voice.enabled && voiceStatus === 'listening' && <span className="live-dot" />}
      </Tool>
      <Tool
        icon={Captions}
        label="Captions"
        on={captionsOn}
        title={captionsOn ? 'Live captions are on' : 'Live captions: show what you say as subtitles'}
        onClick={() => void toggleCaptions()}
      >
        {captionsOn && captionsStatus === 'loading' && <span className="live-dot" style={{ background: 'var(--amber)' }} />}
      </Tool>
      <PrivacyTool />
      <span className="spacer" />
      <button className="cap-btn" onClick={() => void takeSnapshot()} title="Take a snapshot (Ctrl + Alt + S)">
        <Camera size={18} />
        <span className="clabel">Snapshot</span>
      </button>
      <button
        className={`cap-btn ${recording.active ? 'recording' : ''}`}
        onClick={() => void toggleRecording()}
        title={recording.active ? 'Stop recording' : 'Record a video'}
      >
        <span className="rec-icon" />
        <span className="clabel">{recording.active ? elapsed : 'Record'}</span>
      </button>
      <button
        className="cap-btn icon-only"
        title="Full screen"
        onClick={() => {
          if (document.fullscreenElement) void document.exitFullscreen()
          else void document.querySelector('.preview')?.requestFullscreen()
        }}
      >
        <Maximize2 size={18} />
      </button>
    </div>
  )
}
