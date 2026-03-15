import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiFetch } from '../api'
import { useAuth } from '../auth/useAuth'
import type { Workflow, WorkflowRun, WorkflowVersion } from '../itsmTypes'
import { Badge, Button, Input, Panel, Select, Tabs, Textarea } from '../components/ui'

type Tab = 'designer' | 'runs'

function safeJson(text: string) {
  try {
    return { ok: true as const, value: JSON.parse(text) }
  } catch {
    return { ok: false as const, value: null }
  }
}

export function WorkflowEditorPage() {
  const auth = useAuth()
  const { id } = useParams()
  const [wf, setWf] = useState<Workflow | null>(null)
  const [versions, setVersions] = useState<WorkflowVersion[]>([])
  const [runs, setRuns] = useState<WorkflowRun[]>([])
  const [activeTab, setActiveTab] = useState<Tab>('designer')
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [kind, setKind] = useState<Workflow['kind']>('INCIDENT_ESCALATION')
  const [schemaText, setSchemaText] = useState('{"steps":[]}')
  const [testsText, setTestsText] = useState('[]')
  const [sandboxTicketId, setSandboxTicketId] = useState('')

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [runResult, setRunResult] = useState<WorkflowRun | null>(null)

  const selectedVersion = useMemo(() => versions.find((v) => v.id === selectedVersionId) ?? null, [selectedVersionId, versions])

  const load = useCallback(async () => {
    if (!auth.accessToken || !id) return
    setIsLoading(true)
    setError(null)
    try {
      const w = await apiFetch<Workflow>(`/api/workflows/${id}/`, { token: auth.accessToken })
      const v = await apiFetch<WorkflowVersion[]>(`/api/workflows/${id}/versions/`, { token: auth.accessToken })
      const r = await apiFetch<WorkflowRun[]>(`/api/workflows/${id}/runs/`, { token: auth.accessToken })
      setWf(w)
      setVersions(v)
      setRuns(r)
      setName(w.name)
      setKind(w.kind)
      const pick = w.deployed_version?.id ?? v[0]?.id ?? null
      setSelectedVersionId(pick)
      const picked = v.find((x) => x.id === pick) ?? v[0]
      setSchemaText(JSON.stringify(picked?.schema ?? { steps: [] }, null, 2))
      setTestsText(JSON.stringify(picked?.test_cases ?? [], null, 2))
    } catch {
      setError('Failed to load workflow')
    } finally {
      setIsLoading(false)
    }
  }, [auth.accessToken, id])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!selectedVersion) return
    setSchemaText(JSON.stringify(selectedVersion.schema ?? { steps: [] }, null, 2))
    setTestsText(JSON.stringify(selectedVersion.test_cases ?? [], null, 2))
  }, [selectedVersion])

  if (!auth.user) {
    return (
      <div className="snPage">
        <Panel title="Workflow Studio">
          <div style={{ color: 'var(--muted)', fontSize: 14 }}>
            Please <Link to="/login">sign in</Link>.
          </div>
        </Panel>
      </div>
    )
  }

  return (
    <div className="snPage">
      <div className="snRowWrap" style={{ justifyContent: 'space-between', alignItems: 'end' }}>
        <div style={{ display: 'grid', gap: 4 }}>
          <Link to="/workflows" className="snSubtle">
            ← Back
          </Link>
          <h1 className="snH1">{wf?.name || 'Workflow'}</h1>
        </div>
        <div className="snRowWrap">
          <Button
            type="button"
            onClick={async () => {
              if (!auth.accessToken || !wf) return
              const updated = await apiFetch<Workflow>(`/api/workflows/${wf.id}/`, {
                method: 'PATCH',
                token: auth.accessToken,
                body: JSON.stringify({ name, kind, is_active: wf.is_active }),
              })
              setWf(updated)
              await load()
            }}
            disabled={!wf}
          >
            Save
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={async () => {
              if (!auth.accessToken || !wf) return
              await apiFetch(`/api/workflows/${wf.id}/deploy/`, { method: 'POST', token: auth.accessToken, body: JSON.stringify({ version_id: selectedVersionId }) })
              await load()
            }}
            disabled={!wf || !selectedVersionId}
          >
            Deploy
          </Button>
        </div>
      </div>

      {error ? (
        <Panel title="Error">
          <div style={{ color: 'rgba(255,255,255,0.84)' }}>{error}</div>
        </Panel>
      ) : null}

      {isLoading ? (
        <Panel title="Workflow Studio">
          <div className="snSubtle">Loading…</div>
        </Panel>
      ) : null}

      {!isLoading && wf ? (
        <Panel
          title="Studio"
          actions={
            <Tabs
              value={activeTab}
              options={[
                { value: 'designer', label: 'Designer' },
                { value: 'runs', label: 'Runs' },
              ]}
              onChange={(v) => setActiveTab(v as Tab)}
            />
          }
        >
          {activeTab === 'designer' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 12 }}>
              <div style={{ display: 'grid', gap: 12 }}>
                <Panel title="Definition">
                  <div style={{ display: 'grid', gap: 12 }}>
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span className="snSubtle">Name</span>
                      <Input value={name} onChange={(e) => setName(e.target.value)} />
                    </label>
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span className="snSubtle">Kind</span>
                      <Select value={kind} onChange={(e) => setKind(e.target.value as Workflow['kind'])}>
                        <option value="INCIDENT_ESCALATION">Incident Escalation</option>
                        <option value="SLA_ESCALATION">SLA Escalation</option>
                        <option value="CATALOG_FULFILLMENT">Catalog Fulfillment</option>
                      </Select>
                    </label>
                    <div className="snRowWrap">
                      <Badge tone={wf.deployed_version ? 'success' : 'warning'}>
                        {wf.deployed_version ? `Deployed v${wf.deployed_version.version}` : 'Not deployed'}
                      </Badge>
                      <Badge tone="neutral">{wf.is_active ? 'Active' : 'Inactive'}</Badge>
                    </div>
                  </div>
                </Panel>

                <Panel
                  title="Versions"
                  actions={
                    <Button
                      type="button"
                      onClick={async () => {
                        if (!auth.accessToken) return
                        const v = await apiFetch<WorkflowVersion>(`/api/workflows/${wf.id}/new-version/`, { method: 'POST', token: auth.accessToken })
                        await load()
                        setSelectedVersionId(v.id)
                      }}
                    >
                      New version
                    </Button>
                  }
                >
                  <div style={{ display: 'grid', gap: 10 }}>
                    {versions.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        className="snPanel"
                        style={{
                          padding: 12,
                          textAlign: 'left',
                          cursor: 'pointer',
                          borderColor: v.id === selectedVersionId ? 'color-mix(in oklab, var(--primary) 35%, rgba(255,255,255,0.08))' : 'rgba(255,255,255,0.08)',
                        }}
                        onClick={() => setSelectedVersionId(v.id)}
                      >
                        <div className="snRowWrap" style={{ justifyContent: 'space-between' }}>
                          <div style={{ fontWeight: 780 }}>v{v.version}</div>
                          <Badge tone={v.status === 'DEPLOYED' ? 'success' : v.status === 'DRAFT' ? 'warning' : 'neutral'}>{v.status}</Badge>
                        </div>
                        <div className="snSubtle">{new Date(v.created_at).toLocaleString()}</div>
                      </button>
                    ))}
                  </div>
                </Panel>
              </div>

              <div style={{ display: 'grid', gap: 12 }}>
                <Panel
                  title="Schema"
                  actions={
                    <div className="snRowWrap">
                      <Button
                        type="button"
                        onClick={async () => {
                          if (!auth.accessToken || !selectedVersion) return
                          const schema = safeJson(schemaText)
                          const tests = safeJson(testsText)
                          if (!schema.ok || !tests.ok) {
                            setError('Invalid JSON in schema or test cases')
                            return
                          }
                          await apiFetch(`/api/workflow-versions/${selectedVersion.id}/`, {
                            method: 'PATCH',
                            token: auth.accessToken,
                            body: JSON.stringify({ schema: schema.value, test_cases: tests.value }),
                          })
                          await load()
                        }}
                        disabled={!selectedVersion}
                      >
                        Save version
                      </Button>
                      <Button
                        type="button"
                        onClick={async () => {
                          if (!auth.accessToken || !wf) return
                          const data = await apiFetch<{ count: number; results: Array<{ ok: boolean; error?: string }> }>(`/api/workflows/${wf.id}/run-tests/`, {
                            method: 'POST',
                            token: auth.accessToken,
                            body: JSON.stringify({ version_id: selectedVersionId }),
                          })
                          setRunResult(null)
                          setError(`Tests: ${data.results.filter((r) => r.ok).length}/${data.count} passed`)
                        }}
                      >
                        Run tests
                      </Button>
                    </div>
                  }
                >
                  <div style={{ display: 'grid', gap: 12 }}>
                    <Textarea value={schemaText} onChange={(e) => setSchemaText(e.target.value)} rows={16} />
                    <div className="snSubtle">
                      Supported steps: notify, set_ticket, if. Use placeholders like {'{{ticket_number}}'}.
                    </div>
                  </div>
                </Panel>

                <Panel title="Test Cases (sandbox)">
                  <div style={{ display: 'grid', gap: 10 }}>
                    <Textarea value={testsText} onChange={(e) => setTestsText(e.target.value)} rows={8} />
                    <div className="snSubtle">
                      Format: [{'{'} "input": {'{'}"ticket_id":"..."{'}'}, "expect": {'{'}...{'}'} {'}'}]
                    </div>
                  </div>
                </Panel>

                <Panel
                  title="Sandbox Run"
                  actions={
                    <Button
                      type="button"
                      variant="primary"
                      onClick={async () => {
                        if (!auth.accessToken || !wf) return
                        const r = await apiFetch<WorkflowRun>(`/api/workflows/${wf.id}/sandbox-run/`, {
                          method: 'POST',
                          token: auth.accessToken,
                          body: JSON.stringify({ version_id: selectedVersionId, input: { ticket_id: sandboxTicketId.trim() } }),
                        })
                        setRunResult(r)
                        await load()
                      }}
                      disabled={!sandboxTicketId.trim()}
                    >
                      Run
                    </Button>
                  }
                >
                  <div style={{ display: 'grid', gap: 10 }}>
                    <Input value={sandboxTicketId} onChange={(e) => setSandboxTicketId(e.target.value)} placeholder="Ticket UUID…" />
                    {runResult ? (
                      <div style={{ display: 'grid', gap: 10 }}>
                        <div className="snRowWrap">
                          <Badge tone={runResult.status === 'SUCCEEDED' ? 'success' : 'danger'}>{runResult.status}</Badge>
                          <Badge tone="neutral">{runResult.sandbox ? 'Sandbox' : 'Deployed'}</Badge>
                        </div>
                        {runResult.error ? <div style={{ color: 'rgba(255,61,97,0.95)' }}>{runResult.error}</div> : null}
                        <Panel title="Logs">
                          {runResult.logs.length === 0 ? <div className="snSubtle">No logs.</div> : null}
                          {runResult.logs.map((l, i) => (
                            <div key={i} className="snSubtle">
                              {l}
                            </div>
                          ))}
                        </Panel>
                        <Panel title="Output">
                          <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{JSON.stringify(runResult.output, null, 2)}</pre>
                        </Panel>
                      </div>
                    ) : (
                      <div className="snSubtle">Run a sandbox execution to validate safely.</div>
                    )}
                  </div>
                </Panel>
              </div>
            </div>
          ) : null}

          {activeTab === 'runs' ? (
            <div style={{ display: 'grid', gap: 12 }}>
              <Panel title="Recent Runs" actions={<Button type="button" onClick={() => void load()}>Refresh</Button>}>
                {runs.length === 0 ? <div className="snSubtle">No runs yet.</div> : null}
                {runs.length > 0 ? (
                  <table className="snTable">
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>Version</th>
                        <th>Mode</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {runs.slice(0, 50).map((r) => (
                        <tr key={r.id}>
                          <td className="snSubtle">{new Date(r.started_at).toLocaleString()}</td>
                          <td className="snSubtle">v{r.workflow_version.version}</td>
                          <td>
                            <Badge tone={r.sandbox ? 'info' : 'warning'}>{r.sandbox ? 'Sandbox' : 'Deployed'}</Badge>
                          </td>
                          <td>
                            <Badge tone={r.status === 'SUCCEEDED' ? 'success' : r.status === 'FAILED' ? 'danger' : 'neutral'}>{r.status}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}
              </Panel>
            </div>
          ) : null}
        </Panel>
      ) : null}
    </div>
  )
}
