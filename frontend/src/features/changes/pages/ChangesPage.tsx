/**
 * Changes feature page.
 *
 * Tabs:
 * - Change Tickets: work queue for Change records
 * - CAB Calendar: meeting schedule and linked change tickets (privileged admin create)
 */
import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../../../api'
import { useAuth } from '../../../auth/useAuth'
import type { CabMeeting } from '../../../itsmTypes'
import { Badge, Button, Input, Panel, Tabs, Textarea } from '../../../components/ui'
import { WorkQueuePage } from '../../../pages/WorkQueuePage'
import { isPrivileged } from '../../../auth/roles'

type Tab = 'tickets' | 'cab'

export function ChangesPage() {
  const auth = useAuth()
  const [tab, setTab] = useState<Tab>('tickets')
  const [items, setItems] = useState<CabMeeting[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [newTitle, setNewTitle] = useState('CAB Meeting')
  const [newLocation, setNewLocation] = useState('Conference Room')
  const [newNotes, setNewNotes] = useState('Demo CAB meeting')

  const canEdit = isPrivileged(auth.user)

  const load = useCallback(async () => {
    if (!auth.accessToken) return
    setIsLoading(true)
    setError(null)
    try {
      const data = await apiFetch<CabMeeting[]>('/api/cab-meetings/', { token: auth.accessToken })
      setItems(data)
    } catch {
      setError('Failed to load CAB meetings')
    } finally {
      setIsLoading(false)
    }
  }, [auth.accessToken])

  useEffect(() => {
    if (tab !== 'cab') return
    void load()
  }, [load, tab])

  return (
    <div className="snPage">
      <Panel
        title="Changes"
        actions={
          <Tabs
            value={tab}
            options={[
              { value: 'tickets', label: 'Change Tickets' },
              { value: 'cab', label: 'CAB Calendar' },
            ]}
            onChange={(v) => setTab(v as Tab)}
          />
        }
      >
        {tab === 'tickets' ? <WorkQueuePage kind="CHANGE" /> : null}

        {tab === 'cab' ? (
          <div style={{ display: 'grid', gap: 12 }}>
            {error ? (
              <Panel title="Error">
                <div style={{ color: 'rgba(255,255,255,0.84)' }}>{error}</div>
              </Panel>
            ) : null}

            <div className="snRowWrap" style={{ justifyContent: 'space-between' }}>
              <div className="snSubtle">CAB meetings and their scheduled change tickets.</div>
              <div className="snRowWrap">
                <Button type="button" onClick={() => void load()} disabled={isLoading}>
                  Refresh
                </Button>
              </div>
            </div>

            {canEdit ? (
              <Panel title="Create CAB Meeting" actions={<Badge tone="info">Admin</Badge>}>
                <div style={{ display: 'grid', gap: 10 }}>
                  <div className="snGrid2">
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span className="snSubtle">Title</span>
                      <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
                    </label>
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span className="snSubtle">Location</span>
                      <Input value={newLocation} onChange={(e) => setNewLocation(e.target.value)} />
                    </label>
                  </div>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span className="snSubtle">Notes</span>
                    <Textarea value={newNotes} onChange={(e) => setNewNotes(e.target.value)} rows={3} />
                  </label>
                  <div className="snRowWrap" style={{ justifyContent: 'flex-end' }}>
                    <Button
                      type="button"
                      variant="primary"
                      onClick={async () => {
                        if (!auth.accessToken) return
                        const start = new Date()
                        start.setDate(start.getDate() + 1)
                        const end = new Date(start.getTime() + 60 * 60 * 1000)
                        await apiFetch<CabMeeting>('/api/cab-meetings/', {
                          method: 'POST',
                          token: auth.accessToken,
                          body: JSON.stringify({
                            title: newTitle,
                            start_at: start.toISOString(),
                            end_at: end.toISOString(),
                            location: newLocation,
                            notes: newNotes,
                            changes: [],
                          }),
                        })
                        await load()
                      }}
                    >
                      Create
                    </Button>
                  </div>
                </div>
              </Panel>
            ) : null}

            <Panel title="Meetings">
              {isLoading ? <div className="snSubtle">Loading…</div> : null}
              {!isLoading && items.length === 0 ? <div className="snSubtle">No meetings.</div> : null}
              {!isLoading && items.length > 0 ? (
                <div style={{ display: 'grid', gap: 10 }}>
                  {items.slice(0, 20).map((m) => (
                    <div key={m.id} className="snPanel" style={{ padding: 12 }}>
                      <div className="snRowWrap" style={{ justifyContent: 'space-between' }}>
                        <div style={{ display: 'grid', gap: 2 }}>
                          <div style={{ fontWeight: 820 }}>{m.title}</div>
                          <div className="snSubtle">
                            {new Date(m.start_at).toLocaleString()} → {new Date(m.end_at).toLocaleString()} · {m.location || '—'}
                          </div>
                        </div>
                        <Badge tone="info">{m.changes.length} changes</Badge>
                      </div>
                      {m.notes ? <div style={{ marginTop: 8, color: 'rgba(255,255,255,0.82)' }}>{m.notes}</div> : null}
                      {m.changes.length > 0 ? (
                        <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
                          {m.changes.slice(0, 8).map((t) => (
                            <div key={t.id} className="snRowWrap" style={{ justifyContent: 'space-between' }}>
                              <div style={{ fontWeight: 700 }}>{t.number}</div>
                              <div
                                className="snSubtle"
                                style={{ maxWidth: 680, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                              >
                                {t.title}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
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

