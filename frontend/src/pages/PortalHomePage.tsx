import { Link } from 'react-router-dom'
import { Panel } from '../components/ui'
import { useAuth } from '../auth/useAuth'

export function PortalHomePage() {
  const auth = useAuth()

  return (
    <div className="snPage">
      <div style={{ display: 'grid', gap: 4 }}>
        <h1 className="snH1">Self‑Service Portal</h1>
        <div className="snSubtle">Request services, report issues, and search knowledge.</div>
      </div>

      <div className="snGrid2">
        <Panel title="Service Catalog">
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ color: 'var(--muted)', fontSize: 14 }}>
              Browse available services and submit requests with approvals and tracking.
            </div>
            <Link to="/portal/catalog">Open catalog →</Link>
          </div>
        </Panel>
        <Panel title="My Requests">
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ color: 'var(--muted)', fontSize: 14 }}>Track status, fulfillment, and linked tickets.</div>
            <Link to="/portal/requests">View requests →</Link>
          </div>
        </Panel>
      </div>

      <div className="snGrid2">
        <Panel title="Report an Incident">
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ color: 'var(--muted)', fontSize: 14 }}>Create an incident ticket and follow updates.</div>
            <Link to="/incidents">Go to incidents →</Link>
          </div>
        </Panel>
        <Panel title="Knowledge Base">
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ color: 'var(--muted)', fontSize: 14 }}>Search articles and submit feedback/ratings.</div>
            <Link to="/knowledge">Search knowledge →</Link>
          </div>
        </Panel>
      </div>

      <Panel title="Virtual Agent">
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ color: 'var(--muted)', fontSize: 14 }}>
            Ask for help and get suggested knowledge articles or catalog items.
          </div>
          <Link to="/virtual-agent">Chat with Virtual Agent →</Link>
        </div>
      </Panel>

      <div className="snSubtle">Signed in as {auth.user?.username}</div>
    </div>
  )
}

