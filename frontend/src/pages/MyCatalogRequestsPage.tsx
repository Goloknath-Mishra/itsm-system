import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../api'
import { useAuth } from '../auth/useAuth'
import type { CatalogRequest } from '../itsmTypes'
import { Badge, Button, Panel } from '../components/ui'

export function MyCatalogRequestsPage() {
  const auth = useAuth()
  const [items, setItems] = useState<CatalogRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!auth.accessToken) return
    setIsLoading(true)
    setError(null)
    try {
      const data = await apiFetch<CatalogRequest[]>('/api/catalog/requests/', { token: auth.accessToken })
      setItems(data)
    } catch {
      setError('Failed to load requests')
    } finally {
      setIsLoading(false)
    }
  }, [auth.accessToken])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="snPage">
      <div className="snRowWrap" style={{ justifyContent: 'space-between', alignItems: 'end' }}>
        <div style={{ display: 'grid', gap: 4 }}>
          <h1 className="snH1">My Requests</h1>
          <div className="snSubtle">Track approvals, fulfillment, and linked tickets.</div>
        </div>
        <div className="snRowWrap">
          <Button type="button" onClick={() => void load()} disabled={isLoading}>
            Refresh
          </Button>
          <Link to="/portal/catalog">
            <Button type="button" variant="primary">
              New Request
            </Button>
          </Link>
        </div>
      </div>

      {error ? (
        <Panel title="Error">
          <div style={{ color: 'rgba(255,255,255,0.84)' }}>{error}</div>
        </Panel>
      ) : null}

      <Panel title="Requests">
        {isLoading ? <div style={{ color: 'var(--muted)' }}>Loading…</div> : null}
        {!isLoading && items.length === 0 ? <div style={{ color: 'var(--muted)' }}>No requests yet.</div> : null}
        {!isLoading ? (
          <table className="snTable">
            <thead>
              <tr>
                <th>Item</th>
                <th>Status</th>
                <th>Requested</th>
                <th>Ticket</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 720 }}>{r.item.name}</td>
                  <td>
                    <Badge
                      tone={
                        r.status === 'APPROVED'
                          ? 'success'
                          : r.status === 'REJECTED'
                            ? 'danger'
                            : r.status === 'SUBMITTED'
                              ? 'info'
                              : r.status === 'FULFILLING'
                                ? 'warning'
                                : r.status === 'COMPLETED'
                                  ? 'success'
                                  : 'neutral'
                      }
                    >
                      {r.status}
                    </Badge>
                  </td>
                  <td className="snSubtle">{new Date(r.requested_at).toLocaleString()}</td>
                  <td>
                    {r.ticket ? <Link to={`/tickets/${r.ticket.id}`}>{r.ticket.number}</Link> : <span className="snSubtle">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </Panel>
    </div>
  )
}

