import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../api'
import { useAuth } from '../auth/useAuth'
import type { CatalogItem, CatalogRequest } from '../itsmTypes'
import { Badge, Button, Input, Modal, Panel } from '../components/ui'
import { isPrivileged } from '../auth/roles'

export function ServiceCatalogPage() {
  const auth = useAuth()
  const [items, setItems] = useState<CatalogItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const [active, setActive] = useState<CatalogItem | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [details, setDetails] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [isNewOpen, setIsNewOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [newApproval, setNewApproval] = useState(false)
  const [newDescription, setNewDescription] = useState('')
  const [newFulfillment, setNewFulfillment] = useState('')

  const load = useCallback(async () => {
    if (!auth.accessToken) return
    setIsLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams()
      if (search) qs.set('search', search)
      const path = qs.toString() ? `/api/catalog/items/?${qs.toString()}` : '/api/catalog/items/'
      const data = await apiFetch<CatalogItem[]>(path, { token: auth.accessToken })
      setItems(data)
    } catch {
      setError('Failed to load catalog')
    } finally {
      setIsLoading(false)
    }
  }, [auth.accessToken, search])

  useEffect(() => {
    void load()
  }, [load])

  const grouped = useMemo(() => {
    const map = new Map<string, CatalogItem[]>()
    for (const i of items) {
      const key = i.category || 'General'
      const list = map.get(key) ?? []
      list.push(i)
      map.set(key, list)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [items])

  return (
    <div className="snPage">
      <div className="snRowWrap" style={{ justifyContent: 'space-between', alignItems: 'end' }}>
        <div style={{ display: 'grid', gap: 4 }}>
          <h1 className="snH1">Service Catalog</h1>
          <div className="snSubtle">Self‑service requests with approvals and fulfillment tracking.</div>
        </div>
        <div className="snRowWrap">
          <div style={{ width: 320, maxWidth: '60vw' }}>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search catalog…"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void load()
              }}
            />
          </div>
          <Button type="button" onClick={() => void load()} disabled={isLoading}>
            Search
          </Button>
          {isPrivileged(auth.user) ? (
            <Button
              type="button"
              variant="primary"
              onClick={() => {
                setNewName('')
                setNewCategory('')
                setNewApproval(false)
                setNewDescription('')
                setNewFulfillment('')
                setIsNewOpen(true)
              }}
            >
              New Item
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <Panel title="Error">
          <div style={{ color: 'rgba(255,255,255,0.84)' }}>{error}</div>
        </Panel>
      ) : null}

      <Panel title="Catalog">
        {isLoading ? <div style={{ color: 'var(--muted)' }}>Loading…</div> : null}
        {!isLoading && items.length === 0 ? <div style={{ color: 'var(--muted)' }}>No items found.</div> : null}

        {!isLoading ? (
          <div style={{ display: 'grid', gap: 16 }}>
            {grouped.map(([category, list]) => (
              <div key={category} style={{ display: 'grid', gap: 10 }}>
                <div style={{ fontWeight: 780 }}>{category}</div>
                <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
                  {list.map((i) => (
                    <button
                      key={i.id}
                      type="button"
                      className="snPanel"
                      style={{ padding: 14, textAlign: 'left', cursor: 'pointer' }}
                      onClick={() => {
                        setActive(i)
                        setDetails('')
                        setIsOpen(true)
                      }}
                    >
                      <div className="snRowWrap" style={{ justifyContent: 'space-between' }}>
                        <div style={{ fontWeight: 820, letterSpacing: -0.2 }}>{i.name}</div>
                        <Badge tone={i.requires_approval ? 'warning' : 'success'}>
                          {i.requires_approval ? 'Approval' : 'Auto'}
                        </Badge>
                      </div>
                      <div className="snSubtle" style={{ marginTop: 6 }}>
                        {i.description || '—'}
                      </div>
                      <div className="snRowWrap" style={{ marginTop: 10 }}>
                        {i.form ? <Badge tone="info">Form: {i.form.name}</Badge> : <Badge tone="neutral">No form</Badge>}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </Panel>

      <Modal
        title={active ? `Request · ${active.name}` : 'Request'}
        isOpen={isOpen}
        onClose={() => {
          setIsOpen(false)
          setActive(null)
        }}
      >
        {active ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <div className="snRowWrap">
              <Badge tone={active.requires_approval ? 'warning' : 'success'}>
                {active.requires_approval ? 'Approval required' : 'Auto-fulfillment'}
              </Badge>
              {active.category ? <Badge tone="info">{active.category}</Badge> : null}
            </div>

            <div style={{ color: 'var(--muted)', fontSize: 14, lineHeight: '20px' }}>{active.description || '—'}</div>

            <label style={{ display: 'grid', gap: 6 }}>
              <span className="snSubtle">Request details</span>
              <textarea className="snInput" rows={6} value={details} onChange={(e) => setDetails(e.target.value)} />
            </label>

            <div className="snRowWrap" style={{ justifyContent: 'space-between' }}>
              <div className="snSubtle">You can track this request under My Requests.</div>
              <div className="snRowWrap">
                <Button type="button" onClick={() => setIsOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  disabled={isSubmitting}
                  onClick={async () => {
                    if (!auth.accessToken) return
                    setIsSubmitting(true)
                    setError(null)
                    try {
                      await apiFetch<CatalogRequest>('/api/catalog/requests/', {
                        method: 'POST',
                        token: auth.accessToken,
                        body: JSON.stringify({ item_id: active.id, variables: { details } }),
                      })
                      setIsOpen(false)
                      setActive(null)
                    } catch {
                      setError('Failed to submit request')
                    } finally {
                      setIsSubmitting(false)
                    }
                  }}
                >
                  Submit
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal title="New Catalog Item" isOpen={isNewOpen} onClose={() => setIsNewOpen(false)}>
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (!auth.accessToken) return
            setIsSubmitting(true)
            setError(null)
            try {
              await apiFetch<CatalogItem>('/api/catalog/items/', {
                method: 'POST',
                token: auth.accessToken,
                body: JSON.stringify({
                  name: newName,
                  category: newCategory,
                  requires_approval: newApproval,
                  description: newDescription,
                  fulfillment_instructions: newFulfillment,
                  is_active: true,
                }),
              })
              setIsNewOpen(false)
              await load()
            } catch {
              setError('Failed to create catalog item')
            } finally {
              setIsSubmitting(false)
            }
          }}
          style={{ display: 'grid', gap: 12 }}
        >
          <label style={{ display: 'grid', gap: 6 }}>
            Name
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} required />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            Category
            <Input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} />
          </label>
          <label className="snRow" style={{ gap: 10, justifyContent: 'space-between' }}>
            <span className="snSubtle">Requires approval</span>
            <input type="checkbox" checked={newApproval} onChange={(e) => setNewApproval(e.target.checked)} />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            Description
            <textarea className="snInput" rows={4} value={newDescription} onChange={(e) => setNewDescription(e.target.value)} />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            Fulfillment instructions
            <textarea className="snInput" rows={4} value={newFulfillment} onChange={(e) => setNewFulfillment(e.target.value)} />
          </label>
          <div className="snRowWrap" style={{ justifyContent: 'flex-end' }}>
            <Button type="button" onClick={() => setIsNewOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              Create
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
