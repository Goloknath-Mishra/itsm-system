import { Badge } from './ui'

export function TickerBar() {
  return (
    <div className="snTicker">
      <div className="snTickerInner">
        <div className="snTickerItem">
          <Badge tone="warning">Warning</Badge>
          <span>Scheduled Maintenance: Database server maintenance tonight 11PM–2AM</span>
        </div>
        <div className="snTickerDot" />
        <div className="snTickerItem">
          <Badge tone="info">Info</Badge>
          <span>Self-service password reset now available via the IT portal</span>
        </div>
        <div className="snTickerDot" />
        <div className="snTickerItem">
          <Badge tone="success">Resolved</Badge>
          <span>Email delivery delays have been fixed · All systems operational</span>
        </div>
        <div className="snTickerDot" />
        <div className="snTickerItem">
          <Badge tone="danger">Critical</Badge>
          <span>VPN Gateway experiencing high latency · Network team investigating</span>
        </div>
      </div>
    </div>
  )
}

