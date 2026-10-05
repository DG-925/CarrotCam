import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Copy, ExternalLink, FolderOpen, Images, Play, RefreshCw, Trash2, X } from 'lucide-react'
import { IPC, type CaptureItem } from '@shared/app'
import { refreshCaptures } from '@/lib/controller'
import { invoke } from '@/lib/ipc'
import { dayLabel, formatBytes, formatDuration, timeAgo } from '@/lib/format'
import { toast, useStore } from '@/lib/store'
import { Segmented } from '@/components/ui'

type Filter = 'all' | 'photo' | 'video'

/** True once the element has scrolled into view (videos load only then). */
function useSeen<T extends Element>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || seen) return
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setSeen(true), { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [seen])
  return [ref, seen]
}

function Thumb({ item }: { item: CaptureItem }): React.JSX.Element {
  const [duration, setDuration] = useState('')
  const [ref, seen] = useSeen<HTMLSpanElement>()
  if (item.kind === 'photo') return <img src={item.url} alt="" loading="lazy" decoding="async" draggable={false} />
  return (
    <>
      <span ref={ref} style={{ position: 'absolute', inset: 0 }} />
      <video
        src={seen ? `${item.url}#t=0.1` : undefined}
        preload="metadata"
        muted
        playsInline
        onLoadedMetadata={(e) => setDuration(formatDuration(e.currentTarget.duration))}
      />
      <span className="play-badge">
        <Play size={14} fill="currentColor" />
      </span>
      {duration && <span className="dur-badge">{duration}</span>}
    </>
  )
}

async function copyImage(item: CaptureItem): Promise<void> {
  try {
    const blob = await (await fetch(item.url)).blob()
    const png = blob.type === 'image/png' ? blob : await toPng(blob)
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
    toast({ kind: 'success', title: 'Copied to the clipboard' })
  } catch (err) {
    toast({ kind: 'error', title: 'Could not copy', body: String((err as Error).message ?? err) })
  }
}

async function toPng(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob)
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0)
  bitmap.close()
  return canvas.convertToBlob({ type: 'image/png' })
}

function Viewer({ list }: { list: CaptureItem[] }): React.JSX.Element | null {
  const item = useStore((s) => s.viewer)
  const set = useStore((s) => s.set)
  const index = item ? list.findIndex((c) => c.url === item.url) : -1
  const video = useRef<HTMLVideoElement>(null)

  const go = (step: number): void => {
    if (index < 0) return
    const next = list[index + step]
    if (next) set({ viewer: next })
  }
  const remove = async (): Promise<void> => {
    if (!item) return
    const next = list[index + 1] ?? list[index - 1] ?? null
    video.current?.pause()
    const ok = await invoke<boolean>(IPC.capturesDelete, item.kind, item.name)
    if (!ok) {
      toast({ kind: 'error', title: 'Could not delete', body: 'The file may be open in another app.' })
      return
    }
    toast({ kind: 'info', title: 'Moved to the Recycle Bin' })
    set({ viewer: next })
    void refreshCaptures()
  }

  useEffect(() => {
    if (!item) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') set({ viewer: null })
      else if (e.key === 'ArrowLeft') go(-1)
      else if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'Delete') void remove()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!item) return null
  return (
    <div className="viewer" role="dialog" aria-label={item.name}>
      <div className="viewer-bar">
        <button className="icon-btn" onClick={() => set({ viewer: null })} title="Close (Esc)">
          <X size={18} />
        </button>
        <div className="vtitle">
          <b>{item.name}</b>
          <small>
            {item.kind === 'photo' ? 'Snapshot' : 'Recording'} · {new Date(item.mtime).toLocaleString()} · {formatBytes(item.size)}
          </small>
        </div>
        {item.kind === 'photo' && (
          <button className="btn sm" onClick={() => void copyImage(item)}>
            <Copy size={14} /> Copy
          </button>
        )}
        <button className="btn sm" onClick={() => void invoke(IPC.capturesOpen, item.kind, item.name)}>
          <ExternalLink size={14} /> Open
        </button>
        <button className="btn sm" onClick={() => void invoke(IPC.showItem, item.path)}>
          <FolderOpen size={14} /> Show in folder
        </button>
        <button className="btn sm danger" onClick={() => void remove()} title="Move to the Recycle Bin (Delete)">
          <Trash2 size={14} /> Delete
        </button>
      </div>
      <div className="viewer-stage">
        {item.kind === 'photo' ? (
          <img key={item.url} src={item.url} alt={item.name} draggable={false} />
        ) : (
          <video key={item.url} ref={video} src={item.url} controls autoPlay />
        )}
        {index > 0 && (
          <button className="viewer-nav prev" onClick={() => go(-1)} title="Newer (Left arrow)">
            <ChevronLeft size={22} />
          </button>
        )}
        {index >= 0 && index < list.length - 1 && (
          <button className="viewer-nav next" onClick={() => go(1)} title="Older (Right arrow)">
            <ChevronRight size={22} />
          </button>
        )}
      </div>
    </div>
  )
}

export function GalleryPage(): React.JSX.Element {
  const captures = useStore((s) => s.captures)
  const set = useStore((s) => s.set)
  const [filter, setFilter] = useState<Filter>('all')

  useEffect(() => {
    void refreshCaptures()
    const onFocus = (): void => void refreshCaptures()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  const list = useMemo(() => captures.filter((c) => filter === 'all' || c.kind === filter), [captures, filter])
  const groups = useMemo(() => {
    const out: { day: string; items: CaptureItem[] }[] = []
    for (const c of list) {
      const day = dayLabel(c.mtime)
      if (out[out.length - 1]?.day !== day) out.push({ day, items: [] })
      out[out.length - 1].items.push(c)
    }
    return out
  }, [list])
  const photos = captures.filter((c) => c.kind === 'photo').length
  const videos = captures.length - photos

  return (
    <div className="page">
      <div className="page-inner">
        <div className="page-head">
          <div>
            <h1>Gallery</h1>
            <p>
              {captures.length
                ? `${photos} snapshot${photos === 1 ? '' : 's'} and ${videos} recording${videos === 1 ? '' : 's'}`
                : 'Your snapshots and recordings'}
            </p>
          </div>
          <div className="actions">
            <div style={{ width: 250 }}>
              <Segmented<Filter>
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'photo', label: 'Snapshots' },
                  { value: 'video', label: 'Videos' }
                ]}
              />
            </div>
            <button className="btn sm" onClick={() => void refreshCaptures()} title="Refresh">
              <RefreshCw size={14} />
            </button>
            <button className="btn sm" onClick={() => void invoke(IPC.capturesFolder, filter === 'video' ? 'video' : 'photo')}>
              <FolderOpen size={14} /> Open folder
            </button>
          </div>
        </div>

        {list.length === 0 ? (
          <div className="settings-card">
            <div className="empty">
              <span className="empty-icon">
                <Images size={26} />
              </span>
              <b>{filter === 'video' ? 'No recordings yet' : filter === 'photo' ? 'No snapshots yet' : 'Nothing here yet'}</b>
              <span>Take a snapshot or record a video in the Studio. They are saved to your Pictures and Videos folders.</span>
              <button className="btn primary sm" onClick={() => set({ page: 'studio' })}>
                Go to the Studio
              </button>
            </div>
          </div>
        ) : (
          groups.map((g) => (
            <section key={g.day}>
              <h3 className="eyebrow gallery-day">{g.day}</h3>
              <div className="gallery-grid">
                {g.items.map((c) => (
                  <button key={c.url} className="g-item" onClick={() => set({ viewer: c })} title={c.name}>
                    <span className="g-thumb">
                      <Thumb item={c} />
                    </span>
                    <span className="g-meta">
                      <b>{c.kind === 'photo' ? 'Snapshot' : 'Video'}</b>
                      <span>
                        {timeAgo(c.mtime)} · {formatBytes(c.size)}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
      <Viewer list={list} />
    </div>
  )
}
