/**
 * Reusable configuration manager for admin-maintained master data.
 *
 * Uses backend ConfigNamespace/ConfigEntry tables so labels/rules/options are not hardcoded.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../../../api'
import { useAuth } from '../../../auth/useAuth'
import type { ConfigEntry, ConfigNamespace } from '../../../itsmTypes'
import { Badge, Button, Input, Modal, Panel, Select, Textarea } from '../../../components/ui'

function safeJsonParse(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw) as unknown
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
    return {}
  } catch {
    return {}
  }
}

export function ConfigManager({ canConfigure }: { canConfigure: boolean }) {
  const auth = useAuth()
  const [namespaces, setNamespaces] = useState<ConfigNamespace[]>([])
  const [activeKey, setActiveKey] = useState('')
  const [entries, setEntries] = useState<ConfigEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [isNamespaceOpen, setIsNamespaceOpen] = useState(false)
  const [nsKey, setNsKey] = useState('')
  const [nsName, setNsName] = useState('')
  const [nsDesc, setNsDesc] = useState('')

  const [isEntryOpen, setIsEntryOpen] = useState(false)
  const [editEntryId, setEditEntryId] = useState<string | null>(null)
  const [entryKey, setEntryKey] = useState('')
  const [entryLabel, setEntryLabel] = useState('')
  const [entryDesc, setEntryDesc] = useState('')
  const [entryOrder, setEntryOrder] = useState(100)
  const [entryActive, setEntryActive] = useState(true)
  const [entryValueJson, setEntryValueJson] = useState('{}')

  const activeNamespace = useMemo(() => namespaces.find((n) => n.key === activeKey) || null, [activeKey, namespaces])

  const loadNamespaces = useCallback(async () => {
    if (!auth.accessToken) return
    setError(null)
    setIsLoading(true)
    try {
      const data = await apiFetch<ConfigNamespace[]>('/api/config/namespaces/', { token: auth.accessToken })
      setNamespaces(data)
      if (!activeKey && data.length > 0) setActiveKey(data[0].key)
    } catch {
      setError('Failed to load configuration namespaces')
    } finally {
      setIsLoading(false)
    }
  }, [activeKey, auth.accessToken])

  const loadEntries = useCallback(async () => {
    if (!auth.accessToken) return
    if (!activeKey) return
    setError(null)
    setIsLoading(true)
    try {
      const data = await apiFetch<ConfigEntry[]>(`/api/config/entries/?namespace_key=${encodeURIComponent(activeKey)}`, {
        token: auth.accessToken,
      })
      setEntries(data)
    } catch {
      setError('Failed to load configuration entries')
    } finally {
      setIsLoading(false)
    }
  }, [activeKey, auth.accessToken])

  useEffect(() => {
    void loadNamespaces()
  }, [loadNamespaces])

  useEffect(() => {
    void loadEntries()
  }, [loadEntries])

  const openNewNamespace = () => {
    setNsKey('')
    setNsName('')
    setNsDesc('')
    setIsNamespaceOpen(true)
  }

  const openNewEntry = () => {
    setEditEntryId(null)
    setEntryKey('')
    setEntryLabel('')
    setEntryDesc('')
    setEntryOrder(100)
    setEntryActive(true)
    setEntryValueJson('{}')
    setIsEntryOpen(true)
  }

  const openEditEntry = (e: ConfigEntry) => {
    setEditEntryId(e.id)
    setEntryKey(e.key)
    setEntryLabel(e.label)
    setEntryDesc(e.description || '')
    setEntryOrder(e.sort_order)
    setEntryActive(e.is_active)
    setEntryValueJson(JSON.stringify(e.value ?? {}, null, 2))
    setIsEntryOpen(true)
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {error ? (
        <Panel title="Error">
          <div style={{ color: 'rgba(255,255,255,0.84)' }}>{error}</div>
        </Panel>
      ) : null}

      <Panel
        title="Configuration Catalog"
        actions={
          <div className="snRowWrap">
            <Button type="button" onClick={() => void loadNamespaces()} disabled={isLoading}>
              Refresh
            </Button>
            {canConfigure ? (
              <Button type="button" variant="primary" onClick={openNewNamespace}>
                New Namespace
              </Button>
            ) : null}
          </div>
        }
      >
        <div className="snRowWrap" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'grid', gap: 6 }}>
            <div className="snSubtle">Pick a namespace to manage its entries.</div>
            <div className="snRowWrap">
              <Select value={activeKey} onChange={(e) => setActiveKey(e.target.value)} style={{ minWidth: 260 }}>
                {namespaces.map((n) => (
                  <option key={n.id} value={n.key}>
                    {n.name} ({n.key})
                  </option>
                ))}
              </Select>
              {activeNamespace ? <Badge tone={activeNamespace.is_active ? 'success' : 'neutral'}>{activeNamespace.is_active ? 'Active' : 'Inactive'}</Badge> : null}
            </div>
          </div>

          {canConfigure ? (
            <Button type="button" variant="primary" onClick={openNewEntry} disabled={!activeKey}>
              New Entry
            </Button>
          ) : null}
        </div>
      </Panel>

      <Panel title="Entries" actions={<Badge tone="neutral">{entries.length}</Badge>}>
        {isLoading ? <div className="snSubtle">Loading…</div> : null}
        {!isLoading && entries.length === 0 ? <div className="snSubtle">No entries.</div> : null}
        {!isLoading && entries.length > 0 ? (
          <table className="snTable">
            <thead>
              <tr>
                <th>Key</th>
                <th>Label</th>
                <th>Order</th>
                <th>Status</th>
                <th>Updated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td style={{ fontWeight: 740 }}>{e.key}</td>
                  <td>{e.label}</td>
                  <td className="snSubtle">{e.sort_order}</td>
                  <td>
                    <Badge tone={e.is_active ? 'success' : 'neutral'}>{e.is_active ? 'Active' : 'Inactive'}</Badge>
                  </td>
                  <td className="snSubtle">{new Date(e.updated_at).toLocaleString()}</td>
                  <td style={{ textAlign: 'right' }}>
                    {canConfigure ? (
                      <Button type="button" onClick={() => openEditEntry(e)}>
                        Edit
                      </Button>
                    ) : (
                      <span className="snSubtle">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </Panel>

      <Modal title="New Namespace" isOpen={isNamespaceOpen} onClose={() => setIsNamespaceOpen(false)}>
        <form
          onSubmit={async (ev) => {
            ev.preventDefault()
            if (!auth.accessToken || !canConfigure) return
            setError(null)
            try {
              await apiFetch('/api/config/namespaces/', {
                method: 'POST',
                token: auth.accessToken,
                body: JSON.stringify({ key: nsKey.trim(), name: nsName.trim(), description: nsDesc }),
              })
              setIsNamespaceOpen(false)
              await loadNamespaces()
            } catch {
              setError('Failed to create namespace')
            }
          }}
          style={{ display: 'grid', gap: 12 }}
        >
          <label style={{ display: 'grid', gap: 6 }}>
            Key
            <Input value={nsKey} onChange={(e) => setNsKey(e.target.value)} placeholder="e.g., ticket_categories" required />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            Name
            <Input value={nsName} onChange={(e) => setNsName(e.target.value)} placeholder="Human readable name" required />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            Description
            <Textarea value={nsDesc} onChange={(e) => setNsDesc(e.target.value)} rows={3} />
          </label>
          <div className="snRowWrap" style={{ justifyContent: 'flex-end' }}>
            <Button type="button" onClick={() => setIsNamespaceOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Create
            </Button>
          </div>
        </form>
      </Modal>

      <Modal title={editEntryId ? 'Edit Entry' : 'New Entry'} isOpen={isEntryOpen} onClose={() => setIsEntryOpen(false)}>
        <form
          onSubmit={async (ev) => {
            ev.preventDefault()
            if (!auth.accessToken || !canConfigure) return
            setError(null)
            try {
              const payload = {
                namespace_id: activeNamespace?.id,
                key: entryKey.trim(),
                label: entryLabel.trim(),
                description: entryDesc,
                sort_order: entryOrder,
                is_active: entryActive,
                value: safeJsonParse(entryValueJson),
              }
              if (!payload.namespace_id) throw new Error('Missing namespace')
              if (editEntryId) {
                await apiFetch(`/api/config/entries/${editEntryId}/`, {
                  method: 'PATCH',
                  token: auth.accessToken,
                  body: JSON.stringify(payload),
                })
              } else {
                await apiFetch('/api/config/entries/', {
                  method: 'POST',
                  token: auth.accessToken,
                  body: JSON.stringify(payload),
                })
              }
              setIsEntryOpen(false)
              await loadEntries()
            } catch {
              setError('Failed to save entry')
            }
          }}
          style={{ display: 'grid', gap: 12 }}
        >
          <div className="snGrid2">
            <label style={{ display: 'grid', gap: 6 }}>
              Key
              <Input value={entryKey} onChange={(e) => setEntryKey(e.target.value)} required />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              Label
              <Input value={entryLabel} onChange={(e) => setEntryLabel(e.target.value)} required />
            </label>
          </div>
          <div className="snGrid2">
            <label style={{ display: 'grid', gap: 6 }}>
              Sort order
              <Input type="number" value={String(entryOrder)} onChange={(e) => setEntryOrder(Number(e.target.value || 0))} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              Active
              <Select value={entryActive ? '1' : '0'} onChange={(e) => setEntryActive(e.target.value === '1')}>
                <option value="1">Active</option>
                <option value="0">Inactive</option>
              </Select>
            </label>
          </div>
          <label style={{ display: 'grid', gap: 6 }}>
            Description
            <Textarea value={entryDesc} onChange={(e) => setEntryDesc(e.target.value)} rows={2} />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            Value (JSON)
            <Textarea value={entryValueJson} onChange={(e) => setEntryValueJson(e.target.value)} rows={8} />
          </label>
          <div className="snRowWrap" style={{ justifyContent: 'flex-end' }}>
            <Button type="button" onClick={() => setIsEntryOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Save
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

