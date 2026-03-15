import { type ReactNode, useEffect } from 'react'
import { cls } from './cls'

export function Button({
  children,
  variant,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'primary' | 'danger'
}) {
  return (
    <button
      {...props}
      className={cls(
        'snBtn',
        variant === 'primary' && 'snBtnPrimary',
        variant === 'danger' && 'snBtnDanger',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cls('snInput', props.className)} />
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cls('snInput', props.className)} />
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cls('snSelect', props.className)} />
}

export function Panel({
  title,
  actions,
  children,
}: {
  title?: ReactNode
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="snPanel">
      {title ? (
        <div className="snPanelHeader">
          <div className="snPanelTitle">{title}</div>
          {actions ? <div className="snRowWrap">{actions}</div> : null}
        </div>
      ) : null}
      <div className="snPanelBody">{children}</div>
    </section>
  )
}

export function StatCard({ label, value, meta }: { label: string; value: ReactNode; meta?: ReactNode }) {
  return (
    <div className="snStat">
      <div className="snStatLabel">{label}</div>
      <div className="snStatValue">{value}</div>
      {meta ? <div className="snStatMeta">{meta}</div> : <div />}
    </div>
  )
}

export function Badge({
  children,
  tone,
}: {
  children: ReactNode
  tone?: 'neutral' | 'danger' | 'warning' | 'success' | 'info'
}) {
  return (
    <span
      className={cls(
        'snBadge',
        tone === 'danger' && 'snBadgeDanger',
        tone === 'warning' && 'snBadgeWarning',
        tone === 'success' && 'snBadgeSuccess',
        tone === 'info' && 'snBadgeInfo',
      )}
    >
      <span className="snDot" />
      {children}
    </span>
  )
}

export function Tabs<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
}) {
  return (
    <div className="snTabs" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={cls('snTab', value === o.value && 'snTabActive')}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Modal({
  title,
  isOpen,
  onClose,
  children,
}: {
  title: string
  isOpen: boolean
  onClose: () => void
  children: ReactNode
}) {
  useEffect(() => {
    if (!isOpen) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      className="snModalOverlay"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="snModal">
        <div className="snModalHeader">
          <div style={{ fontWeight: 680 }}>{title}</div>
          <Button onClick={onClose}>Close</Button>
        </div>
        <div className="snModalBody">{children}</div>
      </div>
    </div>
  )
}

export function Avatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
  return (
    <div
      style={{
        width: 28,
        height: 28,
        borderRadius: 999,
        display: 'grid',
        placeItems: 'center',
        background: 'linear-gradient(180deg, rgba(31, 210, 255, 0.35), rgba(0, 228, 181, 0.2))',
        border: '1px solid rgba(255,255,255,0.12)',
        fontSize: 12,
        fontWeight: 750,
        letterSpacing: 0.4,
      }}
    >
      {initials || 'U'}
    </div>
  )
}
