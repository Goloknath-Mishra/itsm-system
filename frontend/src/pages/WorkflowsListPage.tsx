import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiFetch } from '../api'
import { useAuth } from '../auth/useAuth'
import type { Workflow } from '../itsmTypes'
import { Badge, Button, Input, Panel } from '../components/ui'
import { isPrivileged } from '../auth/roles'

export function WorkflowsListPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState<Workflow[]>([])
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
      const path = qs.toString() ? `/api/workflows/?${qs.toString()}` : '/api/workflows/'
      const data = await apiFetch<Workflow[]>(path, { token: auth.accessToken })
      setItems(data)
    } catch {
      setError('Failed to load workflows')
    } finally {
      setIsLoading(false)
    }
  }, [auth.accessToken, search])

  useEffect(() => {
    void load()
  }, [load])

  const groups = useMemo(() => {
    const map = new Map<string, Workflow[]>()
    for (const w of items) {
      const k = w.kind
      const list = map.get(k) ?? []
      list.push(w)
      map.set(k, list)
    }
    return [...map.entries()]
  }, [items])

  return (
    <div className="snPage">
      <div className="snRowWrap" style={{ justifyContent: 'space-between', alignItems: 'end' }}>
        <div style={{ display: 'grid', gap: 4 }}>
          <h1 className="snH1">Workflows</h1>
          <div className="snSubtle">Design, test (sandbox), deploy, rollback, and monitor executions.</div>
        </div>
        <div className="snRowWrap">
          <div style={{ width: 320, maxWidth: '60vw' }}>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search workflows…"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void load()
              }}
            />
          </div>
          <Button type="button" onClick={() => void load()} disabled={isLoading}>
            Search
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={async () => {
              if (!auth.accessToken) return
              const created = await apiFetch<Workflow>('/api/workflows/', {
                method: 'POST',
                token: auth.accessToken,
                body: JSON.stringify({ name: 'New Workflow', kind: 'INCIDENT_ESCALATION', is_active: true }),
              })
              navigate(`/workflows/${created.id}`)
            }}
          >
            New workflow
          </Button>
        </div>
      </div>

      {error ? (
        <Panel title="Error">
          <div style={{ color: 'rgba(255,255,255,0.84)' }}>{error}</div>
        </Panel>
      ) : null}

      <Panel title="Library" actions={<Badge tone="info">{isPrivileged(auth.user) ? 'Admin view' : 'Read-only'}</Badge>}>
        {isLoading ? <div className="snSubtle">Loading…</div> : null}
        {!isLoading && items.length === 0 ? <div className="snSubtle">No workflows yet.</div> : null}
        {!isLoading ? (
          <div style={{ display: 'grid', gap: 14 }}>
            {groups.map(([k, list]) => (
              <div key={k} style={{ display: 'grid', gap: 10 }}>
                <div style={{ fontWeight: 820 }}>{k.replaceAll('_', ' ')}</div>
                <div style={{ display: 'grid', gap: 10 }}>
                  {list.map((w) => (
                    <div key={w.id} className="snPanel" style={{ padding: 12, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{w.name}</div>
                        <div className="snSubtle">Updated {new Date(w.updated_at).toLocaleString()}</div>
                      </div>
                      <div className="snRowWrap">
                        <Badge tone={w.deployed_version ? 'success' : 'warning'}>{w.deployed_version ? `Deployed v${w.deployed_version.version}` : 'Not deployed'}</Badge>
                        <Link to={`/workflows/${w.id}`}>
                          <Button type="button" variant="primary">
                            Open
                          </Button>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </Panel>
    </div>
  )
}
