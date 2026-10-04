// 2D overlay layer (runs in the render worker on an OffscreenCanvas):
// name tag, clock, LIVE badge, "be right back" card, standby screen and
// animated reactions. Uploaded as a texture only when it changes.
import type { EffectSettings, Reaction } from '@shared/effects'

const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif'
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
  kind: 'emoji' | 'rect' | 'spark' | 'drop'
  glyph?: string
  color?: string
}

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a)
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
  hasContent = false

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
    const burst = (glyphs: string[], count: number, from: 'bottom' | 'center' | 'top'): void => {
      for (let i = 0; i < count; i++) {
        const x = from === 'center' ? w / 2 + rand(-60, 60) * s : rand(w * 0.08, w * 0.92)
        const y = from === 'bottom' ? h + rand(0, 120) * s : from === 'top' ? -rand(0, 200) * s : h / 2
        this.particles.push({
          x,
          y,
          vx: rand(-40, 40) * s,
          vy: from === 'bottom' ? -rand(140, 300) * s : from === 'top' ? rand(200, 360) * s : -rand(20, 120) * s,
          life: 0,
          max: rand(2.6, 4.2),
          size: rand(38, 76) * s,
          rot: rand(-0.4, 0.4),
          vr: rand(-0.6, 0.6),
          kind: 'emoji',
          glyph: glyphs[i % glyphs.length]
        })
      }
    }
    switch (kind) {
      case 'hearts':
        burst(['❤️', '💖', '💕', '🧡'], 26, 'bottom')
        break
      case 'balloons':
        burst(['🎈', '🎈', '🎉'], 18, 'bottom')
        break
      case 'thumbs':
        this.particles.push({
          x: w / 2,
          y: h / 2,
          vx: 0,
          vy: -30 * s,
          life: 0,
          max: 1.8,
          size: 220 * s,
          rot: 0,
          vr: 0,
          kind: 'emoji',
          glyph: '👍'
        })
        burst(['👍', '✨'], 12, 'center')
        break
      case 'confetti': {
        const colors = [ORANGE, '#ffd166', '#06d6a0', '#118ab2', '#ef476f', '#ffffff']
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
            color: colors[i % colors.length]
          })
        }
        break
      }
      case 'fireworks': {
        const colors = [ORANGE, '#ffd166', '#ff5d8f', '#7bdff2', '#b9fbc0']
        for (let b = 0; b < 4; b++) {
          const cx = rand(w * 0.2, w * 0.8)
          const cy = rand(h * 0.15, h * 0.45)
          const color = colors[b % colors.length]
          const delay = b * 0.35
          for (let i = 0; i < 70; i++) {
            const a = (i / 70) * Math.PI * 2
            const v = rand(160, 300) * s
            this.particles.push({
              x: cx,
              y: cy,
              vx: Math.cos(a) * v,
              vy: Math.sin(a) * v,
              life: -delay,
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
      }
      case 'rain':
        for (let i = 0; i < 140; i++) {
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
        burst(['🌧️'], 3, 'top')
        break
    }
    this.dirty = true
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

    if (this.particles.length) {
      this.drawParticles(dt)
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
    ctx.font = `${70 * s}px ${EMOJI_FONT}`
    ctx.textBaseline = 'middle'
    ctx.fillText('☕', w / 2, y + 78 * s)
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
      if (p.kind === 'emoji') {
        const pop = p.size > 150 ? 0.6 + 0.4 * Math.min(1, p.life / 0.25) : 1
        ctx.font = `${p.size * pop}px ${EMOJI_FONT}`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(p.glyph!, 0, 0)
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
    ctx.fillStyle = ORANGE
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#181210'
    ctx.beginPath()
    ctx.arc(cx, cy, r * 0.62, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ff8c32'
    ctx.beginPath()
    ctx.arc(cx, cy, r * 0.4, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ffecd2'
    ctx.beginPath()
    ctx.arc(cx - r * 0.14, cy - r * 0.14, r * 0.09, 0, Math.PI * 2)
    ctx.fill()
    // orbiting dot
    const a = t * 2.2
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.beginPath()
    ctx.arc(cx + Math.cos(a) * r * 1.35, cy + Math.sin(a) * r * 1.35, 6 * s, 0, Math.PI * 2)
    ctx.fill()

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
