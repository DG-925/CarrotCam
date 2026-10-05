// Live look previews rendered by the GPU engine, shared by every panel that
// shows them. Each look is drawn once per refresh into a small cache canvas
// and copied to the canvases on screen.
import { useEffect, useMemo } from 'react'
import { engine } from './controller'

const W = 192
const H = 108
const cache = new Map<string, HTMLCanvasElement>()
const mounted = new Map<string, Set<HTMLCanvasElement>>()
const wanted = new Map<number, string[]>()
let nextKey = 1
let requested = ''

/** Draws the cached 16:9 preview into a canvas of any shape (cropped, not stretched). */
function paint(el: HTMLCanvasElement, src: HTMLCanvasElement): void {
  const ctx = el.getContext('2d')
  if (!ctx) return
  const scale = Math.max(el.width / src.width, el.height / src.height)
  const sw = el.width / scale
  const sh = el.height / scale
  ctx.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, el.width, el.height)
}

function sync(): void {
  const ids = [...new Set([...wanted.values()].flat())]
  const key = ids.join(',')
  if (key === requested) return
  requested = key
  engine?.requestThumbs(ids)
}

/** Called by the controller with each batch the engine renders. */
export function onThumbs(t: { bitmap: ImageBitmap; ids: string[]; cellW: number; cellH: number; cols: number }): void {
  t.ids.forEach((id, i) => {
    let c = cache.get(id)
    if (!c) {
      c = document.createElement('canvas')
      c.width = W
      c.height = H
      cache.set(id, c)
    }
    c.getContext('2d')?.drawImage(t.bitmap, (i % t.cols) * t.cellW, Math.floor(i / t.cols) * t.cellH, t.cellW, t.cellH, 0, 0, W, H)
    for (const el of mounted.get(id) ?? []) paint(el, c)
  })
  t.bitmap.close()
}

type CanvasRef = (el: HTMLCanvasElement | null) => (() => void) | undefined

/** Keeps the previews for `ids` coming while the component is mounted. */
export function useThumbs(ids: string[]): (id: string) => CanvasRef {
  const key = ids.join(',')
  useEffect(() => {
    const k = nextKey++
    wanted.set(k, key ? key.split(',') : [])
    sync()
    return () => {
      wanted.delete(k)
      sync()
    }
  }, [key])
  // one stable ref callback per look; React 19 calls the returned cleanup
  // for each canvas, so several canvases can show the same look
  return useMemo(() => {
    const refs = new Map<string, CanvasRef>()
    return (id: string) => {
      let ref = refs.get(id)
      if (!ref) {
        ref = (el) => {
          if (!el) return undefined
          if (!mounted.has(id)) mounted.set(id, new Set())
          mounted.get(id)!.add(el)
          const c = cache.get(id)
          if (c) paint(el, c)
          return () => {
            mounted.get(id)?.delete(el)
          }
        }
        refs.set(id, ref)
      }
      return ref
    }
  }, [])
}
