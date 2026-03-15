import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiFetch, buildApiUrl } from '../api'
import { useAuth } from '../auth/useAuth'
import type { Ticket, WarRoom, WarRoomMessage } from '../itsmTypes'
import { Badge, Button, Input, Panel, Textarea } from '../components/ui'
import { isAgent } from '../auth/roles'

function badgeForPriority(priority: Ticket['priority']) {
  if (priority === 'P1') return <Badge tone="danger">Critical</Badge>
  if (priority === 'P2') return <Badge tone="warning">High</Badge>
  if (priority === 'P3') return <Badge tone="info">Medium</Badge>
  return <Badge tone="success">Low</Badge>
}

function badgeForStatus(status: Ticket['status']) {
  if (status === 'NEW') return <Badge tone="info">New</Badge>
  if (status === 'IN_PROGRESS') return <Badge tone="warning">In progress</Badge>
  if (status === 'ON_HOLD') return <Badge tone="info">Pending</Badge>
  if (status === 'RESOLVED') return <Badge tone="success">Resolved</Badge>
  if (status === 'CLOSED') return <Badge tone="success">Closed</Badge>
  return <Badge tone="neutral">{status}</Badge>
}

export function WarRoomPage() {
  const { id, token } = useParams()
  const auth = useAuth()
  const navigate = useNavigate()

  const [warRoom, setWarRoom] = useState<WarRoom | null>(null)
  const [messages, setMessages] = useState<WarRoomMessage[]>([])
  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState<WarRoomMessage | null>(null)
  const [guestName, setGuestName] = useState('Guest')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [slackUrl, setSlackUrl] = useState('')
  const [teamsUrl, setTeamsUrl] = useState('')
  const [isSavingIntegrations, setIsSavingIntegrations] = useState(false)

  const load = useCallback(async () => {
    if (!id) {
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      if (token) {
        const wr = await apiFetch<WarRoom>(`/api/war-rooms/${id}/guest/${token}/overview/`)
        const msgs = await apiFetch<WarRoomMessage[]>(`/api/war-rooms/${id}/guest/${token}/messages/`)
        setWarRoom(wr)
        setMessages(msgs)
        setSlackUrl(wr.slack_webhook_url || '')
        setTeamsUrl(wr.teams_webhook_url || '')
      } else {
        if (!auth.accessToken) {
          setIsLoading(false)
          return
        }
        const wr = await apiFetch<WarRoom>(`/api/tickets/${id}/war-room/`, { token: auth.accessToken })
        const msgs = await apiFetch<WarRoomMessage[]>(`/api/war-rooms/${wr.id}/messages/`, { token: auth.accessToken })
        setWarRoom(wr)
        setMessages(msgs)
        setSlackUrl(wr.slack_webhook_url || '')
        setTeamsUrl(wr.teams_webhook_url || '')
      }
    } catch {
      setError('Failed to load war room')
    } finally {
      setIsLoading(false)
    }
  }, [auth.accessToken, id, token])

  useEffect(() => {
    void load()
  }, [load])

  const duration = useMemo(() => {
    const t = warRoom?.ticket
    if (!t) return '—'
    const start = new Date(t.created_at).getTime()
    const now = Date.now()
    const mins = Math.max(1, Math.round((now - start) / 60000))
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:00`
  }, [warRoom?.ticket])

  const affected = useMemo(() => {
    const seed = (warRoom?.ticket?.number || '0').split('').reduce((a, ch) => a + ch.charCodeAt(0), 0)
    return 120 + (seed % 180)
  }, [warRoom?.ticket?.number])

  const slaRemaining = useMemo(() => {
    const t = warRoom?.ticket
    if (!t || !t.sla_remaining_minutes) return '—'
    const mins = Math.max(0, t.sla_remaining_minutes)
    if (mins > 90) return `${Math.round(mins / 60)}h remaining`
    return `${mins}m remaining`
  }, [warRoom?.ticket])

  const services = useMemo(() => {
    const list = ['VPN Gateway', 'Remote Access', 'Authentication', 'Email', 'CRM System']
    const t = warRoom?.ticket
    if (!t) return list.slice(0, 3)
    const seed = (t.number || '').length + (t.priority === 'P1' ? 2 : 0)
    return list.slice(0, 2 + (seed % 3))
  }, [warRoom?.ticket])

  const ticket = warRoom?.ticket ?? null

  const messageTree = useMemo(() => {
    const byId = new Map<string, WarRoomMessage>()
    const children = new Map<string, WarRoomMessage[]>()
    const roots: WarRoomMessage[] = []
    for (const m of messages) byId.set(m.id, m)
    for (const m of messages) {
      if (m.parent) {
        const list = children.get(m.parent) ?? []
        list.push(m)
        children.set(m.parent, list)
      } else {
        roots.push(m)
      }
    }
    const sortFn = (a: WarRoomMessage, b: WarRoomMessage) => (a.created_at < b.created_at ? -1 : 1)
    roots.sort(sortFn)
    for (const list of children.values()) list.sort(sortFn)
    return { roots, children }
  }, [messages])

  function displayAuthor(m: WarRoomMessage) {
    return m.author?.username || m.guest_name || 'Guest'
  }

  if (!auth.user && !token) {
    return (
      <div className="snPage">
        <Panel title="War Room">
          <div style={{ color: 'var(--muted)', fontSize: 14 }}>
            Please <Link to="/login">sign in</Link>.
          </div>
        </Panel>
      </div>
    )
  }

  return (
    <div className="snPage">
      <div
        style={{
          border: '1px solid rgba(255,61,97,0.22)',
          borderRadius: 18,
          background: 'linear-gradient(180deg, rgba(255,61,97,0.14), rgba(255,61,97,0.05))',
          padding: 14,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
          <div className="snRowWrap">
            <Link to="/incidents" className="snSubtle">
              ← Back
            </Link>
            <Badge tone="danger">War Room</Badge>
            {ticket ? badgeForPriority(ticket.priority) : null}
            {ticket ? badgeForStatus(ticket.status) : null}
          </div>
          <div style={{ fontWeight: 820, letterSpacing: -0.3, fontSize: 16, minWidth: 0 }}>
            {ticket ? `${ticket.number} · ${ticket.title}` : 'Loading…'}
          </div>
        </div>

        <div className="snRowWrap">
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 820, color: 'rgba(255,255,255,0.92)' }}>{duration}</div>
            <div className="snSubtle">Duration</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 820, color: 'rgba(255,255,255,0.92)' }}>{slaRemaining}</div>
            <div className="snSubtle">SLA Remaining</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 820, color: 'rgba(255,255,255,0.92)' }}>{affected}</div>
            <div className="snSubtle">Affected users</div>
          </div>
          <Button type="button" onClick={() => void load()} disabled={isLoading}>
            Refresh
          </Button>
          {!token ? (
            <Button type="button" variant="danger" onClick={() => navigate('/incidents')}>
              Leave War Room
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <Panel title="Error">
          <div style={{ color: 'rgba(255,255,255,0.84)' }}>{error}</div>
        </Panel>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 12, alignItems: 'start' }}>
        <Panel title="Collaboration">
          {isLoading ? <div style={{ color: 'var(--muted)' }}>Loading…</div> : null}
          {!isLoading ? (
            <>
              <div style={{ display: 'grid', gap: 10 }}>
                {messageTree.roots.map((m) => {
                  const render = (msg: WarRoomMessage, depth: number) => {
                    const own = msg.author?.username && msg.author.username === auth.user?.username
                    const bgStyle = own
                      ? 'linear-gradient(180deg, rgba(31,210,255,0.12), rgba(31,210,255,0.04))'
                      : 'rgba(255,255,255,0.02)'
                    const replies = messageTree.children.get(msg.id) ?? []
                    return (
                      <div key={msg.id} style={{ display: 'grid', gap: 8 }}>
                        <div
                          style={{
                            marginLeft: depth ? depth * 18 : 0,
                            border: '1px solid rgba(255,255,255,0.06)',
                            borderRadius: 16,
                            background: bgStyle,
                            padding: 12,
                          }}
                        >
                          <div className="snRowWrap" style={{ justifyContent: 'space-between' }}>
                            <div style={{ fontWeight: 740 }}>{displayAuthor(msg)}</div>
                            <div className="snRowWrap">
                              <div className="snSubtle">{new Date(msg.created_at).toLocaleTimeString()}</div>
                              <Button
                                type="button"
                                onClick={() => setReplyTo(msg)}
                                disabled={Boolean(token) && guestName.trim().length === 0}
                              >
                                Reply
                              </Button>
                            </div>
                          </div>
                          <div style={{ marginTop: 8, whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: '20px' }}>
                            {msg.body}
                          </div>
                        </div>
                        {replies.map((r) => render(r, depth + 1))}
                      </div>
                    )
                  }
                  return render(m, 0)
                })}
                {messages.length === 0 ? <div style={{ color: 'var(--muted)' }}>No messages yet.</div> : null}
              </div>

              <form
                onSubmit={async (e) => {
                  e.preventDefault()
                  if (!warRoom) return
                  setError(null)
                  try {
                    if (token) {
                      const created = await apiFetch<WarRoomMessage>(`/api/war-rooms/${warRoom.id}/guest/${token}/messages/`, {
                        method: 'POST',
                        body: JSON.stringify({ body: text, guest_name: guestName, parent_id: replyTo?.id ?? null }),
                      })
                      setMessages((prev) => [...prev, created])
                    } else {
                      if (!auth.accessToken) return
                      const created = await apiFetch<WarRoomMessage>(`/api/war-rooms/${warRoom.id}/messages/`, {
                        method: 'POST',
                        token: auth.accessToken,
                        body: JSON.stringify({ body: text, parent_id: replyTo?.id ?? null }),
                      })
                      setMessages((prev) => [...prev, created])
                    }
                    setText('')
                    setReplyTo(null)
                  } catch {
                    setError('Failed to send message')
                  }
                }}
                style={{ marginTop: 12, display: 'grid', gap: 10 }}
              >
                {token ? (
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span className="snSubtle">Guest name</span>
                    <Input value={guestName} onChange={(e) => setGuestName(e.target.value)} />
                  </label>
                ) : null}
                {replyTo ? (
                  <div className="snRowWrap" style={{ justifyContent: 'space-between' }}>
                    <div className="snSubtle">Replying to {displayAuthor(replyTo)}</div>
                    <Button type="button" onClick={() => setReplyTo(null)}>
                      Cancel reply
                    </Button>
                  </div>
                ) : null}
                <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Type a message…" required />
                <div className="snRowWrap" style={{ justifyContent: 'space-between' }}>
                  <span className="snSubtle">{token ? 'Guest access (secure link)' : 'Threaded discussion with audit trail'}</span>
                  <Button type="submit" variant="primary" disabled={!text.trim()}>
                    Send
                  </Button>
                </div>
              </form>
            </>
          ) : null}
        </Panel>

        <div style={{ display: 'grid', gap: 12 }}>
          <Panel title="Incident Summary">
            {ticket ? (
              <div style={{ display: 'grid', gap: 10 }}>
                <div className="snRowWrap">
                  {badgeForPriority(ticket.priority)}
                  {badgeForStatus(ticket.status)}
                </div>
                <div className="snSubtle">Assigned</div>
                <div style={{ fontWeight: 740 }}>{ticket.assignee ? ticket.assignee.username : 'Unassigned'}</div>
                <div className="snSubtle">SLA progress</div>
                <div style={{ height: 10, borderRadius: 999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: ticket.priority === 'P1' ? '72%' : ticket.priority === 'P2' ? '46%' : '22%',
                      height: '100%',
                      background: ticket.priority === 'P1' ? 'rgba(255,61,97,0.85)' : 'rgba(255,176,32,0.85)',
                    }}
                  />
                </div>
                <div className="snSubtle">{slaRemaining}</div>
              </div>
            ) : (
              <div style={{ color: 'var(--muted)' }}>—</div>
            )}
          </Panel>

          {warRoom && !token && isAgent(auth.user) ? (
            <Panel title="War Room Controls">
              <div style={{ display: 'grid', gap: 10 }}>
                <div className="snRowWrap">
                  <Button
                    type="button"
                    onClick={async () => {
                      if (!auth.accessToken) return
                      try {
                        const r = await apiFetch<{ url: string }>(`/api/war-rooms/${warRoom.id}/guest-link/`, {
                          method: 'POST',
                          token: auth.accessToken,
                        })
                        setInviteUrl(r.url)
                        await navigator.clipboard.writeText(r.url)
                      } catch {
                        setError('Failed to generate guest link')
                      }
                    }}
                  >
                    Invite guest
                  </Button>
                  <Button
                    type="button"
                    onClick={async () => {
                      if (!warRoom || !auth.accessToken) return
                      const url = buildApiUrl(`/api/war-rooms/${warRoom.id}/export.csv/`)
                      const resp = await fetch(url, { headers: { Authorization: `Bearer ${auth.accessToken}` } })
                      const blob = await resp.blob()
                      const a = document.createElement('a')
                      a.href = URL.createObjectURL(blob)
                      a.download = `${ticket?.number || 'war-room'}.csv`
                      a.click()
                      URL.revokeObjectURL(a.href)
                    }}
                  >
                    Export CSV
                  </Button>
                  <Button
                    type="button"
                    onClick={async () => {
                      if (!warRoom || !auth.accessToken) return
                      const url = buildApiUrl(`/api/war-rooms/${warRoom.id}/export.pdf/`)
                      const resp = await fetch(url, { headers: { Authorization: `Bearer ${auth.accessToken}` } })
                      const blob = await resp.blob()
                      const a = document.createElement('a')
                      a.href = URL.createObjectURL(blob)
                      a.download = `${ticket?.number || 'war-room'}.pdf`
                      a.click()
                      URL.revokeObjectURL(a.href)
                    }}
                  >
                    Export PDF
                  </Button>
                </div>
                {inviteUrl ? <div className="snSubtle">Copied guest link: {inviteUrl}</div> : null}
              </div>
            </Panel>
          ) : null}

          {warRoom && !token && isAgent(auth.user) ? (
            <Panel title="Teams/Slack Integration">
              <div style={{ display: 'grid', gap: 10 }}>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span className="snSubtle">Teams webhook URL</span>
                  <Input value={teamsUrl} onChange={(e) => setTeamsUrl(e.target.value)} placeholder="https://..." />
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span className="snSubtle">Slack webhook URL</span>
                  <Input value={slackUrl} onChange={(e) => setSlackUrl(e.target.value)} placeholder="https://..." />
                </label>
                <div className="snRowWrap" style={{ justifyContent: 'flex-end' }}>
                  <Button
                    type="button"
                    variant="primary"
                    disabled={isSavingIntegrations}
                    onClick={async () => {
                      if (!auth.accessToken || !ticket) return
                      setIsSavingIntegrations(true)
                      setError(null)
                      try {
                        await apiFetch<WarRoom>(`/api/tickets/${ticket.id}/war-room/`, {
                          method: 'POST',
                          token: auth.accessToken,
                          body: JSON.stringify({ teams_webhook_url: teamsUrl, slack_webhook_url: slackUrl }),
                        })
                      } catch {
                        setError('Failed to save integration settings')
                      } finally {
                        setIsSavingIntegrations(false)
                      }
                    }}
                  >
                    Save
                  </Button>
                </div>
              </div>
            </Panel>
          ) : null}

          <Panel title="Affected Services">
            <div style={{ display: 'grid', gap: 10 }}>
              {services.map((s) => (
                <div
                  key={s}
                  style={{
                    padding: 10,
                    borderRadius: 14,
                    border: '1px solid rgba(255,255,255,0.06)',
                    background: 'rgba(255,255,255,0.02)',
                    fontWeight: 720,
                  }}
                >
                  {s}
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}
