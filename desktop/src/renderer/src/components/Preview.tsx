import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  Camera,
  Circle,
  Columns2,
  EyeOff,
  FlipHorizontal2,
  Maximize2,
  RotateCw,
  PartyPopper,
  Square,
  ChevronsLeftRight
} from 'lucide-react'
import type { PrivacyMode, Reaction } from '@shared/effects'
import { engine, setPrivacy, takeSnapshot, toggleRecording } from '@/lib/controller'
import { useStore } from '@/lib/store'

const REACTIONS: { kind: Reaction; emoji: string; label: string }[] = [
  { kind: 'hearts', emoji: '❤️', label: 'Hearts' },
  { kind: 'thumbs', emoji: '👍', label: 'Thumbs up' },
  { kind: 'confetti', emoji: '🎊', label: 'Confetti' },
  { kind: 'balloons', emoji: '🎈', label: 'Balloons' },
  { kind: 'fireworks', emoji: '🎆', label: 'Fireworks' },
  { kind: 'rain', emoji: '🌧️', label: 'Rain' }
]

const PRIVACY: { mode: PrivacyMode; label: string; hint: string }[] = [
  { mode: 'blur', label: 'Blur everything', hint: 'Ctrl+Alt+P' },
  { mode: 'brb', label: 'Be right back', hint: 'Ctrl+Alt+B' },
  { mode: 'freeze', label: 'Freeze frame', hint: 'Ctrl+Alt+F' }
]

function useElapsed(since: number): string {
  const [, tick] = useState(0)
  useEffect(() => {
    if (!since) return
    const t = setInterval(() => tick((x) => x + 1), 500)
    return () => clearInterval(t)
  }, [since])
  if (!since) return '00:00'
  const s = Math.floor((Date.now() - since) / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export function Preview(): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const effects = useStore((s) => s.effects)
  const updateEffects = useStore((s) => s.updateEffects)
  const vcam = useStore((s) => s.vcam)
  const source = useStore((s) => s.source)
  const recording = useStore((s) => s.recording)
  const compare = useStore((s) => s.compare)
  const set = useStore((s) => s.set)
  const [split, setSplit] = useState(0.5)
  const [popover, setPopover] = useState<'react' | 'privacy' | null>(null)
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)
  const elapsed = useElapsed(recording.startedAt)

  useEffect(() => {
    const el = host.current
    if (el && engine?.canvas && engine.canvas.parentElement !== el) el.appendChild(engine.canvas)
  }, [])

  useEffect(() => {
    engine?.setCompare(compare ? split : null)
  }, [compare, split])

  const canPan = effects.framing.zoom > 1.01 && !effects.framing.autoFrame

  const onPointerDown = (e: React.PointerEvent): void => {
    if (!canPan || e.button !== 0) return
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, panX: effects.framing.panX, panY: effects.framing.panY }
  }
  const onPointerMove = (e: React.PointerEvent): void => {
    const d = drag.current
    if (!d || !box.current) return
    const r = box.current.getBoundingClientRect()
    const z = effects.framing.zoom
    const k = 2 / Math.max(0.01, 1 - 1 / z) // move content with the cursor
    const mx = effects.framing.mirror ? -1 : 1
    updateEffects((x) => {
      x.framing.panX = Math.max(-1, Math.min(1, d.panX - ((e.clientX - d.x) / r.width) * k * mx * (1 / z)))
      x.framing.panY = Math.max(-1, Math.min(1, d.panY - ((e.clientY - d.y) / r.height) * k * (1 / z)))
    })
  }
  const onWheel = (e: React.WheelEvent): void => {
    if (effects.framing.autoFrame) return
    const z = Math.max(1, Math.min(4, effects.framing.zoom * Math.exp(-e.deltaY * 0.0015)))
    updateEffects((x) => {
      x.framing.zoom = Number(z.toFixed(3))
      if (z <= 1.001) {
        x.framing.panX = 0
        x.framing.panY = 0
      }
    })
  }

  const onCompareDrag = (e: React.PointerEvent): void => {
    if (!box.current) return
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent): void => {
      const r = box.current!.getBoundingClientRect()
      setSplit(Math.min(0.98, Math.max(0.02, (ev.clientX - r.left) / r.width)))
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const live = source.state === 'live'

  return (
    <div className="preview-area">
      <div className="preview-wrap">
        <div
          ref={box}
          className={`preview ${live ? 'live' : ''}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => (drag.current = null)}
          onWheel={onWheel}
          onDoubleClick={() => {
            if (document.fullscreenElement) void document.exitFullscreen()
            else void box.current?.requestFullscreen()
          }}
          style={{ cursor: canPan ? (drag.current ? 'grabbing' : 'grab') : 'default' }}
        >
          <div ref={host} style={{ position: 'absolute', inset: 0 }} />
          <div className="ring" />

          <div className="preview-hud">
            <div className="hud-row">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {!vcam.running && vcam.error && (
                  <span className="chip" title={vcam.error}>
                    <span className="dot" /> Virtual camera unavailable
                  </span>
                )}
                <AnimatePresence>
                  {recording.active && (
                    <motion.span className="chip" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                      <span className="dot rec" /> REC {elapsed}
                    </motion.span>
                  )}
                  {effects.privacy !== 'off' && (
                    <motion.span className="chip" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} style={{ background: 'rgba(255,122,26,0.85)' }}>
                      <EyeOff size={13} /> {effects.privacy === 'brb' ? 'Be right back' : effects.privacy === 'freeze' ? 'Frozen' : 'Privacy blur'}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {compare && (
              <>
                <div className="compare-label" style={{ left: 16, color: '#fff' }}>
                  Before
                </div>
                <div className="compare-label" style={{ right: 16, color: '#fff' }}>
                  After
                </div>
                <div className="compare-handle" style={{ left: `${split * 100}%` }} onPointerDown={onCompareDrag}>
                  <span>
                    <ChevronsLeftRight size={18} />
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="dock-wrap">
        <AnimatePresence>
          {popover && (
            <motion.div
              className="toolbar popover"
              style={{ flexDirection: popover === 'privacy' ? 'column' : 'row', alignItems: 'stretch' }}
              initial={{ opacity: 0, y: 8, x: '-50%' }}
              animate={{ opacity: 1, y: 0, x: '-50%' }}
              exit={{ opacity: 0, y: 8, x: '-50%' }}
              transition={{ duration: 0.2 }}
            >
              {popover === 'react'
                ? REACTIONS.map((r) => (
                    <button
                      key={r.kind}
                      className="tool"
                      style={{ fontSize: 22 }}
                      onClick={() => engine.react(r.kind)}
                      title={r.label}
                    >
                      {r.emoji}
                    </button>
                  ))
                : PRIVACY.map((p) => (
                    <button
                      key={p.mode}
                      className={`btn ghost sm ${effects.privacy === p.mode ? 'on' : ''}`}
                      style={{
                        color: '#fff',
                        justifyContent: 'space-between',
                        gap: 18,
                        background: effects.privacy === p.mode ? 'var(--accent)' : undefined
                      }}
                      onClick={() => {
                        setPrivacy(p.mode)
                        setPopover(null)
                      }}
                    >
                      {p.label} <span style={{ opacity: 0.6, fontSize: 11 }}>{p.hint}</span>
                    </button>
                  ))}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="toolbar dock" onDoubleClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
          <button className={`tool ${compare ? 'on' : ''}`} onClick={() => set({ compare: !compare })}>
            <Columns2 size={19} />
            <span className="tooltip">Before / after</span>
          </button>
          <button
            className={`tool ${effects.framing.mirror ? 'on' : ''}`}
            onClick={() => updateEffects((e) => void (e.framing.mirror = !e.framing.mirror))}
          >
            <FlipHorizontal2 size={19} />
            <span className="tooltip">Mirror</span>
          </button>
          <button
            className="tool"
            onClick={() =>
              updateEffects((e) => void (e.framing.rotate = (((e.framing.rotate + 90) % 360) as 0 | 90 | 180 | 270)))
            }
          >
            <RotateCw size={18} />
            <span className="tooltip">Rotate {effects.framing.rotate ? `(${effects.framing.rotate}°)` : ''}</span>
          </button>
          <button className={`tool ${popover === 'react' ? 'on' : ''}`} onClick={() => setPopover(popover === 'react' ? null : 'react')}>
            <PartyPopper size={19} />
            <span className="tooltip">Reactions</span>
          </button>
          <div className="tool-sep" />
          <button className="tool" onClick={() => void takeSnapshot()}>
            <Camera size={19} />
            <span className="tooltip">Snapshot</span>
          </button>
          <button className={`tool ${recording.active ? 'rec' : ''}`} onClick={() => void toggleRecording()}>
            {recording.active ? <Square size={16} fill="currentColor" /> : <Circle size={19} />}
            <span className="tooltip">{recording.active ? 'Stop recording' : 'Record'}</span>
          </button>
          <div className="tool-sep" />
          <button
            className={`tool ${effects.privacy !== 'off' ? 'on' : ''}`}
            onClick={() => (effects.privacy !== 'off' ? setPrivacy(effects.privacy) : setPopover(popover === 'privacy' ? null : 'privacy'))}
          >
            <EyeOff size={19} />
            <span className="tooltip">{effects.privacy !== 'off' ? 'Turn privacy off' : 'Privacy'}</span>
          </button>
          <button
            className="tool"
            onClick={() => (document.fullscreenElement ? void document.exitFullscreen() : void box.current?.requestFullscreen())}
          >
            <Maximize2 size={18} />
            <span className="tooltip">Full screen</span>
          </button>
        </div>
      </div>
    </div>
  )
}
