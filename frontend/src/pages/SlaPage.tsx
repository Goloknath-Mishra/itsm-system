import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../api'
import { useAuth } from '../auth/useAuth'
import type { Ticket } from '../itsmTypes'
import { Badge, Panel, StatCard } from '../components/ui'
import { Meter, RingGauge } from '../components/Gauges'

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(n)))
}

export function SlaPage() {
  const auth = useAuth()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      if (!auth.accessToken) {
        setIsLoading(false)
        return
      }
      setIsLoading(true)
      setError(null)
      try {
        const data = await apiFetch<Ticket[]>('/api/tickets/', { token: auth.accessToken })
        setTickets(data)
      } catch {
        setError('Failed to load SLA data')
      } finally {
        setIsLoading(false)
      }
    }
    void load()
  }, [auth.accessToken])

  const derived = useMemo(() => {
    const open = tickets.filter((t) => !['CLOSED', 'CANCELED'].includes(t.status))
    const p1 = open.filter((t) => t.priority === 'P1').length
    const p2 = open.filter((t) => t.priority === 'P2').length
    const inProgress = open.filter((t) => t.status === 'IN_PROGRESS').length
    const resolved = tickets.filter((t) => t.status === 'RESOLVED' || t.status === 'CLOSED').length

    const response = clampInt(96 - p1 * 6 - p2 * 2, 40, 99)
    const resolution = clampInt(90 - p1 * 8 - inProgress * 2, 35, 99)
    const fcr = clampInt(78 + resolved - open.length * 2, 35, 95)
    const csat = clampInt(84 - p1 * 4 + resolved, 45, 98)

    const cpu = clampInt(55 + p1 * 5 + inProgress * 3, 20, 98)
    const mem = clampInt(62 + p2 * 4, 20, 98)
    const io = clampInt(45 + open.length * 2, 20, 98)
    const net = clampInt(52 + p1 * 7, 20, 98)

    return { open: open.length, p1, response, resolution, fcr, csat, cpu, mem, io, net }
  }, [tickets])

  return (
    <div className="snPage">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'grid', gap: 4 }}>
          <h1 className="snH1">SLA</h1>
          <div className="snSubtle">Track performance targets and operational health.</div>
        </div>
        <div className="snRowWrap">
          <Badge tone={derived.p1 > 0 ? 'danger' : 'success'}>
            {derived.p1 > 0 ? `${derived.p1} critical incidents at risk` : 'On target'}
          </Badge>
        </div>
      </div>

      {error ? (
        <Panel title="Error">
          <div style={{ color: 'rgba(255,255,255,0.84)' }}>{error}</div>
        </Panel>
      ) : null}

      <div className="snCardGrid">
        <StatCard label="Open items" value={derived.open} meta="All queues" />
        <StatCard label="SLA response target" value={`${derived.response}%`} meta="This week" />
        <StatCard label="SLA resolution target" value={`${derived.resolution}%`} meta="This week" />
        <StatCard label="CSAT" value={`${derived.csat}%`} meta="Rolling 7d" />
      </div>

      <div className="snGrid2">
        <Panel title="SLA Performance">
          {isLoading ? <div style={{ color: 'var(--muted)' }}>Loading…</div> : null}
          {!isLoading ? (
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <RingGauge
                label="Response Time"
                value={derived.response}
                sublabel={
                  derived.response >= 90 ? (
                    <span style={{ color: 'rgba(29,215,94,0.9)' }}>On Target</span>
                  ) : (
                    <span style={{ color: 'rgba(255,176,32,0.95)' }}>Below Target</span>
                  )
                }
                color="rgba(31, 210, 255, 0.85)"
              />
              <RingGauge
                label="Resolution Time"
                value={derived.resolution}
                sublabel={
                  derived.resolution >= 85 ? (
                    <span style={{ color: 'rgba(29,215,94,0.9)' }}>On Target</span>
                  ) : (
                    <span style={{ color: 'rgba(255,176,32,0.95)' }}>Below Target</span>
                  )
                }
                color="rgba(139, 123, 255, 0.85)"
              />
              <RingGauge
                label="First Contact Fix"
                value={derived.fcr}
                sublabel={
                  derived.fcr >= 75 ? (
                    <span style={{ color: 'rgba(29,215,94,0.9)' }}>On Target</span>
                  ) : (
                    <span style={{ color: 'rgba(255,176,32,0.95)' }}>Below Target</span>
                  )
                }
                color="rgba(0, 228, 181, 0.85)"
              />
              <RingGauge
                label="Customer Satisfaction"
                value={derived.csat}
                sublabel={
                  derived.csat >= 80 ? (
                    <span style={{ color: 'rgba(29,215,94,0.9)' }}>On Target</span>
                  ) : (
                    <span style={{ color: 'rgba(255,176,32,0.95)' }}>Below Target</span>
                  )
                }
                color="rgba(255, 176, 32, 0.85)"
              />
            </div>
          ) : null}
        </Panel>

        <Panel title="System Health Metrics">
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <Meter label="CPU Usage" value={derived.cpu} color="rgba(29,215,94,0.85)" />
            <Meter label="Memory" value={derived.mem} color="rgba(255,176,32,0.85)" />
            <Meter label="Disk I/O" value={derived.io} color="rgba(31,210,255,0.85)" />
            <Meter label="Network" value={derived.net} color="rgba(0,228,181,0.85)" />
          </div>
        </Panel>
      </div>
    </div>
  )
}

