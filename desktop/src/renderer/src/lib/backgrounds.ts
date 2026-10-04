// Built-in virtual backgrounds, generated procedurally (no image licensing,
// tiny download) at 1920x1080.

export interface BuiltInBackground {
  id: string
  name: string
  preview: string // css background for the picker chip
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void
}

function seeded(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

function bokeh(colors: string[], bg: [string, string], seed: number) {
  return (ctx: CanvasRenderingContext2D, w: number, h: number): void => {
    const rnd = seeded(seed)
    const g = ctx.createLinearGradient(0, 0, w, h)
    g.addColorStop(0, bg[0])
    g.addColorStop(1, bg[1])
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    ctx.globalCompositeOperation = 'lighter'
    for (let i = 0; i < 70; i++) {
      const r = 30 + rnd() * 140
      const x = rnd() * w
      const y = rnd() * h
      const c = colors[Math.floor(rnd() * colors.length)]
      const rg = ctx.createRadialGradient(x, y, r * 0.2, x, y, r)
      rg.addColorStop(0, c)
      rg.addColorStop(0.75, c.replace(/[\d.]+\)$/, '0.08)'))
      rg.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = rg
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalCompositeOperation = 'source-over'
  }
}

function mesh(stops: [number, number, string][], base: string) {
  return (ctx: CanvasRenderingContext2D, w: number, h: number): void => {
    ctx.fillStyle = base
    ctx.fillRect(0, 0, w, h)
    for (const [x, y, c] of stops) {
      const rg = ctx.createRadialGradient(x * w, y * h, 0, x * w, y * h, Math.max(w, h) * 0.7)
      rg.addColorStop(0, c)
      rg.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = rg
      ctx.fillRect(0, 0, w, h)
    }
  }
}

export const BUILT_IN_BACKGROUNDS: BuiltInBackground[] = [
  {
    id: 'bi:bokeh-warm',
    name: 'Warm Bokeh',
    preview: 'radial-gradient(circle at 30% 40%, #ffb36b 0 12%, transparent 13%), radial-gradient(circle at 70% 60%, #ff7a1a 0 10%, transparent 11%), linear-gradient(135deg,#3a1d0e,#120a06)',
    draw: bokeh(['rgba(255,170,90,0.55)', 'rgba(255,120,40,0.5)', 'rgba(255,220,160,0.45)'], ['#2b160b', '#0d0805'], 7)
  },
  {
    id: 'bi:bokeh-city',
    name: 'City Night',
    preview: 'radial-gradient(circle at 25% 60%, #5ac8ff 0 10%, transparent 11%), radial-gradient(circle at 70% 35%, #ff5d8f 0 9%, transparent 10%), linear-gradient(135deg,#0b1430,#05060d)',
    draw: bokeh(['rgba(90,200,255,0.5)', 'rgba(255,93,143,0.45)', 'rgba(255,214,102,0.45)', 'rgba(160,120,255,0.4)'], ['#0b1430', '#05060d'], 42)
  },
  {
    id: 'bi:mesh-carrot',
    name: 'Carrot Glow',
    preview: 'radial-gradient(circle at 20% 20%, #ff9a3d, transparent 55%), radial-gradient(circle at 85% 80%, #ff3d6e, transparent 55%), #2a1208',
    draw: mesh([[0.15, 0.2, 'rgba(255,154,61,0.95)'], [0.85, 0.85, 'rgba(255,61,110,0.8)'], [0.7, 0.15, 'rgba(255,214,102,0.55)']], '#2a1208')
  },
  {
    id: 'bi:mesh-ocean',
    name: 'Deep Ocean',
    preview: 'radial-gradient(circle at 20% 80%, #1fb6ff, transparent 55%), radial-gradient(circle at 80% 20%, #7c5cff, transparent 55%), #071426',
    draw: mesh([[0.2, 0.85, 'rgba(31,182,255,0.85)'], [0.85, 0.2, 'rgba(124,92,255,0.8)'], [0.5, 0.5, 'rgba(0,255,200,0.25)']], '#071426')
  },
  {
    id: 'bi:aurora',
    name: 'Aurora',
    preview: 'linear-gradient(160deg,#03140f,#0a3b2c 40%,#36d399 70%,#7c5cff)',
    draw: mesh([[0.1, 0.3, 'rgba(54,211,153,0.85)'], [0.6, 0.15, 'rgba(124,92,255,0.75)'], [0.9, 0.7, 'rgba(14,165,233,0.6)']], '#03140f')
  },
  {
    id: 'bi:studio-grey',
    name: 'Studio Grey',
    preview: 'radial-gradient(circle at 50% 35%, #6b6560, #1c1a18 75%)',
    draw: (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h * 0.35, 0, w / 2, h * 0.35, w * 0.75)
      g.addColorStop(0, '#77706a')
      g.addColorStop(1, '#161412')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
    }
  }
]

export async function renderBuiltIn(id: string): Promise<Blob | null> {
  const bg = BUILT_IN_BACKGROUNDS.find((b) => b.id === id)
  if (!bg) return null
  const canvas = document.createElement('canvas')
  canvas.width = 1920
  canvas.height = 1080
  const ctx = canvas.getContext('2d')!
  bg.draw(ctx, canvas.width, canvas.height)
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'))
}
