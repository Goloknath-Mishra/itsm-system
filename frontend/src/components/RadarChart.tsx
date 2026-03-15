type RadarPoint = {
  label: string
  value: number
  color: string
}

function polar(cx: number, cy: number, r: number, angle: number) {
  const a = ((angle - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
}

export function RadarChart({
  points,
  maxValue,
}: {
  points: RadarPoint[]
  maxValue: number
}) {
  const w = 340
  const h = 240
  const cx = w / 2
  const cy = 120
  const radius = 86
  const n = Math.max(points.length, 3)
  const angles = Array.from({ length: n }).map((_, i) => (360 / n) * i)

  const rings = [0.25, 0.5, 0.75, 1].map((m) => {
    const r = radius * m
    const pts = angles
      .map((a) => {
        const p = polar(cx, cy, r, a)
        return `${p.x},${p.y}`
      })
      .join(' ')
    return pts
  })

  const poly = angles
    .map((a, i) => {
      const v = points[i]?.value ?? 0
      const pct = Math.max(0, Math.min(1, v / Math.max(maxValue, 1)))
      const p = polar(cx, cy, radius * pct, a)
      return `${p.x},${p.y}`
    })
    .join(' ')

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" role="presentation">
      {rings.map((r, idx) => (
        <polygon
          key={idx}
          points={r}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="1"
        />
      ))}
      {angles.map((a, idx) => {
        const p = polar(cx, cy, radius, a)
        return (
          <line key={idx} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
        )
      })}

      <polygon points={poly} fill="rgba(31,210,255,0.14)" stroke="rgba(31,210,255,0.7)" strokeWidth="2" />

      {angles.map((a, idx) => {
        const p = polar(cx, cy, radius + 20, a)
        const label = points[idx]?.label ?? ''
        const value = points[idx]?.value ?? 0
        const fill = points[idx]?.color ?? 'rgba(255,255,255,0.6)'
        return (
          <g key={idx}>
            <circle cx={p.x} cy={p.y} r="3" fill={fill} opacity="0.9" />
            <text
              x={p.x}
              y={p.y + (p.y > cy ? 14 : -8)}
              textAnchor="middle"
              fill="rgba(255,255,255,0.72)"
              fontSize="10"
            >
              {label}
            </text>
            <text x={p.x} y={p.y + (p.y > cy ? 26 : 4)} textAnchor="middle" fill={fill} fontSize="10" fontWeight="750">
              {value}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

