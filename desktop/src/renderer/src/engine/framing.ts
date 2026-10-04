// Camera framing: maps output pixels to source pixels (cover fit, zoom, pan,
// rotation, tilt, mirror) and runs the smooth "auto frame" (center stage).
import type { EffectSettings, FrameTightness } from '@shared/effects'
import type { FaceData } from './types'

export interface Affine {
  // src = [a b; c d] * uv + [e f]
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

export function affineToMat3(m: Affine): Float32Array {
  // column-major mat3 for GLSL: uM * vec3(uv, 1)
  return new Float32Array([m.a, m.c, 0, m.b, m.d, 0, m.e, m.f, 1])
}

export function applyAffine(m: Affine, x: number, y: number): [number, number] {
  return [m.a * x + m.b * y + m.e, m.c * x + m.d * y + m.f]
}

export function invertAffine(m: Affine): Affine {
  const det = m.a * m.d - m.b * m.c || 1e-9
  const a = m.d / det
  const b = -m.b / det
  const c = -m.c / det
  const d = m.a / det
  return { a, b, c, d, e: -(a * m.e + b * m.f), f: -(c * m.e + d * m.f) }
}

interface FrameState {
  cx: number // crop center in view px (centered)
  cy: number
  zoom: number
}

const TIGHTNESS: Record<FrameTightness, number> = { close: 0.42, medium: 0.3, wide: 0.2 }

/** Smoothly animated framing controller. */
export class Framer {
  private cur: FrameState = { cx: 0, cy: 0, zoom: 1 }
  private target: FrameState = { cx: 0, cy: 0, zoom: 1 }
  private lastFaceAt = 0
  private initialized = false

  /**
   * Computes the output -> source affine for this frame.
   * `rotation` = user rotation + frame rotation (degrees, clockwise).
   */
  update(
    srcW: number,
    srcH: number,
    outW: number,
    outH: number,
    rotation: number,
    f: EffectSettings['framing'],
    face: FaceData | null,
    dt: number,
    now: number
  ): Affine {
    const rot = ((rotation % 360) + 360) % 360
    const swap = rot === 90 || rot === 270
    const vw = swap ? srcH : srcW
    const vh = swap ? srcW : srcH
    const k0 = Math.min(vw / outW, vh / outH) // cover fit

    if (f.autoFrame) {
      if (face) {
        this.lastFaceAt = now
        // face box (source uv) -> view px
        const [fx, fy] = this.srcToView((face.box[0] + face.box[2]) / 2, (face.box[1] + face.box[3]) / 2, srcW, srcH, rot)
        const fh = Math.abs(face.box[3] - face.box[1]) * (swap ? srcW : srcH)
        const desired = TIGHTNESS[f.tightness] ?? 0.3
        const zoom = clamp((k0 * desired * outH) / Math.max(fh, 1), 1, 3.2)
        // keep the eyes around the upper third
        const cy = fy + fh * 0.18
        const tgt = { cx: fx, cy, zoom }
        // dead zone: ignore tiny moves so the frame feels calm
        const cropH = (outH * k0) / this.target.zoom
        const moved = Math.hypot(tgt.cx - this.target.cx, tgt.cy - this.target.cy) > cropH * 0.07
        const zoomed = Math.abs(Math.log(tgt.zoom / this.target.zoom)) > 0.12
        if (moved || zoomed || !this.initialized) this.target = tgt
      } else if (now - this.lastFaceAt > 2500) {
        this.target = { cx: 0, cy: 0, zoom: 1 }
      }
    } else {
      const zoom = clamp(f.zoom, 1, 4)
      const k = k0 / zoom
      const maxX = Math.max(0, (vw - outW * k) / 2)
      const maxY = Math.max(0, (vh - outH * k) / 2)
      this.target = { cx: f.panX * maxX, cy: f.panY * maxY, zoom }
    }

    // critically damped smoothing
    const speed = f.autoFrame ? 1.2 + (f.speed / 100) * 4.5 : 14
    const t = this.initialized ? 1 - Math.exp(-dt * speed) : 1
    this.initialized = true
    this.cur.cx += (this.target.cx - this.cur.cx) * t
    this.cur.cy += (this.target.cy - this.cur.cy) * t
    this.cur.zoom *= Math.pow(this.target.zoom / this.cur.zoom, t)

    // clamp so the crop never leaves the image
    const k = k0 / this.cur.zoom
    const maxX = Math.max(0, (vw - outW * k) / 2)
    const maxY = Math.max(0, (vh - outH * k) / 2)
    const cx = clamp(this.cur.cx, -maxX, maxX)
    const cy = clamp(this.cur.cy, -maxY, maxY)

    const tilt = (f.tilt * Math.PI) / 180
    const map = (u: number, v: number): [number, number] => {
      let qx = (u - 0.5) * outW
      let qy = (v - 0.5) * outH
      if (f.mirror) qx = -qx
      if (f.flip) qy = -qy
      // tilt, scale into view px
      const tx = (qx * Math.cos(tilt) - qy * Math.sin(tilt)) * k + cx
      const ty = (qx * Math.sin(tilt) + qy * Math.cos(tilt)) * k + cy
      // view -> source: rotate by -rot
      const [sx, sy] = rotate(tx, ty, -rot)
      return [sx / srcW + 0.5, sy / srcH + 0.5]
    }
    const [e, ff] = map(0, 0)
    const [x1, y1] = map(1, 0)
    const [x2, y2] = map(0, 1)
    return { a: x1 - e, c: y1 - ff, b: x2 - e, d: y2 - ff, e, f: ff }
  }

  private srcToView(u: number, v: number, srcW: number, srcH: number, rot: number): [number, number] {
    return rotate((u - 0.5) * srcW, (v - 0.5) * srcH, rot)
  }

  reset(): void {
    this.initialized = false
  }
}

function rotate(x: number, y: number, deg: number): [number, number] {
  const r = (deg * Math.PI) / 180
  const c = Math.round(Math.cos(r) * 1e6) / 1e6
  const s = Math.round(Math.sin(r) * 1e6) / 1e6
  return [x * c - y * s, x * s + y * c]
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}
