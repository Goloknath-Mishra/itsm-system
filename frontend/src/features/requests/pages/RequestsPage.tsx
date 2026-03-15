/**
 * Requests feature page.
 *
 * Tabs:
 * - Ticket Requests: service request tickets (work queue)
 * - Catalog Requests: catalog submission records, with status updates for agents
 */
import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../../../api'
import { useAuth } from '../../../auth/useAuth'
import type { CatalogRequest } from '../../../itsmTypes'
import { Badge, Button, Panel, Select, Tabs } from '../../../components/ui'
import { WorkQueuePage } from '../../../pages/WorkQueuePage'
import { isAgent as isAgentRole } from '../../../auth/roles'
import { useConfigEntries } from '../../../config/useConfigEntries'

type Tab = 'tickets' | 'catalog'

type BadgeTone = 'neutral' | 'info' | 'warning' | 'danger' | 'success'

function normalizeTone(tone: unknown): BadgeTone {
  if (tone === 'info' || tone === 'warning' || tone === 'danger' || tone === 'success') return tone
  return 'neutral'
}

export function RequestsPage() {
  const auth = useAuth()
  const [tab, setTab] = useState<Tab>('tickets')
  const [items, setItems] = useState<CatalogRequest[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const statusConfig = useConfigEntries('catalog_request_statuses')

  const canEdit = isAgentRole(auth.user)

  const load = useCallback(async () => {
    if (!auth.accessToken) return
    setIsLoading(true)
    setError(null)
    try {
      const data = await apiFetch<CatalogRequest[]>('/api/catalog/requests/', { token: auth.accessToken })
      setItems(data)
    } catch {
      setError('Failed to load catalog requests')
    } finally {
      setIsLoading(false)
    }
  }, [auth.accessToken])

  useEffect(() => {
    if (tab !== 'catalog') return
    void load()
  }, [load, tab])

  return (
    <div className="snPage">
      <Panel
        title="Requests"
        actions={
          <Tabs
            value={tab}
            options={[
              { value: 'tickets', label: 'Ticket Requests' },
              { value: 'catalog', label: 'Catalog Requests' },
            ]}
            onChange={(v) => setTab(v as Tab)}
          />
        }
      >
        {tab === 'tickets' ? <WorkQueuePage kind="SERVICE_REQUEST" /> : null}

        {tab === 'catalog' ? (
          <div style={{ display: 'grid', gap: 12 }}>
            {error ? (
              <Panel title="Error">
                <div style={{ color: 'rgba(255,255,255,0.84)' }}>{error}</div>
              </Panel>
            ) : null}

            <div className="snRowWrap" style={{ justifyContent: 'space-between' }}>
              <div className="snSubtle">Agent-facing view of catalog submissions and approvals.</div>
              <Button type="button" onClick={() => void load()} disabled={isLoading}>
                Refresh
              </Button>
            </div>

            <Panel title="Catalog Requests">
              {isLoading ? <div className="snSubtle">Loading…</div> : null}
              {!isLoading && items.length === 0 ? <div className="snSubtle">No catalog requests.</div> : null}
              {!isLoading && items.length > 0 ? (
                <table className="snTable">
                  <thead>
                    <tr>
                      <th>Requested</th>
                      <th>Item</th>
                      <th>Requester</th>
                      <th>Status</th>
                      <th>Ticket</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.slice(0, 50).map((r) => (
                      <tr key={r.id}>
                        <td className="snSubtle">{new Date(r.requested_at).toLocaleString()}</td>
                        <td>{r.item.name}</td>
                        <td className="snSubtle">{r.requester.username}</td>
                        <td>
                          <Badge tone={normalizeTone(statusConfig.byKey[r.status]?.value?.tone)}>{statusConfig.byKey[r.status]?.label || r.status}</Badge>
                        </td>
                        <td className="snSubtle">{r.ticket ? r.ticket.number : '—'}</td>
                        <td>
                          {canEdit ? (
                            <div className="snRowWrap">
                              <Select
                                value={r.status}
                                onChange={async (e) => {
                                  if (!auth.accessToken) return
                                  const next = e.target.value as CatalogRequest['status']
                                  const updated = await apiFetch<CatalogRequest>(`/api/catalog/requests/${r.id}/set-status/`, {
                                    method: 'POST',
                                    token: auth.accessToken,
                                    body: JSON.stringify({ status: next }),
                                  })
                                  setItems((prev) => prev.map((x) => (x.id === r.id ? updated : x)))
                                }}
                              >
                                {statusConfig.entries.map((s) => (
                                  <option key={s.id} value={s.key}>
                                    {s.label}
                                  </option>
                                ))}
                              </Select>
                            </div>
                          ) : (
                            <span className="snSubtle">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </Panel>
          </div>
        ) : null}
      </Panel>
    </div>
  )
}
