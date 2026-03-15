import { Link } from 'react-router-dom'
import { Panel } from '../components/ui'
import { useAuth } from '../auth/useAuth'

export function PlaceholderPage({ title }: { title: string }) {
  const auth = useAuth()

  return (
    <div className="snPage">
      <Panel title={title}>
        {auth.user ? (
          <div style={{ color: 'var(--muted)', fontSize: 14, lineHeight: '20px' }}>
            This module is scaffolded to match a ServiceNow-style ITSM navigation, but the backend workflows are not
            implemented yet.
          </div>
        ) : (
          <div style={{ color: 'var(--muted)', fontSize: 14 }}>
            Please <Link to="/login">sign in</Link> to access ITSM modules.
          </div>
        )}
      </Panel>
    </div>
  )
}

