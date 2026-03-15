import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiFetch } from '../api'
import { useAuth } from '../auth/useAuth'
import type { Notification } from '../itsmTypes'
import { Badge, Button, Panel } from '../components/ui'

export function NotificationsPage() {
  const auth = useAuth()
  const navigate = useNavigate()

  const [items, setItems] = useState<Notification[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!auth.accessToken) return
    setIsLoading(true)
    setError(null)
    try {
      const data = await apiFetch<Notification[]>('/api/notifications/', { token: auth.accessToken })
      setItems(data)
    } catch {
      setError('Failed to load notifications')
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
          <h1 className="snH1">Notifications</h1>
          <div className="snSubtle">SLA, approvals, and updates.</div>
        </div>
        <div className="snRowWrap">
          <Button type="button" onClick={() => void load()} disabled={isLoading}>
            Refresh
          </Button>
          <Button
            type="button"
            onClick={async () => {
              if (!auth.accessToken) return
              try {
                await Promise.all(
                  items.filter((n) => !n.is_read).map((n) => apiFetch(`/api/notifications/${n.id}/mark-read/`, { method: 'POST', token: auth.accessToken })),
                )
              } finally {
                await load()
              }
            }}
          >
            Mark all read
          </Button>
        </div>
      </div>

      {error ? (
        <Panel title="Error">
          <div style={{ color: 'rgba(255,255,255,0.84)' }}>{error}</div>
        </Panel>
      ) : null}

      <Panel title="Inbox">
        {isLoading ? <div style={{ color: 'var(--muted)' }}>Loading…</div> : null}
        {!isLoading && items.length === 0 ? <div style={{ color: 'var(--muted)' }}>No notifications.</div> : null}
        {!isLoading ? (
          <div style={{ display: 'grid', gap: 10 }}>
            {items.map((n) => (
              <button
                key={n.id}
                type="button"
                className="snPanel"
                style={{
                  padding: 12,
                  textAlign: 'left',
                  cursor: 'pointer',
                  borderColor: n.is_read ? 'rgba(255,255,255,0.08)' : 'color-mix(in oklab, var(--primary) 25%, rgba(255,255,255,0.08))',
                }}
                onClick={async () => {
                  if (!auth.accessToken) return
                  try {
                    if (!n.is_read) {
                      await apiFetch(`/api/notifications/${n.id}/mark-read/`, { method: 'POST', token: auth.accessToken })
                    }
                  } finally {
                    if (n.link) navigate(n.link)
                    await load()
                  }
                }}
              >
                <div className="snRowWrap" style={{ justifyContent: 'space-between' }}>
                  <div className="snRowWrap">
                    <Badge
                      tone={
                        n.kind === 'SLA' ? 'danger' : n.kind === 'APPROVAL' ? 'warning' : n.kind === 'AI' ? 'info' : 'neutral'
                      }
                    >
                      {n.kind}
                    </Badge>
                    <div style={{ fontWeight: 760 }}>{n.title}</div>
                  </div>
                  <div className="snSubtle">{new Date(n.created_at).toLocaleString()}</div>
                </div>
                {n.body ? <div style={{ marginTop: 8, color: 'rgba(255,255,255,0.82)' }}>{n.body}</div> : null}
                {n.link ? (
                  <div style={{ marginTop: 8 }} className="snSubtle">
                    Open →
                  </div>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
      </Panel>

      <div className="snSubtle">
        Need help? Try <Link to="/virtual-agent">Virtual Agent</Link>.
      </div>
    </div>
  )
}

