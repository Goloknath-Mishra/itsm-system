import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../api'
import { useAuth } from '../auth/useAuth'
import type { Asset } from '../itsmTypes'
import { Badge, Button, Input, Modal, Panel, Select } from '../components/ui'
import { isAgent } from '../auth/roles'

export function AssetsPage() {
  const auth = useAuth()

  const [assets, setAssets] = useState<Asset[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<Asset['status'] | ''>('')

  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [assetTag, setAssetTag] = useState('')
  const [name, setName] = useState('')
  const [assetStatus, setAssetStatus] = useState<Asset['status']>('IN_STOCK')
  const [vendor, setVendor] = useState('')
  const [model, setModel] = useState('')
  const [serialNumber, setSerialNumber] = useState('')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')

  const [activeAsset, setActiveAsset] = useState<Asset | null>(null)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [editAssetTag, setEditAssetTag] = useState('')
  const [editName, setEditName] = useState('')
  const [editStatus, setEditStatus] = useState<Asset['status']>('IN_STOCK')
  const [editVendor, setEditVendor] = useState('')
  const [editModel, setEditModel] = useState('')
  const [editSerialNumber, setEditSerialNumber] = useState('')
  const [editLocation, setEditLocation] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const load = useCallback(async () => {
    if (!auth.accessToken) {
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams()
      if (status) qs.set('status', status)
      if (search) qs.set('search', search)
      const path = qs.toString() ? `/api/assets/?${qs.toString()}` : '/api/assets/'
      const data = await apiFetch<Asset[]>(path, { token: auth.accessToken })
      setAssets(data)
    } catch {
      setError('Failed to load assets (agents only)')
    } finally {
      setIsLoading(false)
    }
  }, [auth.accessToken, search, status])

  useEffect(() => {
    void load()
  }, [load])

  const canCreate = isAgent(auth.user)

  const statusOptions = useMemo(
    () => [
      { value: '' as const, label: 'All status' },
      { value: 'IN_STOCK' as const, label: 'In Stock' },
      { value: 'IN_USE' as const, label: 'In Use' },
      { value: 'UNDER_REPAIR' as const, label: 'Under Repair' },
      { value: 'RETIRED' as const, label: 'Retired' },
    ],
    [],
  )

  if (!auth.user) {
    return (
      <div className="snPage">
        <Panel title="IT Assets">
          <div style={{ color: 'var(--muted)', fontSize: 14 }}>
            Please <Link to="/login">sign in</Link>.
          </div>
        </Panel>
      </div>
    )
  }

  return (
    <div className="snPage">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'grid', gap: 4 }}>
          <h1 className="snH1">IT Assets</h1>
          <div className="snSubtle">Track inventory, ownership, and lifecycle state.</div>
        </div>
        <div className="snRowWrap">
          <Button type="button" onClick={() => void load()} disabled={isLoading}>
            Refresh
          </Button>
          {canCreate ? (
            <Link to="/assets/scanner">
              <Button type="button">Scan</Button>
            </Link>
          ) : null}
          {canCreate ? (
            <Link to="/assets/analytics">
              <Button type="button">Analytics</Button>
            </Link>
          ) : null}
          {canCreate ? (
            <Button type="button" variant="primary" onClick={() => setIsCreateOpen(true)}>
              New Asset
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <Panel title="Error">
          <div style={{ color: 'rgba(255,255,255,0.84)' }}>{error}</div>
        </Panel>
      ) : null}

      <Panel
        title="Register"
        actions={
          <div className="snRowWrap">
            <div style={{ width: 280 }}>
              <Input
                placeholder="Search assets…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void load()
                }}
              />
            </div>
            <Select value={status} onChange={(e) => setStatus(e.target.value as Asset['status'] | '')}>
              {statusOptions.map((o) => (
                <option key={o.value || 'all'} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
            <Button type="button" onClick={() => void load()}>
              Apply
            </Button>
          </div>
        }
      >
        {isLoading ? <div style={{ color: 'var(--muted)' }}>Loading…</div> : null}
        {!isLoading ? (
          <table className="snTable">
            <thead>
              <tr>
                <th>Tag</th>
                <th>Name</th>
                <th>Status</th>
                <th>Owner</th>
                <th>Location</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => (
                <tr
                  key={a.id}
                  onClick={() => {
                    setActiveAsset(a)
                    setEditAssetTag(a.asset_tag)
                    setEditName(a.name)
                    setEditStatus(a.status)
                    setEditVendor(a.vendor || '')
                    setEditModel(a.model || '')
                    setEditSerialNumber(a.serial_number || '')
                    setEditLocation(a.location || '')
                    setEditDescription(a.description || '')
                    setIsEditOpen(true)
                  }}
                  style={{ cursor: canCreate ? 'pointer' : 'default' }}
                >
                  <td style={{ fontWeight: 720 }}>{a.asset_tag}</td>
                  <td>{a.name}</td>
                  <td>
                    <Badge
                      tone={
                        a.status === 'IN_USE'
                          ? 'success'
                          : a.status === 'IN_STOCK'
                            ? 'info'
                            : a.status === 'UNDER_REPAIR'
                              ? 'warning'
                              : 'neutral'
                      }
                    >
                      {a.status}
                    </Badge>
                  </td>
                  <td className="snSubtle">{a.owner ? a.owner.username : '—'}</td>
                  <td className="snSubtle">{a.location || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {!isLoading && assets.length === 0 ? <div style={{ color: 'var(--muted)' }}>No assets found.</div> : null}
      </Panel>

      <Modal title="New Asset" isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)}>
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (!auth.accessToken) return
            setError(null)
            try {
              await apiFetch<Asset>('/api/assets/', {
                method: 'POST',
                token: auth.accessToken,
                body: JSON.stringify({
                  asset_tag: assetTag,
                  name,
                  status: assetStatus,
                  vendor,
                  model,
                  serial_number: serialNumber,
                  location,
                  description,
                }),
              })
              setIsCreateOpen(false)
              setAssetTag('')
              setName('')
              setAssetStatus('IN_STOCK')
              setVendor('')
              setModel('')
              setSerialNumber('')
              setLocation('')
              setDescription('')
              await load()
            } catch {
              setError('Failed to create asset')
            }
          }}
          style={{ display: 'grid', gap: 12 }}
        >
          <div className="snRowWrap">
            <label style={{ display: 'grid', gap: 6, flex: '1 1 220px' }}>
              Asset tag
              <Input value={assetTag} onChange={(e) => setAssetTag(e.target.value)} required />
            </label>
            <label style={{ display: 'grid', gap: 6, flex: '1 1 220px' }}>
              Status
              <Select value={assetStatus} onChange={(e) => setAssetStatus(e.target.value as Asset['status'])}>
                <option value="IN_STOCK">In Stock</option>
                <option value="IN_USE">In Use</option>
                <option value="UNDER_REPAIR">Under Repair</option>
                <option value="RETIRED">Retired</option>
              </Select>
            </label>
          </div>
          <label style={{ display: 'grid', gap: 6 }}>
            Name
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <div className="snRowWrap">
            <label style={{ display: 'grid', gap: 6, flex: '1 1 220px' }}>
              Vendor
              <Input value={vendor} onChange={(e) => setVendor(e.target.value)} />
            </label>
            <label style={{ display: 'grid', gap: 6, flex: '1 1 220px' }}>
              Model
              <Input value={model} onChange={(e) => setModel(e.target.value)} />
            </label>
          </div>
          <div className="snRowWrap">
            <label style={{ display: 'grid', gap: 6, flex: '1 1 220px' }}>
              Serial number
              <Input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} />
            </label>
            <label style={{ display: 'grid', gap: 6, flex: '1 1 220px' }}>
              Location
              <Input value={location} onChange={(e) => setLocation(e.target.value)} />
            </label>
          </div>
          <label style={{ display: 'grid', gap: 6 }}>
            Description
            <textarea className="snInput" value={description} onChange={(e) => setDescription(e.target.value)} rows={5} />
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

      <Modal
        title={activeAsset ? `Asset · ${activeAsset.asset_tag}` : 'Asset'}
        isOpen={isEditOpen}
        onClose={() => {
          setIsEditOpen(false)
          setActiveAsset(null)
        }}
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (!auth.accessToken || !activeAsset) return
            if (!canCreate) return
            setIsSaving(true)
            setError(null)
            try {
              await apiFetch<Asset>(`/api/assets/${activeAsset.id}/`, {
                method: 'PATCH',
                token: auth.accessToken,
                body: JSON.stringify({
                  asset_tag: editAssetTag,
                  name: editName,
                  status: editStatus,
                  vendor: editVendor,
                  model: editModel,
                  serial_number: editSerialNumber,
                  location: editLocation,
                  description: editDescription,
                }),
              })
              setIsEditOpen(false)
              setActiveAsset(null)
              await load()
            } catch {
              setError('Failed to update asset')
            } finally {
              setIsSaving(false)
            }
          }}
          style={{ display: 'grid', gap: 12 }}
        >
          <div className="snRowWrap">
            <label style={{ display: 'grid', gap: 6, flex: '1 1 220px' }}>
              Asset tag
              <Input value={editAssetTag} onChange={(e) => setEditAssetTag(e.target.value)} disabled={!canCreate || isSaving} />
            </label>
            <label style={{ display: 'grid', gap: 6, flex: '1 1 220px' }}>
              Status
              <Select value={editStatus} onChange={(e) => setEditStatus(e.target.value as Asset['status'])} disabled={!canCreate || isSaving}>
                <option value="IN_STOCK">In Stock</option>
                <option value="IN_USE">In Use</option>
                <option value="UNDER_REPAIR">Under Repair</option>
                <option value="RETIRED">Retired</option>
              </Select>
            </label>
          </div>
          <label style={{ display: 'grid', gap: 6 }}>
            Name
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} disabled={!canCreate || isSaving} />
          </label>
          <div className="snRowWrap">
            <label style={{ display: 'grid', gap: 6, flex: '1 1 220px' }}>
              Vendor
              <Input value={editVendor} onChange={(e) => setEditVendor(e.target.value)} disabled={!canCreate || isSaving} />
            </label>
            <label style={{ display: 'grid', gap: 6, flex: '1 1 220px' }}>
              Model
              <Input value={editModel} onChange={(e) => setEditModel(e.target.value)} disabled={!canCreate || isSaving} />
            </label>
          </div>
          <div className="snRowWrap">
            <label style={{ display: 'grid', gap: 6, flex: '1 1 220px' }}>
              Serial number
              <Input value={editSerialNumber} onChange={(e) => setEditSerialNumber(e.target.value)} disabled={!canCreate || isSaving} />
            </label>
            <label style={{ display: 'grid', gap: 6, flex: '1 1 220px' }}>
              Location
              <Input value={editLocation} onChange={(e) => setEditLocation(e.target.value)} disabled={!canCreate || isSaving} />
            </label>
          </div>
          <label style={{ display: 'grid', gap: 6 }}>
            Description
            <textarea className="snInput" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={6} disabled={!canCreate || isSaving} />
          </label>

          <div className="snRowWrap" style={{ justifyContent: 'space-between' }}>
            <div className="snSubtle">{canCreate ? 'Edit and maintain asset records.' : 'Read-only access.'}</div>
            <div className="snRowWrap">
              <Button
                type="button"
                onClick={() => {
                  setIsEditOpen(false)
                  setActiveAsset(null)
                }}
              >
                Close
              </Button>
              {canCreate ? (
                <Button type="submit" variant="primary" disabled={isSaving}>
                  Save
                </Button>
              ) : null}
            </div>
          </div>
        </form>
      </Modal>
    </div>
  )
}
