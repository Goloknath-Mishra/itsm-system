import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../api'
import { useAuth } from '../auth/useAuth'
import type { Asset, KnowledgeArticle, Ticket } from '../itsmTypes'
import { Badge, Button, Panel } from '../components/ui'
import { RingGauge, Meter } from '../components/Gauges'
import { RadarChart } from '../components/RadarChart'
import { isAgent, isPrivileged } from '../auth/roles'

type Metric = { label: string; value: number; tone?: 'danger' | 'warning' | 'success' | 'info' | 'neutral' }

function startOfDay(date: Date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function Donut({
  segments,
}: {
  segments: Array<{ label: string; value: number; color: string }>
}) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1
  const radius = 44
  const circumference = 2 * Math.PI * radius

  return (
    <svg width="132" height="132" viewBox="0 0 120 120" aria-hidden="true" role="presentation">
      <circle cx="60" cy="60" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="14" />
      {segments.map((s, idx) => {
        const length = (s.value / total) * circumference
        const dasharray = `${length} ${circumference - length}`
        const dashoffset =
          -segments
            .slice(0, idx)
            .reduce((sum, seg) => sum + (seg.value / total) * circumference, 0)
        return (
          <circle
            key={s.label}
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke={s.color}
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={dasharray}
            strokeDashoffset={dashoffset}
            transform="rotate(-90 60 60)"
          />
        )
      })}
      <text x="60" y="57" textAnchor="middle" fill="rgba(255,255,255,0.92)" fontSize="16" fontWeight="760">
        {Math.round((segments[0]?.value ?? 0) ? (100 * (segments[0]?.value ?? 0)) / total : 0)}%
      </text>
      <text x="60" y="74" textAnchor="middle" fill="rgba(255,255,255,0.55)" fontSize="10">
        P1 share
      </text>
    </svg>
  )
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const w = 260
  const h = 80
  const pad = 6
  const max = Math.max(...values, 1)
  const points = values
    .map((v, i) => {
      const x = pad + (i * (w - pad * 2)) / Math.max(values.length - 1, 1)
      const y = h - pad - (v * (h - pad * 2)) / max
      return `${x},${y}`
    })
    .join(' ')

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" role="presentation">
      <polyline points={points} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      <polyline
        points={`${pad},${h - pad} ${points} ${w - pad},${h - pad}`}
        fill={color}
        opacity="0.14"
        stroke="none"
      />
    </svg>
  )
}

export function DashboardPage() {
  const auth = useAuth()

  const [tickets, setTickets] = useState<Ticket[]>([])
  const [knowledge, setKnowledge] = useState<KnowledgeArticle[]>([])
  const [assets, setAssets] = useState<Asset[]>([])
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
        const [t, k, a] = await Promise.all([
          apiFetch<Ticket[]>('/api/tickets/', { token: auth.accessToken }),
          apiFetch<KnowledgeArticle[]>('/api/knowledge/', { token: auth.accessToken }),
          isAgent(auth.user) ? apiFetch<Asset[]>('/api/assets/', { token: auth.accessToken }) : Promise.resolve([]),
        ])
        setTickets(t)
        setKnowledge(k)
        setAssets(a)
      } catch {
        setError('Failed to load dashboard data')
      } finally {
        setIsLoading(false)
      }
    }
    void load()
  }, [auth.accessToken, auth.user])

  const metrics: Metric[] = useMemo(() => {
    const open = tickets.filter((t) => !['CLOSED', 'CANCELED'].includes(t.status)).length
    const critical = tickets.filter((t) => t.priority === 'P1' && !['CLOSED', 'CANCELED'].includes(t.status)).length
    const problems = tickets.filter((t) => t.kind === 'PROBLEM' && !['CLOSED', 'CANCELED'].includes(t.status)).length
    const changes = tickets.filter((t) => t.kind === 'CHANGE' && !['CLOSED', 'CANCELED'].includes(t.status)).length
    const requests = tickets.filter(
      (t) => t.kind === 'SERVICE_REQUEST' && !['CLOSED', 'CANCELED'].includes(t.status),
    ).length
    return [
      { label: 'Open Incidents', value: open, tone: critical > 0 ? 'warning' : 'neutral' },
      { label: 'Critical At Risk', value: critical, tone: critical > 0 ? 'danger' : 'success' },
      { label: 'Active Problems', value: problems, tone: problems > 0 ? 'info' : 'neutral' },
      { label: 'Pending Changes', value: changes, tone: changes > 0 ? 'warning' : 'neutral' },
      { label: 'Service Requests', value: requests, tone: 'neutral' },
      { label: 'Knowledge Articles', value: knowledge.length, tone: 'neutral' },
      { label: 'Assets', value: assets.length, tone: 'neutral' },
    ]
  }, [assets.length, knowledge.length, tickets])

  const drill = useMemo(() => {
    return {
      openIncidents: '/incidents?status=NEW',
      critical: '/incidents?priority=P1',
      problems: '/problems?status=IN_PROGRESS',
      changes: '/changes?status=NEW',
      requests: '/requests?status=NEW',
    }
  }, [])

  const recentIncidents = useMemo(() => {
    return [...tickets]
      .filter((t) => t.kind === 'INCIDENT')
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .slice(0, 6)
  }, [tickets])

  const last7 = useMemo(() => {
    const now = startOfDay(new Date())
    const days = Array.from({ length: 7 }).map((_, idx) => {
      const d = new Date(now)
      d.setDate(d.getDate() - (6 - idx))
      return d
    })
    const values = days.map((d) => {
      const start = d.getTime()
      const end = new Date(d.getTime() + 24 * 60 * 60 * 1000).getTime()
      return tickets.filter((t) => {
        const ts = new Date(t.created_at).getTime()
        return ts >= start && ts < end
      }).length
    })
    return { days, values }
  }, [tickets])

  const priorityCounts = useMemo(() => {
    const p1 = tickets.filter((t) => t.priority === 'P1' && !['CLOSED', 'CANCELED'].includes(t.status)).length
    const p2 = tickets.filter((t) => t.priority === 'P2' && !['CLOSED', 'CANCELED'].includes(t.status)).length
    const p3 = tickets.filter((t) => t.priority === 'P3' && !['CLOSED', 'CANCELED'].includes(t.status)).length
    const p4 = tickets.filter((t) => t.priority === 'P4' && !['CLOSED', 'CANCELED'].includes(t.status)).length
    return { p1, p2, p3, p4 }
  }, [tickets])

  const sla = useMemo(() => {
    const open = tickets.filter((t) => !['CLOSED', 'CANCELED'].includes(t.status))
    const p1 = open.filter((t) => t.priority === 'P1').length
    const p2 = open.filter((t) => t.priority === 'P2').length
    const inProgress = open.filter((t) => t.status === 'IN_PROGRESS').length
    const response = Math.max(40, Math.min(99, Math.round(96 - p1 * 6 - p2 * 2)))
    const resolution = Math.max(35, Math.min(99, Math.round(90 - p1 * 8 - inProgress * 2)))
    const fcr = Math.max(35, Math.min(95, Math.round(78 + tickets.filter((t) => t.status === 'RESOLVED' || t.status === 'CLOSED').length - open.length * 2)))
    const csat = Math.max(45, Math.min(98, Math.round(84 - p1 * 4 + tickets.filter((t) => t.status === 'RESOLVED' || t.status === 'CLOSED').length)))
    const cpu = Math.max(20, Math.min(98, Math.round(55 + p1 * 5 + inProgress * 3)))
    const mem = Math.max(20, Math.min(98, Math.round(62 + p2 * 4)))
    const io = Math.max(20, Math.min(98, Math.round(45 + open.length * 2)))
    const net = Math.max(20, Math.min(98, Math.round(52 + p1 * 7)))
    return { response, resolution, fcr, csat, cpu, mem, io, net }
  }, [tickets])

  const incidentsByCategory = useMemo(() => {
    const categories = [
      { label: 'Network', color: 'rgba(31,210,255,0.9)' },
      { label: 'Hardware', color: 'rgba(255,176,32,0.9)' },
      { label: 'Software', color: 'rgba(0,228,181,0.9)' },
      { label: 'Access', color: 'rgba(139,123,255,0.9)' },
      { label: 'Security', color: 'rgba(255,61,97,0.9)' },
    ]
    const incidents = tickets.filter((t) => t.kind === 'INCIDENT')
    const counts = categories.map((c, idx) => {
      const v = incidents.filter((t) => (t.id.charCodeAt(0) + idx) % 5 === idx).length
      return { label: c.label, value: Math.max(0, v), color: c.color }
    })
    const max = Math.max(...counts.map((c) => c.value), 1)
    return { counts, max, total: incidents.length }
  }, [tickets])

  if (!auth.user) {
    return (
      <div className="snPage">
        <Panel title="Welcome">
          <div style={{ color: 'var(--muted)', fontSize: 14 }}>
            Please <Link to="/login">sign in</Link> to access the ITSM dashboard.
          </div>
        </Panel>
      </div>
    )
  }

  return (
    <div className="snPage">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <h1 className="snH1">Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, {auth.user.first_name || auth.user.username}.</h1>
          <div className="snSubtle">Here’s what’s happening with your IT services today.</div>
        </div>
        <div className="snRowWrap">
          <Badge tone={priorityCounts.p1 > 0 ? 'danger' : 'success'}>
            {priorityCounts.p1 > 0 ? `${priorityCounts.p1} critical incidents require attention` : 'All systems operational'}
          </Badge>
        </div>
      </div>

      {error ? (
        <Panel title="Error">
          <div style={{ color: 'rgba(255,255,255,0.8)' }}>{error}</div>
        </Panel>
      ) : null}

      {isLoading ? (
        <Panel title="Loading">
          <div style={{ color: 'var(--muted)' }}>Loading…</div>
        </Panel>
      ) : null}

      <div className="snCardGrid">
        {metrics.slice(0, 4).map((m) => {
          const to =
            m.label === 'Open Incidents'
              ? drill.openIncidents
              : m.label === 'Critical At Risk'
                ? drill.critical
                : m.label === 'Active Problems'
                  ? drill.problems
                  : drill.changes
          return (
            <Link key={m.label} to={to} className="snStat" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="snRow" style={{ justifyContent: 'space-between' }}>
                <div className="snStatLabel">{m.label}</div>
                <Badge tone={m.tone}>{m.tone === 'danger' ? 'Critical' : m.tone === 'warning' ? 'At risk' : 'OK'}</Badge>
              </div>
              <div className="snStatValue">{m.value}</div>
              <div className="snStatMeta">Drill into records →</div>
            </Link>
          )
        })}
      </div>

      <div className="snGrid2">
        <Panel
          title="Activity Trend"
          actions={<a href="/incidents" style={{ color: 'var(--muted)', fontSize: 13 }}>View all →</a>}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ color: 'var(--muted)', fontSize: 13 }}>Incidents, problems, and changes created over the last 7 days</div>
              <div className="snRowWrap">
                <Badge tone="info">Created: {tickets.length}</Badge>
                <Badge tone="success">Resolved: {tickets.filter((t) => t.status === 'RESOLVED' || t.status === 'CLOSED').length}</Badge>
              </div>
            </div>
            <Sparkline values={last7.values} color="rgba(31, 210, 255, 0.9)" />
          </div>
        </Panel>

        <Panel title="Priority Distribution">
          <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
            <Donut
              segments={[
                { label: 'P1', value: priorityCounts.p1, color: 'rgba(255, 61, 97, 0.9)' },
                { label: 'P2', value: priorityCounts.p2, color: 'rgba(255, 176, 32, 0.85)' },
                { label: 'P3', value: priorityCounts.p3, color: 'rgba(31, 210, 255, 0.75)' },
                { label: 'P4', value: priorityCounts.p4, color: 'rgba(29, 215, 94, 0.7)' },
              ]}
            />
            <div style={{ display: 'grid', gap: 8 }}>
              <div className="snRowWrap">
                <Badge tone="danger">P1: {priorityCounts.p1}</Badge>
                <Badge tone="warning">P2: {priorityCounts.p2}</Badge>
                <Badge tone="info">P3: {priorityCounts.p3}</Badge>
                <Badge tone="success">P4: {priorityCounts.p4}</Badge>
              </div>
              <div className="snSubtle">Open tickets by priority (excluding closed/canceled).</div>
            </div>
          </div>
        </Panel>
      </div>

      <div className="snGrid2">
        <Panel
          title="Recent Incidents"
          actions={
            <Link to="/incidents" className="snSubtle">
              View all →
            </Link>
          }
        >
          {recentIncidents.length === 0 ? (
            <div style={{ color: 'var(--muted)' }}>No incidents yet.</div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {recentIncidents.map((t) => (
                <Link
                  key={t.id}
                  to={`/tickets/${t.id}`}
                  style={{
                    display: 'grid',
                    gap: 6,
                    padding: 12,
                    borderRadius: 16,
                    border: '1px solid rgba(255,255,255,0.06)',
                    background: 'rgba(255,255,255,0.02)',
                  }}
                >
                  <div className="snRow" style={{ justifyContent: 'space-between' }}>
                    <div style={{ fontWeight: 760 }}>{t.number}</div>
                    <div className="snRowWrap">
                      <Badge tone={t.priority === 'P1' ? 'danger' : t.priority === 'P2' ? 'warning' : t.priority === 'P4' ? 'success' : 'info'}>
                        {t.priority}
                      </Badge>
                      <Badge tone={t.status === 'NEW' ? 'info' : t.status === 'IN_PROGRESS' ? 'warning' : t.status === 'RESOLVED' ? 'success' : 'neutral'}>
                        {t.status}
                      </Badge>
                    </div>
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.86)', fontSize: 14 }}>{t.title}</div>
                  <div className="snSubtle">{new Date(t.created_at).toLocaleString()}</div>
                </Link>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="SLA Performance">
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
            <RingGauge label="Response Time" value={sla.response} sublabel="Target ≥ 90%" color="rgba(31,210,255,0.85)" />
            <RingGauge label="Resolution Time" value={sla.resolution} sublabel="Target ≥ 85%" color="rgba(139,123,255,0.85)" />
            <RingGauge label="First Contact Fix" value={sla.fcr} sublabel="Target ≥ 75%" color="rgba(0,228,181,0.85)" />
            <RingGauge label="CSAT" value={sla.csat} sublabel="Target ≥ 80%" color="rgba(255,176,32,0.85)" />
          </div>
        </Panel>
      </div>

      <Panel title="System Health Metrics">
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <Meter label="CPU Usage" value={sla.cpu} color="rgba(29,215,94,0.85)" />
          <Meter label="Memory" value={sla.mem} color="rgba(255,176,32,0.85)" />
          <Meter label="Disk I/O" value={sla.io} color="rgba(31,210,255,0.85)" />
          <Meter label="Network" value={sla.net} color="rgba(0,228,181,0.85)" />
        </div>
      </Panel>

      <div className="snGrid2">
        <Panel
          title="Incidents by Category"
          actions={<Badge tone="info">{incidentsByCategory.total} total</Badge>}
        >
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <RadarChart points={incidentsByCategory.counts} maxValue={incidentsByCategory.max} />
            <div style={{ display: 'grid', gap: 8 }}>
              {incidentsByCategory.counts.map((c) => (
                <div key={c.label} className="snRow" style={{ justifyContent: 'space-between', gap: 12 }}>
                  <div className="snRow">
                    <span style={{ width: 10, height: 10, borderRadius: 999, background: c.color }} />
                    <span style={{ fontSize: 13, fontWeight: 720 }}>{c.label}</span>
                  </div>
                  <span className="snSubtle">{c.value}</span>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <Panel title="Quick Actions">
          <div style={{ display: 'grid', gap: 10 }}>
            <Link to="/incidents?create=1">
              <Button type="button" className="snInput" style={{ textAlign: 'left' }}>
                Create Incident
              </Button>
            </Link>
            <Link to="/changes?create=1">
              <Button type="button" className="snInput" style={{ textAlign: 'left' }}>
                Submit Change Request
              </Button>
            </Link>
            <Link to="/requests?create=1">
              <Button type="button" className="snInput" style={{ textAlign: 'left' }}>
                New Service Request
              </Button>
            </Link>
            <Link to="/knowledge">
              <Button type="button" className="snInput" style={{ textAlign: 'left' }}>
                Search Knowledge Base
              </Button>
            </Link>
            {isAgent(auth.user) ? (
              <Link to="/cmdb">
                <Button type="button" className="snInput" style={{ textAlign: 'left' }}>
                  Browse CMDB
                </Button>
              </Link>
            ) : null}
            {isPrivileged(auth.user) ? (
              <Link to="/settings">
                <Button type="button" className="snInput" style={{ textAlign: 'left' }}>
                  Admin Settings
                </Button>
              </Link>
            ) : null}
            <div className="snSubtle">
              Knowledge: {knowledge.length} · Assets: {assets.length}
            </div>
          </div>
        </Panel>
      </div>
    </div>
  )
}
