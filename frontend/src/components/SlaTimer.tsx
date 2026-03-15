/**
 * SLA countdown/timer UI for tickets.
 *
 * Uses `dueAt` (ISO timestamp) to render a live countdown that updates every minute.
 * Shows breached/at-risk/on-track signal based on remaining time and/or `slaStatus`.
 */
import { useEffect, useMemo, useState } from 'react'
import { Badge } from './ui'
import { useConfigEntries } from '../config/useConfigEntries'

type Tone = 'neutral' | 'info' | 'warning' | 'danger' | 'success'

function formatMinutes(mins: number) {
  const m = Math.abs(mins)
  const d = Math.floor(m / (60 * 24))
  const h = Math.floor((m - d * 60 * 24) / 60)
  const mm = m % 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${mm}m`
  return `${mm}m`
}

function toneForRemaining(remainingMinutes: number): Tone {
  if (remainingMinutes <= 0) return 'danger'
  if (remainingMinutes <= 60) return 'warning'
  return 'success'
}

export function SlaTimer({
  dueAt,
  slaStatus,
}: {
  dueAt: string | null | undefined
  slaStatus?: string | null | undefined
}) {
  const [now, setNow] = useState(() => Date.now())
  const slaStatusConfig = useConfigEntries('ticket_sla_statuses')

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(t)
  }, [])

  const info = useMemo(() => {
    if (!dueAt) return null
    const due = new Date(dueAt).getTime()
    if (!Number.isFinite(due)) return null
    const remainingMinutes = Math.floor((due - now) / 60_000)
    const breached = remainingMinutes <= 0
    const tone = toneForRemaining(remainingMinutes)
    const label = breached ? `Breached by ${formatMinutes(remainingMinutes)}` : `Due in ${formatMinutes(remainingMinutes)}`
    return { remainingMinutes, breached, tone, label }
  }, [dueAt, now])

  if (!info) return <Badge tone="neutral">No SLA</Badge>

  const statusKey = (slaStatus || '').toUpperCase()
  const statusEntry = slaStatusConfig.byKey[statusKey]
  const statusTone = ((statusEntry?.value?.tone as Tone | undefined) || info.tone) as Tone
  const statusLabel = statusEntry?.label || slaStatus

  return (
    <div className="snRowWrap" style={{ gap: 8 }}>
      <Badge tone={statusTone}>{info.label}</Badge>
      {statusLabel ? <Badge tone="neutral">{statusLabel}</Badge> : null}
    </div>
  )
}
