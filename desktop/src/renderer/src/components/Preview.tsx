import { useEffect, useRef, useState } from 'react'
import { ChevronsLeftRight, Mic, PenLine, Smartphone, Video } from 'lucide-react'
import { engine, selectSource } from '@/lib/controller'
import { useElapsed } from '@/hooks/useElapsed'
import { useStore } from '@/lib/store'

/** Circular "hold" progress for gestures (no blur, cheap to draw). */
function HoldRing({ progress }: { progress: number }): React.JSX.Element {
  const r = 8
  const c = 2 * Math.PI * r
  return (
    <svg className="hold-ring" viewBox="0 0 20 20" aria-hidden>
      <circle className="track" cx="10" cy="10" r={r} />
      <circle className="fill" cx="10" cy="10" r={r} strokeDasharray={c} strokeDashoffset={c * (1 - progress)} />
    </svg>
  )
}

/** The few hints that sit on the picture. Everything else lives outside it. */
function Hud(): React.JSX.Element {
  const handControl = useStore((s) => s.app.handControl)
  const hint = useStore((s) => s.handHint)
  const progress = useStore((s) => s.handProgress)
  const inkMode = useStore((s) => s.inkMode)
  const recording = useStore((s) => s.recording)
  const listenUntil = useStore((s) => s.voice.listenUntil)
  const elapsed = useElapsed(recording.startedAt)
  const listening = listenUntil > Date.now()
  return (
    <div className="hud">
      {recording.active && (
        <span className="hud-pill plain rec">
          <span className="sdot rec" /> {elapsed}
        </span>
      )}
      {listening && (
        <span className="hud-pill accent plain">
          <Mic size={14} /> Listening… say a command
        </span>
      )}
      {handControl && hint && (
        <span className="hud-pill">
          {progress !== null ? <HoldRing progress={progress} /> : <span style={{ width: 4 }} />}
          {hint}
        </span>
      )}
      {inkMode && !hint && (
        <span className="hud-pill plain">
          <PenLine size={14} /> Drawing: point to draw, hold an open palm to erase
        </span>
      )}
    </div>
  )
}

export function Preview(): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const framing = useStore((s) => s.effects.framing)
  const updateEffects = useStore((s) => s.updateEffects)
  const source = useStore((s) => s.source)
  const cameras = useStore((s) => s.cameras)
  const compare = useStore((s) => s.compare)
  const set = useStore((s) => s.set)
  const [split, setSplit] = useState(0.5)
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)

  useEffect(() => {
    const el = host.current
    if (el && engine?.canvas && engine.canvas.parentElement !== el) el.appendChild(engine.canvas)
  }, [])

  useEffect(() => {
    engine?.setCompare(compare ? split : null)
  }, [compare, split])

  const canPan = framing.zoom > 1.01 && !framing.autoFrame

  const onPointerDown = (e: React.PointerEvent): void => {
    if (!canPan || e.button !== 0) return
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, panX: framing.panX, panY: framing.panY }
  }
  const onPointerMove = (e: React.PointerEvent): void => {
    const d = drag.current
    if (!d || !box.current) return
    const r = box.current.getBoundingClientRect()
    const z = framing.zoom
    const k = 2 / Math.max(0.01, 1 - 1 / z) // move content with the cursor
    const mx = framing.mirror ? -1 : 1
    updateEffects((x) => {
      x.framing.panX = Math.max(-1, Math.min(1, d.panX - ((e.clientX - d.x) / r.width) * k * mx * (1 / z)))
      x.framing.panY = Math.max(-1, Math.min(1, d.panY - ((e.clientY - d.y) / r.height) * k * (1 / z)))
    })
  }
  const onWheel = (e: React.WheelEvent): void => {
    if (framing.autoFrame) return
    const z = Math.max(1, Math.min(4, framing.zoom * Math.exp(-e.deltaY * 0.0015)))
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
    e.stopPropagation()
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

  return (
    <div className="preview-area">
      <div
        ref={box}
        className="preview"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => (drag.current = null)}
        onWheel={onWheel}
        onDoubleClick={() => {
          if (document.fullscreenElement) void document.exitFullscreen()
          else void box.current?.requestFullscreen()
        }}
        style={{ cursor: canPan ? 'grab' : 'default' }}
      >
        <div ref={host} className="canvas-host" />
        <Hud />
        {compare && (
          <>
            <div className="compare-label" style={{ left: 16 }}>
              BEFORE
            </div>
            <div className="compare-label" style={{ right: 16 }}>
              AFTER
            </div>
            <div className="compare-handle" style={{ left: `${split * 100}%` }} onPointerDown={onCompareDrag}>
              <span>
                <ChevronsLeftRight size={18} />
              </span>
            </div>
          </>
        )}
        {!source.id && (
          <div className="preview-empty">
            <button className="btn primary" onClick={() => set({ phonesOpen: true })}>
              <Smartphone size={16} /> Connect a phone
            </button>
            {cameras.length > 0 && (
              <button className="btn" onClick={() => void selectSource(`cam:${cameras[0].id}`)}>
                <Video size={16} /> Use {cameras.length === 1 ? cameras[0].label.replace(/\s*\(.*\)$/, '') : 'a webcam'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
