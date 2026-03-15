/**
 * Problems feature page.
 *
 * Tabs:
 * - Problem Tickets: work queue for Problem records
 * - Known Errors: knowledge-like library linked to problem tickets
 */
import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../../../api'
import { useAuth } from '../../../auth/useAuth'
import type { KnownError } from '../../../itsmTypes'
import { Badge, Button, Panel, Tabs } from '../../../components/ui'
import { WorkQueuePage } from '../../../pages/WorkQueuePage'

type Tab = 'tickets' | 'known-errors'

export function ProblemsPage() {
  const auth = useAuth()
  const [tab, setTab] = useState<Tab>('tickets')
  const [items, setItems] = useState<KnownError[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!auth.accessToken) return
    setIsLoading(true)
    setError(null)
    try {
      const data = await apiFetch<KnownError[]>('/api/known-errors/', { token: auth.accessToken })
      setItems(data)
    } catch {
      setError('Failed to load known errors')
    } finally {
      setIsLoading(false)
    }
  }, [auth.accessToken])

  useEffect(() => {
    if (tab !== 'known-errors') return
    void load()
  }, [load, tab])

  return (
    <div className="snPage">
      <Panel
        title="Problems"
        actions={
          <Tabs
            value={tab}
            options={[
              { value: 'tickets', label: 'Problem Tickets' },
              { value: 'known-errors', label: 'Known Errors' },
            ]}
            onChange={(v) => setTab(v as Tab)}
          />
        }
      >
        {tab === 'tickets' ? <WorkQueuePage kind="PROBLEM" /> : null}

        {tab === 'known-errors' ? (
          <div style={{ display: 'grid', gap: 12 }}>
            {error ? (
              <Panel title="Error">
                <div style={{ color: 'rgba(255,255,255,0.84)' }}>{error}</div>
              </Panel>
            ) : null}
            <div className="snRowWrap" style={{ justifyContent: 'space-between' }}>
              <div className="snSubtle">Root cause documentation linked to problem tickets.</div>
              <Button type="button" onClick={() => void load()} disabled={isLoading}>
                Refresh
              </Button>
            </div>
            <Panel title="Known Error Library">
              {isLoading ? <div className="snSubtle">Loading…</div> : null}
              {!isLoading && items.length === 0 ? <div className="snSubtle">No known errors.</div> : null}
              {!isLoading && items.length > 0 ? (
                <div style={{ display: 'grid', gap: 10 }}>
                  {items.slice(0, 50).map((k) => (
                    <div key={k.id} className="snPanel" style={{ padding: 12 }}>
                      <div className="snRowWrap" style={{ justifyContent: 'space-between' }}>
                        <div style={{ display: 'grid', gap: 2 }}>
                          <div style={{ fontWeight: 820 }}>{k.problem_ticket.number}</div>
                          <div className="snSubtle">{k.problem_ticket.title}</div>
                        </div>
                        <Badge tone="info">Known Error</Badge>
                      </div>
                      <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                        <div>
                          <div className="snSubtle">Symptoms</div>
                          <div style={{ color: 'rgba(255,255,255,0.84)' }}>{k.symptoms || '—'}</div>
                        </div>
                        <div>
                          <div className="snSubtle">Workaround</div>
                          <div style={{ color: 'rgba(255,255,255,0.84)' }}>{k.workaround || '—'}</div>
                        </div>
                        <div className="snSubtle">Related KB: {k.related_article ? k.related_article.title : '—'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </Panel>
          </div>
        ) : null}
      </Panel>
    </div>
  )
}

