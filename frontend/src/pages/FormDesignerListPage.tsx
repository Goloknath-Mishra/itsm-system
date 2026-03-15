import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiFetch } from '../api'
import { useAuth } from '../auth/useAuth'
import { Badge, Button, Input, Panel, Tabs } from '../components/ui'
import type { DynamicForm } from '../formDesigner/types'
import { countFields, defaultSchema } from '../formDesigner/schema'
import { isPrivileged } from '../auth/roles'

type Tab = 'all' | 'published' | 'drafts'

export function FormDesignerListPage() {
  const auth = useAuth()
  const navigate = useNavigate()

  const [forms, setForms] = useState<DynamicForm[]>([])
  const [tab, setTab] = useState<Tab>('all')
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!auth.accessToken) return
    setIsLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams()
      if (tab === 'published') qs.set('status', 'PUBLISHED')
      if (tab === 'drafts') qs.set('status', 'DRAFT')
      if (search) qs.set('search', search)
      const path = qs.toString() ? `/api/forms/?${qs.toString()}` : '/api/forms/'
      const data = await apiFetch<DynamicForm[]>(path, { token: auth.accessToken })
      setForms(data)
    } catch {
      setError('Failed to load forms')
    } finally {
      setIsLoading(false)
    }
  }, [auth.accessToken, search, tab])

  useEffect(() => {
    void load()
  }, [load])

  const stats = useMemo(() => {
    const total = forms.length
    const published = forms.filter((f) => f.status === 'PUBLISHED').length
    const drafts = forms.filter((f) => f.status === 'DRAFT').length
    const fields = forms.reduce((sum, f) => sum + countFields(f.schema), 0)
    return { total, published, drafts, fields }
  }, [forms])

  return (
    <div className="snPage">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'grid', gap: 4 }}>
          <h1 className="snH1">Form Designer</h1>
          <div className="snSubtle">Create, customize, and publish forms with drag-and-drop field configuration.</div>
        </div>
        <div className="snRowWrap">
          <Button type="button" onClick={() => void load()} disabled={isLoading}>
            Refresh
          </Button>
          {isPrivileged(auth.user) ? (
            <Button
              type="button"
              variant="primary"
              onClick={async () => {
                if (!auth.accessToken) return
                setError(null)
                try {
                  const created = await apiFetch<DynamicForm>('/api/forms/', {
                    method: 'POST',
                    token: auth.accessToken,
                    body: JSON.stringify({
                      name: 'New Form',
                      description: '',
                      record_type: 'INCIDENT',
                      status: 'DRAFT',
                      schema: defaultSchema(),
                    }),
                  })
                  navigate(`/form-designer/${created.id}`)
                } catch {
                  setError('Failed to create form')
                }
              }}
            >
              New Form
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <Panel title="Error">
          <div style={{ color: 'rgba(255,255,255,0.84)' }}>{error}</div>
        </Panel>
      ) : null}

      <div className="snCardGrid">
        <div className="snStat">
          <div className="snStatLabel">Total forms</div>
          <div className="snStatValue">{stats.total}</div>
          <div className="snStatMeta">In this workspace</div>
        </div>
        <div className="snStat">
          <div className="snStatLabel">Published</div>
          <div className="snStatValue">{stats.published}</div>
          <div className="snStatMeta">Active</div>
        </div>
        <div className="snStat">
          <div className="snStatLabel">Drafts</div>
          <div className="snStatValue">{stats.drafts}</div>
          <div className="snStatMeta">Not published</div>
        </div>
        <div className="snStat">
          <div className="snStatLabel">Total fields</div>
          <div className="snStatValue">{stats.fields}</div>
          <div className="snStatMeta">Across forms</div>
        </div>
      </div>

      <Panel
        title="Forms"
        actions={
          <div className="snRowWrap">
            <Tabs
              value={tab}
              options={[
                { value: 'all', label: 'All' },
                { value: 'published', label: 'Published' },
                { value: 'drafts', label: 'Drafts' },
              ]}
              onChange={setTab}
            />
            <div style={{ width: 340, maxWidth: '56vw' }}>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search forms…"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void load()
                }}
              />
            </div>
            <Button type="button" onClick={() => void load()}>
              Apply
            </Button>
          </div>
        }
      >
        {isLoading ? <div style={{ color: 'var(--muted)' }}>Loading…</div> : null}
        {!isLoading && forms.length === 0 ? <div style={{ color: 'var(--muted)' }}>No forms found.</div> : null}
        {!isLoading ? (
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>
            {forms.map((f) => (
              <Link
                key={f.id}
                to={`/form-designer/${f.id}`}
                className="snPanel"
                style={{ padding: 14, display: 'grid', gap: 12 }}
              >
                <div className="snRow" style={{ justifyContent: 'space-between' }}>
                  <div style={{ display: 'grid', gap: 4 }}>
                    <div style={{ fontWeight: 820, letterSpacing: -0.2 }}>{f.name}</div>
                    <div className="snSubtle">{f.description || '—'}</div>
                  </div>
                  <Badge tone={f.status === 'PUBLISHED' ? 'success' : 'warning'}>
                    {f.status === 'PUBLISHED' ? 'Published' : 'Draft'}
                  </Badge>
                </div>
                <div className="snRowWrap">
                  <Badge tone="info">{f.record_type}</Badge>
                  <Badge tone="neutral">v{f.version}</Badge>
                </div>
                <div className="snRowWrap" style={{ justifyContent: 'space-between' }}>
                  <div className="snRowWrap">
                    <span className="snSubtle">{countFields(f.schema)} fields</span>
                    <span className="snSubtle">{(f.schema.sections ?? []).length} sections</span>
                  </div>
                  <span className="snSubtle">{new Date(f.updated_at).toLocaleDateString()}</span>
                </div>
              </Link>
            ))}
          </div>
        ) : null}
      </Panel>
    </div>
  )
}
