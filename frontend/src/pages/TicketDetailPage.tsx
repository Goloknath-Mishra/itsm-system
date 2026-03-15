import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiFetch } from '../api'
import { useAuth } from '../auth/useAuth'
import type { CabMeeting, CatalogRequest, KnownError, Ticket, TicketComment } from '../itsmTypes'
import { Badge, Button, Panel, Select, Textarea } from '../components/ui'
import { isAgent as isAgentRole } from '../auth/roles'
import { SlaTimer } from '../components/SlaTimer'
import { useConfigEntries } from '../config/useConfigEntries'

type Recommendations = {
  suggested_assignment_group_id: string | null
  suggested_assignment_group_name: string | null
  knowledge: Array<{ id: string; title: string; category: string }>
}

type BadgeTone = 'neutral' | 'info' | 'warning' | 'danger' | 'success'

function normalizeTone(tone: unknown): BadgeTone {
  if (tone === 'info' || tone === 'warning' || tone === 'danger' || tone === 'success') return tone
  return 'neutral'
}

type Option = { id: string; key: string; label: string }

function optionsFromConfig(entries: Array<{ id: string; key: string; label: string }>, currentKey: string): Option[] {
  if (entries.length > 0) return entries
  return [{ id: 'current', key: currentKey, label: currentKey }]
}

export function TicketDetailPage() {
  const { id } = useParams()
  const auth = useAuth()
  const statusConfig = useConfigEntries('ticket_statuses')
  const priorityConfig = useConfigEntries('ticket_priorities')

  const badgeForStatus = useCallback(
    (status: Ticket['status']) => {
      const e = statusConfig.byKey[status]
      const tone = normalizeTone(e?.value?.tone)
      return <Badge tone={tone}>{e?.label || status}</Badge>
    },
    [statusConfig.byKey],
  )

  const badgeForPriority = useCallback(
    (priority: Ticket['priority']) => {
      const e = priorityConfig.byKey[priority]
      const tone = normalizeTone(e?.value?.tone)
      const label = (e?.label || priority).split(' ')[0]
      return <Badge tone={tone}>{label}</Badge>
    },
    [priorityConfig.byKey],
  )

  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [commentBody, setCommentBody] = useState('')
  const [editStatus, setEditStatus] = useState<Ticket['status']>('NEW')
  const [editPriority, setEditPriority] = useState<Ticket['priority']>('P3')
  const [editResolution, setEditResolution] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [recommendations, setRecommendations] = useState<Recommendations | null>(null)
  const [isRecoLoading, setIsRecoLoading] = useState(false)
  const [knownError, setKnownError] = useState<KnownError | null>(null)
  const [cabMeetings, setCabMeetings] = useState<CabMeeting[]>([])
  const [catalogRequests, setCatalogRequests] = useState<CatalogRequest[]>([])

  const loadTicket = useCallback(
    async (ticketId: string) => {
      if (!auth.accessToken) {
        setTicket(null)
        setIsLoading(false)
        return
      }
      setIsLoading(true)
      setError(null)
      try {
        const data = await apiFetch<Ticket>(`/api/tickets/${ticketId}/`, { token: auth.accessToken })
        setTicket(data)
        setEditStatus(data.status)
        setEditPriority(data.priority)
        setEditResolution(data.resolution_summary ?? '')
        setKnownError(null)
        setCabMeetings([])
        setCatalogRequests([])
        try {
          if (data.kind === 'PROBLEM') {
            const ke = await apiFetch<KnownError[]>(`/api/known-errors/?problem_ticket=${data.id}`, { token: auth.accessToken })
            setKnownError(ke[0] ?? null)
          }
          if (data.kind === 'CHANGE') {
            const meetings = await apiFetch<CabMeeting[]>(`/api/cab-meetings/?changes=${data.id}`, { token: auth.accessToken })
            setCabMeetings(meetings)
          }
          if (data.kind === 'SERVICE_REQUEST') {
            const cr = await apiFetch<CatalogRequest[]>(`/api/catalog/requests/?ticket=${data.id}`, { token: auth.accessToken })
            setCatalogRequests(cr)
          }
        } catch {
          return
        }
      } catch {
        setError('Failed to load ticket')
      } finally {
        setIsLoading(false)
      }
    },
    [auth.accessToken],
  )

  useEffect(() => {
    if (id) void loadTicket(id)
  }, [id, loadTicket])

  if (!auth.user) {
    return (
      <div className="snPage">
        <Panel title="Ticket">
          <div style={{ color: 'var(--muted)', fontSize: 14 }}>
            Please <Link to="/login">sign in</Link>.
          </div>
        </Panel>
      </div>
    )
  }

  if (!id) {
    return (
      <div className="snPage">
        <Panel title="Ticket">
          <div style={{ color: 'var(--muted)' }}>Missing ticket id</div>
        </Panel>
      </div>
    )
  }

  const canEdit = isAgentRole(auth.user)
  const canClose = ticket ? !['CLOSED', 'CANCELED'].includes(ticket.status) : false

  return (
    <div className="snPage">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'grid', gap: 6 }}>
          <Link to="/incidents" className="snSubtle">
            ← Back to queue
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 className="snH1">{ticket ? `${ticket.number} — ${ticket.title}` : 'Ticket'}</h1>
            {ticket ? (
              <>
                {badgeForStatus(ticket.status)}
                {badgeForPriority(ticket.priority)}
              </>
            ) : null}
          </div>
          {ticket ? (
            <div className="snSubtle">
              Requested by {ticket.requester.username}
              {ticket.assignee ? ` · Assigned to ${ticket.assignee.username}` : ''}
            </div>
          ) : null}
        </div>
        <div className="snRowWrap">
          <Button type="button" onClick={() => void loadTicket(id)} disabled={isLoading}>
            Refresh
          </Button>
          {ticket && canEdit && (!ticket.assignee || ticket.assignee.username !== auth.user.username) ? (
            <Button
              type="button"
              onClick={async () => {
                if (!auth.accessToken) return
                setIsSaving(true)
                setError(null)
                try {
                  const updated = await apiFetch<Ticket>(`/api/tickets/${id}/assign-to-me/`, {
                    method: 'POST',
                    token: auth.accessToken,
                  })
                  setTicket(updated)
                  setEditStatus(updated.status)
                } catch {
                  setError('Failed to assign ticket')
                } finally {
                  setIsSaving(false)
                }
              }}
              disabled={isSaving}
            >
              Assign to me
            </Button>
          ) : null}
          {ticket && ticket.kind === 'INCIDENT' && canEdit ? (
            <Link to={`/incidents/${id}/war-room`}>
              <Button type="button" variant="primary">
                War Room
              </Button>
            </Link>
          ) : null}
          {ticket && canEdit ? (
            <Button
              type="button"
              onClick={async () => {
                if (!auth.accessToken) return
                setIsRecoLoading(true)
                setError(null)
                try {
                  const data = await apiFetch<Recommendations>(`/api/tickets/${id}/recommendations/`, { token: auth.accessToken })
                  setRecommendations(data)
                } catch {
                  setError('Failed to load recommendations')
                } finally {
                  setIsRecoLoading(false)
                }
              }}
              disabled={isRecoLoading}
            >
              AI Suggest
            </Button>
          ) : null}
          {canClose ? (
            <Button
              type="button"
              variant="danger"
              onClick={async () => {
                if (!auth.accessToken) return
                setIsSaving(true)
                setError(null)
                try {
                  const updated = await apiFetch<Ticket>(`/api/tickets/${id}/close/`, {
                    method: 'POST',
                    token: auth.accessToken,
                  })
                  setTicket(updated)
                  setEditStatus(updated.status)
                } catch {
                  setError('Failed to close ticket')
                } finally {
                  setIsSaving(false)
                }
              }}
              disabled={isSaving}
            >
              Close
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <Panel title="Error">
          <div style={{ color: 'rgba(255,255,255,0.84)' }}>{error}</div>
        </Panel>
      ) : null}

      {ticket && ticket.kind === 'INCIDENT' ? (
        <Panel title="SLA">
          <div style={{ display: 'grid', gap: 10 }}>
            <div className="snSubtle">Countdown to breach is based on the ticket due time.</div>
            <SlaTimer dueAt={ticket.due_at} slaStatus={ticket.sla_status} />
            {ticket.due_at ? <div className="snSubtle">Due at {new Date(ticket.due_at).toLocaleString()}</div> : null}
          </div>
        </Panel>
      ) : null}

      {recommendations ? (
        <Panel
          title="AI Recommendations"
          actions={
            canEdit && recommendations.suggested_assignment_group_id ? (
              <Button
                type="button"
                variant="primary"
                onClick={async () => {
                  if (!auth.accessToken || !ticket) return
                  setIsSaving(true)
                  setError(null)
                  try {
                    const updated = await apiFetch<Ticket>(`/api/tickets/${ticket.id}/`, {
                      method: 'PATCH',
                      token: auth.accessToken,
                      body: JSON.stringify({ assignment_group_id: recommendations.suggested_assignment_group_id }),
                    })
                    setTicket(updated)
                  } catch {
                    setError('Failed to apply recommendation')
                  } finally {
                    setIsSaving(false)
                  }
                }}
                disabled={isSaving}
              >
                Apply group
              </Button>
            ) : null
          }
        >
          <div style={{ display: 'grid', gap: 10 }}>
            <div className="snRowWrap">
              <Badge tone="info">
                Suggested group: {recommendations.suggested_assignment_group_name || '—'}
              </Badge>
            </div>
            <div>
              <div className="snSubtle">Suggested knowledge</div>
              <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                {recommendations.knowledge.length === 0 ? <div className="snSubtle">No matches.</div> : null}
                {recommendations.knowledge.map((k) => (
                  <div key={k.id} className="snRowWrap" style={{ justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 720 }}>{k.title}</span>
                    <span className="snSubtle">{k.category || '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Panel>
      ) : null}

      {ticket && (knownError || cabMeetings.length > 0 || catalogRequests.length > 0) ? (
        <Panel title="Related">
          <div style={{ display: 'grid', gap: 12 }}>
            {ticket.kind === 'PROBLEM' ? (
              <div>
                <div className="snSubtle">Known error</div>
                {knownError ? (
                  <div className="snPanel" style={{ padding: 12, marginTop: 8 }}>
                    <div className="snRowWrap" style={{ justifyContent: 'space-between' }}>
                      <Badge tone="info">Known Error</Badge>
                      <div className="snSubtle">Updated {new Date(knownError.updated_at).toLocaleString()}</div>
                    </div>
                    <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                      <div>
                        <div className="snSubtle">Symptoms</div>
                        <div style={{ color: 'rgba(255,255,255,0.84)' }}>{knownError.symptoms || '—'}</div>
                      </div>
                      <div>
                        <div className="snSubtle">Workaround</div>
                        <div style={{ color: 'rgba(255,255,255,0.84)' }}>{knownError.workaround || '—'}</div>
                      </div>
                      <div className="snSubtle">Related KB: {knownError.related_article ? knownError.related_article.title : '—'}</div>
                    </div>
                  </div>
                ) : (
                  <div className="snSubtle" style={{ marginTop: 8 }}>
                    No known error linked.
                  </div>
                )}
              </div>
            ) : null}

            {ticket.kind === 'CHANGE' ? (
              <div>
                <div className="snSubtle">CAB meetings</div>
                {cabMeetings.length === 0 ? <div className="snSubtle" style={{ marginTop: 8 }}>Not scheduled.</div> : null}
                {cabMeetings.length > 0 ? (
                  <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
                    {cabMeetings.slice(0, 5).map((m) => (
                      <div key={m.id} className="snPanel" style={{ padding: 12 }}>
                        <div className="snRowWrap" style={{ justifyContent: 'space-between' }}>
                          <div style={{ fontWeight: 760 }}>{m.title}</div>
                          <Badge tone="info">{new Date(m.start_at).toLocaleString()}</Badge>
                        </div>
                        <div className="snSubtle" style={{ marginTop: 6 }}>
                          {m.location || '—'}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {ticket.kind === 'SERVICE_REQUEST' ? (
              <div>
                <div className="snSubtle">Catalog request</div>
                {catalogRequests.length === 0 ? <div className="snSubtle" style={{ marginTop: 8 }}>No catalog request linked.</div> : null}
                {catalogRequests.length > 0 ? (
                  <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
                    {catalogRequests.slice(0, 3).map((r) => (
                      <div key={r.id} className="snPanel" style={{ padding: 12 }}>
                        <div className="snRowWrap" style={{ justifyContent: 'space-between' }}>
                          <div style={{ fontWeight: 760 }}>{r.item.name}</div>
                          <Badge tone="info">{r.status}</Badge>
                        </div>
                        <div className="snSubtle" style={{ marginTop: 6 }}>
                          Requested {new Date(r.requested_at).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </Panel>
      ) : null}

      {isLoading ? (
        <Panel title="Loading">
          <div style={{ color: 'var(--muted)' }}>Loading…</div>
        </Panel>
      ) : null}

      {ticket ? (
        <div className="snGrid2">
          <Panel
            title="Details"
            actions={
              canEdit ? (
                <Button
                  type="button"
                  variant="primary"
                  disabled={isSaving}
                  onClick={async () => {
                    if (!auth.accessToken) return
                    setIsSaving(true)
                    setError(null)
                    try {
                      const updated = await apiFetch<Ticket>(`/api/tickets/${ticket.id}/`, {
                        method: 'PATCH',
                        token: auth.accessToken,
                        body: JSON.stringify({
                          status: editStatus,
                          priority: editPriority,
                          resolution_summary: editResolution,
                        }),
                      })
                      setTicket(updated)
                    } catch {
                      setError('Failed to update ticket')
                    } finally {
                      setIsSaving(false)
                    }
                  }}
                >
                  Save
                </Button>
              ) : null
            }
          >
            <div style={{ display: 'grid', gap: 12 }}>
              <div className="snRowWrap">
                <div style={{ display: 'grid', gap: 6, flex: '1 1 220px' }}>
                  <span className="snSubtle">Kind</span>
                  <div style={{ fontWeight: 720 }}>{ticket.kind}</div>
                </div>
                <div style={{ display: 'grid', gap: 6, flex: '1 1 220px' }}>
                  <span className="snSubtle">Created</span>
                  <div style={{ fontWeight: 720 }}>{new Date(ticket.created_at).toLocaleString()}</div>
                </div>
              </div>

              <div className="snRowWrap">
                <label style={{ display: 'grid', gap: 6, flex: '1 1 220px' }}>
                  <span className="snSubtle">Status</span>
                  {canEdit ? (
                    <Select value={editStatus} onChange={(e) => setEditStatus(e.target.value as Ticket['status'])}>
                      {optionsFromConfig(
                        statusConfig.entries.map((s) => ({ id: s.id, key: s.key, label: s.label })),
                        editStatus,
                      ).map((s) => (
                        <option key={s.id} value={s.key}>
                          {s.label}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <div style={{ fontWeight: 720 }}>{badgeForStatus(ticket.status)}</div>
                  )}
                </label>
                <label style={{ display: 'grid', gap: 6, flex: '1 1 220px' }}>
                  <span className="snSubtle">Priority</span>
                  {canEdit ? (
                    <Select value={editPriority} onChange={(e) => setEditPriority(e.target.value as Ticket['priority'])}>
                      {optionsFromConfig(
                        priorityConfig.entries.map((p) => ({ id: p.id, key: p.key, label: p.label })),
                        editPriority,
                      ).map((p) => (
                        <option key={p.id} value={p.key}>
                          {p.label}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <div style={{ fontWeight: 720 }}>{badgeForPriority(ticket.priority)}</div>
                  )}
                </label>
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <span className="snSubtle">Description</span>
                <div style={{ whiteSpace: 'pre-wrap', color: 'rgba(255,255,255,0.88)', fontSize: 14, lineHeight: '20px' }}>
                  {ticket.description || '—'}
                </div>
              </div>

              <label style={{ display: 'grid', gap: 6 }}>
                <span className="snSubtle">Resolution summary</span>
                {canEdit ? (
                  <Textarea value={editResolution} onChange={(e) => setEditResolution(e.target.value)} rows={4} />
                ) : (
                  <div style={{ whiteSpace: 'pre-wrap', color: 'rgba(255,255,255,0.88)', fontSize: 14, lineHeight: '20px' }}>
                    {ticket.resolution_summary || '—'}
                  </div>
                )}
              </label>
            </div>
          </Panel>

          <Panel title="Activity">
            <form
              onSubmit={async (e) => {
                e.preventDefault()
                if (!auth.accessToken) return
                setError(null)
                try {
                  const created = await apiFetch<TicketComment>(`/api/tickets/${id}/comments/`, {
                    method: 'POST',
                    token: auth.accessToken,
                    body: JSON.stringify({ body: commentBody }),
                  })
                  setTicket((t) => (t ? { ...t, comments: [...t.comments, created] } : t))
                  setCommentBody('')
                } catch {
                  setError('Failed to add comment')
                }
              }}
              style={{ display: 'grid', gap: 10 }}
            >
              <label style={{ display: 'grid', gap: 6 }}>
                <span className="snSubtle">Add work note</span>
                <Textarea value={commentBody} onChange={(e) => setCommentBody(e.target.value)} rows={3} required />
              </label>
              <div className="snRowWrap" style={{ justifyContent: 'flex-end' }}>
                <Button type="submit" variant="primary">
                  Post
                </Button>
              </div>
            </form>

            <div style={{ marginTop: 14, display: 'grid', gap: 12 }}>
              {ticket.comments.length === 0 ? <div style={{ color: 'var(--muted)' }}>No activity yet.</div> : null}
              {[...ticket.comments]
                .slice()
                .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
                .map((c) => (
                  <div key={c.id} style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12 }}>
                    <div className="snRow" style={{ justifyContent: 'space-between' }}>
                      <div style={{ fontWeight: 720, fontSize: 13 }}>{c.author.username}</div>
                      <div className="snSubtle">{new Date(c.created_at).toLocaleString()}</div>
                    </div>
                    <div style={{ marginTop: 8, whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: '20px' }}>{c.body}</div>
                  </div>
                ))}
            </div>
          </Panel>
        </div>
      ) : null}
    </div>
  )
}
