import { NavLink, useNavigate } from 'react-router-dom'
import { Icon } from './Icon'
import { Button, Input } from './ui'
import { cls } from './cls'
import { useState } from 'react'

export type SidebarItem = {
  to: string
  label: string
  icon:
    | 'dashboard'
    | 'incident'
    | 'problem'
    | 'change'
    | 'request'
    | 'knowledge'
    | 'cmdb'
    | 'assets'
    | 'ai'
    | 'trophy'
    | 'sla'
    | 'settings'
}

export function Sidebar({
  isCollapsed,
  onToggleCollapsed,
  items,
}: {
  isCollapsed: boolean
  onToggleCollapsed: () => void
  items: SidebarItem[]
}) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')

  return (
    <aside className="snSidebar">
      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 10,
                display: 'grid',
                placeItems: 'center',
                background: 'linear-gradient(180deg, rgba(31, 210, 255, 0.35), rgba(0, 228, 181, 0.18))',
                border: '1px solid rgba(255,255,255,0.12)',
              }}
            >
              <Icon name="dashboard" size={16} />
            </div>
            {!isCollapsed ? (
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 750, letterSpacing: -0.2, lineHeight: '16px' }}>IT Service Hub</div>
                <div className="snSubtle" style={{ letterSpacing: 0.8, textTransform: 'uppercase' }}>
                  Command Center
                </div>
              </div>
            ) : null}
          </div>
          <Button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            style={{ padding: 8, borderRadius: 12 }}
          >
            <Icon name="collapse" size={16} />
          </Button>
        </div>

        {!isCollapsed ? (
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', left: 12, top: 10, color: 'rgba(255,255,255,0.55)' }}>
              <Icon name="search" size={16} />
            </div>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Quick search…"
              style={{ paddingLeft: 36 }}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return
                const q = query.trim()
                if (!q) return
                navigate(`/search?q=${encodeURIComponent(q)}`)
              }}
            />
          </div>
        ) : null}

        <nav style={{ display: 'grid', gap: 4, marginTop: 4 }}>
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cls('snNavItem', isActive && 'snNavItemActive', isCollapsed && 'snNavItemCollapsed')
              }
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 10px',
                borderRadius: 12,
                border: `1px solid ${isActive ? 'rgba(31, 210, 255, 0.22)' : 'transparent'}`,
                background: isActive ? 'rgba(31, 210, 255, 0.08)' : 'transparent',
                color: isActive ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.72)',
              })}
            >
              <span style={{ width: 24, display: 'grid', placeItems: 'center' }}>
                <Icon name={item.icon} size={18} />
              </span>
              {!isCollapsed ? <span style={{ fontSize: 13, fontWeight: 640 }}>{item.label}</span> : null}
            </NavLink>
          ))}
        </nav>

        {!isCollapsed ? (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="snSubtle" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Settings</span>
              <span>⌘</span>
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  )
}
