/**
 * CMDB feature page.
 *
 * Provides:
 * - Service register (owner team, description, active)
 * - Service relationships (depends-on / runs-on) to services or assets
 * - Read-only mode for non-privileged users, create actions for privileged admins
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../../../api'
import { useAuth } from '../../../auth/useAuth'
import type { Asset, Service, ServiceRelationship, Team } from '../../../itsmTypes'
import { Badge, Button, Input, Panel, Select, Tabs, Textarea } from '../../../components/ui'
import { isPrivileged } from '../../../auth/roles'

type Tab = 'services' | 'relationships'

export function CmdbPage() {
  const auth = useAuth()
  const [tab, setTab] = useState<Tab>('services')
  const canEdit = isPrivileged(auth.user)

  const [services, setServices] = useState<Service[]>([])
  const [rels, setRels] = useState<ServiceRelationship[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [assets, setAssets] = useState<Asset[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [newServiceName, setNewServiceName] = useState('')
  const [newServiceDesc, setNewServiceDesc] = useState('')
  const [newServiceOwner, setNewServiceOwner] = useState<string>('')

  const [relType, setRelType] = useState<ServiceRelationship['rel_type']>('DEPENDS_ON')
  const [relSource, setRelSource] = useState<string>('')
  const [relTargetService, setRelTargetService] = useState<string>('')
  const [relTargetAsset, setRelTargetAsset] = useState<string>('')

  const load = useCallback(async () => {
    if (!auth.accessToken) return
    setIsLoading(true)
    setError(null)
    try {
      const [sv, rs, ts, as] = await Promise.all([
        apiFetch<Service[]>('/api/services/', { token: auth.accessToken }),
        apiFetch<ServiceRelationship[]>('/api/service-relationships/', { token: auth.accessToken }),
        apiFetch<Team[]>('/api/teams/', { token: auth.accessToken }),
        apiFetch<Asset[]>('/api/assets/', { token: auth.accessToken }),
      ])
      setServices(sv)
      setRels(rs)
      setTeams(ts)
      setAssets(as)
      setRelSource(sv[0]?.id ?? '')
      setRelTargetService(sv[1]?.id ?? '')
      setNewServiceOwner(ts[0]?.id ?? '')
    } catch {
      setError('Failed to load CMDB data')
    } finally {
      setIsLoading(false)
    }
  }, [auth.accessToken])

  useEffect(() => {
    void load()
  }, [load])

  const servicesById = useMemo(() => new Map(services.map((s) => [s.id, s])), [services])
  const deps = useMemo(() => {
    const out = new Map<string, ServiceRelationship[]>()
    for (const r of rels) {
      const list = out.get(r.source_service.id) ?? []
      list.push(r)
      out.set(r.source_service.id, list)
    }
    return out
  }, [rels])

  return (
    <div className="snPage">
      <div className="snRowWrap" style={{ justifyContent: 'space-between', alignItems: 'end' }}>
        <div style={{ display: 'grid', gap: 4 }}>
          <h1 className="snH1">CMDB</h1>
          <div className="snSubtle">Services, relationships, and impacted assets.</div>
        </div>
        <div className="snRowWrap">
          <Badge tone={canEdit ? 'info' : 'warning'}>{canEdit ? 'Admin mode' : 'Read-only'}</Badge>
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

      <Panel
        title="Configuration Items"
        actions={
          <Tabs
            value={tab}
            options={[
              { value: 'services', label: 'Services' },
              { value: 'relationships', label: 'Relationships' },
            ]}
            onChange={(v) => setTab(v as Tab)}
          />
        }
      >
        {isLoading ? <div className="snSubtle">Loading…</div> : null}

        {!isLoading && tab === 'services' ? (
          <div style={{ display: 'grid', gap: 12 }}>
            {canEdit ? (
              <Panel title="Create Service">
                <div style={{ display: 'grid', gap: 10 }}>
                  <div className="snGrid2">
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span className="snSubtle">Name</span>
                      <Input value={newServiceName} onChange={(e) => setNewServiceName(e.target.value)} placeholder="e.g., VPN Gateway" />
                    </label>
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span className="snSubtle">Owner team</span>
                      <Select value={newServiceOwner} onChange={(e) => setNewServiceOwner(e.target.value)}>
                        <option value="">—</option>
                        {teams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </Select>
                    </label>
                  </div>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span className="snSubtle">Description</span>
                    <Textarea value={newServiceDesc} onChange={(e) => setNewServiceDesc(e.target.value)} rows={3} />
                  </label>
                  <div className="snRowWrap" style={{ justifyContent: 'flex-end' }}>
                    <Button
                      type="button"
                      variant="primary"
                      disabled={!newServiceName.trim()}
                      onClick={async () => {
                        if (!auth.accessToken) return
                        await apiFetch<Service>('/api/services/', {
                          method: 'POST',
                          token: auth.accessToken,
                          body: JSON.stringify({
                            name: newServiceName.trim(),
                            description: newServiceDesc,
                            owner_team_id: newServiceOwner || null,
                            is_active: true,
                          }),
                        })
                        setNewServiceName('')
                        setNewServiceDesc('')
                        await load()
                      }}
                    >
                      Create
                    </Button>
                  </div>
                </div>
              </Panel>
            ) : null}

            <Panel title="Services">
              {services.length === 0 ? <div className="snSubtle">No services.</div> : null}
              {services.length > 0 ? (
                <div style={{ display: 'grid', gap: 10 }}>
                  {services.map((s) => (
                    <div key={s.id} className="snPanel" style={{ padding: 12 }}>
                      <div className="snRowWrap" style={{ justifyContent: 'space-between' }}>
                        <div style={{ display: 'grid', gap: 2 }}>
                          <div style={{ fontWeight: 820 }}>{s.name}</div>
                          <div className="snSubtle">{s.owner_team ? `Owner: ${s.owner_team.name}` : 'Owner: —'}</div>
                        </div>
                        <Badge tone={s.is_active ? 'success' : 'neutral'}>{s.is_active ? 'Active' : 'Inactive'}</Badge>
                      </div>
                      {s.description ? <div style={{ marginTop: 8, color: 'rgba(255,255,255,0.84)' }}>{s.description}</div> : null}
                      <div style={{ marginTop: 10 }}>
                        <div className="snSubtle">Dependencies</div>
                        <div style={{ marginTop: 6, display: 'grid', gap: 6 }}>
                          {(deps.get(s.id) ?? []).slice(0, 6).map((r) => (
                            <div key={r.id} className="snRowWrap" style={{ justifyContent: 'space-between' }}>
                              <Badge tone="neutral">{r.rel_type}</Badge>
                              <div className="snSubtle" style={{ flex: 1, marginLeft: 10 }}>
                                {r.target_service ? r.target_service.name : r.target_asset ? `${r.target_asset.asset_tag} (${r.target_asset.name})` : '—'}
                              </div>
                            </div>
                          ))}
                          {(deps.get(s.id) ?? []).length === 0 ? <div className="snSubtle">No relationships.</div> : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </Panel>
          </div>
        ) : null}

        {!isLoading && tab === 'relationships' ? (
          <div style={{ display: 'grid', gap: 12 }}>
            {canEdit ? (
              <Panel title="Create Relationship">
                <div style={{ display: 'grid', gap: 10 }}>
                  <div className="snGrid2">
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span className="snSubtle">Type</span>
                      <Select value={relType} onChange={(e) => setRelType(e.target.value as ServiceRelationship['rel_type'])}>
                        <option value="DEPENDS_ON">DEPENDS_ON</option>
                        <option value="RUNS_ON">RUNS_ON</option>
                      </Select>
                    </label>
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span className="snSubtle">Source service</span>
                      <Select value={relSource} onChange={(e) => setRelSource(e.target.value)}>
                        <option value="">—</option>
                        {services.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </Select>
                    </label>
                  </div>
                  <div className="snGrid2">
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span className="snSubtle">Target service</span>
                      <Select value={relTargetService} onChange={(e) => setRelTargetService(e.target.value)}>
                        <option value="">—</option>
                        {services.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </Select>
                    </label>
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span className="snSubtle">Target asset</span>
                      <Select value={relTargetAsset} onChange={(e) => setRelTargetAsset(e.target.value)}>
                        <option value="">—</option>
                        {assets.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.asset_tag} · {a.name}
                          </option>
                        ))}
                      </Select>
                    </label>
                  </div>
                  <div className="snRowWrap" style={{ justifyContent: 'flex-end' }}>
                    <Button
                      type="button"
                      variant="primary"
                      disabled={!relSource || (!relTargetService && !relTargetAsset)}
                      onClick={async () => {
                        if (!auth.accessToken) return
                        await apiFetch<ServiceRelationship>('/api/service-relationships/', {
                          method: 'POST',
                          token: auth.accessToken,
                          body: JSON.stringify({
                            rel_type: relType,
                            source_service_id: relSource,
                            target_service_id: relTargetService || null,
                            target_asset_id: relTargetAsset || null,
                          }),
                        })
                        setRelTargetAsset('')
                        await load()
                      }}
                    >
                      Create
                    </Button>
                  </div>
                  <div className="snSubtle">Either target service or target asset is required.</div>
                </div>
              </Panel>
            ) : null}

            <Panel title="Relationships">
              {rels.length === 0 ? <div className="snSubtle">No relationships.</div> : null}
              {rels.length > 0 ? (
                <div style={{ display: 'grid', gap: 10 }}>
                  {rels.slice(0, 80).map((r) => (
                    <div key={r.id} className="snPanel" style={{ padding: 12 }}>
                      <div className="snRowWrap" style={{ justifyContent: 'space-between' }}>
                        <div className="snRowWrap">
                          <Badge tone="neutral">{r.rel_type}</Badge>
                          <div style={{ fontWeight: 780 }}>{servicesById.get(r.source_service.id)?.name ?? r.source_service.name}</div>
                          <div className="snSubtle">→</div>
                          <div style={{ fontWeight: 740 }}>
                            {r.target_service ? r.target_service.name : r.target_asset ? `${r.target_asset.asset_tag}` : '—'}
                          </div>
                        </div>
                        <Badge tone={r.target_service ? 'info' : 'warning'}>{r.target_service ? 'Service' : 'Asset'}</Badge>
                      </div>
                      {r.target_asset ? <div className="snSubtle" style={{ marginTop: 6 }}>{r.target_asset.name}</div> : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </Panel>
          </div>
        ) : null}
      </Panel>
    </div>
  )
}

