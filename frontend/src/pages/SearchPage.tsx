/**
 * Global Search results page.
 *
 * Triggered from Topbar search. Queries backend `/api/search/?q=...` and renders
 * compact results for tickets, knowledge, assets, and CMDB services.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { apiFetch } from '../api'
import { useAuth } from '../auth/useAuth'
import { Badge, Button, Input, Panel } from '../components/ui'

type SearchResponse = {
  q: string
  tickets: Array<{ id: string; number: string; title: string; kind: string; status: string; priority: string }>
  knowledge: Array<{ id: string; title: string; category: string; status: string }>
  assets: Array<{ id: string; asset_tag: string; name: string; status: string }>
  services: Array<{ id: string; name: string; is_active: boolean }>
}

export function SearchPage() {
  const auth = useAuth()
  const location = useLocation()
  const [data, setData] = useState<SearchResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const q = useMemo(() => {
    const qs = new URLSearchParams(location.search)
    return (qs.get('q') || '').trim()
  }, [location.search])

  const [query, setQuery] = useState(q)

  useEffect(() => {
    setQuery(q)
  }, [q])

  const load = useCallback(async () => {
    if (!auth.accessToken) return
    setError(null)
    setIsLoading(true)
    try {
      const res = await apiFetch<SearchResponse>(`/api/search/?q=${encodeURIComponent(query.trim())}`, { token: auth.accessToken })
      setData(res)
    } catch {
      setError('Search failed')
      setData(null)
    } finally {
      setIsLoading(false)
    }
  }, [auth.accessToken, query])

  useEffect(() => {
    if (!query.trim()) {
      setData({ q: '', tickets: [], knowledge: [], assets: [], services: [] })
      return
    }
    void load()
  }, [load, query])

  return (
    <div className="snPage">
      <div className="snRowWrap" style={{ justifyContent: 'space-between', alignItems: 'end' }}>
        <div style={{ display: 'grid', gap: 4 }}>
          <h1 className="snH1">Search</h1>
          <div className="snSubtle">Search across tickets, knowledge, assets, and services.</div>
        </div>
      </div>

      <Panel
        title="Query"
        actions={
          <div className="snRowWrap">
            <div style={{ width: 360 }}>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void load()
                }}
              />
            </div>
            <Button type="button" variant="primary" onClick={() => void load()} disabled={!query.trim() || isLoading}>
              Search
            </Button>
          </div>
        }
      >
        {isLoading ? <div className="snSubtle">Searching…</div> : null}
        {error ? <div style={{ color: 'rgba(255,255,255,0.84)' }}>{error}</div> : null}
        {!isLoading && !error && data && !data.q ? <div className="snSubtle">Enter a query.</div> : null}
      </Panel>

      {data ? (
        <div className="snGrid2">
          <Panel title="Tickets" actions={<Badge tone="neutral">{data.tickets.length}</Badge>}>
            {data.tickets.length === 0 ? <div className="snSubtle">No tickets found.</div> : null}
            {data.tickets.length > 0 ? (
              <div style={{ display: 'grid', gap: 8 }}>
                {data.tickets.slice(0, 20).map((t) => (
                  <Link key={t.id} to={`/tickets/${t.id}`} className="snPanel" style={{ padding: 12, textDecoration: 'none' }}>
                    <div className="snRowWrap" style={{ justifyContent: 'space-between' }}>
                      <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                        <div style={{ fontWeight: 820 }}>{t.number}</div>
                        <div className="snSubtle" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {t.title}
                        </div>
                      </div>
                      <div className="snRowWrap">
                        <Badge tone="neutral">{t.kind}</Badge>
                        <Badge tone="info">{t.status}</Badge>
                        <Badge tone="warning">{t.priority}</Badge>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : null}
          </Panel>

          <Panel title="Knowledge" actions={<Badge tone="neutral">{data.knowledge.length}</Badge>}>
            {data.knowledge.length === 0 ? <div className="snSubtle">No articles found.</div> : null}
            {data.knowledge.length > 0 ? (
              <div style={{ display: 'grid', gap: 8 }}>
                {data.knowledge.slice(0, 20).map((k) => (
                  <Link
                    key={k.id}
                    to={`/knowledge?search=${encodeURIComponent(query.trim())}`}
                    className="snPanel"
                    style={{ padding: 12, textDecoration: 'none' }}
                  >
                    <div className="snRowWrap" style={{ justifyContent: 'space-between' }}>
                      <div style={{ fontWeight: 780 }}>{k.title}</div>
                      <div className="snRowWrap">
                        <Badge tone="neutral">{k.category}</Badge>
                        <Badge tone="info">{k.status}</Badge>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : null}
          </Panel>

          <Panel title="Assets" actions={<Badge tone="neutral">{data.assets.length}</Badge>}>
            {data.assets.length === 0 ? <div className="snSubtle">No assets found.</div> : null}
            {data.assets.length > 0 ? (
              <div style={{ display: 'grid', gap: 8 }}>
                {data.assets.slice(0, 20).map((a) => (
                  <Link key={a.id} to="/assets" className="snPanel" style={{ padding: 12, textDecoration: 'none' }}>
                    <div className="snRowWrap" style={{ justifyContent: 'space-between' }}>
                      <div style={{ display: 'grid', gap: 2 }}>
                        <div style={{ fontWeight: 820 }}>{a.asset_tag}</div>
                        <div className="snSubtle">{a.name}</div>
                      </div>
                      <Badge tone="neutral">{a.status}</Badge>
                    </div>
                  </Link>
                ))}
              </div>
            ) : null}
          </Panel>

          <Panel title="Services" actions={<Badge tone="neutral">{data.services.length}</Badge>}>
            {data.services.length === 0 ? <div className="snSubtle">No services found.</div> : null}
            {data.services.length > 0 ? (
              <div style={{ display: 'grid', gap: 8 }}>
                {data.services.slice(0, 20).map((s) => (
                  <Link key={s.id} to="/cmdb" className="snPanel" style={{ padding: 12, textDecoration: 'none' }}>
                    <div className="snRowWrap" style={{ justifyContent: 'space-between' }}>
                      <div style={{ fontWeight: 780 }}>{s.name}</div>
                      <Badge tone={s.is_active ? 'success' : 'neutral'}>{s.is_active ? 'Active' : 'Inactive'}</Badge>
                    </div>
                  </Link>
                ))}
              </div>
            ) : null}
          </Panel>
        </div>
      ) : null}
    </div>
  )
}
