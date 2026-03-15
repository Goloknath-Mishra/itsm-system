/**
 * AI Agents feature page.
 *
 * Provides agent-facing utilities:
 * - Open Virtual Agent
 * - Ticket triage suggestions (assignment group + knowledge)
 * - CMDB-based impact analysis for a ticket
 */
import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../../api'
import { useAuth } from '../../../auth/useAuth'
import type { Ticket } from '../../../itsmTypes'
import { Badge, Button, Input, Panel, Tabs, Textarea } from '../../../components/ui'
import { isAgent } from '../../../auth/roles'

type Tab = 'virtual-agent' | 'ticket-triage' | 'impact'

type Recommendations = {
  suggested_assignment_group_id: string | null
  suggested_assignment_group_name: string | null
  knowledge: Array<{ id: string; title: string; category: string }>
}

type Impact = {
  services: Array<{ id: string; name: string }>
  assets: Array<{ id: string; asset_tag: string; name: string }>
}

export function AIAgentsPage() {
  const auth = useAuth()
  const canEdit = isAgent(auth.user)
  const [tab, setTab] = useState<Tab>('virtual-agent')
  const [ticketId, setTicketId] = useState('')
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [reco, setReco] = useState<Recommendations | null>(null)
  const [impact, setImpact] = useState<Impact | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadTicket = useCallback(async () => {
    if (!auth.accessToken || !ticketId.trim()) return
    setIsBusy(true)
    setError(null)
    try {
      const t = await apiFetch<Ticket>(`/api/tickets/${ticketId.trim()}/`, { token: auth.accessToken })
      setTicket(t)
    } catch {
      setTicket(null)
      setError('Ticket not found')
    } finally {
      setIsBusy(false)
    }
  }, [auth.accessToken, ticketId])

  const runReco = useCallback(async () => {
    if (!auth.accessToken || !ticketId.trim()) return
    setIsBusy(true)
    setError(null)
    try {
      const r = await apiFetch<Recommendations>(`/api/tickets/${ticketId.trim()}/recommendations/`, { token: auth.accessToken })
      setReco(r)
    } catch {
      setReco(null)
      setError('Failed to get recommendations')
    } finally {
      setIsBusy(false)
    }
  }, [auth.accessToken, ticketId])

  const runImpact = useCallback(async () => {
    if (!auth.accessToken || !ticketId.trim()) return
    setIsBusy(true)
    setError(null)
    try {
      const r = await apiFetch<Impact>(`/api/tickets/${ticketId.trim()}/impact/`, { token: auth.accessToken })
      setImpact(r)
    } catch {
      setImpact(null)
      setError('Failed to compute impact')
    } finally {
      setIsBusy(false)
    }
  }, [auth.accessToken, ticketId])

  const suggestedGroup = useMemo(() => reco?.suggested_assignment_group_name ?? '—', [reco])

  return (
    <div className="snPage">
      <div className="snRowWrap" style={{ justifyContent: 'space-between', alignItems: 'end' }}>
        <div style={{ display: 'grid', gap: 4 }}>
          <h1 className="snH1">AI Agents</h1>
          <div className="snSubtle">Assist with triage, impact analysis, and automation.</div>
        </div>
        <Badge tone={canEdit ? 'info' : 'warning'}>{canEdit ? 'Agent tools' : 'Read-only'}</Badge>
      </div>

      {error ? (
        <Panel title="Error">
          <div style={{ color: 'rgba(255,255,255,0.84)' }}>{error}</div>
        </Panel>
      ) : null}

      <Panel
        title="Tools"
        actions={
          <Tabs
            value={tab}
            options={[
              { value: 'virtual-agent', label: 'Virtual Agent' },
              { value: 'ticket-triage', label: 'Ticket Triage' },
              { value: 'impact', label: 'Impact' },
            ]}
            onChange={(v) => setTab(v as Tab)}
          />
        }
      >
        {tab === 'virtual-agent' ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <Panel title="Chat">
              <div className="snSubtle">Use the Virtual Agent to suggest knowledge and catalog items.</div>
              <div className="snRowWrap" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
                <Link to="/virtual-agent">
                  <Button type="button" variant="primary">
                    Open Virtual Agent
                  </Button>
                </Link>
              </div>
            </Panel>
            <Panel title="Workflow Automation">
              <div className="snSubtle">Build escalation flows, approvals, and notifications in Workflow Studio.</div>
              <div className="snRowWrap" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
                <Link to="/workflows">
                  <Button type="button">Open Workflows</Button>
                </Link>
              </div>
            </Panel>
          </div>
        ) : null}

        {tab === 'ticket-triage' ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <Panel title="Select Ticket">
              <div style={{ display: 'grid', gap: 10 }}>
                <Input value={ticketId} onChange={(e) => setTicketId(e.target.value)} placeholder="Ticket UUID…" />
                <div className="snRowWrap" style={{ justifyContent: 'flex-end' }}>
                  <Button type="button" onClick={() => void loadTicket()} disabled={!ticketId.trim() || isBusy}>
                    Load
                  </Button>
                  <Button type="button" variant="primary" onClick={() => void runReco()} disabled={!ticketId.trim() || isBusy}>
                    Suggest
                  </Button>
                </div>
              </div>
            </Panel>

            {ticket ? (
              <Panel title="Ticket Summary">
                <div style={{ display: 'grid', gap: 6 }}>
                  <div style={{ fontWeight: 820 }}>{ticket.number}</div>
                  <div style={{ color: 'rgba(255,255,255,0.84)' }}>{ticket.title}</div>
                  <div className="snSubtle">
                    {ticket.kind} · {ticket.priority} · {ticket.status}
                  </div>
                </div>
              </Panel>
            ) : null}

            {reco ? (
              <Panel
                title="Recommendations"
                actions={
                  canEdit && reco.suggested_assignment_group_id ? (
                    <Button
                      type="button"
                      variant="primary"
                      onClick={async () => {
                        if (!auth.accessToken || !ticket) return
                        await apiFetch<Ticket>(`/api/tickets/${ticket.id}/`, {
                          method: 'PATCH',
                          token: auth.accessToken,
                          body: JSON.stringify({ assignment_group_id: reco.suggested_assignment_group_id }),
                        })
                        await loadTicket()
                      }}
                    >
                      Apply assignment group
                    </Button>
                  ) : null
                }
              >
                <div style={{ display: 'grid', gap: 12 }}>
                  <div className="snRowWrap" style={{ justifyContent: 'space-between' }}>
                    <div className="snSubtle">Suggested group</div>
                    <Badge tone="info">{suggestedGroup}</Badge>
                  </div>
                  <div>
                    <div className="snSubtle">Suggested knowledge</div>
                    {reco.knowledge.length === 0 ? <div className="snSubtle">None.</div> : null}
                    {reco.knowledge.length > 0 ? (
                      <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
                        {reco.knowledge.map((k) => (
                          <div key={k.id} className="snRowWrap" style={{ justifyContent: 'space-between' }}>
                            <div style={{ fontWeight: 700 }}>{k.title}</div>
                            <div className="snSubtle">{k.category}</div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </Panel>
            ) : (
              <Panel title="Recommendations">
                <div className="snSubtle">Run Suggest to get assignment and KB suggestions.</div>
              </Panel>
            )}
          </div>
        ) : null}

        {tab === 'impact' ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <Panel title="Impact Analyzer">
              <div style={{ display: 'grid', gap: 10 }}>
                <Input value={ticketId} onChange={(e) => setTicketId(e.target.value)} placeholder="Ticket UUID…" />
                <Textarea value={''} onChange={() => undefined} rows={3} disabled />
                <div className="snRowWrap" style={{ justifyContent: 'flex-end' }}>
                  <Button type="button" variant="primary" onClick={() => void runImpact()} disabled={!ticketId.trim() || isBusy}>
                    Compute impact
                  </Button>
                </div>
                <div className="snSubtle">Uses CMDB service relationships to find dependent services and assets.</div>
              </div>
            </Panel>

            {impact ? (
              <div className="snGrid2">
                <Panel title="Impacted Services">
                  {impact.services.length === 0 ? <div className="snSubtle">None.</div> : null}
                  {impact.services.length > 0 ? (
                    <div style={{ display: 'grid', gap: 8 }}>
                      {impact.services.map((s) => (
                        <div key={s.id} className="snRowWrap" style={{ justifyContent: 'space-between' }}>
                          <div style={{ fontWeight: 720 }}>{s.name}</div>
                          <Badge tone="info">Service</Badge>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </Panel>
                <Panel title="Impacted Assets">
                  {impact.assets.length === 0 ? <div className="snSubtle">None.</div> : null}
                  {impact.assets.length > 0 ? (
                    <div style={{ display: 'grid', gap: 8 }}>
                      {impact.assets.map((a) => (
                        <div key={a.id} className="snRowWrap" style={{ justifyContent: 'space-between' }}>
                          <div style={{ fontWeight: 720 }}>{a.asset_tag}</div>
                          <div className="snSubtle">{a.name}</div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </Panel>
              </div>
            ) : null}
          </div>
        ) : null}
      </Panel>
    </div>
  )
}

