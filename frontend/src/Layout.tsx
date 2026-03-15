import { Outlet } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { Sidebar, type SidebarItem } from './components/Sidebar'
import { Topbar } from './components/Topbar'
import { cls } from './components/cls'
import { TickerBar } from './components/TickerBar'
import { useAuth } from './auth/useAuth'
import { isAgent, isPrivileged } from './auth/roles'

export function Layout() {
  const auth = useAuth()
  const [isCollapsed, setIsCollapsed] = useState(false)

  const navItems = useMemo<SidebarItem[]>(
    () => {
      const agent = isAgent(auth.user)
      const privileged = isPrivileged(auth.user)
      const items: SidebarItem[] = [
        { to: '/portal', label: 'Portal', icon: 'dashboard' as const },
        { to: '/dashboard', label: 'Dashboard', icon: 'dashboard' as const },
        { to: '/incidents', label: 'Incidents', icon: 'incident' as const },
        { to: '/requests', label: 'Requests', icon: 'request' as const },
        { to: '/knowledge', label: 'Knowledge', icon: 'knowledge' as const },
        { to: '/gamification', label: 'Gamification', icon: 'trophy' as const },
        { to: '/settings', label: 'Settings', icon: 'settings' as const },
      ]

      if (agent) {
        items.push(
          { to: '/problems', label: 'Problems', icon: 'problem' as const },
          { to: '/changes', label: 'Changes', icon: 'change' as const },
          { to: '/cmdb', label: 'CMDB', icon: 'cmdb' as const },
          { to: '/assets', label: 'IT Assets', icon: 'assets' as const },
          { to: '/ai-agents', label: 'AI Agents', icon: 'ai' as const },
        )
      }

      if (privileged) {
        items.push(
          { to: '/reports', label: 'Reports', icon: 'dashboard' as const },
          { to: '/workflows', label: 'Workflows', icon: 'settings' as const },
          { to: '/sla', label: 'SLA', icon: 'sla' as const },
          { to: '/form-designer', label: 'Form Designer', icon: 'settings' as const },
        )
      }

      return items
    },
    [auth.user],
  )

  return (
    <div className={cls('snShell', isCollapsed && 'snSidebarCollapsed')}>
      <Sidebar isCollapsed={isCollapsed} onToggleCollapsed={() => setIsCollapsed((v) => !v)} items={navItems} />
      <div className="snMain">
        <TickerBar />
        <Topbar />
        <div className="snContent">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
