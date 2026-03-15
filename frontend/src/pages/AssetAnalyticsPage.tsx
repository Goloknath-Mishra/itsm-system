import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../api'
import { useAuth } from '../auth/useAuth'
import type { AssetAlert, AssetAnalytics, AssetMetric } from '../itsmTypes'
import { Badge, Button, Input, Panel, StatCard } from '../components/ui'

export function AssetAnalyticsPage() {
  const auth = useAuth()
  const [data, setData] = useState<AssetAnalytics | null>(null)
  const [alerts, setAlerts] = useState<AssetAlert[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [demoAssetId, setDemoAssetId] = useState('')

  const load = useCallback(async () => {
    if (!auth.accessToken) return
    setIsLoading(true)
    setError(null)
    try {
      const [a, openAlerts] = await Promise.all([
        apiFetch<AssetAnalytics>('/api/asset-analytics/', { token: auth.accessToken }),
        apiFetch<AssetAlert[]>('/api/asset-alerts/?is_open=true', { token: auth.accessToken }),
      ])
      setData(a)
      setAlerts(openAlerts)
    } catch {
      setError('Failed to load asset analytics')
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
          <h1 className="snH1">Asset Analytics</h1>
          <div className="snSubtle">Real-time monitoring, anomaly alerts, and lifecycle recommendations.</div>
        </div>
        <div className="snRowWrap">
          <Link to="/assets">
            <Button type="button">Assets</Button>
          </Link>
          <Button type="button" onClick={() => void load()} disabled={isLoading}>
            Refresh
          </Button>
        </div>
      </div>

      {error ? (
        <Panel title="Error">
          <div style={{ color: 'rgba(255,255,255,0.84)' }}>{error}</div>
        </Panel>
      ) : null}

      <div className="snCardGrid">
        <StatCard label="Open alerts" value={data?.open_alerts ?? '—'} meta="Anomalies detected" />
        <StatCard label="Critical alerts" value={data?.critical_alerts ?? '—'} meta="Immediate attention" />
        <StatCard label="Metrics (24h)" value={data?.metrics_last_24h ?? '—'} meta="Ingested samples" />
        <StatCard label="Recommendations" value={data?.recommendations.length ?? '—'} meta="Lifecycle & optimization" />
      </div>

      <div className="snGrid2">
        <Panel title="Open Alerts">
          {isLoading ? <div className="snSubtle">Loading…</div> : null}
          {!isLoading && alerts.length === 0 ? <div className="snSubtle">No open alerts.</div> : null}
          {!isLoading && alerts.length > 0 ? (
            <div style={{ display: 'grid', gap: 10 }}>
              {alerts.slice(0, 20).map((a) => (
                <div key={a.id} className="snPanel" style={{ padding: 12 }}>
                  <div className="snRowWrap" style={{ justifyContent: 'space-between' }}>
                    <div className="snRowWrap">
                      <Badge tone={a.severity === 'CRITICAL' ? 'danger' : a.severity === 'WARNING' ? 'warning' : 'info'}>{a.severity}</Badge>
                      <div style={{ fontWeight: 760 }}>{a.kind}</div>
                    </div>
                    <div className="snSubtle">{new Date(a.created_at).toLocaleString()}</div>
                  </div>
                  <div style={{ marginTop: 8, color: 'rgba(255,255,255,0.84)' }}>{a.message}</div>
                  <div className="snRowWrap" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
                    <Button
                      type="button"
                      onClick={async () => {
                        if (!auth.accessToken) return
                        await apiFetch(`/api/asset-alerts/${a.id}/resolve/`, { method: 'POST', token: auth.accessToken })
                        await load()
                      }}
                    >
                      Resolve
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </Panel>

        <Panel title="Recommendations">
          {isLoading ? <div className="snSubtle">Loading…</div> : null}
          {!isLoading && (data?.recommendations.length ?? 0) === 0 ? <div className="snSubtle">No recommendations yet.</div> : null}
          {!isLoading && (data?.recommendations.length ?? 0) > 0 ? (
            <div style={{ display: 'grid', gap: 10 }}>
              {data?.recommendations.slice(0, 20).map((r) => (
                <div key={r.id} className="snPanel" style={{ padding: 12 }}>
                  <div className="snRowWrap" style={{ justifyContent: 'space-between' }}>
                    <Badge tone="info">{r.kind}</Badge>
                    <div className="snSubtle">{new Date(r.created_at).toLocaleString()}</div>
                  </div>
                  <div style={{ marginTop: 8, color: 'rgba(255,255,255,0.84)' }}>{r.message}</div>
                </div>
              ))}
            </div>
          ) : null}
        </Panel>
      </div>

      <Panel title="Ingest Demo Metric">
        <div style={{ display: 'grid', gap: 10 }}>
          <div className="snSubtle">
            Paste an Asset ID and submit a high CPU sample to trigger anomaly detection.
          </div>
          <div className="snRowWrap">
            <Input value={demoAssetId} onChange={(e) => setDemoAssetId(e.target.value)} placeholder="Asset UUID…" />
            <Button
              type="button"
              variant="primary"
              disabled={!demoAssetId.trim()}
              onClick={async () => {
                if (!auth.accessToken) return
                const payload: Omit<AssetMetric, 'id' | 'created_at'> = {
                  asset: demoAssetId.trim(),
                  captured_at: new Date().toISOString(),
                  cpu_pct: 97,
                  memory_pct: 62,
                  temperature_c: 78,
                  data: { source: 'demo' },
                }
                await apiFetch('/api/asset-metrics/', { method: 'POST', token: auth.accessToken, body: JSON.stringify(payload) })
                await load()
              }}
            >
              Ingest
            </Button>
          </div>
        </div>
      </Panel>
    </div>
  )
}

