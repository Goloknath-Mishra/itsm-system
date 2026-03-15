import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiFetch } from '../api'
import { useAuth } from '../auth/useAuth'
import type { ReportDefinition, ReportDataset } from '../itsmTypes'
import { Badge, Button, Input, Panel } from '../components/ui'
import { isPrivileged } from '../auth/roles'

function labelForDataset(d: ReportDataset) {
  if (d === 'TICKETS') return 'Tickets'
  if (d === 'ASSETS') return 'Assets'
  if (d === 'KNOWLEDGE') return 'Knowledge'
  return 'Catalog Requests'
}

export function ReportsListPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState<ReportDefinition[]>([])
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!auth.accessToken) return
    setIsLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams()
      if (search) qs.set('search', search)
      const path = qs.toString() ? `/api/reports/?${qs.toString()}` : '/api/reports/'
      const data = await apiFetch<ReportDefinition[]>(path, { token: auth.accessToken })
      setItems(data)
    } catch {
      setError('Failed to load reports')
    } finally {
      setIsLoading(false)
    }
  }, [auth.accessToken, search])

  useEffect(() => {
    void load()
  }, [load])

  const grouped = useMemo(() => {
    const map = new Map<ReportDataset, ReportDefinition[]>()
    for (const r of items) {
      const list = map.get(r.dataset) ?? []
      list.push(r)
      map.set(r.dataset, list)
    }
    return map
  }, [items])

  return (
    <div className="snPage">
      <div className="snRowWrap" style={{ justifyContent: 'space-between', alignItems: 'end' }}>
        <div style={{ display: 'grid', gap: 4 }}>
          <h1 className="snH1">Reports</h1>
          <div className="snSubtle">Build and export reports with nested filters.</div>
        </div>
        <div className="snRowWrap">
          <div style={{ width: 340, maxWidth: '60vw' }}>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search reports…"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void load()
              }}
            />
          </div>
          <Button type="button" onClick={() => void load()} disabled={isLoading}>
            Search
          </Button>
          <Button type="button" variant="primary" onClick={() => navigate('/reports/new')}>
            New report
          </Button>
        </div>
      </div>

      {error ? (
        <Panel title="Error">
          <div style={{ color: 'rgba(255,255,255,0.84)' }}>{error}</div>
        </Panel>
      ) : null}

      <Panel title="Library" actions={<Badge tone="info">{isPrivileged(auth.user) ? 'Admin view' : 'Read-only'}</Badge>}>
        {isLoading ? <div style={{ color: 'var(--muted)' }}>Loading…</div> : null}
        {!isLoading && items.length === 0 ? <div style={{ color: 'var(--muted)' }}>No reports yet.</div> : null}
        {!isLoading ? (
          <div style={{ display: 'grid', gap: 14 }}>
            {(['TICKETS', 'ASSETS', 'KNOWLEDGE', 'CATALOG_REQUESTS'] as const).map((d) => {
              const list = grouped.get(d) ?? []
              if (list.length === 0) return null
              return (
                <div key={d} style={{ display: 'grid', gap: 10 }}>
                  <div style={{ fontWeight: 820 }}>{labelForDataset(d)}</div>
                  <div style={{ display: 'grid', gap: 10 }}>
                    {list.map((r) => (
                      <div
                        key={r.id}
                        className="snPanel"
                        style={{ padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}
                      >
                        <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                          <div style={{ fontWeight: 780, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
                          <div className="snSubtle">
                            Updated {new Date(r.updated_at).toLocaleString()} · Owner {r.created_by.username}
                          </div>
                        </div>
                        <div className="snRowWrap">
                          <Badge tone="neutral">{labelForDataset(r.dataset)}</Badge>
                          <Link to={`/reports/${r.id}`}>
                            <Button type="button" variant="primary">
                              Open
                            </Button>
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        ) : null}
      </Panel>
    </div>
  )
}
