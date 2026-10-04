// 2D overlay layer (runs in the render worker on an OffscreenCanvas):
// name tag, clock, LIVE badge, "be right back" card, standby screen and
// animated reactions. Uploaded as a texture only when it changes.
import type { EffectSettings, Reaction } from '@shared/effects'

// Lucide icon paths (24x24 viewBox) drawn as vectors on the video
const ICON = {
  heart:
    'M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5',
  sparkle:
    'M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z',
  thumbs: [
    'M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z',
    'M7 10v12'
  ],
  coffee: ['M10 2v2', 'M14 2v2', 'M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1', 'M6 2v2']
}
const HEART = new Path2D(ICON.heart)
const SPARKLE = new Path2D(ICON.sparkle)
const THUMBS = ICON.thumbs.map((d) => new Path2D(d))
const COFFEE = ICON.coffee.map((d) => new Path2D(d))
const UI_FONT = '"Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif'
const ORANGE = '#ff7a1a'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  size: number
  rot: number
  vr: number
  kind: 'heart' | 'sparkle' | 'thumb' | 'balloon' | 'rect' | 'spark' | 'drop'
  color?: string
}

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a)
}

/** Draws 24x24 lucide icon paths centered at (x, y) with the given size. */
function drawIcon(
  ctx: OffscreenCanvasRenderingContext2D,
  paths: Path2D[],
  x: number,
  y: number,
  size: number,
  style: { fill?: string; stroke?: string }
): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(size / 24, size / 24)
  ctx.translate(-12, -12)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const p of paths) {
    if (style.fill) {
      ctx.fillStyle = style.fill
      ctx.fill(p)
    }
    if (style.stroke) {
      ctx.strokeStyle = style.stroke
      ctx.lineWidth = 2
      ctx.stroke(p)
    }
  }
  ctx.restore()
}

function roundRect(ctx: OffscreenCanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

export class OverlayLayer {
  readonly canvas: OffscreenCanvas
  private ctx: OffscreenCanvasRenderingContext2D
  private particles: Particle[] = []
  private settings: EffectSettings['overlay'] | null = null
  private privacy: EffectSettings['privacy'] = 'off'
  private dirty = true
  private lastClock = ''
  private tagShownAt = 0
  private tagKey = ''
  private brbSince = 0
  private logo: ImageBitmap | null = null
  hasContent = false
  // laser pointer / air drawing, in output pixels (set every frame while used)
  private ink: { pointer: [number, number] | null; strokes: [number, number][][]; drawing: boolean } | null = null
  private trail: [number, number][] = []

  setLogo(bmp: ImageBitmap): void {
    this.logo = bmp
    this.dirty = true
  }

  constructor(
    public w: number,
    public h: number
  ) {
    this.canvas = new OffscreenCanvas(w, h)
    this.ctx = this.canvas.getContext('2d')!
  }

  resize(w: number, h: number): void {
    this.w = w
    this.h = h
    this.canvas.width = w
    this.canvas.height = h
    this.dirty = true
  }

  configure(o: EffectSettings['overlay'], privacy: EffectSettings['privacy']): void {
    const key = o.nameTag.enabled ? `${o.nameTag.name}|${o.nameTag.title}|${o.nameTag.style}|${o.nameTag.right}` : ''
    if (key && key !== this.tagKey) this.tagShownAt = performance.now()
    this.tagKey = key
    if (privacy === 'brb' && this.privacy !== 'brb') this.brbSince = Date.now()
    this.settings = o
    this.privacy = privacy
    this.dirty = true
  }

  react(kind: Reaction): void {
    const { w, h } = this
    const s = h / 720
    const warm = [ORANGE, '#ff4d6d', '#ff8fab', '#ffd166', '#ff9a3d']
    const bright = [ORANGE, '#ffd166', '#06d6a0', '#3a86ff', '#ef476f', '#8338ec']
    const rise = (kindOf: Particle['kind'], colors: string[], count: number, size: [number, number]): void => {
      for (let i = 0; i < count; i++) {
        this.particles.push({
          x: rand(w * 0.06, w * 0.94),
          y: h + rand(0, 140) * s,
          vx: rand(-35, 35) * s,
          vy: -rand(150, 300) * s,
          life: 0,
          max: rand(2.8, 4.4),
          size: rand(size[0], size[1]) * s,
          rot: rand(-0.35, 0.35),
          vr: rand(-0.5, 0.5),
          kind: kindOf,
          color: colors[i % colors.length]
        })
      }
    }
    switch (kind) {
      case 'hearts':
        rise('heart', warm, 28, [34, 72])
        break
      case 'balloons':
        rise('balloon', bright, 16, [50, 80])
        break
      case 'thumbs':
        this.particles.push({ x: w / 2, y: h / 2, vx: 0, vy: -25 * s, life: 0, max: 1.9, size: 200 * s, rot: 0, vr: 0, kind: 'thumb', color: ORANGE })
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2
          const v = rand(160, 280) * s
          this.particles.push({
            x: w / 2,
            y: h / 2,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v,
            life: 0,
            max: rand(1.1, 1.7),
            size: rand(18, 34) * s,
            rot: 0,
            vr: rand(-2, 2),
            kind: 'sparkle',
            color: i % 2 ? '#ffd166' : '#ffffff'
          })
        }
        break
      case 'confetti':
        for (let i = 0; i < 160; i++) {
          this.particles.push({
            x: rand(0, w),
            y: -rand(0, h * 0.6),
            vx: rand(-60, 60) * s,
            vy: rand(160, 320) * s,
            life: 0,
            max: rand(3, 4.5),
            size: rand(8, 16) * s,
            rot: rand(0, 6.28),
            vr: rand(-8, 8),
            kind: 'rect',
            color: bright[i % bright.length]
          })
        }
        break
      case 'fireworks':
        for (let b = 0; b < 4; b++) {
          const cx = rand(w * 0.2, w * 0.8)
          const cy = rand(h * 0.15, h * 0.45)
          const color = bright[b % bright.length]
          for (let i = 0; i < 70; i++) {
            const a = (i / 70) * Math.PI * 2
            const v = rand(160, 300) * s
            this.particles.push({
              x: cx,
              y: cy,
              vx: Math.cos(a) * v,
              vy: Math.sin(a) * v,
              life: -b * 0.35,
              max: 1.7,
              size: rand(3, 5) * s,
              rot: 0,
              vr: 0,
              kind: 'spark',
              color
            })
          }
        }
        break
      case 'rain':
        for (let i = 0; i < 160; i++) {
          this.particles.push({
            x: rand(0, w),
            y: -rand(0, h),
            vx: -30 * s,
            vy: rand(700, 1000) * s,
            life: 0,
            max: rand(2.2, 3.2),
            size: rand(14, 30) * s,
            rot: 0,
            vr: 0,
            kind: 'drop',
            color: 'rgba(170,200,255,0.75)'
          })
        }
        break
    }
    this.dirty = true
  }

  /** Laser pointer and air drawing for this frame (output pixels). */
  setInk(pointer: [number, number] | null, strokes: [number, number][][], drawing: boolean): void {
    if (pointer && !drawing) {
      this.trail.push(pointer)
      if (this.trail.length > 10) this.trail.shift()
    } else if (this.trail.length) {
      this.trail.shift() // let the trail fade out
    }
    const active = !!pointer || strokes.length > 0 || this.trail.length > 0
    if (active || this.ink) this.dirty = true
    this.ink = active ? { pointer, strokes, drawing } : null
  }

  /** Advances animations; returns true when the texture must be re-uploaded. */
  update(dt: number): boolean {
    const o = this.settings
    if (!o) return false
    const now = performance.now()
    let animating = this.particles.length > 0
    if (o.nameTag.enabled && now - this.tagShownAt < 900) animating = true
    if (o.badge !== 'none') animating = animating || Math.floor(now / 100) !== Math.floor((now - dt * 1000) / 100)
    if (o.clock || this.privacy === 'brb') {
      const clock = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      if (clock !== this.lastClock) {
        this.lastClock = clock
        this.dirty = true
      }
    }
    if (!animating && !this.dirty) return false
    this.dirty = false
    this.draw(dt, now)
    return true
  }

  private draw(dt: number, now: number): void {
    const { ctx, w, h } = this
    const o = this.settings!
    const s = h / 720
    ctx.clearRect(0, 0, w, h)
    let content = false

    if (this.privacy === 'brb') {
      this.drawBrb(s)
      content = true
    }

    if (o.nameTag.enabled && this.privacy !== 'brb') {
      this.drawNameTag(o.nameTag, s, Math.min(1, (now - this.tagShownAt) / 650))
      content = true
    }
    if (o.clock && this.privacy !== 'brb') {
      ctx.font = `600 ${26 * s}px ${UI_FONT}`
      const text = this.lastClock
      const tw = ctx.measureText(text).width
      const x = w - tw - 44 * s
      const y = 30 * s
      ctx.fillStyle = 'rgba(12,10,9,0.55)'
      roundRect(ctx, x - 16 * s, y, tw + 32 * s, 44 * s, 22 * s)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.textBaseline = 'middle'
      ctx.fillText(text, x, y + 23 * s)
      content = true
    }
    if (o.badge !== 'none' && this.privacy !== 'brb') {
      const label = o.badge === 'live' ? 'LIVE' : 'ON AIR'
      ctx.font = `800 ${22 * s}px ${UI_FONT}`
      const tw = ctx.measureText(label).width
      const x = 30 * s
      const y = 30 * s
      const bw = tw + 58 * s
      ctx.fillStyle = o.badge === 'live' ? '#e5243b' : ORANGE
      roundRect(ctx, x, y, bw, 42 * s, 10 * s)
      ctx.fill()
      const pulse = 0.55 + 0.45 * Math.abs(Math.sin(now / 420))
      ctx.fillStyle = `rgba(255,255,255,${pulse})`
      ctx.beginPath()
      ctx.arc(x + 22 * s, y + 21 * s, 7 * s, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.textBaseline = 'middle'
      ctx.fillText(label, x + 38 * s, y + 22 * s)
      content = true
    }

    const wm = o.watermark
    if (wm?.enabled && this.logo && this.privacy !== 'brb') {
      const size = 66 * s
      const m = 26 * s
      const x = wm.corner.endsWith('l') ? m : w - m - size
      const y = wm.corner.startsWith('t') ? m : h - m - size
      ctx.save()
      ctx.globalAlpha = Math.min(1, Math.max(0.1, wm.opacity / 100))
      ctx.shadowColor = 'rgba(0,0,0,0.35)'
      ctx.shadowBlur = 10 * s
      ctx.drawImage(this.logo, x, y, size, size)
      ctx.restore()
      content = true
    }

    if (this.particles.length) {
      this.drawParticles(dt)
      content = true
    }
    if (this.ink && this.privacy !== 'brb') {
      this.drawInk(this.ink, s)
      content = true
    }
    this.hasContent = content
  }

  private drawNameTag(tag: EffectSettings['overlay']['nameTag'], s: number, t: number): void {
    const { ctx, w, h } = this
    const ease = 1 - Math.pow(1 - t, 3)
    const name = tag.name.trim() || ' '
    const title = tag.title.trim()
    ctx.textBaseline = 'alphabetic'
    ctx.font = `700 ${36 * s}px ${UI_FONT}`
    const nw = ctx.measureText(name).width
    ctx.font = `500 ${22 * s}px ${UI_FONT}`
    const tw = title ? ctx.measureText(title).width : 0
    const boxW = Math.max(nw, tw) + 64 * s
    const boxH = (title ? 104 : 72) * s
    const margin = 44 * s
    const baseX = tag.right ? w - margin - boxW : margin
    const x = baseX + (tag.right ? 1 : -1) * (1 - ease) * (boxW * 0.35)
    const y = h - margin - boxH
    ctx.save()
    ctx.globalAlpha = ease
    if (tag.style === 'carrot') {
      const g = ctx.createLinearGradient(x, y, x + boxW, y)
      g.addColorStop(0, '#ff8a2a')
      g.addColorStop(1, '#ff5e1a')
      ctx.fillStyle = 'rgba(14,12,11,0.82)'
      roundRect(ctx, x, y, boxW, boxH, 18 * s)
      ctx.fill()
      ctx.fillStyle = g
      roundRect(ctx, x, y, 10 * s, boxH, 5 * s)
      ctx.fill()
    } else if (tag.style === 'glass') {
      ctx.fillStyle = 'rgba(255,255,255,0.16)'
      roundRect(ctx, x, y, boxW, boxH, 22 * s)
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'
      ctx.lineWidth = 1.5 * s
      ctx.stroke()
    }
    if (tag.style === 'minimal') {
      ctx.shadowColor = 'rgba(0,0,0,0.65)'
      ctx.shadowBlur = 14 * s
    }
    const tx = x + 32 * s
    ctx.fillStyle = '#ffffff'
    ctx.font = `700 ${36 * s}px ${UI_FONT}`
    ctx.fillText(name, tx, y + (title ? 50 : 48) * s)
    if (title) {
      ctx.fillStyle = tag.style === 'carrot' ? '#ffb27a' : 'rgba(255,255,255,0.85)'
      ctx.font = `500 ${22 * s}px ${UI_FONT}`
      ctx.fillText(title, tx, y + 84 * s)
    }
    ctx.restore()
  }

  private drawInk(ink: NonNullable<OverlayLayer['ink']>, s: number): void {
    const { ctx } = this
    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    // drawing: bright strokes with a soft dark edge so they read on any background
    for (const pass of [
      { color: 'rgba(0,0,0,0.35)', width: 11 * s },
      { color: ORANGE, width: 7 * s }
    ]) {
      ctx.strokeStyle = pass.color
      ctx.lineWidth = pass.width
      for (const st of ink.strokes) {
        if (st.length < 2) continue
        ctx.beginPath()
        ctx.moveTo(st[0][0], st[0][1])
        for (let i = 1; i < st.length - 1; i++) {
          const mx = (st[i][0] + st[i + 1][0]) / 2
          const my = (st[i][1] + st[i + 1][1]) / 2
          ctx.quadraticCurveTo(st[i][0], st[i][1], mx, my)
        }
        const last = st[st.length - 1]
        ctx.lineTo(last[0], last[1])
        ctx.stroke()
      }
    }
    // laser: fading trail + glowing red dot
    this.trail.forEach(([x, y], i) => {
      const k = (i + 1) / this.trail.length
      ctx.fillStyle = `rgba(255,40,40,${0.35 * k})`
      ctx.beginPath()
      ctx.arc(x, y, 6 * s * k, 0, Math.PI * 2)
      ctx.fill()
    })
    if (ink.pointer) {
      const [x, y] = ink.pointer
      if (ink.drawing) {
        // pen cursor
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 2.5 * s
        ctx.fillStyle = ORANGE
        ctx.beginPath()
        ctx.arc(x, y, 8 * s, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      } else {
        const g = ctx.createRadialGradient(x, y, 0, x, y, 26 * s)
        g.addColorStop(0, 'rgba(255,60,60,0.9)')
        g.addColorStop(0.35, 'rgba(255,30,30,0.35)')
        g.addColorStop(1, 'rgba(255,0,0,0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(x, y, 26 * s, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#fff'
        ctx.beginPath()
        ctx.arc(x, y, 4 * s, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.restore()
  }

  private drawBrb(s: number): void {
    const { ctx, w, h } = this
    ctx.fillStyle = 'rgba(10,9,8,0.55)'
    ctx.fillRect(0, 0, w, h)
    const cw = 620 * s
    const ch = 300 * s
    const x = (w - cw) / 2
    const y = (h - ch) / 2
    ctx.fillStyle = 'rgba(18,16,14,0.88)'
    roundRect(ctx, x, y, cw, ch, 34 * s)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,122,26,0.55)'
    ctx.lineWidth = 2 * s
    ctx.stroke()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = 'rgba(255,122,26,0.16)'
    ctx.beginPath()
    ctx.arc(w / 2, y + 78 * s, 44 * s, 0, Math.PI * 2)
    ctx.fill()
    drawIcon(ctx, COFFEE, w / 2, y + 78 * s, 50 * s, { stroke: ORANGE })
    ctx.fillStyle = '#fff'
    ctx.font = `800 ${50 * s}px ${UI_FONT}`
    ctx.fillText('Be right back', w / 2, y + 168 * s)
    ctx.fillStyle = '#ffb27a'
    ctx.font = `500 ${24 * s}px ${UI_FONT}`
    const since = new Date(this.brbSince || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    ctx.fillText(`Away since ${since}`, w / 2, y + 232 * s)
    ctx.textAlign = 'start'
  }

  private drawParticles(dt: number): void {
    const { ctx, h } = this
    const alive: Particle[] = []
    for (const p of this.particles) {
      p.life += dt
      if (p.life < 0) {
        alive.push(p)
        continue
      }
      if (p.life > p.max) continue
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.rot += p.vr * dt
      if (p.kind === 'spark') {
        p.vy += 180 * (h / 720) * dt
        p.vx *= 0.985
        p.vy *= 0.985
      }
      if (p.kind === 'rect') p.vx += Math.sin(p.life * 3 + p.rot) * 20 * dt
      const fade = Math.min(1, (p.max - p.life) / 0.6) * Math.min(1, p.life / 0.15 + 0.2)
      ctx.save()
      ctx.globalAlpha = Math.max(0, fade)
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      if (p.kind === 'heart') {
        drawIcon(ctx, [HEART], 0, 0, p.size, { fill: p.color })
      } else if (p.kind === 'sparkle') {
        drawIcon(ctx, [SPARKLE], 0, 0, p.size, { fill: p.color })
      } else if (p.kind === 'thumb') {
        const pop = 0.6 + 0.4 * Math.min(1, p.life / 0.22)
        const r = (p.size / 2) * pop
        ctx.shadowColor = 'rgba(0,0,0,0.35)'
        ctx.shadowBlur = r * 0.3
        ctx.fillStyle = p.color!
        ctx.beginPath()
        ctx.arc(0, 0, r, 0, Math.PI * 2)
        ctx.fill()
        ctx.shadowBlur = 0
        drawIcon(ctx, THUMBS, 0, 0, r * 1.1, { stroke: '#ffffff' })
      } else if (p.kind === 'balloon') {
        const r = p.size / 2
        ctx.strokeStyle = 'rgba(255,255,255,0.7)'
        ctx.lineWidth = 1.5 * (h / 720)
        ctx.beginPath()
        ctx.moveTo(0, r * 1.25)
        ctx.bezierCurveTo(r * 0.3, r * 1.8, -r * 0.3, r * 2.3, 0, r * 2.9)
        ctx.stroke()
        ctx.fillStyle = p.color!
        ctx.beginPath()
        ctx.ellipse(0, 0, r * 0.85, r * 1.05, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.moveTo(-r * 0.12, r * 1.1)
        ctx.lineTo(r * 0.12, r * 1.1)
        ctx.lineTo(0, r * 0.98)
        ctx.fill()
        ctx.fillStyle = 'rgba(255,255,255,0.45)'
        ctx.beginPath()
        ctx.ellipse(-r * 0.3, -r * 0.4, r * 0.16, r * 0.28, -0.5, 0, Math.PI * 2)
        ctx.fill()
      } else if (p.kind === 'rect') {
        ctx.fillStyle = p.color!
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
      } else if (p.kind === 'spark') {
        ctx.fillStyle = p.color!
        ctx.shadowColor = p.color!
        ctx.shadowBlur = p.size * 3
        ctx.beginPath()
        ctx.arc(0, 0, p.size, 0, Math.PI * 2)
        ctx.fill()
      } else {
        ctx.strokeStyle = p.color!
        ctx.lineWidth = 2 * (h / 720)
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.lineTo(-p.size * 0.15, p.size)
        ctx.stroke()
      }
      ctx.restore()
      alive.push(p)
    }
    this.particles = alive
  }
}

/** Animated "waiting for camera" card used while no source is streaming. */
export class StandbyScreen {
  readonly canvas: OffscreenCanvas
  private ctx: OffscreenCanvasRenderingContext2D
  text = 'Connect your phone or pick a camera'
  logo: ImageBitmap | null = null

  constructor(
    public w: number,
    public h: number
  ) {
    this.canvas = new OffscreenCanvas(w, h)
    this.ctx = this.canvas.getContext('2d')!
  }

  resize(w: number, h: number): void {
    this.w = w
    this.h = h
    this.canvas.width = w
    this.canvas.height = h
  }

  draw(t: number): void {
    const { ctx, w, h } = this
    const s = h / 720
    const g = ctx.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, '#17120f')
    g.addColorStop(1, '#0b0908')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    const cx = w / 2
    const cy = h * 0.42
    const glowR = 260 * s * (1 + 0.06 * Math.sin(t * 1.6))
    const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR)
    rg.addColorStop(0, 'rgba(255,122,26,0.42)')
    rg.addColorStop(1, 'rgba(255,122,26,0)')
    ctx.fillStyle = rg
    ctx.fillRect(0, 0, w, h)

    const r = 74 * s
    if (this.logo) {
      // gently floating carrot
      const bob = Math.sin(t * 1.8) * 6 * s
      const size = r * 2.3
      ctx.save()
      ctx.translate(cx, cy + bob)
      ctx.rotate(Math.sin(t * 1.2) * 0.05)
      ctx.drawImage(this.logo, -size / 2, -size / 2, size, size)
      ctx.restore()
    } else {
      ctx.fillStyle = ORANGE
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#fff'
    ctx.font = `800 ${54 * s}px ${UI_FONT}`
    ctx.fillText('CarrotCam', cx, cy + r + 70 * s)
    ctx.fillStyle = 'rgba(255,220,195,0.7)'
    ctx.font = `500 ${24 * s}px ${UI_FONT}`
    ctx.fillText(this.text, cx, cy + r + 122 * s)
    ctx.textAlign = 'start'
  }
}
