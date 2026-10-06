// Drag and resize sources right on the preview (shown while the Sources panel is open).
import { useEffect, useRef, useState } from 'react'
import { Lock } from 'lucide-react'
import type { Rect, SceneSource } from '@shared/scenes'
import { useScenes } from '@/lib/scenes'

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const SNAP = 0.012

/** Snaps a value to the picture edges and center. */
function snap(v: number, targets: number[]): number {
  for (const t of targets) if (Math.abs(v - t) < SNAP) return t
  return v
}

export function SceneEditor(): React.JSX.Element {
  const box = useRef<HTMLDivElement>(null)
  const scene = useScenes((s) => s.scenes.find((x) => x.id === s.active))
  const selected = useScenes((s) => s.selected)
  const select = useScenes((s) => s.select)
  const update = useScenes((s) => s.updateSource)
  const remove = useScenes((s) => s.removeSource)
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] })
  const drag = useRef<{
    id: string
    handle: Handle | 'move'
    start: Rect
    px: number
    py: number
    aspect: number
  } | null>(null)

  const sources = (scene?.sources ?? []).filter((s) => s.visible)

  // keyboard: nudge, delete, deselect
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      const src = sources.find((s) => s.id === selected)
      if (!src) return
      if (e.key === 'Escape') select(null)
      else if ((e.key === 'Delete' || e.key === 'Backspace') && src.kind !== 'camera') remove(src.id)
      else if (e.key.startsWith('Arrow') && !src.locked) {
        const step = e.shiftKey ? 0.02 : 0.002
        const r = { ...src.rect }
        if (e.key === 'ArrowLeft') r.x -= step
        if (e.key === 'ArrowRight') r.x += step
        if (e.key === 'ArrowUp') r.y -= step
        if (e.key === 'ArrowDown') r.y += step
        update(src.id, { rect: r })
      } else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const begin = (e: React.PointerEvent, src: SceneSource, handle: Handle | 'move'): void => {
    if (e.button !== 0) return
    e.stopPropagation()
    select(src.id)
    if (src.locked) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { id: src.id, handle, start: { ...src.rect }, px: e.clientX, py: e.clientY, aspect: src.rect.w / src.rect.h }
  }

  const move = (e: React.PointerEvent): void => {
    const d = drag.current
    const el = box.current
    if (!d || !el) return
    const b = el.getBoundingClientRect()
    const dx = (e.clientX - d.px) / b.width
    const dy = (e.clientY - d.py) / b.height
    const s = d.start
    let r: Rect = { ...s }
    const gx: number[] = []
    const gy: number[] = []
    if (d.handle === 'move') {
      r.x = s.x + dx
      r.y = s.y + dy
      if (!e.altKey) {
        // snap the edges and the middle to the picture's edges and center
        const sx = snap(r.x, [0, 0.5]) - r.x || snap(r.x + r.w, [1, 0.5]) - (r.x + r.w) || snap(r.x + r.w / 2, [0.5]) - (r.x + r.w / 2)
        const sy = snap(r.y, [0, 0.5]) - r.y || snap(r.y + r.h, [1, 0.5]) - (r.y + r.h) || snap(r.y + r.h / 2, [0.5]) - (r.y + r.h / 2)
        r.x += sx
        r.y += sy
        if (sx) gx.push(...[r.x, r.x + r.w, r.x + r.w / 2].filter((v) => [0, 0.5, 1].some((t) => Math.abs(v - t) < 1e-6)))
        if (sy) gy.push(...[r.y, r.y + r.h, r.y + r.h / 2].filter((v) => [0, 0.5, 1].some((t) => Math.abs(v - t) < 1e-6)))
      }
    } else {
      const h = d.handle
      let x0 = s.x
      let y0 = s.y
      let x1 = s.x + s.w
      let y1 = s.y + s.h
      if (h.includes('w')) x0 = Math.min(x1 - 0.02, snap(s.x + dx, [0, 0.5]))
      if (h.includes('e')) x1 = Math.max(x0 + 0.02, snap(s.x + s.w + dx, [1, 0.5]))
      if (h.includes('n')) y0 = Math.min(y1 - 0.02, snap(s.y + dy, [0, 0.5]))
      if (h.includes('s')) y1 = Math.max(y0 + 0.02, snap(s.y + s.h + dy, [1, 0.5]))
      r = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
      // corners keep the shape unless Shift is held
      if (h.length === 2 && !e.shiftKey) {
        const w = r.w
        const hh = w / d.aspect
        if (h.includes('n')) r.y = y1 - hh
        r.h = hh
      }
    }
    setGuides({ x: gx, y: gy })
    update(d.id, { rect: r })
  }

  const end = (): void => {
    drag.current = null
    setGuides({ x: [], y: [] })
  }

  return (
    <div
      ref={box}
      className="scene-editor"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) select(null)
      }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      {sources.map((s) => {
        const r = s.rect
        const on = s.id === selected
        return (
          <div
            key={s.id}
            className={`se-box ${on ? 'selected' : ''} ${s.locked ? 'locked' : ''}`}
            style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}
            onPointerDown={(e) => begin(e, s, 'move')}
          >
            {on && (
              <span className="se-label">
                {s.locked && <Lock size={11} />} {s.name}
              </span>
            )}
            {on &&
              !s.locked &&
              HANDLES.map((h) => <span key={h} className={`se-handle ${h}`} onPointerDown={(e) => begin(e, s, h)} />)}
          </div>
        )
      })}
      {guides.x.map((x) => (
        <span key={`x${x}`} className="se-guide v" style={{ left: `${x * 100}%` }} />
      ))}
      {guides.y.map((y) => (
        <span key={`y${y}`} className="se-guide h" style={{ top: `${y * 100}%` }} />
      ))}
    </div>
  )
}
