import type { ReactNode } from 'react'

export function RingGauge({
  label,
  value,
  sublabel,
  color,
}: {
  label: string
  value: number
  sublabel: ReactNode
  color: string
}) {
  const radius = 38
  const circumference = 2 * Math.PI * radius
  const pct = Math.max(0, Math.min(100, value))
  const len = (pct / 100) * circumference

  return (
    <div
      style={{
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 18,
        padding: 14,
        background: 'rgba(255,255,255,0.02)',
        display: 'grid',
        gap: 10,
        justifyItems: 'center',
      }}
    >
      <div style={{ fontWeight: 760, fontSize: 13, color: 'rgba(255,255,255,0.82)' }}>{label}</div>
      <svg width="104" height="104" viewBox="0 0 120 120" aria-hidden="true" role="presentation">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="14" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={`${len} ${circumference - len}`}
          transform="rotate(-90 60 60)"
        />
        <text x="60" y="62" textAnchor="middle" fill="rgba(255,255,255,0.92)" fontSize="18" fontWeight="820">
          {pct}%
        </text>
      </svg>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.62)', textAlign: 'center' }}>{sublabel}</div>
    </div>
  )
}

export function Meter({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color: string
}) {
  const pct = Math.max(0, Math.min(100, value))
  const r = 34
  const w = 120
  const h = 78
  const cx = w / 2
  const cy = 62

  function polarToCartesian(angle: number) {
    const a = ((angle - 90) * Math.PI) / 180
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
  }

  function arcPath(from: number, to: number) {
    const start = polarToCartesian(to)
    const end = polarToCartesian(from)
    const large = to - from <= 180 ? 0 : 1
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 0 ${end.x} ${end.y}`
  }

  const angle = (pct / 100) * 180

  return (
    <div style={{ display: 'grid', gap: 8, justifyItems: 'center' }}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" role="presentation">
        <path d={arcPath(0, 180)} stroke="rgba(255,255,255,0.07)" strokeWidth="10" fill="none" strokeLinecap="round" />
        <path d={arcPath(0, angle)} stroke={color} strokeWidth="10" fill="none" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="2" fill="rgba(255,255,255,0.35)" />
        <line
          x1={cx}
          y1={cy}
          x2={polarToCartesian(angle).x}
          y2={polarToCartesian(angle).y}
          stroke="rgba(255,255,255,0.6)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <text x={cx} y="30" textAnchor="middle" fill="rgba(255,255,255,0.88)" fontSize="18" fontWeight="820">
          {pct}%
        </text>
      </svg>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.62)' }}>{label}</div>
    </div>
  )
}

