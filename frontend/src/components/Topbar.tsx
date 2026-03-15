import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { Icon } from './Icon'
import { Avatar, Badge, Button, Input } from './ui'
import { useAuth } from '../auth/useAuth'
import { isAgent } from '../auth/roles'
import { apiFetch } from '../api'

function pageTitleFromPath(pathname: string) {
  if (pathname.startsWith('/portal')) return 'Self‑Service Portal'
  if (pathname.startsWith('/dashboard')) return 'Dashboard'
  if (pathname.startsWith('/incidents')) return 'Incident Management'
  if (pathname.startsWith('/requests')) return 'Service Requests'
  if (pathname.startsWith('/problems')) return 'Problem Management'
  if (pathname.startsWith('/changes')) return 'Change Management'
  if (pathname.startsWith('/knowledge')) return 'Knowledge'
  if (pathname.startsWith('/assets')) return 'IT Assets'
  if (pathname.startsWith('/cmdb')) return 'CMDB'
  if (pathname.startsWith('/reports')) return 'Reports'
  if (pathname.startsWith('/workflows')) return 'Workflows'
  if (pathname.startsWith('/sla')) return 'SLA'
  if (pathname.startsWith('/gamification')) return 'Gamification'
  if (pathname.startsWith('/ai-agents')) return 'AI Agents'
  if (pathname.startsWith('/form-designer')) return 'Form Designer'
  if (pathname.startsWith('/settings')) return 'Settings'
  if (pathname.startsWith('/notifications')) return 'Notifications'
  if (pathname.startsWith('/virtual-agent')) return 'Virtual Agent'
  return 'IT Service Hub'
}

export function Topbar() {
  const auth = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [unread, setUnread] = useState(0)
  const [query, setQuery] = useState('')

  const title = pageTitleFromPath(location.pathname)
  const searchPlaceholder = useMemo(() => {
    if (location.pathname.startsWith('/search')) return 'Search again…'
    return 'Search tickets, KB, assets…'
  }, [location.pathname])

  useEffect(() => {
    async function loadUnread() {
      if (!auth.accessToken) return
      try {
        const data = await apiFetch<{ count: number }>('/api/notifications/unread-count/', { token: auth.accessToken })
        setUnread(data.count)
      } catch {
        return
      }
    }
    void loadUnread()
    const t = window.setInterval(() => void loadUnread(), 15000)
    return () => window.clearInterval(t)
  }, [auth.accessToken])

  return (
    <header className="snTopbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 760, letterSpacing: -0.3 }}>{title}</div>
          <div className="snSubtle">Track, manage, and resolve services efficiently</div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 320, maxWidth: '42vw', position: 'relative' }}>
          <div style={{ position: 'absolute', left: 12, top: 10, color: 'rgba(255,255,255,0.55)' }}>
            <Icon name="search" size={16} />
          </div>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            style={{ paddingLeft: 36 }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              const q = query.trim()
              if (!q) return
              navigate(`/search?q=${encodeURIComponent(q)}`)
            }}
          />
        </div>

        <Badge tone="info">Info</Badge>
        <Button
          type="button"
          aria-label="Notifications"
          style={{ padding: 9, position: 'relative' }}
          onClick={() => navigate('/notifications')}
        >
          <Icon name="bell" size={18} />
          {unread > 0 ? (
            <span
              style={{
                position: 'absolute',
                top: 4,
                right: 4,
                width: 16,
                height: 16,
                borderRadius: 999,
                background: 'rgba(255,61,97,0.9)',
                color: 'rgba(255,255,255,0.95)',
                fontSize: 10,
                fontWeight: 820,
                display: 'grid',
                placeItems: 'center',
                border: '1px solid rgba(255,255,255,0.18)',
              }}
            >
              {unread > 9 ? '9+' : unread}
            </span>
          ) : null}
        </Button>

        {auth.user ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Avatar name={auth.user.first_name || auth.user.username} />
            <div style={{ display: 'grid', gap: 2 }}>
              <div style={{ fontSize: 13, fontWeight: 680, lineHeight: '14px' }}>{auth.user.username}</div>
              <div className="snSubtle" style={{ fontSize: 12 }}>
                {isAgent(auth.user) ? 'Agent' : 'Requester'}
              </div>
            </div>
            <Button
              type="button"
              onClick={() => {
                auth.logout()
                navigate('/login')
              }}
              style={{ padding: '9px 10px' }}
              aria-label="Log out"
            >
              Log out
            </Button>
          </div>
        ) : (
          <Link to="/login">
            <Button type="button" variant="primary">
              Sign in
            </Button>
          </Link>
        )}
      </div>
    </header>
  )
}
