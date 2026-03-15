import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiFetch } from '../api'
import { useAuth } from '../auth/useAuth'
import { Badge, Button, Input, Modal, Panel, Select, Tabs, Textarea } from '../components/ui'
import { isPrivileged } from '../auth/roles'
import type {
  DynamicForm,
  FormField,
  FormFieldType,
  FormRecordType,
  FormSchema,
  FormSection,
  RuleCondition,
  RuleGroup,
} from '../formDesigner/types'
import { countFields, defaultField, findField, newId } from '../formDesigner/schema'

type EditorTab = 'fields' | 'workflows' | 'dependencies' | 'analytics' | 'history' | 'preview'
type DrawerTab = 'basic' | 'validation' | 'permissions' | 'visibility'

const fieldTypes: Array<{ type: FormFieldType; label: string }> = [
  { type: 'text', label: 'Text' },
  { type: 'multiline', label: 'Multiline Text' },
  { type: 'number', label: 'Number' },
  { type: 'decimal', label: 'Decimal' },
  { type: 'email', label: 'Email' },
  { type: 'date', label: 'Date' },
  { type: 'option_set', label: 'Option Set' },
  { type: 'multi_select', label: 'Multi-select' },
  { type: 'two_options', label: 'Two options' },
  { type: 'checkbox', label: 'Checkbox' },
  { type: 'lookup', label: 'Lookup/Reference' },
]

function ensureSchema(schema: unknown): FormSchema {
  if (!schema || typeof schema !== 'object') return { sections: [] }
  const s = schema as FormSchema
  if (!Array.isArray(s.sections)) return { sections: [] }
  return s
}

function ensureRuleGroup(g?: RuleGroup): RuleGroup {
  if (!g || typeof g !== 'object') return { op: 'AND', conditions: [] }
  if (g.op !== 'AND' && g.op !== 'OR') return { op: 'AND', conditions: Array.isArray(g.conditions) ? g.conditions : [] }
  return { op: g.op, conditions: Array.isArray(g.conditions) ? g.conditions : [] }
}

function evalCondition(c: RuleCondition, values: Record<string, string>) {
  const left = values[c.field] ?? ''
  const right = c.value ?? ''
  if (c.op === 'is_set') return left.trim().length > 0
  if (c.op === 'eq') return left === right
  if (c.op === 'ne') return left !== right
  if (c.op === 'contains') return left.toLowerCase().includes(right.toLowerCase())
  if (c.op === 'in') {
    const set = right
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    return set.includes(left)
  }
  return false
}

function evalRuleGroup(g: RuleGroup | undefined, values: Record<string, string>) {
  const group = ensureRuleGroup(g)
  if (group.conditions.length === 0) return true
  if (group.op === 'OR') return group.conditions.some((c) => evalCondition(c, values))
  return group.conditions.every((c) => evalCondition(c, values))
}

export function FormDesignerEditorPage() {
  const { id } = useParams()
  const auth = useAuth()

  const [form, setForm] = useState<DynamicForm | null>(null)
  const [schema, setSchema] = useState<FormSchema>({ sections: [] })
  const [tab, setTab] = useState<EditorTab>('fields')
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('basic')
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null)
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [recordType, setRecordType] = useState<FormRecordType>('INCIDENT')

  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [previewValues, setPreviewValues] = useState<Record<string, string>>({})
  const [drag, setDrag] = useState<{ fieldId: string; fromSectionId: string } | null>(null)

  const load = useCallback(async () => {
    if (!id || !auth.accessToken) return
    setIsLoading(true)
    setError(null)
    try {
      const data = await apiFetch<DynamicForm>(`/api/forms/${id}/`, { token: auth.accessToken })
      setForm(data)
      const s = ensureSchema(data.schema)
      if (!s.sections.length) s.sections = [{ id: newId(), title: 'General Information', fields: [] }]
      setSchema(s)
      setName(data.name)
      setDescription(data.description || '')
      setRecordType(data.record_type)
      setSelectedSectionId(s.sections[0]?.id ?? null)
    } catch {
      setError('Failed to load form')
    } finally {
      setIsLoading(false)
    }
  }, [auth.accessToken, id])

  useEffect(() => {
    void load()
  }, [load])

  const canEdit = isPrivileged(auth.user)

  const selected = useMemo(() => {
    if (!selectedFieldId) return null
    return findField(schema, selectedFieldId)
  }, [schema, selectedFieldId])

  const totalFields = useMemo(() => countFields(schema), [schema])

  const allFieldNames = useMemo(() => {
    const out: Array<{ name: string; label: string }> = []
    for (const s of schema.sections) {
      for (const f of s.fields) out.push({ name: f.name, label: f.label })
    }
    return out
  }, [schema.sections])

  const moveField = useCallback((fieldId: string, fromSectionId: string, toSectionId: string, beforeFieldId?: string | null) => {
    setSchema((prev) => {
      const next: FormSchema = { sections: prev.sections.map((s) => ({ ...s, fields: [...s.fields] })) }
      const from = next.sections.find((s) => s.id === fromSectionId)
      const to = next.sections.find((s) => s.id === toSectionId)
      if (!from || !to) return prev
      const idx = from.fields.findIndex((f) => f.id === fieldId)
      if (idx < 0) return prev
      const [field] = from.fields.splice(idx, 1)
      const insertAt = beforeFieldId ? to.fields.findIndex((f) => f.id === beforeFieldId) : -1
      if (insertAt >= 0) to.fields.splice(insertAt, 0, field)
      else to.fields.push(field)
      return next
    })
  }, [])

  async function saveForm(nextStatus?: 'DRAFT' | 'PUBLISHED') {
    if (!auth.accessToken || !form) return
    setIsSaving(true)
    setError(null)
    try {
      const updated = await apiFetch<DynamicForm>(`/api/forms/${form.id}/`, {
        method: 'PATCH',
        token: auth.accessToken,
        body: JSON.stringify({
          name,
          description,
          record_type: recordType,
          schema,
          status: nextStatus ?? form.status,
        }),
      })
      setForm(updated)
    } catch {
      setError('Failed to save form')
    } finally {
      setIsSaving(false)
    }
  }

  async function publishForm() {
    if (!auth.accessToken || !form) return
    setIsSaving(true)
    setError(null)
    try {
      const updated = await apiFetch<DynamicForm>(`/api/forms/${form.id}/publish/`, { method: 'POST', token: auth.accessToken })
      setForm(updated)
    } catch {
      setError('Failed to publish form')
    } finally {
      setIsSaving(false)
    }
  }

  function addSection() {
    const section: FormSection = { id: newId(), title: 'Section', fields: [] }
    setSchema((prev) => ({ ...prev, sections: [...prev.sections, section] }))
    setSelectedSectionId(section.id)
  }

  function addField(type: FormFieldType) {
    const sectionId = selectedSectionId ?? schema.sections[0]?.id
    if (!sectionId) return
    const field = defaultField(type)
    setSchema((prev) => ({
      ...prev,
      sections: prev.sections.map((s) => (s.id === sectionId ? { ...s, fields: [...s.fields, field] } : s)),
    }))
    setSelectedFieldId(field.id)
    setDrawerTab('basic')
  }

  function updateSelectedField(patch: Partial<FormField>) {
    if (!selectedFieldId) return
    setSchema((prev) => ({
      ...prev,
      sections: prev.sections.map((s) => ({
        ...s,
        fields: s.fields.map((f) => (f.id === selectedFieldId ? { ...f, ...patch } : f)),
      })),
    }))
  }

  function removeSelectedField() {
    if (!selectedFieldId) return
    setSchema((prev) => ({
      ...prev,
      sections: prev.sections.map((s) => ({ ...s, fields: s.fields.filter((f) => f.id !== selectedFieldId) })),
    }))
    setSelectedFieldId(null)
  }

  const applyDefaults = useCallback(
    (values: Record<string, string>) => {
      const next = { ...values }
      for (const s of schema.sections) {
        for (const f of s.fields) {
          const key = f.name
          const current = next[key] ?? ''
          const hasValue = current.trim().length > 0
          const shouldDefault = Boolean(f.defaultValue) && evalRuleGroup(f.defaultWhen, next)
          if (!hasValue && shouldDefault) next[key] = f.defaultValue || ''
        }
      }
      return next
    },
    [schema.sections],
  )

  useEffect(() => {
    if (!isPreviewOpen) return
    const next = applyDefaults(previewValues)
    const changed = Object.keys(next).some((k) => next[k] !== previewValues[k])
    if (changed) setPreviewValues(next)
  }, [applyDefaults, isPreviewOpen, previewValues])

  function RuleGroupEditor({ value, onChange }: { value?: RuleGroup; onChange: (next: RuleGroup) => void }) {
    const g = ensureRuleGroup(value)
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <div className="snRowWrap">
          <span className="snSubtle">Operator</span>
          <Select value={g.op} onChange={(e) => onChange({ ...g, op: e.target.value === 'OR' ? 'OR' : 'AND' })} disabled={!canEdit}>
            <option value="AND">AND</option>
            <option value="OR">OR</option>
          </Select>
          <Button
            type="button"
            disabled={!canEdit}
            onClick={() =>
              onChange({
                ...g,
                conditions: [...g.conditions, { field: allFieldNames[0]?.name ?? '', op: 'eq', value: '' }],
              })
            }
          >
            Add condition
          </Button>
        </div>
        {g.conditions.length === 0 ? <div className="snSubtle">No conditions.</div> : null}
        {g.conditions.map((c, idx) => (
          <div
            key={`${c.field}-${idx}`}
            style={{
              display: 'grid',
              gap: 8,
              gridTemplateColumns: '1fr 160px 1fr auto',
              alignItems: 'center',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 14,
              padding: 10,
              background: 'rgba(255,255,255,0.02)',
            }}
          >
            <Select
              value={c.field}
              onChange={(e) => {
                const next = [...g.conditions]
                next[idx] = { ...c, field: e.target.value }
                onChange({ ...g, conditions: next })
              }}
              disabled={!canEdit}
            >
              {allFieldNames.map((f) => (
                <option key={f.name} value={f.name}>
                  {f.label}
                </option>
              ))}
            </Select>
            <Select
              value={c.op}
              onChange={(e) => {
                const next = [...g.conditions]
                next[idx] = { ...c, op: e.target.value as RuleCondition['op'] }
                onChange({ ...g, conditions: next })
              }}
              disabled={!canEdit}
            >
              <option value="eq">equals</option>
              <option value="ne">not equal</option>
              <option value="contains">contains</option>
              <option value="in">in (a,b,c)</option>
              <option value="is_set">is set</option>
            </Select>
            <Input
              value={c.value ?? ''}
              onChange={(e) => {
                const next = [...g.conditions]
                next[idx] = { ...c, value: e.target.value }
                onChange({ ...g, conditions: next })
              }}
              disabled={!canEdit || c.op === 'is_set'}
              placeholder={c.op === 'in' ? 'a,b,c' : 'value'}
            />
            <Button
              type="button"
              disabled={!canEdit}
              onClick={() => {
                const next = g.conditions.filter((_, i) => i !== idx)
                onChange({ ...g, conditions: next })
              }}
            >
              Remove
            </Button>
          </div>
        ))}
      </div>
    )
  }

  if (!auth.user) {
    return (
      <div className="snPage">
        <Panel title="Form Designer">
          <div style={{ color: 'var(--muted)', fontSize: 14 }}>Please sign in.</div>
        </Panel>
      </div>
    )
  }

  return (
    <div className="snPage" style={{ maxWidth: 1400 }}>
      <div className="snRowWrap" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="snRowWrap">
          <Link to="/form-designer" className="snSubtle">
            ← Back to Forms
          </Link>
          <Badge tone="info">Form Designer</Badge>
          {form ? <Badge tone={form.status === 'PUBLISHED' ? 'success' : 'warning'}>{form.status}</Badge> : null}
          {form ? <Badge tone="neutral">v{form.version}</Badge> : null}
        </div>
        <div className="snRowWrap">
          <Button
            type="button"
            onClick={() => {
              setPreviewValues({})
              setIsPreviewOpen(true)
            }}
            disabled={isLoading}
          >
            Preview
          </Button>
          {canEdit ? (
            <Button type="button" onClick={() => void saveForm()} disabled={isSaving || isLoading} variant="primary">
              Save Form
            </Button>
          ) : null}
          {canEdit && form?.status !== 'PUBLISHED' ? (
            <Button type="button" onClick={() => void publishForm()} disabled={isSaving || isLoading}>
              Publish
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <Panel title="Error">
          <div style={{ color: 'rgba(255,255,255,0.84)' }}>{error}</div>
        </Panel>
      ) : null}

      <Panel title="Form">
        <div className="snGrid2">
          <label style={{ display: 'grid', gap: 6 }}>
            <span className="snSubtle">Form name</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit || isSaving} />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span className="snSubtle">Record type</span>
            <Select value={recordType} onChange={(e) => setRecordType(e.target.value as FormRecordType)} disabled={!canEdit || isSaving}>
              <option value="INCIDENT">Incident</option>
              <option value="SERVICE_REQUEST">Service Request</option>
              <option value="PROBLEM">Problem</option>
              <option value="CHANGE">Change</option>
              <option value="ASSET">Asset</option>
            </Select>
          </label>
          <label style={{ display: 'grid', gap: 6, gridColumn: '1 / -1' }}>
            <span className="snSubtle">Description</span>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} disabled={!canEdit || isSaving} />
          </label>
        </div>
      </Panel>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr 360px', gap: 12, alignItems: 'start' }}>
        <Panel title="Field Types">
          <div style={{ display: 'grid', gap: 10 }}>
            {fieldTypes.map((t) => (
              <Button key={t.type} type="button" onClick={() => addField(t.type)} disabled={!canEdit} className="snInput" style={{ textAlign: 'left' }}>
                {t.label}
              </Button>
            ))}
          </div>
        </Panel>

        <Panel
          title="Canvas"
          actions={
            <div className="snRowWrap">
              <Badge tone="neutral">{schema.sections.length} sections</Badge>
              <Badge tone="neutral">{totalFields} fields</Badge>
              {canEdit ? (
                <Button type="button" onClick={addSection}>
                  Add Section
                </Button>
              ) : null}
            </div>
          }
        >
          <Tabs
            value={tab}
            options={[
              { value: 'fields', label: 'Fields' },
              { value: 'workflows', label: 'Workflows' },
              { value: 'dependencies', label: 'Dependencies' },
              { value: 'analytics', label: 'Analytics' },
              { value: 'history', label: 'History' },
              { value: 'preview', label: 'Preview' },
            ]}
            onChange={setTab}
          />

          {tab === 'fields' ? (
            <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
              {schema.sections.map((s) => (
                <div
                  key={s.id}
                  style={{ border: '1px dashed rgba(255,255,255,0.10)', borderRadius: 16, padding: 12 }}
                  onDragOver={(e) => {
                    if (!canEdit) return
                    e.preventDefault()
                  }}
                  onDrop={() => {
                    if (!canEdit || !drag) return
                    moveField(drag.fieldId, drag.fromSectionId, s.id, null)
                    setDrag(null)
                  }}
                >
                  <div className="snRowWrap" style={{ justifyContent: 'space-between' }}>
                    <button
                      type="button"
                      onClick={() => setSelectedSectionId(s.id)}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: 'inherit',
                        fontWeight: 820,
                        cursor: 'pointer',
                      }}
                    >
                      {s.title}
                    </button>
                    <div className="snSubtle">{s.fields.length} fields</div>
                  </div>

                  <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
                    {s.fields.length === 0 ? (
                      <div style={{ color: 'var(--muted-2)', fontSize: 13, padding: 10, textAlign: 'center' }}>
                        Drag fields here or click a field type to add
                      </div>
                    ) : null}
                    {s.fields.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        draggable={canEdit}
                        onDragStart={() => setDrag({ fieldId: f.id, fromSectionId: s.id })}
                        onDragEnd={() => setDrag(null)}
                        onDragOver={(e) => {
                          if (!canEdit) return
                          e.preventDefault()
                        }}
                        onDrop={() => {
                          if (!canEdit || !drag) return
                          moveField(drag.fieldId, drag.fromSectionId, s.id, f.id)
                          setDrag(null)
                        }}
                        onClick={() => {
                          setSelectedFieldId(f.id)
                          setDrawerTab('basic')
                        }}
                        style={{
                          border: f.id === selectedFieldId ? '1px solid color-mix(in oklab, var(--primary) 35%, transparent)' : '1px solid rgba(255,255,255,0.06)',
                          background: 'rgba(255,255,255,0.02)',
                          borderRadius: 14,
                          padding: 12,
                          textAlign: 'left',
                          cursor: 'pointer',
                        }}
                      >
                        <div className="snRowWrap" style={{ justifyContent: 'space-between' }}>
                          <div style={{ fontWeight: 760 }}>{f.label}</div>
                          <Badge tone="neutral">{f.type}</Badge>
                        </div>
                        <div className="snSubtle" style={{ marginTop: 6 }}>
                          {f.name}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {tab !== 'fields' ? (
            <div style={{ marginTop: 12, color: 'var(--muted)', fontSize: 14, lineHeight: '20px' }}>
              This tab is scaffolded for ServiceNow-style configuration. Workflows, dependencies, analytics, and history can be implemented on top of the form schema.
            </div>
          ) : null}
        </Panel>

        <Panel title="Field Configuration">
          {!selected ? (
            <div style={{ color: 'var(--muted)', fontSize: 14 }}>Select a field to configure.</div>
          ) : (
            <>
              <Tabs
                value={drawerTab}
                options={[
                  { value: 'basic', label: 'Basic' },
                  { value: 'validation', label: 'Validation' },
                  { value: 'permissions', label: 'Permissions' },
                  { value: 'visibility', label: 'Visibility' },
                ]}
                onChange={setDrawerTab}
              />

              <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
                {drawerTab === 'basic' ? (
                  <>
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span className="snSubtle">Label</span>
                      <Input value={selected.field.label} onChange={(e) => updateSelectedField({ label: e.target.value })} disabled={!canEdit} />
                    </label>
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span className="snSubtle">Field name (schema)</span>
                      <Input value={selected.field.name} onChange={(e) => updateSelectedField({ name: e.target.value })} disabled={!canEdit} />
                    </label>
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span className="snSubtle">Description</span>
                      <Input value={selected.field.description ?? ''} onChange={(e) => updateSelectedField({ description: e.target.value })} disabled={!canEdit} />
                    </label>
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span className="snSubtle">Placeholder</span>
                      <Input value={selected.field.placeholder ?? ''} onChange={(e) => updateSelectedField({ placeholder: e.target.value })} disabled={!canEdit} />
                    </label>
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span className="snSubtle">Default value</span>
                      <Input value={selected.field.defaultValue ?? ''} onChange={(e) => updateSelectedField({ defaultValue: e.target.value })} disabled={!canEdit} />
                    </label>
                    <Panel title="Dynamic default (rules)">
                      <RuleGroupEditor value={selected.field.defaultWhen} onChange={(next) => updateSelectedField({ defaultWhen: next })} />
                    </Panel>
                  </>
                ) : null}

                {drawerTab === 'validation' ? (
                  <>
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span className="snSubtle">Required</span>
                      <Select
                        value={selected.field.required ? 'yes' : 'no'}
                        onChange={(e) => updateSelectedField({ required: e.target.value === 'yes' })}
                        disabled={!canEdit}
                      >
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                      </Select>
                    </label>
                    <Panel title="Conditional required (rules)">
                      <RuleGroupEditor value={selected.field.requiredWhen} onChange={(next) => updateSelectedField({ requiredWhen: next })} />
                    </Panel>
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span className="snSubtle">Maximum length</span>
                      <Input
                        value={selected.field.maxLength?.toString() ?? ''}
                        onChange={(e) => updateSelectedField({ maxLength: e.target.value ? Number(e.target.value) : undefined })}
                        disabled={!canEdit}
                      />
                    </label>
                    {(selected.field.type === 'option_set' || selected.field.type === 'multi_select' || selected.field.type === 'two_options') ? (
                      <label style={{ display: 'grid', gap: 6 }}>
                        <span className="snSubtle">Options (one per line)</span>
                        <Textarea
                          value={(selected.field.options ?? []).join('\n')}
                          onChange={(e) => updateSelectedField({ options: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean) })}
                          rows={6}
                          disabled={!canEdit}
                        />
                      </label>
                    ) : null}
                  </>
                ) : null}

                {drawerTab === 'permissions' ? (
                  <div style={{ color: 'var(--muted)', fontSize: 14, lineHeight: '20px' }}>
                    Field-level permissions can be enforced when forms are used to render ticket/create pages. This editor stores permission rules in the schema.
                  </div>
                ) : null}

                {drawerTab === 'visibility' ? (
                  <>
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span className="snSubtle">Visible</span>
                      <Select
                        value={selected.field.visible === false ? 'no' : 'yes'}
                        onChange={(e) => updateSelectedField({ visible: e.target.value === 'yes' })}
                        disabled={!canEdit}
                      >
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </Select>
                    </label>
                    <Panel title="Conditional visibility (rules)">
                      <RuleGroupEditor value={selected.field.visibleWhen} onChange={(next) => updateSelectedField({ visibleWhen: next })} />
                    </Panel>
                  </>
                ) : null}

                <div className="snRowWrap" style={{ justifyContent: 'space-between', marginTop: 6 }}>
                  <div className="snSubtle">Type: {selected.field.type}</div>
                  {canEdit ? (
                    <Button type="button" variant="danger" onClick={removeSelectedField}>
                      Remove
                    </Button>
                  ) : null}
                </div>
              </div>
            </>
          )}
        </Panel>
      </div>

      <Modal title="Live Preview" isOpen={isPreviewOpen} onClose={() => setIsPreviewOpen(false)}>
        <div style={{ display: 'grid', gap: 12 }}>
          <div className="snSubtle">Preview renders the current in-memory schema.</div>
          {schema.sections.map((s) => (
            <div key={s.id} style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 12 }}>
              <div style={{ fontWeight: 780 }}>{s.title}</div>
              <div style={{ marginTop: 10, display: 'grid', gap: 12 }}>
                {s.fields
                  .filter((f) => {
                    if (f.visible === false) return false
                    const g = ensureRuleGroup(f.visibleWhen)
                    if (g.conditions.length === 0) return true
                    return evalRuleGroup(f.visibleWhen, previewValues)
                  })
                  .map((f) => {
                    const req = ensureRuleGroup(f.requiredWhen)
                    const required = Boolean(f.required) || (req.conditions.length > 0 && evalRuleGroup(f.requiredWhen, previewValues))
                    const value = previewValues[f.name] ?? ''
                    const showError = required && value.trim().length === 0

                    const setValue = (v: string) => setPreviewValues((prev) => ({ ...prev, [f.name]: v }))

                    const input =
                      f.type === 'multiline' ? (
                        <textarea className="snInput" rows={4} placeholder={f.placeholder} value={value} onChange={(e) => setValue(e.target.value)} />
                      ) : f.type === 'email' ? (
                        <input className="snInput" type="email" placeholder={f.placeholder} value={value} onChange={(e) => setValue(e.target.value)} />
                      ) : f.type === 'number' || f.type === 'decimal' ? (
                        <input className="snInput" type="number" placeholder={f.placeholder} value={value} onChange={(e) => setValue(e.target.value)} />
                      ) : f.type === 'date' ? (
                        <input className="snInput" type="date" value={value} onChange={(e) => setValue(e.target.value)} />
                      ) : f.type === 'checkbox' ? (
                        <label className="snRow" style={{ gap: 10 }}>
                          <input type="checkbox" checked={value === 'true'} onChange={(e) => setValue(e.target.checked ? 'true' : '')} />
                          <span className="snSubtle">{f.placeholder || 'Enabled'}</span>
                        </label>
                      ) : f.type === 'option_set' ? (
                        <select className="snSelect" value={value} onChange={(e) => setValue(e.target.value)}>
                          <option value="">Select…</option>
                          {(f.options ?? []).map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </select>
                      ) : f.type === 'two_options' ? (
                        <div className="snRowWrap">
                          {(f.options ?? ['Yes', 'No']).slice(0, 2).map((o) => (
                            <label key={o} className="snRow" style={{ gap: 8 }}>
                              <input type="radio" checked={value === o} onChange={() => setValue(o)} />
                              <span className="snSubtle">{o}</span>
                            </label>
                          ))}
                        </div>
                      ) : f.type === 'multi_select' ? (
                        <textarea
                          className="snInput"
                          rows={3}
                          placeholder="Comma-separated…"
                          value={value}
                          onChange={(e) => setValue(e.target.value)}
                        />
                      ) : f.type === 'lookup' ? (
                        <input className="snInput" placeholder="Search…" value={value} onChange={(e) => setValue(e.target.value)} />
                      ) : (
                        <input className="snInput" placeholder={f.placeholder} value={value} onChange={(e) => setValue(e.target.value)} />
                      )

                    return (
                      <div key={f.id} style={{ display: 'grid', gap: 6 }}>
                        <div className="snRowWrap" style={{ justifyContent: 'space-between' }}>
                          <span style={{ fontWeight: 720 }}>{f.label}</span>
                          {required ? <Badge tone={showError ? 'danger' : 'warning'}>{showError ? 'Required (missing)' : 'Required'}</Badge> : null}
                        </div>
                        {input}
                        {f.description ? <div className="snSubtle">{f.description}</div> : null}
                      </div>
                    )
                  })}
                {s.fields.filter((f) => f.visible !== false).length === 0 ? (
                  <div style={{ color: 'var(--muted)' }}>No visible fields.</div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  )
}
