// Hand control: drive the camera with hand gestures.
//
//  - pinch (thumb + index) with both hands, pull apart / together -> zoom
//  - pinch with one hand and drag (while zoomed)                  -> move the view
//  - point with the index finger while drawing is on              -> draw
//  - hold a gesture for a moment                                  -> command
//
// Hand positions arrive in source coordinates (not mirrored, not zoomed), so
// moving the view never feeds back into the hand positions.
import type { HandData } from '@/engine/types'

export type HandCommand = 'reset' | 'snapshot' | 'nextFilter' | 'prevFilter' | 'follow' | 'brb' | 'blur' | 'hearts' | 'draw'

export interface View {
  zoom: number
  panX: number
  panY: number
}

export interface HandActions {
  view: () => View
  setView: (v: View) => void
  command: (c: HandCommand) => void
  hint: (text: string | null) => void
  /** index fingertip (source uv) while drawing with a pointing finger, else null */
  pointer: (p: [number, number] | null) => void
  drawing: () => boolean
}

/**
 * Gestures you hold to run a command. `gesture` is a MediaPipe category or one
 * of our own poses worked out from the fingers: 'Point', 'Three' and 'Heart'.
 */
export const HAND_COMMANDS: { gesture: string; pose: string; command: HandCommand; label: string }[] = [
  { gesture: 'Open_Palm', pose: 'Open palm', command: 'reset', label: 'Reset zoom (erases the drawing while drawing)' },
  { gesture: 'Victory', pose: 'Peace sign', command: 'snapshot', label: 'Snapshot' },
  { gesture: 'Three', pose: 'Three fingers', command: 'brb', label: 'Be right back on/off' },
  { gesture: 'Thumb_Up', pose: 'Thumbs up', command: 'nextFilter', label: 'Next filter' },
  { gesture: 'Thumb_Down', pose: 'Thumbs down', command: 'prevFilter', label: 'Previous filter' },
  { gesture: 'Point', pose: 'Point up', command: 'follow', label: 'Follow me on/off' },
  { gesture: 'Closed_Fist', pose: 'Fist', command: 'blur', label: 'Background blur on/off' },
  { gesture: 'ILoveYou', pose: 'Rock on', command: 'draw', label: 'Drawing on/off' },
  { gesture: 'Heart', pose: 'Heart with both hands', command: 'hearts', label: 'Hearts' }
]

type Point = [number, number]

/** Our own poses from the finger states (MediaPipe has no "three fingers" or "point"). */
export function poseOf(h: HandData): string {
  const [, index, middle, ring, pinky] = h.fingers
  if (index && middle && ring && !pinky) return 'Three'
  if ((index && !middle && !ring && !pinky) || h.gesture === 'Pointing_Up') return 'Point'
  return h.gesture
}

/** Two hands making a heart: index tips touch on top, thumb tips touch below. */
export function isHeart(a: HandData, b: HandData, aspect: number): boolean {
  const dist = (p: Point, q: Point): number => Math.hypot((p[0] - q[0]) * aspect, p[1] - q[1])
  const s = (a.size + b.size) / 2
  const tipsY = (a.tip[1] + b.tip[1]) / 2
  const thumbsY = (a.thumb[1] + b.thumb[1]) / 2
  // two real hands side by side (not the same hand reported twice)
  const sideBySide = Math.abs(a.wrist[0] - b.wrist[0]) * aspect > s * 0.6
  return sideBySide && dist(a.tip, b.tip) < s * 0.7 && dist(a.thumb, b.thumb) < s * 0.7 && tipsY < thumbsY - s * 0.35
}

const HOLD_MS = 700 // how long a gesture must be held
const COOLDOWN_MS = 1500 // between two commands
const PAN_GAIN = 4 // full pan range for a hand move of half the picture
const SMOOTH = 0.5

const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v))

export class HandControl {
  private mode: 'idle' | 'zoom' | 'pan' | 'wait' = 'idle'
  private start = { d: 1, x: 0, y: 0, zoom: 1, panX: 0, panY: 0 }
  private smooth = new Map<string, { x: number; y: number; tip: Point }>()
  private pointing = false
  private hold = { gesture: '', since: 0 }
  private lastCommandAt = 0
  private lastHint: string | null = null

  constructor(private a: HandActions) {}

  reset(): void {
    this.mode = 'idle'
    this.smooth.clear()
    this.hold = { gesture: '', since: 0 }
    this.hint(null)
    this.point(null)
  }

  update(raw: HandData[], aspect: number, now = performance.now()): void {
    const hands = raw.map((h) => this.smoothed(h))
    for (const side of [...this.smooth.keys()]) if (!raw.some((h) => h.side === side)) this.smooth.delete(side)
    const pinching = hands.filter((h) => h.pinch)

    // two hands pinching: stretch to zoom
    if (pinching.length >= 2) {
      const [p, q] = pinching
      const d = Math.max(Math.hypot((p.x - q.x) * aspect, p.y - q.y), 0.02)
      if (this.mode !== 'zoom') {
        const v = this.a.view()
        this.start = { ...this.start, d, zoom: v.zoom }
        this.mode = 'zoom'
      }
      const zoom = clamp(this.start.zoom * (d / this.start.d), 1, 4)
      const v = this.a.view()
      this.a.setView(zoom <= 1.01 ? { zoom: 1, panX: 0, panY: 0 } : { ...v, zoom: Number(zoom.toFixed(3)) })
      this.hint(`Zoom ${zoom.toFixed(1)}×`)
      return
    }

    // after zooming, wait for both hands to let go before panning
    if (this.mode === 'zoom') this.mode = pinching.length ? 'wait' : 'idle'
    if (this.mode === 'wait') {
      if (pinching.length) return
      this.mode = 'idle'
    }

    // one hand pinching: grab and drag the picture
    if (pinching.length === 1) {
      const h = pinching[0]
      const v = this.a.view()
      if (v.zoom <= 1.01) {
        this.hint('Pinch with both hands and pull apart to zoom')
        return
      }
      if (this.mode !== 'pan') {
        this.start = { ...this.start, x: h.x, y: h.y, panX: v.panX, panY: v.panY }
        this.mode = 'pan'
      }
      this.a.setView({
        zoom: v.zoom,
        panX: Number(clamp(this.start.panX - (h.x - this.start.x) * PAN_GAIN, -1, 1).toFixed(3)),
        panY: Number(clamp(this.start.panY - (h.y - this.start.y) * PAN_GAIN, -1, 1).toFixed(3))
      })
      this.hint('Moving the view')
      return
    }
    if (this.mode === 'pan') this.mode = 'idle'

    // two hands making a heart
    const heart = hands.length >= 2 && isHeart(hands[0], hands[1], aspect)

    // while drawing is on, the pointing finger is the pen (otherwise pointing
    // is the Follow me command below)
    const pen = heart || !this.a.drawing() ? undefined : hands.find((h) => poseOf(h) === 'Point')
    if (pen) {
      this.point(pen.tip)
      this.hold = { gesture: '', since: 0 }
      this.hint('Drawing')
      return
    }
    this.point(null)

    // hold a gesture to run a command
    const match = heart
      ? { h: hands[0], c: HAND_COMMANDS.find((c) => c.gesture === 'Heart') }
      : hands
          .map((h) => ({ h, c: HAND_COMMANDS.find((c) => c.gesture === poseOf(h)) }))
          .find((x) => x.c && (x.c.gesture === 'Three' || x.c.gesture === 'Point' || x.h.score > 0.6))
    if (!match?.c) {
      this.hold = { gesture: '', since: 0 }
      // tell people their hand is seen, so a gesture that is not recognised
      // is distinguishable from a hand that is not tracked at all
      this.hint(hands.length ? 'Hand detected' : null)
      return
    }
    const c = match.c
    if (c.gesture !== this.hold.gesture) this.hold = { gesture: c.gesture, since: now }
    if (now - this.lastCommandAt < COOLDOWN_MS || this.hold.since === Infinity) {
      this.hint(null)
      return
    }
    if (now - this.hold.since >= HOLD_MS) {
      this.lastCommandAt = now
      this.hold.since = Infinity // fire once per pose: change the gesture to fire again
      this.hint(null)
      this.a.command(c.command)
    } else {
      this.hint(`${c.pose}: ${c.label}, hold…`)
    }
  }

  private smoothed(h: HandData): HandData {
    const prev = this.smooth.get(h.side)
    const lerp = (a: number, b: number): number => a + (b - a) * SMOOTH
    const next = prev
      ? {
          x: lerp(prev.x, h.x),
          y: lerp(prev.y, h.y),
          // the pointer is smoothed again on the GPU side: keep this one snappy
          tip: [prev.tip[0] + (h.tip[0] - prev.tip[0]) * 0.75, prev.tip[1] + (h.tip[1] - prev.tip[1]) * 0.75] as Point
        }
      : { x: h.x, y: h.y, tip: h.tip }
    this.smooth.set(h.side, next)
    return { ...h, ...next }
  }

  private point(p: Point | null): void {
    if (!p && !this.pointing) return
    this.pointing = !!p
    this.a.pointer(p)
  }

  private hint(text: string | null): void {
    if (text === this.lastHint) return
    this.lastHint = text
    this.a.hint(text)
  }
}
