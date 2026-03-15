import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiFetch, buildApiUrl } from '../api'
import { useAuth } from '../auth/useAuth'
import type { ReportDataset, ReportDefinition, ReportSchedule } from '../itsmTypes'
import { Badge, Button, Input, Panel, Select, Tabs, Textarea } from '../components/ui'

type CondOp = 'AND' | 'OR'
type RuleOp = 'eq' | 'ne' | 'contains' | 'startswith' | 'endswith' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'isnull'

type ConditionRule = { type: 'rule'; id: string; field: string; op: RuleOp; value: string }
type ConditionGroup = { type: 'group'; id: string; op: CondOp; children: Array<ConditionRule | ConditionGroup> }

function uid() {
  return crypto.randomUUID()
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object'
}

const datasets: Array<{ value: ReportDataset; label: string }> = [
  { value: 'TICKETS', label: 'Tickets' },
  { value: 'ASSETS', label: 'Assets' },
  { value: 'KNOWLEDGE', label: 'Knowledge' },
  { value: 'CATALOG_REQUESTS', label: 'Catalog Requests' },
]

const fieldsByDataset: Record<ReportDataset, Array<{ key: string; label: string }>> = {
  TICKETS: [
    { key: 'number', label: 'Number' },
    { key: 'kind', label: 'Kind' },
    { key: 'status', label: 'Status' },
    { key: 'priority', label: 'Priority' },
    { key: 'impact', label: 'Impact' },
    { key: 'urgency', label: 'Urgency' },
    { key: 'category', label: 'Category' },
    { key: 'subcategory', label: 'Subcategory' },
    { key: 'title', label: 'Title' },
    { key: 'assignee', label: 'Assignee' },
    { key: 'assignment_group', label: 'Assignment Group' },
    { key: 'requester', label: 'Requester' },
    { key: 'sla_status', label: 'SLA Status' },
    { key: 'due_at', label: 'Due At' },
    { key: 'created_at', label: 'Created At' },
    { key: 'updated_at', label: 'Updated At' },
  ],
  ASSETS: [
    { key: 'asset_tag', label: 'Asset Tag' },
    { key: 'name', label: 'Name' },
    { key: 'status', label: 'Status' },
    { key: 'owner', label: 'Owner' },
    { key: 'location', label: 'Location' },
    { key: 'vendor', label: 'Vendor' },
    { key: 'model', label: 'Model' },
    { key: 'serial_number', label: 'Serial Number' },
    { key: 'updated_at', label: 'Updated At' },
    { key: 'created_at', label: 'Created At' },
  ],
  KNOWLEDGE: [
    { key: 'title', label: 'Title' },
    { key: 'category', label: 'Category' },
    { key: 'status', label: 'Status' },
    { key: 'author', label: 'Author' },
    { key: 'published_at', label: 'Published At' },
    { key: 'updated_at', label: 'Updated At' },
    { key: 'created_at', label: 'Created At' },
  ],
  CATALOG_REQUESTS: [
    { key: 'id', label: 'Request ID' },
    { key: 'item', label: 'Catalog Item' },
    { key: 'status', label: 'Status' },
    { key: 'requester', label: 'Requester' },
    { key: 'approved_at', label: 'Approved At' },
    { key: 'requested_at', label: 'Requested At' },
    { key: 'updated_at', label: 'Updated At' },
    { key: 'ticket_number', label: 'Ticket Number' },
  ],
}

function normalizeConditions(raw: unknown): ConditionGroup {
  if (!isRecord(raw)) return { type: 'group', id: uid(), op: 'AND', children: [] }
  const nodeType = typeof raw.type === 'string' ? raw.type : ''
  const children = Array.isArray(raw.children) ? raw.children : []
  if (nodeType === 'group') {
    return {
      type: 'group',
      id: typeof raw.id === 'string' ? raw.id : uid(),
      op: raw.op === 'OR' ? 'OR' : 'AND',
      children: children.map((c) => {
        if (isRecord(c) && c.type === 'group') return normalizeConditions(c)
        return normalizeRule(c)
      }),
    }
  }
  return { type: 'group', id: uid(), op: 'AND', children: [] }
}

function normalizeRule(raw: unknown): ConditionRule {
  const r = isRecord(raw) ? raw : {}
  return {
    type: 'rule',
    id: typeof r.id === 'string' ? r.id : uid(),
    field: typeof r.field === 'string' ? r.field : '',
    op: (typeof r.op === 'string' ? (r.op as RuleOp) : 'contains') || 'contains',
    value: r.value == null ? '' : String(r.value),
  }
}

type DraftReport = {
  name: string
  dataset: ReportDataset
  selected_fields: string[]
  conditions: ConditionGroup
  is_public: boolean
}

function defaultReport(dataset: ReportDataset): DraftReport {
  return {
    name: 'New report',
    dataset,
    selected_fields: fieldsByDataset[dataset].slice(0, 6).map((f) => f.key),
    conditions: { type: 'group', id: uid(), op: 'AND', children: [] },
    is_public: true,
  }
}

export function ReportBuilderPage() {
  const auth = useAuth()
  const { id } = useParams()
  const navigate = useNavigate()
  const isNew = id === 'new'

  const [name, setName] = useState('New report')
  const [dataset, setDataset] = useState<ReportDataset>('TICKETS')
  const [selected, setSelected] = useState<string[]>([])
  const [conditions, setConditions] = useState<ConditionGroup>({ type: 'group', id: uid(), op: 'AND', children: [] })
  const [isPublic, setIsPublic] = useState(true)

  const [reportId, setReportId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [preview, setPreview] = useState<{ columns: string[]; rows: string[][] } | null>(null)
  const [activeTab, setActiveTab] = useState<'builder' | 'preview' | 'schedules'>('builder')

  const [schedules, setSchedules] = useState<ReportSchedule[]>([])
  const [newFreq, setNewFreq] = useState<'DAILY' | 'WEEKLY' | 'MONTHLY'>('WEEKLY')
  const [newFmt, setNewFmt] = useState<'CSV' | 'PDF' | 'XLSX'>('PDF')
  const [newRecipients, setNewRecipients] = useState('')

  const dragIndex = useRef<number | null>(null)

  const fieldLib = useMemo(() => fieldsByDataset[dataset], [dataset])
  const selectedSet = useMemo(() => new Set(selected), [selected])

  const load = useCallback(async () => {
    if (!auth.accessToken) return
    setIsLoading(true)
    setError(null)
    try {
      if (isNew) {
        const seed = defaultReport('TICKETS')
        setName(seed.name)
        setDataset(seed.dataset)
        setSelected(seed.selected_fields)
        setConditions(normalizeConditions(seed.conditions))
        setIsPublic(seed.is_public)
        setReportId(null)
        setSchedules([])
      } else if (id) {
        const r = await apiFetch<ReportDefinition>(`/api/reports/${id}/`, { token: auth.accessToken })
        setName(r.name)
        setDataset(r.dataset)
        setSelected(r.selected_fields || [])
        setConditions(normalizeConditions(r.conditions))
        setIsPublic(Boolean(r.is_public))
        setReportId(r.id)
        const sc = await apiFetch<ReportSchedule[]>(`/api/report-schedules/?report=${r.id}`, { token: auth.accessToken })
        setSchedules(sc)
      }
    } catch {
      setError('Failed to load report')
    } finally {
      setIsLoading(false)
    }
  }, [auth.accessToken, id, isNew])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!isNew) return
    const seed = defaultReport(dataset)
    setSelected(seed.selected_fields)
    setConditions(normalizeConditions(seed.conditions))
  }, [dataset, isNew])

  const save = useCallback(async () => {
    if (!auth.accessToken) return
    setIsSaving(true)
    setError(null)
    try {
      const payload = {
        name,
        dataset,
        selected_fields: selected,
        conditions,
        is_public: isPublic,
      }
      if (reportId) {
        const r = await apiFetch<ReportDefinition>(`/api/reports/${reportId}/`, {
          method: 'PATCH',
          token: auth.accessToken,
          body: JSON.stringify(payload),
        })
        setReportId(r.id)
      } else {
        const r = await apiFetch<ReportDefinition>('/api/reports/', {
          method: 'POST',
          token: auth.accessToken,
          body: JSON.stringify(payload),
        })
        setReportId(r.id)
        navigate(`/reports/${r.id}`, { replace: true })
      }
    } catch {
      setError('Failed to save report')
    } finally {
      setIsSaving(false)
    }
  }, [auth.accessToken, conditions, dataset, isPublic, name, navigate, reportId, selected])

  const runPreview = useCallback(async () => {
    if (!auth.accessToken || !reportId) return
    setError(null)
    try {
      const data = await apiFetch<{ columns: string[]; rows: string[][] }>(`/api/reports/${reportId}/run/`, {
        method: 'POST',
        token: auth.accessToken,
        body: JSON.stringify({ format: 'json', limit: 50 }),
      })
      setPreview({ columns: data.columns, rows: data.rows })
      setActiveTab('preview')
    } catch {
      setError('Failed to run report')
    }
  }, [auth.accessToken, reportId])

  const download = useCallback(
    async (fmt: 'CSV' | 'PDF' | 'XLSX') => {
      if (!auth.accessToken || !reportId) return
      setError(null)
      try {
        const url = buildApiUrl(`/api/reports/${reportId}/run/`)
        const resp = await fetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${auth.accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ format: fmt, limit: 2000 }),
        })
        const blob = await resp.blob()
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `${name}.${fmt.toLowerCase()}`
        a.click()
        URL.revokeObjectURL(a.href)
      } catch {
        setError('Failed to download')
      }
    },
    [auth.accessToken, name, reportId],
  )

  const addRule = useCallback((groupId: string) => {
    const add = (g: ConditionGroup): ConditionGroup => {
      if (g.id === groupId) {
        return {
          ...g,
          children: [...g.children, { type: 'rule', id: uid(), field: fieldLib[0]?.key || '', op: 'contains', value: '' }],
        }
      }
      return { ...g, children: g.children.map((c) => (c.type === 'group' ? add(c) : c)) }
    }
    setConditions((prev) => add(prev))
  }, [fieldLib])

  const addGroup = useCallback((groupId: string) => {
    const add = (g: ConditionGroup): ConditionGroup => {
      if (g.id === groupId) {
        return { ...g, children: [...g.children, { type: 'group', id: uid(), op: 'AND', children: [] }] }
      }
      return { ...g, children: g.children.map((c) => (c.type === 'group' ? add(c) : c)) }
    }
    setConditions((prev) => add(prev))
  }, [])

  const removeNode = useCallback((nodeId: string) => {
    const prune = (g: ConditionGroup): ConditionGroup => {
      return {
        ...g,
        children: g.children
          .filter((c) => c.id !== nodeId)
          .map((c) => (c.type === 'group' ? prune(c) : c)),
      }
    }
    setConditions((prev) => prune(prev))
  }, [])

  const updateGroupOp = useCallback((groupId: string, op: CondOp) => {
    const upd = (g: ConditionGroup): ConditionGroup => {
      if (g.id === groupId) return { ...g, op }
      return { ...g, children: g.children.map((c) => (c.type === 'group' ? upd(c) : c)) }
    }
    setConditions((prev) => upd(prev))
  }, [])

  const updateRule = useCallback((ruleId: string, patch: Partial<ConditionRule>) => {
    const upd = (g: ConditionGroup): ConditionGroup => {
      return {
        ...g,
        children: g.children.map((c) => {
          if (c.type === 'group') return upd(c)
          if (c.id === ruleId) return { ...c, ...patch }
          return c
        }),
      }
    }
    setConditions((prev) => upd(prev))
  }, [])

  const scheduleCreate = useCallback(async () => {
    if (!auth.accessToken || !reportId) return
    setError(null)
    try {
      const recipients = newRecipients
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      await apiFetch<ReportSchedule>('/api/report-schedules/', {
        method: 'POST',
        token: auth.accessToken,
        body: JSON.stringify({ report_id: reportId, frequency: newFreq, format: newFmt, recipients, is_active: true }),
      })
      const sc = await apiFetch<ReportSchedule[]>(`/api/report-schedules/?report=${reportId}`, { token: auth.accessToken })
      setSchedules(sc)
      setNewRecipients('')
    } catch {
      setError('Failed to create schedule')
    }
  }, [auth.accessToken, newFmt, newFreq, newRecipients, reportId])

  const runDue = useCallback(async () => {
    if (!auth.accessToken) return
    setError(null)
    try {
      await apiFetch('/api/report-schedules/run-due/', { method: 'POST', token: auth.accessToken })
    } catch {
      setError('Failed to run schedules')
    }
  }, [auth.accessToken])

  const available = useMemo(() => fieldLib.filter((f) => !selectedSet.has(f.key)), [fieldLib, selectedSet])

  const renderGroup = (g: ConditionGroup, depth: number) => {
    return (
      <div key={g.id} style={{ borderLeft: depth ? '2px solid rgba(255,255,255,0.08)' : undefined, paddingLeft: depth ? 10 : 0 }}>
        <div className="snRowWrap" style={{ justifyContent: 'space-between' }}>
          <div className="snRowWrap">
            <Badge tone="info">Group</Badge>
            <Select value={g.op} onChange={(e) => updateGroupOp(g.id, e.target.value === 'OR' ? 'OR' : 'AND')}>
              <option value="AND">AND</option>
              <option value="OR">OR</option>
            </Select>
            <Button type="button" onClick={() => addRule(g.id)}>
              Add rule
            </Button>
            <Button type="button" onClick={() => addGroup(g.id)}>
              Add group
            </Button>
            {depth ? (
              <Button type="button" onClick={() => removeNode(g.id)}>
                Remove
              </Button>
            ) : null}
          </div>
          <div className="snSubtle">{g.children.length} items</div>
        </div>

        <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
          {g.children.length === 0 ? <div className="snSubtle">No conditions.</div> : null}
          {g.children.map((c) => {
            if (c.type === 'group') return renderGroup(c, depth + 1)
            return (
              <div
                key={c.id}
                style={{
                  display: 'grid',
                  gap: 8,
                  gridTemplateColumns: '1fr 140px 1fr auto',
                  alignItems: 'center',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 14,
                  padding: 10,
                  background: 'rgba(255,255,255,0.02)',
                }}
              >
                <Select value={c.field} onChange={(e) => updateRule(c.id, { field: e.target.value })}>
                  {fieldLib.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </Select>
                <Select value={c.op} onChange={(e) => updateRule(c.id, { op: e.target.value as RuleOp })}>
                  <option value="contains">contains</option>
                  <option value="eq">equals</option>
                  <option value="ne">not equal</option>
                  <option value="startswith">starts with</option>
                  <option value="endswith">ends with</option>
                  <option value="gt">{'>'}</option>
                  <option value="gte">{'>='}</option>
                  <option value="lt">{'<'}</option>
                  <option value="lte">{'<='}</option>
                  <option value="in">in (a,b,c)</option>
                  <option value="isnull">is null</option>
                </Select>
                <Input
                  value={c.value}
                  onChange={(e) => updateRule(c.id, { value: e.target.value })}
                  placeholder={c.op === 'in' ? 'a,b,c' : 'value'}
                  disabled={c.op === 'isnull'}
                />
                <Button type="button" onClick={() => removeNode(c.id)}>
                  Remove
                </Button>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="snPage">
        <Panel title="Report Builder">
          <div style={{ color: 'var(--muted)' }}>Loading…</div>
        </Panel>
      </div>
    )
  }

  return (
    <div className="snPage">
      <div className="snRowWrap" style={{ justifyContent: 'space-between', alignItems: 'end' }}>
        <div style={{ display: 'grid', gap: 4 }}>
          <div className="snRowWrap">
            <Link to="/reports" className="snSubtle">
              ← Back
            </Link>
            <Badge tone="info">Report Builder</Badge>
          </div>
          <h1 className="snH1">{name}</h1>
        </div>
        <div className="snRowWrap">
          <Button type="button" onClick={() => void runPreview()} disabled={!reportId}>
            Preview
          </Button>
          <Button type="button" onClick={() => void download('CSV')} disabled={!reportId}>
            CSV
          </Button>
          <Button type="button" onClick={() => void download('XLSX')} disabled={!reportId}>
            Excel
          </Button>
          <Button type="button" onClick={() => void download('PDF')} disabled={!reportId}>
            PDF
          </Button>
          <Button type="button" variant="primary" onClick={() => void save()} disabled={isSaving}>
            Save
          </Button>
        </div>
      </div>

      {error ? (
        <Panel title="Error">
          <div style={{ color: 'rgba(255,255,255,0.84)' }}>{error}</div>
        </Panel>
      ) : null}

      <Panel
        title="Workspace"
        actions={
          <Tabs
            value={activeTab}
            options={[
              { value: 'builder', label: 'Builder' },
              { value: 'preview', label: 'Preview' },
              { value: 'schedules', label: 'Schedules' },
            ]}
            onChange={(v) => setActiveTab(v as 'builder' | 'preview' | 'schedules')}
          />
        }
      >
        {activeTab === 'builder' ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Panel title="Definition">
              <div style={{ display: 'grid', gap: 12 }}>
                <label style={{ display: 'grid', gap: 6 }}>
                  Name
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  Dataset
                  <Select value={dataset} onChange={(e) => setDataset(e.target.value as ReportDataset)} disabled={!isNew}>
                    {datasets.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="snRow" style={{ gap: 10, justifyContent: 'space-between' }}>
                  <span className="snSubtle">Visible to other agents</span>
                  <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
                </label>
              </div>
            </Panel>

            <Panel title="Fields (drag to reorder)">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ display: 'grid', gap: 8 }}>
                  <div className="snSubtle">Available</div>
                  {available.map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      className="snBtn"
                      style={{ textAlign: 'left' }}
                      onClick={() => setSelected((prev) => [...prev, f.key])}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                  <div className="snSubtle">Selected</div>
                  {selected.length === 0 ? <div className="snSubtle">Select fields to include.</div> : null}
                  {selected.map((k, idx) => {
                    const label = fieldLib.find((f) => f.key === k)?.label ?? k
                    return (
                      <div
                        key={`${k}-${idx}`}
                        draggable
                        onDragStart={() => {
                          dragIndex.current = idx
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          const from = dragIndex.current
                          dragIndex.current = null
                          if (from == null || from === idx) return
                          setSelected((prev) => {
                            const next = [...prev]
                            const [moved] = next.splice(from, 1)
                            next.splice(idx, 0, moved)
                            return next
                          })
                        }}
                        style={{
                          border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: 14,
                          padding: 10,
                          background: 'rgba(255,255,255,0.02)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: 10,
                        }}
                      >
                        <div style={{ fontWeight: 720 }}>{label}</div>
                        <Button type="button" onClick={() => setSelected((prev) => prev.filter((_, i) => i !== idx))}>
                          Remove
                        </Button>
                      </div>
                    )
                  })}
                </div>
              </div>
            </Panel>

            <Panel title="Conditions (nested AND/OR)">
              <div style={{ display: 'grid', gap: 12 }}>
                {renderGroup(conditions, 0)}
                <div className="snSubtle">Tip: Use “in” with comma-separated values.</div>
              </div>
            </Panel>

            <Panel title="Notes">
              <Textarea value={''} onChange={() => undefined} rows={8} placeholder="Optional notes for stakeholders…" disabled />
            </Panel>
          </div>
        ) : null}

        {activeTab === 'preview' ? (
          <div style={{ display: 'grid', gap: 12 }}>
            {!reportId ? <div className="snSubtle">Save the report first to preview it.</div> : null}
            {preview ? (
              <Panel title="Preview Results">
                {preview.rows.length === 0 ? <div className="snSubtle">No results.</div> : null}
                {preview.rows.length > 0 ? (
                  <table className="snTable">
                    <thead>
                      <tr>
                        {preview.columns.map((c) => (
                          <th key={c}>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((r, idx) => (
                        <tr key={idx}>
                          {r.map((v, i) => (
                            <td key={i}>{v}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}
              </Panel>
            ) : (
              <div className="snSubtle">Run Preview to see results.</div>
            )}
          </div>
        ) : null}

        {activeTab === 'schedules' ? (
          <div style={{ display: 'grid', gap: 12 }}>
            {!reportId ? <div className="snSubtle">Save the report first to add schedules.</div> : null}
            {reportId ? (
              <div className="snGrid2">
                <Panel title="Create Schedule">
                  <div style={{ display: 'grid', gap: 12 }}>
                    <label style={{ display: 'grid', gap: 6 }}>
                      Frequency
                      <Select value={newFreq} onChange={(e) => setNewFreq(e.target.value as 'DAILY' | 'WEEKLY' | 'MONTHLY')}>
                        <option value="DAILY">Daily</option>
                        <option value="WEEKLY">Weekly</option>
                        <option value="MONTHLY">Monthly</option>
                      </Select>
                    </label>
                    <label style={{ display: 'grid', gap: 6 }}>
                      Format
                      <Select value={newFmt} onChange={(e) => setNewFmt(e.target.value as 'CSV' | 'PDF' | 'XLSX')}>
                        <option value="PDF">PDF</option>
                        <option value="CSV">CSV</option>
                        <option value="XLSX">Excel</option>
                      </Select>
                    </label>
                    <label style={{ display: 'grid', gap: 6 }}>
                      Recipients (comma-separated emails)
                      <Input value={newRecipients} onChange={(e) => setNewRecipients(e.target.value)} placeholder="a@x.com,b@y.com" />
                    </label>
                    <div className="snRowWrap" style={{ justifyContent: 'space-between' }}>
                      <Button type="button" onClick={() => void runDue()}>
                        Run due schedules
                      </Button>
                      <Button type="button" variant="primary" onClick={() => void scheduleCreate()}>
                        Create
                      </Button>
                    </div>
                    <div className="snSubtle">Scheduled emails use the backend email backend (console in DEBUG).</div>
                  </div>
                </Panel>
                <Panel title="Existing Schedules">
                  {schedules.length === 0 ? <div className="snSubtle">No schedules yet.</div> : null}
                  {schedules.length > 0 ? (
                    <div style={{ display: 'grid', gap: 10 }}>
                      {schedules.map((s) => (
                        <div
                          key={s.id}
                          style={{
                            border: '1px solid rgba(255,255,255,0.06)',
                            borderRadius: 14,
                            background: 'rgba(255,255,255,0.02)',
                            padding: 12,
                            display: 'grid',
                            gap: 6,
                          }}
                        >
                          <div className="snRowWrap" style={{ justifyContent: 'space-between' }}>
                            <div className="snRowWrap">
                              <Badge tone="info">{s.frequency}</Badge>
                              <Badge tone="neutral">{s.format}</Badge>
                              <Badge tone={s.is_active ? 'success' : 'neutral'}>{s.is_active ? 'Active' : 'Inactive'}</Badge>
                            </div>
                            <div className="snSubtle">{new Date(s.created_at).toLocaleDateString()}</div>
                          </div>
                          <div className="snSubtle">Recipients: {(s.recipients || []).join(', ') || '—'}</div>
                          <div className="snSubtle">
                            Next: {s.next_run_at ? new Date(s.next_run_at).toLocaleString() : '—'} · Last:{' '}
                            {s.last_run_at ? new Date(s.last_run_at).toLocaleString() : '—'}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </Panel>
              </div>
            ) : null}
          </div>
        ) : null}
      </Panel>
    </div>
  )
}
