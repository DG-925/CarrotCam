import { useCallback, useId, useRef, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'

export function Logo({ size = 26 }: { size?: number }): React.JSX.Element {
  return <img src="logo.png" width={size} height={size} alt="" draggable={false} style={{ display: 'block' }} />
}

export function Section({
  title,
  action,
  children
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}): React.JSX.Element {
  return (
    <div className="section">
      <div className="section-head">
        <h3>{title}</h3>
        {action}
      </div>
      {children}
    </div>
  )
}

export function Switch({
  value,
  onChange,
  label
}: {
  value: boolean
  onChange: (v: boolean) => void
  label?: string
}): React.JSX.Element {
  return (
    <button
      role="switch"
      aria-checked={value}
      aria-label={label}
      className={`switch ${value ? 'on' : ''}`}
      onClick={() => onChange(!value)}
    >
      <motion.span
        className="knob"
        animate={{ x: value ? 18 : 0 }}
        transition={{ type: 'spring', stiffness: 600, damping: 34 }}
      />
    </button>
  )
}

export function ToggleRow({
  title,
  hint,
  value,
  onChange,
  icon
}: {
  title: string
  hint?: string
  value: boolean
  onChange: (v: boolean) => void
  icon?: ReactNode
}): React.JSX.Element {
  return (
    <div className="row">
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
        {icon}
        <div className="label">
          <b>{title}</b>
          {hint && <small>{hint}</small>}
        </div>
      </div>
      <Switch value={value} onChange={onChange} label={title} />
    </div>
  )
}

export function Slider({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  defaultValue,
  onChange,
  format,
  bipolar
}: {
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  defaultValue?: number
  onChange: (v: number) => void
  format?: (v: number) => string
  bipolar?: boolean
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const def = defaultValue ?? (bipolar ? 0 : min)
  const pct = ((value - min) / (max - min)) * 100
  const zero = bipolar ? ((0 - min) / (max - min)) * 100 : 0
  const id = useId()

  const setFromEvent = useCallback(
    (clientX: number) => {
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const t = Math.min(1, Math.max(0, (clientX - r.left) / r.width))
      let v = min + t * (max - min)
      v = Math.round(v / step) * step
      if (bipolar && Math.abs(v) < (max - min) * 0.02) v = 0 // gentle snap to center
      onChange(Number(v.toFixed(4)))
    },
    [min, max, step, bipolar, onChange]
  )

  const onPointerDown = (e: React.PointerEvent): void => {
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    setDragging(true)
    setFromEvent(e.clientX)
  }

  const onKey = (e: React.KeyboardEvent): void => {
    const big = (max - min) / 10
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') onChange(Math.min(max, value + (e.shiftKey ? big : step)))
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') onChange(Math.max(min, value - (e.shiftKey ? big : step)))
    else if (e.key === 'Home') onChange(min)
    else if (e.key === 'End') onChange(max)
    else return
    e.preventDefault()
  }

  const left = Math.min(zero, pct)
  const width = Math.abs(pct - zero)
  const display = format ? format(value) : bipolar && value > 0 ? `+${Math.round(value)}` : `${Math.round(value)}`

  return (
    <div className="slider">
      <div className="slider-top">
        <label htmlFor={id}>{label}</label>
        <span className={`val ${value !== def ? 'changed' : ''}`}>{display}</span>
      </div>
      <div
        id={id}
        ref={ref}
        className={`range ${dragging ? 'dragging' : ''}`}
        role="slider"
        tabIndex={0}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-label={label}
        onPointerDown={onPointerDown}
        onPointerMove={(e) => dragging && setFromEvent(e.clientX)}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
        onDoubleClick={() => onChange(def)}
        onKeyDown={onKey}
        title="Double-click to reset"
      >
        <div className="track" />
        {bipolar && <div className="center-tick" />}
        <div className="fill" style={{ left: `${left}%`, width: `${width}%` }} />
        <div className="thumb" style={{ left: `${pct}%` }} />
      </div>
    </div>
  )
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange
}: {
  value: T
  options: { value: T; label: ReactNode }[]
  onChange: (v: T) => void
}): React.JSX.Element {
  const id = useId()
  return (
    <div className="segmented">
      {options.map((o) => (
        <button key={String(o.value)} className={o.value === value ? 'active' : ''} onClick={() => onChange(o.value)}>
          {o.value === value && (
            <motion.div
              layoutId={`seg-${id}`}
              className="seg-bg"
              transition={{ type: 'spring', stiffness: 500, damping: 38 }}
            />
          )}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  )
}

/** Keyboard shortcut chips: <Keys keys={['Ctrl', 'Alt', 'P']} /> */
export function Keys({ keys }: { keys: string[] }): React.JSX.Element {
  return (
    <span className="kbd">
      {keys.map((k) => (
        <kbd key={k}>{k}</kbd>
      ))}
    </span>
  )
}

export const fadeUp = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] as const }
}

export const stagger = (i: number) => ({
  initial: { opacity: 0, y: 8, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  transition: { duration: 0.32, delay: Math.min(i * 0.025, 0.3), ease: [0.22, 1, 0.36, 1] as const }
})
