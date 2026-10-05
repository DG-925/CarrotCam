import { Balloon, CloudRain, FolderOpen, Heart, PartyPopper, Play, Sparkles, ThumbsUp } from 'lucide-react'
import { IPC, type CaptureItem } from '@shared/app'
import type { Reaction } from '@shared/effects'
import { engine } from '@/lib/controller'
import { invoke } from '@/lib/ipc'
import { timeAgo } from '@/lib/format'
import { useStore } from '@/lib/store'

const REACTIONS: { kind: Reaction; icon: typeof Heart; label: string; color: string; fill?: boolean }[] = [
  { kind: 'hearts', icon: Heart, label: 'Hearts', color: 'var(--c-heart)', fill: true },
  { kind: 'thumbs', icon: ThumbsUp, label: 'Like', color: 'var(--c-like)' },
  { kind: 'confetti', icon: PartyPopper, label: 'Confetti', color: 'var(--c-confetti)' },
  { kind: 'balloons', icon: Balloon, label: 'Balloons', color: 'var(--c-balloon)' },
  { kind: 'fireworks', icon: Sparkles, label: 'Fireworks', color: 'var(--c-fireworks)' },
  { kind: 'rain', icon: CloudRain, label: 'Rain', color: 'var(--c-rain)' }
]

function Reactions(): React.JSX.Element {
  const handControl = useStore((s) => s.app.handControl)
  return (
    <section className="mini-card">
      <div className="mini-card-head">
        <span className="eyebrow">Reactions</span>
        <span className="aside">{handControl ? 'or make a heart with your hands' : 'or say “Carrot, hearts”'}</span>
      </div>
      <div className="reactions">
        {REACTIONS.map((r) => (
          <button key={r.kind} className="reaction" title={r.label} onClick={() => engine.react(r.kind)} style={{ '--rc': r.color } as React.CSSProperties}>
            <span className="rbox">
              <r.icon size={24} fill={r.fill ? 'currentColor' : 'none'} />
            </span>
            <span>{r.label}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

export function CaptureThumb({ item }: { item: CaptureItem }): React.JSX.Element {
  return item.kind === 'photo' ? (
    <img src={item.url} alt="" loading="lazy" decoding="async" draggable={false} />
  ) : (
    // the first frame, without loading the whole file
    <video src={`${item.url}#t=0.1`} preload="metadata" muted playsInline />
  )
}

function RecentCaptures(): React.JSX.Element {
  const captures = useStore((s) => s.captures)
  const set = useStore((s) => s.set)
  const recent = captures.slice(0, 4)
  return (
    <section className="mini-card">
      <div className="mini-card-head">
        <span className="eyebrow">Recent captures</span>
        {captures.length > 0 ? (
          <button className="link-btn" onClick={() => set({ page: 'gallery' })}>
            <FolderOpen size={14} /> Open gallery
          </button>
        ) : (
          <button className="link-btn" onClick={() => void invoke(IPC.capturesFolder, 'photo')}>
            <FolderOpen size={14} /> Open folder
          </button>
        )}
      </div>
      {recent.length === 0 ? (
        <div className="captures-empty">Snapshots and recordings you take show up here.</div>
      ) : (
        <div className="captures">
          {recent.map((c) => (
            <button key={c.url} className="capture" onClick={() => set({ page: 'gallery', viewer: c })} title={c.name}>
              <span className="cthumb">
                <CaptureThumb item={c} />
                {c.kind === 'video' && (
                  <span className="play-badge">
                    <Play size={14} fill="currentColor" />
                  </span>
                )}
              </span>
              <span className="cmeta">
                {c.kind === 'photo' ? 'Snapshot' : 'Video'} · {timeAgo(c.mtime)}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

export function StudioCards(): React.JSX.Element {
  return (
    <div className="studio-cards">
      <Reactions />
      <RecentCaptures />
    </div>
  )
}
