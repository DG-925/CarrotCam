import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Check, ChevronDown, type LucideIcon } from 'lucide-react'

export interface DropdownOption<T> {
  value: T
  label: string
  description?: string
  icon?: LucideIcon
  group?: string
  right?: ReactNode
  /** small tag after the label (also on the button) */
  badge?: ReactNode
  disabled?: boolean
}

/** Friendly select: icon + label + description, grouped, animated, keyboard friendly. */
export function Dropdown<T extends string | number>({
  value,
  options,
  onChange,
  placeholder = 'Choose…',
  footer,
  compact = false,
  className = '',
  menuWidth
}: {
  value: T | null
  options: DropdownOption<T>[]
  onChange: (v: T) => void
  placeholder?: string
  footer?: (close: () => void) => ReactNode
  compact?: boolean
  className?: string
  menuWidth?: number
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const id = useId()
  const current = options.find((o) => o.value === value)
  const selectable = options.filter((o) => !o.disabled)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent): void => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [open])

  useEffect(() => {
    if (open) setActive(Math.max(0, selectable.findIndex((o) => o.value === value)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const pick = (o: DropdownOption<T>): void => {
    if (o.disabled) return
    onChange(o.value)
    setOpen(false)
  }

  const onKey = (e: React.KeyboardEvent): void => {
    if (!open && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) {
      setOpen(true)
      e.preventDefault()
      return
    }
    if (!open) return
    if (e.key === 'Escape') setOpen(false)
    else if (e.key === 'ArrowDown') setActive((i) => Math.min(selectable.length - 1, i + 1))
    else if (e.key === 'ArrowUp') setActive((i) => Math.max(0, i - 1))
    else if (e.key === 'Enter') selectable[active] && pick(selectable[active])
    else return
    e.preventDefault()
  }

  const Icon = current?.icon
  let lastGroup: string | undefined
  return (
    <div className={`dropdown ${open ? 'open' : ''} ${compact ? 'compact' : ''} ${className}`} ref={root} onKeyDown={onKey}>
      <button
        className="dropdown-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        {Icon && (
          <span className="dd-icon">
            <Icon size={compact ? 17 : 19} />
          </span>
        )}
        <span className="dd-text">
          <span className="dd-label">
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{current?.label ?? placeholder}</span>
            {current?.badge}
          </span>
          {!compact && current?.description && <span className="dd-desc">{current.description}</span>}
        </span>
        <motion.span className="dd-chevron" animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.15 }}>
          <ChevronDown size={16} />
        </motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            id={id}
            role="listbox"
            className="dropdown-menu"
            style={menuWidth ? { width: menuWidth } : undefined}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="dd-scroll">
              {options.map((o) => {
                const header = o.group && o.group !== lastGroup ? o.group : null
                lastGroup = o.group
                const OIcon = o.icon
                const isActive = selectable[active] === o
                return (
                  <div key={String(o.value)}>
                    {header && <div className="dd-group">{header}</div>}
                    <button
                      role="option"
                      aria-selected={o.value === value}
                      className={`dd-option ${o.value === value ? 'selected' : ''} ${isActive ? 'active' : ''}`}
                      disabled={o.disabled}
                      onMouseEnter={() => setActive(selectable.indexOf(o))}
                      onClick={() => pick(o)}
                    >
                      {OIcon && (
                        <span className="dd-icon">
                          <OIcon size={17} />
                        </span>
                      )}
                      <span className="dd-text">
                        <span className="dd-label">
                          {o.label}
                          {o.badge}
                        </span>
                        {o.description && <span className="dd-desc">{o.description}</span>}
                      </span>
                      {o.right}
                      {o.value === value && <Check size={16} className="dd-check" />}
                    </button>
                  </div>
                )
              })}
              {options.length === 0 && <div className="dd-empty">Nothing here yet</div>}
            </div>
            {footer && <div className="dd-footer">{footer(() => setOpen(false))}</div>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
