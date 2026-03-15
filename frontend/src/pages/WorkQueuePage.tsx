import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { apiFetch } from '../api'
import { useAuth } from '../auth/useAuth'
import type { ConfigEntry, Service, Team, Ticket } from '../itsmTypes'
import { Badge, Button, Input, Modal, Panel, Select, StatCard, Tabs } from '../components/ui'
import { isAgent as isAgentRole } from '../auth/roles'
import { useConfigEntries } from '../config/useConfigEntries'

type ViewMode = 'board' | 'list'
type Kind = Ticket['kind']

type BadgeTone = 'neutral' | 'info' | 'warning' | 'danger' | 'success'

function normalizeTone(tone: unknown): BadgeTone {
  if (tone === 'info' || tone === 'warning' || tone === 'danger' || tone === 'success') return tone
  return 'neutral'
}

type Option = { id: string; key: string; label: string }

function optionsFromConfig(entries: ConfigEntry[], currentKey: string): Option[] {
  if (entries.length > 0) return entries.map((e) => ({ id: e.id, key: e.key, label: e.label }))
  return [{ id: 'current', key: currentKey, label: currentKey }]
}

function kindLabel(kind: Kind) {
  if (kind === 'INCIDENT') return 'Incident'
  if (kind === 'SERVICE_REQUEST') return 'Request'
  if (kind === 'PROBLEM') return 'Problem'
  return 'Change'
}

// SLA display helper for list/board views. Caller triggers re-render every minute.
function formatSla(dueAt: string | null, nowMs: number) {
  if (!dueAt) return { text: '—', tone: 'neutral' as const }
  const due = new Date(dueAt).getTime()
  const diffMin = Math.round((due - nowMs) / 60000)
  if (diffMin <= 0) return { text: `Overdue ${Math.abs(diffMin)}m`, tone: 'danger' as const }
  if (diffMin <= 60) return { text: `${diffMin}m`, tone: 'warning' as const }
  const hours = Math.floor(diffMin / 60)
  const mins = diffMin % 60
  return { text: `${hours}h ${mins}m`, tone: diffMin <= 240 ? ('info' as const) : ('neutral' as const) }
}

const boardColumns: Array<{ key: Ticket['status']; label: string }> = [
  { key: 'NEW', label: 'New' },
  { key: 'IN_PROGRESS', label: 'In Progress' },
  { key: 'ON_HOLD', label: 'Pending' },
  { key: 'RESOLVED', label: 'Resolved' },
]

export function WorkQueuePage({ kind }: { kind: Kind }) {
  const auth = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const didInitFromQuery = useRef(false)

  const [tickets, setTickets] = useState<Ticket[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [, setSlaTick] = useState(0)

  const [view, setView] = useState<ViewMode>('board')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<Ticket['status'] | ''>('')
  const [priority, setPriority] = useState<Ticket['priority'] | ''>('')

  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [bulkStatus, setBulkStatus] = useState<Ticket['status']>('IN_PROGRESS')

  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [createTitle, setCreateTitle] = useState('')
  const [createDescription, setCreateDescription] = useState('')
  const [createPriority, setCreatePriority] = useState<Ticket['priority']>('P3')
  const [createImpact, setCreateImpact] = useState<Ticket['impact']>('MEDIUM')
  const [createUrgency, setCreateUrgency] = useState<Ticket['urgency']>('MEDIUM')
  const [createCategory, setCreateCategory] = useState('')
  const [createSubcategory, setCreateSubcategory] = useState('')
  const [createCategoryIsCustom, setCreateCategoryIsCustom] = useState(false)
  const [createSubcategoryIsCustom, setCreateSubcategoryIsCustom] = useState(false)
  const [createChangeType, setCreateChangeType] = useState<Ticket['change_type']>('STANDARD')
  const [createAssignmentGroupId, setCreateAssignmentGroupId] = useState('')
  const [createAffectedServiceId, setCreateAffectedServiceId] = useState('')
  const [createDueAt, setCreateDueAt] = useState('')
  const [teams, setTeams] = useState<Team[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [categories, setCategories] = useState<ConfigEntry[]>([])
  const [subcategories, setSubcategories] = useState<ConfigEntry[]>([])

  const statusConfig = useConfigEntries('ticket_statuses')
  const priorityConfig = useConfigEntries('ticket_priorities')
  const impactConfig = useConfigEntries('ticket_impacts')
  const urgencyConfig = useConfigEntries('ticket_urgencies')
  const changeTypeConfig = useConfigEntries('ticket_change_types')

  const title =
    kind === 'INCIDENT'
      ? 'Incident Management'
      : kind === 'SERVICE_REQUEST'
        ? 'Service Requests'
        : kind === 'PROBLEM'
          ? 'Problem Management'
          : 'Change Management'

  // Deep-link support: allow dashboard drill-through to apply filters and optionally open the create modal.
  useEffect(() => {
    if (didInitFromQuery.current) return
    didInitFromQuery.current = true
    const qs = new URLSearchParams(location.search)
    const qStatus = qs.get('status') as Ticket['status'] | null
    const qPriority = qs.get('priority') as Ticket['priority'] | null
    const qSearch = qs.get('search')
    if (qStatus) setStatus(qStatus)
    if (qPriority) setPriority(qPriority)
    if (qSearch) setSearch(qSearch)
    if (qs.get('create') === '1') setIsCreateOpen(true)
  }, [location.search])

  // Keep SLA time indicators fresh without forcing every row to manage its own interval.
  useEffect(() => {
    const t = window.setInterval(() => setSlaTick((x) => x + 1), 60_000)
    return () => window.clearInterval(t)
  }, [])

  const isAgent = isAgentRole(auth.user)

  // Create modal master data (assignment groups, services, categories) for richer ticket creation.
  useEffect(() => {
    if (!isCreateOpen) return
    if (!auth.accessToken) return
    let cancelled = false
    async function loadMasterData() {
      try {
        const [t, s, c, sc] = await Promise.all([
          isAgent ? apiFetch<Team[]>('/api/teams/', { token: auth.accessToken }) : Promise.resolve([] as Team[]),
          apiFetch<Service[]>('/api/services/', { token: auth.accessToken }),
          apiFetch<ConfigEntry[]>('/api/config/entries/?namespace_key=ticket_categories', { token: auth.accessToken }),
          apiFetch<ConfigEntry[]>('/api/config/entries/?namespace_key=ticket_subcategories', { token: auth.accessToken }),
        ])
        if (cancelled) return
        setTeams(t)
        setServices(s)
        setCategories(c.filter((x) => x.is_active))
        setSubcategories(sc.filter((x) => x.is_active))
      } catch {
        return
      }
    }
    void loadMasterData()
    return () => {
      cancelled = true
    }
  }, [auth.accessToken, isAgent, isCreateOpen])

  const load = useCallback(async () => {
    if (!auth.accessToken) {
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams()
      qs.set('kind', kind)
      if (status) qs.set('status', status)
      if (priority) qs.set('priority', priority)
      if (search) qs.set('search', search)
      const data = await apiFetch<Ticket[]>(`/api/tickets/?${qs.toString()}`, { token: auth.accessToken })
      setTickets(data)
      setSelected({})
    } catch {
      setError('Failed to load work queue')
    } finally {
      setIsLoading(false)
    }
  }, [auth.accessToken, kind, priority, search, status])

  useEffect(() => {
    void load()
  }, [load])

  const summary = useMemo(() => {
    const open = tickets.filter((t) => !['CLOSED', 'CANCELED'].includes(t.status)).length
    const critical = tickets.filter((t) => t.priority === 'P1' && !['CLOSED', 'CANCELED'].includes(t.status)).length
    const atRisk = tickets.filter((t) => ['P1', 'P2'].includes(t.priority) && t.status !== 'RESOLVED' && t.status !== 'CLOSED').length
    const resolved = tickets.filter((t) => t.status === 'RESOLVED' || t.status === 'CLOSED').length
    return { open, critical, atRisk, resolved }
  }, [tickets])

  const board = useMemo(() => {
    const map = new Map<Ticket['status'], Ticket[]>()
    for (const c of boardColumns) map.set(c.key, [])
    for (const t of tickets) {
      const list = map.get(t.status)
      if (list) list.push(t)
    }
    for (const c of boardColumns) {
      map.get(c.key)?.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
    }
    return map
  }, [tickets])

  const selectedIds = useMemo(() => Object.keys(selected).filter((k) => selected[k]), [selected])
  const nowMs = Date.now()
  const selectedCategoryKey = useMemo(() => {
    if (!createCategory) return null
    const byKey = categories.find((c) => c.key === createCategory)
    if (byKey) return byKey.key
    const byLabel = categories.find((c) => c.label === createCategory)
    return byLabel ? byLabel.key : null
  }, [categories, createCategory])

  const visibleSubcategories = useMemo(() => {
    if (!selectedCategoryKey) return subcategories
    return subcategories.filter((s) => (s.value?.category_key as string | undefined) === selectedCategoryKey)
  }, [selectedCategoryKey, subcategories])

  const badgeForStatus = useCallback(
    (status: Ticket['status']) => {
      const e = statusConfig.byKey[status]
      const tone = normalizeTone(e?.value?.tone)
      return <Badge tone={tone}>{e?.label || status}</Badge>
    },
    [statusConfig.byKey],
  )

  const badgeForPriority = useCallback(
    (priority: Ticket['priority']) => {
      const e = priorityConfig.byKey[priority]
      const tone = normalizeTone(e?.value?.tone)
      const label = (e?.label || priority).split(' ')[0]
      return <Badge tone={tone}>{label}</Badge>
    },
    [priorityConfig.byKey],
  )

  if (!auth.user) {
    return (
      <div className="snPage">
        <Panel title={title}>
          <div style={{ color: 'var(--muted)', fontSize: 14 }}>
            Please <Link to="/login">sign in</Link> to access this module.
          </div>
        </Panel>
      </div>
    )
  }

  return (
    <div className="snPage">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'grid', gap: 4 }}>
          <h1 className="snH1">{title}</h1>
          <div className="snSubtle">Track, manage, and resolve {kindLabel(kind).toLowerCase()}s affecting IT services.</div>
        </div>
        <div className="snRowWrap">
          <Button type="button" onClick={() => void load()} disabled={isLoading}>
            Refresh
          </Button>
          {isAgent ? (
            <Button
              type="button"
              onClick={async () => {
                if (!auth.accessToken) return
                setError(null)
                try {
                  const qs = new URLSearchParams()
                  qs.set('kind', kind)
                  qs.set('assignee', String(auth.user?.id ?? ''))
                  const data = await apiFetch<Ticket[]>(`/api/tickets/?${qs.toString()}`, { token: auth.accessToken })
                  setTickets(data)
                  setSelected({})
                } catch {
                  setError('Failed to load my work')
                }
              }}
            >
              My Work
            </Button>
          ) : null}
          <Button type="button" variant="primary" onClick={() => setIsCreateOpen(true)}>
            New {kindLabel(kind)}
          </Button>
        </div>
      </div>

      {error ? (
        <Panel title="Error">
          <div style={{ color: 'rgba(255,255,255,0.8)' }}>{error}</div>
        </Panel>
      ) : null}

      <div className="snCardGrid">
        <StatCard label="Critical" value={summary.critical} meta="P1 open" />
        <StatCard label="Open" value={summary.open} meta="Not closed/canceled" />
        <StatCard label="At Risk" value={summary.atRisk} meta="P1–P2 in progress" />
        <StatCard label="Resolved" value={summary.resolved} meta="Resolved/closed" />
      </div>

      <Panel
        title="Queue"
        actions={
          <div className="snRowWrap">
            <Tabs
              value={view}
              options={[
                { value: 'board', label: 'Board' },
                { value: 'list', label: 'List' },
              ]}
              onChange={setView}
            />
            <div style={{ width: 240 }}>
              <Input
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void load()
                }}
              />
            </div>
            <Select value={priority} onChange={(e) => setPriority(e.target.value as Ticket['priority'] | '')}>
              <option value="">All priority</option>
              {priorityConfig.entries.map((p) => (
                <option key={p.id} value={p.key}>
                  {p.label}
                </option>
              ))}
            </Select>
            <Select value={status} onChange={(e) => setStatus(e.target.value as Ticket['status'] | '')}>
              <option value="">All status</option>
              {statusConfig.entries.map((s) => (
                <option key={s.id} value={s.key}>
                  {s.label}
                </option>
              ))}
            </Select>
            <Button type="button" onClick={() => void load()}>
              Apply
            </Button>
          </div>
        }
      >
        {isAgent && selectedIds.length > 0 ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
            <div className="snRowWrap">
              <Badge tone="info">{selectedIds.length} selected</Badge>
              <Button
                type="button"
                onClick={async () => {
                  if (!auth.accessToken) return
                  setError(null)
                  try {
                    await Promise.all(
                      selectedIds.map((tid) =>
                        apiFetch<Ticket>(`/api/tickets/${tid}/assign-to-me/`, { method: 'POST', token: auth.accessToken }),
                      ),
                    )
                    await load()
                  } catch {
                    setError('Bulk assign failed')
                  }
                }}
              >
                Assign to me
              </Button>
              <Select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value as Ticket['status'])}>
                {statusConfig.entries.map((s) => (
                  <option key={s.id} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </Select>
              <Button
                type="button"
                onClick={async () => {
                  if (!auth.accessToken) return
                  setError(null)
                  try {
                    await Promise.all(
                      selectedIds.map((tid) =>
                        apiFetch<Ticket>(`/api/tickets/${tid}/set-status/`, {
                          method: 'POST',
                          token: auth.accessToken,
                          body: JSON.stringify({ status: bulkStatus }),
                        }),
                      ),
                    )
                    await load()
                  } catch {
                    setError('Bulk status update failed')
                  }
                }}
              >
                Apply status
              </Button>
              <Button type="button" onClick={() => setSelected({})}>
                Clear
              </Button>
            </div>
          </div>
        ) : null}

        {isLoading ? <div style={{ color: 'var(--muted)' }}>Loading…</div> : null}
        {!isLoading && view === 'board' ? (
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            {boardColumns.map((col) => (
              <div key={col.key} style={{ display: 'grid', gap: 10, minWidth: 0 }}>
                <div className="snRow" style={{ justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 13, fontWeight: 720 }}>{col.label}</div>
                  <div className="snSubtle">{board.get(col.key)?.length ?? 0}</div>
                </div>
                <div style={{ display: 'grid', gap: 10 }}>
                  {(board.get(col.key) ?? []).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className="snPanel"
                      style={{ padding: 12, textAlign: 'left', cursor: 'pointer' }}
                      onClick={() => navigate(`/tickets/${t.id}`)}
                    >
                      <div className="snRow" style={{ justifyContent: 'space-between' }}>
                        <div style={{ fontWeight: 760, letterSpacing: -0.2 }}>{t.number}</div>
                        {badgeForPriority(t.priority)}
                      </div>
                      <div style={{ marginTop: 6, fontSize: 13, color: 'rgba(255,255,255,0.86)' }}>{t.title}</div>
                      <div className="snRowWrap" style={{ marginTop: 10 }}>
                        {badgeForStatus(t.status)}
                        <Badge tone={formatSla(t.due_at, nowMs).tone}>{formatSla(t.due_at, nowMs).text}</Badge>
                        <span className="snSubtle">{new Date(t.updated_at).toLocaleDateString()}</span>
                      </div>
                    </button>
                  ))}
                  {(board.get(col.key) ?? []).length === 0 ? (
                    <div style={{ color: 'var(--muted-2)', fontSize: 13, padding: 10 }}>No items</div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {!isLoading && view === 'list' ? (
          <table className="snTable">
            <thead>
              <tr>
                {isAgent ? <th /> : null}
                <th>Number</th>
                <th>Title</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Assignee</th>
                <th>SLA</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id}>
                  {isAgent ? (
                    <td style={{ width: 34 }}>
                      <input
                        type="checkbox"
                        checked={Boolean(selected[t.id])}
                        onChange={(e) => setSelected((prev) => ({ ...prev, [t.id]: e.target.checked }))}
                      />
                    </td>
                  ) : null}
                  <td>
                    <Link to={`/tickets/${t.id}`}>{t.number}</Link>
                  </td>
                  <td>{t.title}</td>
                  <td>{badgeForPriority(t.priority)}</td>
                  <td>{badgeForStatus(t.status)}</td>
                  <td className="snSubtle">{t.assignee ? t.assignee.username : '—'}</td>
                  <td>
                    {t.due_at ? <Badge tone={formatSla(t.due_at, nowMs).tone}>{formatSla(t.due_at, nowMs).text}</Badge> : <span className="snSubtle">—</span>}
                  </td>
                  <td className="snSubtle">{new Date(t.updated_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </Panel>

      <Modal title={`New ${kindLabel(kind)}`} isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)}>
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (!auth.accessToken) return
            setError(null)
            try {
              // Build payload dynamically so empty optional fields are not sent.
              const payload: Record<string, unknown> = {
                title: createTitle,
                description: createDescription,
                kind,
                priority: createPriority,
                impact: createImpact,
                urgency: createUrgency,
              }
              if (createCategoryIsCustom) {
                if (createCategory.trim()) payload.category = createCategory.trim()
              } else {
                const label = categories.find((c) => c.key === createCategory)?.label
                if (label) payload.category = label
              }
              if (createSubcategoryIsCustom) {
                if (createSubcategory.trim()) payload.subcategory = createSubcategory.trim()
              } else {
                const label = subcategories.find((c) => c.key === createSubcategory)?.label
                if (label) payload.subcategory = label
              }
              if (kind === 'CHANGE') payload.change_type = createChangeType
              if (createAffectedServiceId) payload.affected_service_id = createAffectedServiceId
              if (isAgent && createAssignmentGroupId) payload.assignment_group_id = createAssignmentGroupId
              if (isAgent && createDueAt) payload.due_at = new Date(createDueAt).toISOString()

              const created = await apiFetch<Ticket>('/api/tickets/', {
                method: 'POST',
                token: auth.accessToken,
                body: JSON.stringify(payload),
              })
              setIsCreateOpen(false)
              setCreateTitle('')
              setCreateDescription('')
              setCreatePriority('P3')
              setCreateImpact('MEDIUM')
              setCreateUrgency('MEDIUM')
              setCreateCategory('')
              setCreateSubcategory('')
              setCreateCategoryIsCustom(false)
              setCreateSubcategoryIsCustom(false)
              setCreateChangeType('STANDARD')
              setCreateAssignmentGroupId('')
              setCreateAffectedServiceId('')
              setCreateDueAt('')
              navigate(`/tickets/${created.id}`)
            } catch {
              setError(`Failed to create ${kindLabel(kind).toLowerCase()}`)
            }
          }}
          style={{ display: 'grid', gap: 12 }}
        >
          <label style={{ display: 'grid', gap: 6 }}>
            Title
            <Input value={createTitle} onChange={(e) => setCreateTitle(e.target.value)} required />
          </label>
          <div className="snRowWrap">
            <label style={{ display: 'grid', gap: 6, flex: '1 1 220px' }}>
              Priority
              <Select value={createPriority} onChange={(e) => setCreatePriority(e.target.value as Ticket['priority'])}>
              {optionsFromConfig(priorityConfig.entries, createPriority).map((p) => (
                <option key={p.id} value={p.key}>
                  {p.label}
                </option>
              ))}
              </Select>
            </label>
            <div style={{ flex: '1 1 220px', display: 'grid', gap: 6 }}>
              <span className="snSubtle">Type</span>
              <div style={{ fontWeight: 720 }}>{kindLabel(kind)}</div>
            </div>
          </div>

          <div className="snRowWrap">
            <label style={{ display: 'grid', gap: 6, flex: '1 1 220px' }}>
              Impact
              <Select value={createImpact} onChange={(e) => setCreateImpact(e.target.value as Ticket['impact'])}>
                {optionsFromConfig(impactConfig.entries, createImpact).map((x) => (
                  <option key={x.id} value={x.key}>
                    {x.label}
                  </option>
                ))}
              </Select>
            </label>
            <label style={{ display: 'grid', gap: 6, flex: '1 1 220px' }}>
              Urgency
              <Select value={createUrgency} onChange={(e) => setCreateUrgency(e.target.value as Ticket['urgency'])}>
                {optionsFromConfig(urgencyConfig.entries, createUrgency).map((x) => (
                  <option key={x.id} value={x.key}>
                    {x.label}
                  </option>
                ))}
              </Select>
            </label>
          </div>

          <div className="snRowWrap">
            <label style={{ display: 'grid', gap: 6, flex: '1 1 220px' }}>
              Category
              {categories.length > 0 && !createCategoryIsCustom ? (
                <Select
                  value={createCategory}
                  onChange={(e) => {
                    const v = e.target.value
                    if (v === '__custom__') {
                      setCreateCategoryIsCustom(true)
                      setCreateCategory('')
                      setCreateSubcategory('')
                      setCreateSubcategoryIsCustom(false)
                      return
                    }
                    setCreateCategoryIsCustom(false)
                    setCreateCategory(v)
                    setCreateSubcategory('')
                    setCreateSubcategoryIsCustom(false)
                  }}
                >
                  <option value="">—</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                  <option value="__custom__">Custom…</option>
                </Select>
              ) : (
                <Input value={createCategory} onChange={(e) => setCreateCategory(e.target.value)} placeholder="Custom category" />
              )}
            </label>
            <label style={{ display: 'grid', gap: 6, flex: '1 1 220px' }}>
              Subcategory
              {subcategories.length > 0 && !createSubcategoryIsCustom ? (
                <Select
                  value={createSubcategory}
                  onChange={(e) => {
                    const v = e.target.value
                    if (v === '__custom__') {
                      setCreateSubcategoryIsCustom(true)
                      setCreateSubcategory('')
                      return
                    }
                    setCreateSubcategoryIsCustom(false)
                    setCreateSubcategory(v)
                  }}
                >
                  <option value="">—</option>
                  {visibleSubcategories.map((s) => (
                    <option key={s.id} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                  <option value="__custom__">Custom…</option>
                </Select>
              ) : (
                <Input value={createSubcategory} onChange={(e) => setCreateSubcategory(e.target.value)} placeholder="Custom subcategory" />
              )}
            </label>
          </div>

          {kind === 'CHANGE' ? (
            <label style={{ display: 'grid', gap: 6 }}>
              Change Type
              <Select value={createChangeType} onChange={(e) => setCreateChangeType(e.target.value as Ticket['change_type'])}>
                {optionsFromConfig(changeTypeConfig.entries, createChangeType).map((x) => (
                  <option key={x.id} value={x.key}>
                    {x.label}
                  </option>
                ))}
              </Select>
            </label>
          ) : null}

          <div className="snRowWrap">
            <label style={{ display: 'grid', gap: 6, flex: '1 1 220px' }}>
              Affected Service
              <Select value={createAffectedServiceId} onChange={(e) => setCreateAffectedServiceId(e.target.value)}>
                <option value="">—</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </label>
            {isAgent ? (
              <label style={{ display: 'grid', gap: 6, flex: '1 1 220px' }}>
                Assignment Group
                <Select value={createAssignmentGroupId} onChange={(e) => setCreateAssignmentGroupId(e.target.value)}>
                  <option value="">—</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </label>
            ) : (
              <div style={{ flex: '1 1 220px' }} />
            )}
          </div>

          {isAgent ? (
            <label style={{ display: 'grid', gap: 6 }}>
              Due At (optional)
              <Input type="datetime-local" value={createDueAt} onChange={(e) => setCreateDueAt(e.target.value)} />
            </label>
          ) : null}

          <label style={{ display: 'grid', gap: 6 }}>
            Description
            <textarea
              className="snInput"
              value={createDescription}
              onChange={(e) => setCreateDescription(e.target.value)}
              rows={6}
            />
          </label>
          <div className="snRowWrap" style={{ justifyContent: 'flex-end' }}>
            <Button type="button" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Create
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
