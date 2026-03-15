import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../api'
import { useAuth } from '../auth/useAuth'
import { useNavigate } from 'react-router-dom'
import { Avatar, Badge, Button, Input, Panel, Select, Tabs, Textarea } from '../components/ui'
import { usePreferences } from '../preferences/usePreferences'
import type { BarcodeTemplate, CatalogItem, ReportSchedule, Reward, SlaPolicy, SystemSetting, Team, TicketNumberConfig } from '../itsmTypes'
import { isPrivileged } from '../auth/roles'
import { ConfigManager } from '../features/admin/components/ConfigManager'

type SettingsTab =
  | 'profile'
  | 'form-designer'
  | 'master-data'
  | 'auto-number'
  | 'barcodes'
  | 'sla'
  | 'gamification'
  | 'ai-agents'
  | 'workflows'
  | 'export'
  | 'notifications'
  | 'access'
  | 'appearance'
  | 'security'

export function SettingsPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState<SettingsTab>('profile')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canConfigure = isPrivileged(auth.user)

  const tabs = useMemo(() => {
    const base = [
      { value: 'profile' as const, label: 'Profile' },
      { value: 'notifications' as const, label: 'Notifications' },
      { value: 'appearance' as const, label: 'Appearance' },
      { value: 'security' as const, label: 'Security' },
    ]
    if (!canConfigure) return base
    return [
      ...base.slice(0, 1),
      { value: 'access' as const, label: 'Access' },
      { value: 'master-data' as const, label: 'Master Data' },
      { value: 'form-designer' as const, label: 'Form Designer' },
      { value: 'auto-number' as const, label: 'Auto-Number' },
      { value: 'barcodes' as const, label: 'Barcodes' },
      { value: 'sla' as const, label: 'SLA Config' },
      { value: 'gamification' as const, label: 'Gamification' },
      { value: 'ai-agents' as const, label: 'AI Agents' },
      { value: 'workflows' as const, label: 'Workflows' },
      { value: 'export' as const, label: 'Export Schedules' },
      ...base.slice(1),
    ]
  }, [canConfigure])

  return (
    <div className="snPage">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'grid', gap: 4 }}>
          <h1 className="snH1">Settings</h1>
          <div className="snSubtle">Manage your account preferences and ITSM configurations.</div>
        </div>
        <div className="snRowWrap">
          <Badge tone={canConfigure ? 'info' : 'warning'}>{canConfigure ? 'Admin mode' : 'Limited access'}</Badge>
          <Button type="button" variant="primary" disabled={isSaving}>
            Save Changes
          </Button>
        </div>
      </div>

      {error ? (
        <Panel title="Error">
          <div style={{ color: 'rgba(255,255,255,0.84)' }}>{error}</div>
        </Panel>
      ) : null}

      <Panel
        title="Configuration"
        actions={
          <div className="snRowWrap">
            <Tabs value={tab} options={tabs} onChange={setTab} />
          </div>
        }
      >
        {tab === 'profile' ? (
          <ProfileSection
            isSaving={isSaving}
            onSave={async (payload) => {
              if (!auth.accessToken) return
              setIsSaving(true)
              setError(null)
              try {
                await apiFetch('/api/me/', { method: 'PATCH', token: auth.accessToken, body: JSON.stringify(payload) })
                await auth.refreshMe()
              } catch {
                setError('Failed to save profile')
              } finally {
                setIsSaving(false)
              }
            }}
          />
        ) : null}
        {tab === 'notifications' ? (
          <div style={{ display: 'grid', gap: 18 }}>
            <NotificationsSection />
            <GlobalNotificationsSection canConfigure={canConfigure} />
          </div>
        ) : null}
        {tab === 'access' ? <AccessManagementSection canConfigure={canConfigure} /> : null}
        {tab === 'master-data' ? <ConfigManager canConfigure={canConfigure} /> : null}
        {tab === 'auto-number' ? <AutoNumberSection canConfigure={canConfigure} /> : null}
        {tab === 'barcodes' ? <BarcodesSection canConfigure={canConfigure} /> : null}
        {tab === 'sla' ? <SlaConfigSection canConfigure={canConfigure} /> : null}
        {tab === 'gamification' ? <GamificationConfigSection canConfigure={canConfigure} /> : null}
        {tab === 'ai-agents' ? <AIAgentsConfigSection canConfigure={canConfigure} /> : null}
        {tab === 'workflows' ? <WorkflowsSection /> : null}
        {tab === 'export' ? <ExportSchedulesSection canConfigure={canConfigure} /> : null}
        {tab === 'appearance' ? <AppearanceSection /> : null}
        {tab === 'security' ? <SecuritySection /> : null}
        {tab === 'form-designer' ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gap: 4 }}>
              <div style={{ fontWeight: 760 }}>Form Designer</div>
              <div className="snSubtle">Design forms for incidents, requests, changes, and more.</div>
            </div>
            <div className="snRowWrap">
              <Button type="button" variant="primary" onClick={() => navigate('/form-designer')}>
                Open Form Designer
              </Button>
              <div className="snSubtle">Manage drafts, publish versions, and configure fields.</div>
            </div>
          </div>
        ) : null}
      </Panel>
    </div>
  )
}

function ProfileSection({
  isSaving,
  onSave,
}: {
  isSaving: boolean
  onSave: (payload: { first_name?: string; last_name?: string; email?: string }) => Promise<void>
}) {
  const auth = useAuth()
  const displayName = auth.user?.first_name || auth.user?.username || 'User'

  const [firstName, setFirstName] = useState(auth.user?.first_name || '')
  const [lastName, setLastName] = useState(auth.user?.last_name || '')
  const [email, setEmail] = useState(auth.user?.email || '')
  const [jobTitle, setJobTitle] = useState('')
  const [department, setDepartment] = useState('')
  const [phone, setPhone] = useState('')
  const [timezone, setTimezone] = useState('UTC')

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="snRowWrap" style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'grid', gap: 4 }}>
          <div style={{ fontWeight: 760 }}>Profile Information</div>
          <div className="snSubtle">Update your personal details and contact information.</div>
        </div>
        <div className="snRowWrap">
          <Avatar name={displayName} />
          <Button type="button">Upload Photo</Button>
        </div>
      </div>

      <div className="snGrid2">
        <label style={{ display: 'grid', gap: 6 }}>
          <span className="snSubtle">Full Name</span>
          <div className="snRowWrap">
            <Input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="First name"
              disabled={isSaving}
            />
            <Input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Last name"
              disabled={isSaving}
            />
          </div>
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span className="snSubtle">Email</span>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" disabled={isSaving} />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span className="snSubtle">Job Title</span>
          <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="e.g., IT Support Analyst" />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span className="snSubtle">Department</span>
          <Input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g., IT Operations" />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span className="snSubtle">Phone</span>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 (555) 000-0000" />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span className="snSubtle">Timezone</span>
          <Select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            <option value="UTC">UTC</option>
            <option value="Europe/London">London (UK)</option>
            <option value="Europe/Berlin">Berlin (EU)</option>
            <option value="America/New_York">Eastern (ET)</option>
            <option value="America/Chicago">Central (CT)</option>
            <option value="America/Denver">Mountain (MT)</option>
            <option value="America/Los_Angeles">Pacific (PT)</option>
          </Select>
        </label>
      </div>

      <div className="snRowWrap" style={{ justifyContent: 'flex-end' }}>
        <Button type="button">Cancel</Button>
        <Button
          type="button"
          variant="primary"
          disabled={isSaving}
          onClick={() => onSave({ first_name: firstName, last_name: lastName, email })}
        >
          Save Changes
        </Button>
      </div>
    </div>
  )
}

function NotificationsSection() {
  const [emailNotifs, setEmailNotifs] = useState(true)
  const [inAppNotifs, setInAppNotifs] = useState(true)
  const [slaAlerts, setSlaAlerts] = useState(true)

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'grid', gap: 4 }}>
        <div style={{ fontWeight: 760 }}>Notifications</div>
        <div className="snSubtle">Choose how you receive updates.</div>
      </div>
      <ToggleRow label="Email notifications" value={emailNotifs} onChange={setEmailNotifs} />
      <ToggleRow label="In-app notifications" value={inAppNotifs} onChange={setInAppNotifs} />
      <ToggleRow label="SLA breach alerts" value={slaAlerts} onChange={setSlaAlerts} />
    </div>
  )
}

function AppearanceSection() {
  const { preferences, setPreferences, saveToServer } = usePreferences()
  const [isSaving, setIsSaving] = useState(false)
  const [density, setDensity] = useState<'comfortable' | 'compact'>(preferences.density)
  const [theme, setTheme] = useState<'dark' | 'light'>(preferences.theme)
  const [accent, setAccent] = useState(preferences.accent)

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'grid', gap: 4 }}>
        <div style={{ fontWeight: 760 }}>Appearance</div>
        <div className="snSubtle">Adjust layout density and motion.</div>
      </div>

      <Panel title="Display Theme">
        <div className="snGrid2">
          <button
            type="button"
            className="snPanel"
            onClick={() => {
              setTheme('light')
              setPreferences({ ...preferences, theme: 'light' })
            }}
            style={{
              padding: 14,
              textAlign: 'left',
              cursor: 'pointer',
              borderColor: theme === 'light' ? 'color-mix(in oklab, var(--primary) 35%, transparent)' : undefined,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div>
                <div style={{ fontWeight: 760 }}>Light</div>
                <div className="snSubtle">Bright and clear</div>
              </div>
              <div style={{ width: 34, height: 22, borderRadius: 12, background: 'rgba(255,255,255,0.85)' }} />
            </div>
          </button>

          <button
            type="button"
            className="snPanel"
            onClick={() => {
              setTheme('dark')
              setPreferences({ ...preferences, theme: 'dark' })
            }}
            style={{
              padding: 14,
              textAlign: 'left',
              cursor: 'pointer',
              borderColor: theme === 'dark' ? 'color-mix(in oklab, var(--primary) 35%, transparent)' : undefined,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div>
                <div style={{ fontWeight: 760 }}>Dark</div>
                <div className="snSubtle">Easy on the eyes</div>
              </div>
              <div style={{ width: 34, height: 22, borderRadius: 12, background: 'rgba(8,12,18,0.85)' }} />
            </div>
          </button>
        </div>
      </Panel>

      <Panel title="Accent Color">
        <div className="snRowWrap" style={{ justifyContent: 'space-between' }}>
          <div className="snRowWrap">
            {(
              [
                { key: 'cyan', color: '#1fd2ff' },
                { key: 'purple', color: '#8b7bff' },
                { key: 'green', color: '#1dd75e' },
                { key: 'orange', color: '#ffb020' },
                { key: 'pink', color: '#ff3d61' },
              ] as const
            ).map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => {
                  setAccent(c.key)
                  setPreferences({ ...preferences, accent: c.key })
                }}
                aria-label={`Accent ${c.key}`}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 999,
                  border: c.key === accent ? `2px solid ${c.color}` : '1px solid rgba(255,255,255,0.18)',
                  background: c.color,
                  cursor: 'pointer',
                }}
              />
            ))}
          </div>
          <div className="snSubtle">Live preview</div>
        </div>
      </Panel>

      <Panel title="Display Density">
        <div className="snRowWrap" style={{ justifyContent: 'space-between' }}>
          <label style={{ display: 'grid', gap: 6, minWidth: 280 }}>
            <span className="snSubtle">Density</span>
            <Select
              value={density}
              onChange={(e) => {
                const v = e.target.value as 'comfortable' | 'compact'
                setDensity(v)
                setPreferences({ ...preferences, density: v })
              }}
            >
              <option value="comfortable">Comfortable</option>
              <option value="compact">Compact</option>
            </Select>
          </label>
          <Button
            type="button"
            variant="primary"
            disabled={isSaving}
            onClick={async () => {
              setIsSaving(true)
              try {
                await saveToServer()
              } finally {
                setIsSaving(false)
              }
            }}
          >
            Save Preferences
          </Button>
        </div>
      </Panel>
    </div>
  )
}

function SecuritySection() {
  const [mfa, setMfa] = useState(true)
  const [sessionTimeout, setSessionTimeout] = useState('60')

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'grid', gap: 4 }}>
        <div style={{ fontWeight: 760 }}>Security</div>
        <div className="snSubtle">Protect access to service operations.</div>
      </div>
      <ToggleRow label="Require MFA" value={mfa} onChange={setMfa} />
      <label style={{ display: 'grid', gap: 6, maxWidth: 320 }}>
        <span className="snSubtle">Session timeout (minutes)</span>
        <Input value={sessionTimeout} onChange={(e) => setSessionTimeout(e.target.value)} />
      </label>
    </div>
  )
}

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
        alignItems: 'center',
        padding: 12,
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 14,
        background: 'rgba(255,255,255,0.02)',
      }}
    >
      <div style={{ fontWeight: 650 }}>{label}</div>
      <button
        type="button"
        className="snBtn"
        onClick={() => onChange(!value)}
        aria-pressed={value}
        style={{
          width: 54,
          padding: 6,
          borderRadius: 999,
          display: 'flex',
          justifyContent: value ? 'flex-end' : 'flex-start',
          background: value ? 'rgba(29,215,94,0.14)' : 'rgba(255,255,255,0.03)',
          borderColor: value ? 'rgba(29,215,94,0.25)' : 'rgba(255,255,255,0.08)',
        }}
      >
        <span
          style={{
            width: 18,
            height: 18,
            borderRadius: 999,
            background: value ? 'rgba(29,215,94,0.85)' : 'rgba(255,255,255,0.22)',
            border: '1px solid rgba(255,255,255,0.10)',
          }}
        />
      </button>
    </div>
  )
}

// Settings storage helper: read a single SystemSetting by key (privileged endpoint).
async function loadSystemSetting(token: string, key: string) {
  try {
    return await apiFetch<SystemSetting>(`/api/system-settings/${encodeURIComponent(key)}/`, { token })
  } catch {
    return null
  }
}

// Settings storage helper: create or update a SystemSetting row (privileged endpoint).
async function upsertSystemSetting(token: string, key: string, value: Record<string, unknown>) {
  const existing = await loadSystemSetting(token, key)
  if (existing) {
    return await apiFetch<SystemSetting>(`/api/system-settings/${encodeURIComponent(key)}/`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ value }),
    })
  }
  return await apiFetch<SystemSetting>('/api/system-settings/', {
    method: 'POST',
    token,
    body: JSON.stringify({ key, value }),
  })
}

// Admin setting: controls ticket numbering prefix/padding used when tickets are created.
function AutoNumberSection({ canConfigure }: { canConfigure: boolean }) {
  const auth = useAuth()
  const [cfg, setCfg] = useState<TicketNumberConfig | null>(null)
  const [prefix, setPrefix] = useState('ITSM-')
  const [padding, setPadding] = useState('6')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      if (!auth.accessToken) return
      setIsLoading(true)
      setError(null)
      try {
        const data = await apiFetch<TicketNumberConfig>('/api/ticket-number-config/1/', { token: auth.accessToken })
        setCfg(data)
        setPrefix(data.prefix)
        setPadding(String(data.padding))
      } catch {
        setError('Failed to load auto-number config')
      } finally {
        setIsLoading(false)
      }
    }
    void load()
  }, [auth.accessToken])

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'grid', gap: 4 }}>
        <div style={{ fontWeight: 760 }}>Auto-Number</div>
        <div className="snSubtle">Configure ticket number prefix and padding.</div>
      </div>
      {error ? <div style={{ color: 'rgba(255,255,255,0.84)' }}>{error}</div> : null}
      {!canConfigure ? <div className="snSubtle">Agent permissions required.</div> : null}
      <div className="snGrid2">
        <label style={{ display: 'grid', gap: 6 }}>
          <span className="snSubtle">Prefix</span>
          <Input value={prefix} onChange={(e) => setPrefix(e.target.value)} disabled={!canConfigure || isLoading} />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span className="snSubtle">Padding</span>
          <Input value={padding} onChange={(e) => setPadding(e.target.value)} disabled={!canConfigure || isLoading} />
        </label>
      </div>
      <div className="snRowWrap" style={{ justifyContent: 'flex-end' }}>
        <Button
          type="button"
          variant="primary"
          disabled={!canConfigure || !auth.accessToken || isSaving}
          onClick={async () => {
            if (!auth.accessToken) return
            setIsSaving(true)
            setError(null)
            try {
              const next = await apiFetch<TicketNumberConfig>('/api/ticket-number-config/1/', {
                method: 'PUT',
                token: auth.accessToken,
                body: JSON.stringify({ prefix, padding: Number(padding || 6) }),
              })
              setCfg(next)
            } catch {
              setError('Failed to save auto-number config')
            } finally {
              setIsSaving(false)
            }
          }}
        >
          Save
        </Button>
      </div>
      {cfg ? <div className="snSubtle">Last updated: {new Date(cfg.updated_at).toLocaleString()}</div> : null}
    </div>
  )
}

function BarcodesSection({ canConfigure }: { canConfigure: boolean }) {
  const auth = useAuth()
  const [items, setItems] = useState<BarcodeTemplate[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('Default')
  const [fields, setFields] = useState('asset_tag,name,owner,location,serial_number')

  const load = useCallback(async () => {
    if (!auth.accessToken) return
    setIsLoading(true)
    setError(null)
    try {
      const data = await apiFetch<BarcodeTemplate[]>('/api/barcode-templates/', { token: auth.accessToken })
      setItems(data)
    } catch {
      setError('Failed to load barcode templates')
    } finally {
      setIsLoading(false)
    }
  }, [auth.accessToken])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'grid', gap: 4 }}>
        <div style={{ fontWeight: 760 }}>Barcodes</div>
        <div className="snSubtle">Manage label templates for asset barcodes.</div>
      </div>
      {error ? <div style={{ color: 'rgba(255,255,255,0.84)' }}>{error}</div> : null}
      {!canConfigure ? <div className="snSubtle">Agent permissions required.</div> : null}

      {canConfigure ? (
        <Panel title="Create Template">
          <div style={{ display: 'grid', gap: 10 }}>
            <div className="snGrid2">
              <label style={{ display: 'grid', gap: 6 }}>
                <span className="snSubtle">Name</span>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span className="snSubtle">Fields (comma-separated)</span>
                <Input value={fields} onChange={(e) => setFields(e.target.value)} />
              </label>
            </div>
            <div className="snRowWrap" style={{ justifyContent: 'flex-end' }}>
              <Button
                type="button"
                variant="primary"
                disabled={!auth.accessToken || isSaving || !name.trim()}
                onClick={async () => {
                  if (!auth.accessToken) return
                  setIsSaving(true)
                  setError(null)
                  try {
                    const show_fields = fields
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean)
                    await apiFetch<BarcodeTemplate>('/api/barcode-templates/', {
                      method: 'POST',
                      token: auth.accessToken,
                      body: JSON.stringify({ name: name.trim(), is_active: true, template: { show_fields } }),
                    })
                    await load()
                  } catch {
                    setError('Failed to create template')
                  } finally {
                    setIsSaving(false)
                  }
                }}
              >
                Create
              </Button>
            </div>
          </div>
        </Panel>
      ) : null}

      <Panel title="Templates">
        {isLoading ? <div className="snSubtle">Loading…</div> : null}
        {!isLoading && items.length === 0 ? <div className="snSubtle">No templates.</div> : null}
        {!isLoading && items.length > 0 ? (
          <div style={{ display: 'grid', gap: 10 }}>
            {items.map((t) => (
              <div key={t.id} className="snPanel" style={{ padding: 12 }}>
                <div className="snRowWrap" style={{ justifyContent: 'space-between' }}>
                  <div style={{ fontWeight: 820 }}>{t.name}</div>
                  <Badge tone={t.is_active ? 'success' : 'neutral'}>{t.is_active ? 'Active' : 'Inactive'}</Badge>
                </div>
                <div className="snSubtle" style={{ marginTop: 6 }}>
                  Updated {new Date(t.updated_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </Panel>
    </div>
  )
}

function SlaConfigSection({ canConfigure }: { canConfigure: boolean }) {
  const auth = useAuth()
  const [items, setItems] = useState<SlaPolicy[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [kind, setKind] = useState<SlaPolicy['kind']>('INCIDENT')
  const [priority, setPriority] = useState<SlaPolicy['priority']>('P3')
  const [resolutionMinutes, setResolutionMinutes] = useState('480')
  const [atRiskMinutes, setAtRiskMinutes] = useState('60')

  const load = useCallback(async () => {
    if (!auth.accessToken) return
    setIsLoading(true)
    setError(null)
    try {
      const data = await apiFetch<SlaPolicy[]>('/api/sla-policies/', { token: auth.accessToken })
      setItems(data)
    } catch {
      setError('Failed to load SLA policies')
    } finally {
      setIsLoading(false)
    }
  }, [auth.accessToken])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'grid', gap: 4 }}>
        <div style={{ fontWeight: 760 }}>SLA Config</div>
        <div className="snSubtle">Define resolution and at-risk thresholds by record type and priority.</div>
      </div>
      {error ? <div style={{ color: 'rgba(255,255,255,0.84)' }}>{error}</div> : null}
      {!canConfigure ? <div className="snSubtle">Agent permissions required.</div> : null}

      {canConfigure ? (
        <Panel title="Add Policy">
          <div className="snGrid2">
            <label style={{ display: 'grid', gap: 6 }}>
              <span className="snSubtle">Kind</span>
              <Select value={kind} onChange={(e) => setKind(e.target.value as SlaPolicy['kind'])}>
                <option value="INCIDENT">INCIDENT</option>
                <option value="SERVICE_REQUEST">SERVICE_REQUEST</option>
                <option value="PROBLEM">PROBLEM</option>
                <option value="CHANGE">CHANGE</option>
              </Select>
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span className="snSubtle">Priority</span>
              <Select value={priority} onChange={(e) => setPriority(e.target.value as SlaPolicy['priority'])}>
                <option value="P1">P1</option>
                <option value="P2">P2</option>
                <option value="P3">P3</option>
                <option value="P4">P4</option>
              </Select>
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span className="snSubtle">Resolution (minutes)</span>
              <Input value={resolutionMinutes} onChange={(e) => setResolutionMinutes(e.target.value)} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span className="snSubtle">At risk (minutes)</span>
              <Input value={atRiskMinutes} onChange={(e) => setAtRiskMinutes(e.target.value)} />
            </label>
          </div>
          <div className="snRowWrap" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
            <Button
              type="button"
              variant="primary"
              onClick={async () => {
                if (!auth.accessToken) return
                await apiFetch<SlaPolicy>('/api/sla-policies/', {
                  method: 'POST',
                  token: auth.accessToken,
                  body: JSON.stringify({
                    kind,
                    priority,
                    resolution_minutes: Number(resolutionMinutes || 480),
                    at_risk_minutes: Number(atRiskMinutes || 60),
                    is_active: true,
                  }),
                })
                await load()
              }}
            >
              Add
            </Button>
          </div>
        </Panel>
      ) : null}

      <Panel title="Policies">
        {isLoading ? <div className="snSubtle">Loading…</div> : null}
        {!isLoading && items.length === 0 ? <div className="snSubtle">No policies.</div> : null}
        {!isLoading && items.length > 0 ? (
          <table className="snTable">
            <thead>
              <tr>
                <th>Kind</th>
                <th>Priority</th>
                <th>Resolution</th>
                <th>At risk</th>
                <th>Active</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id}>
                  <td className="snSubtle">{p.kind}</td>
                  <td>
                    <Badge tone={p.priority === 'P1' ? 'danger' : p.priority === 'P2' ? 'warning' : p.priority === 'P3' ? 'info' : 'success'}>
                      {p.priority}
                    </Badge>
                  </td>
                  <td className="snSubtle">{p.resolution_minutes}m</td>
                  <td className="snSubtle">{p.at_risk_minutes}m</td>
                  <td className="snSubtle">{p.is_active ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </Panel>
    </div>
  )
}

function GamificationConfigSection({ canConfigure }: { canConfigure: boolean }) {
  const auth = useAuth()
  const [rewards, setRewards] = useState<Reward[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rewardName, setRewardName] = useState('')
  const [rewardCost, setRewardCost] = useState('100')
  const [rewardStock, setRewardStock] = useState('20')
  const [pointsJson, setPointsJson] = useState('{"points_sla_p1":50,"points_sla_p2":30,"points_sla_p3":20,"points_sla_p4":15}')

  const load = useCallback(async () => {
    if (!auth.accessToken) return
    setIsLoading(true)
    setError(null)
    try {
      const [rw, cfg] = await Promise.all([
        apiFetch<Reward[]>('/api/rewards/', { token: auth.accessToken }),
        loadSystemSetting(auth.accessToken, 'gamification'),
      ])
      setRewards(rw)
      if (cfg) setPointsJson(JSON.stringify(cfg.value ?? {}, null, 2))
    } catch {
      setError('Failed to load gamification settings')
    } finally {
      setIsLoading(false)
    }
  }, [auth.accessToken])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'grid', gap: 4 }}>
        <div style={{ fontWeight: 760 }}>Gamification</div>
        <div className="snSubtle">Configure point values and rewards catalog.</div>
      </div>
      {error ? <div style={{ color: 'rgba(255,255,255,0.84)' }}>{error}</div> : null}
      {!canConfigure ? <div className="snSubtle">Agent permissions required.</div> : null}

      {canConfigure ? (
        <Panel
          title="Point Rules (JSON)"
          actions={
            <Button
              type="button"
              variant="primary"
              onClick={async () => {
                if (!auth.accessToken) return
                try {
                  const v = JSON.parse(pointsJson || '{}') as Record<string, unknown>
                  await upsertSystemSetting(auth.accessToken, 'gamification', v)
                } catch {
                  setError('Invalid JSON')
                }
              }}
            >
              Save
            </Button>
          }
        >
          <Textarea value={pointsJson} onChange={(e) => setPointsJson(e.target.value)} rows={6} />
        </Panel>
      ) : null}

      <Panel title="Rewards">
        {isLoading ? <div className="snSubtle">Loading…</div> : null}
        {canConfigure ? (
          <div style={{ display: 'grid', gap: 10, marginBottom: 12 }}>
            <div className="snGrid2">
              <Input value={rewardName} onChange={(e) => setRewardName(e.target.value)} placeholder="Reward name…" />
              <Input value={rewardCost} onChange={(e) => setRewardCost(e.target.value)} placeholder="Cost points…" />
            </div>
            <div className="snRowWrap" style={{ justifyContent: 'space-between' }}>
              <Input value={rewardStock} onChange={(e) => setRewardStock(e.target.value)} placeholder="Stock (blank = unlimited)" />
              <Button
                type="button"
                variant="primary"
                disabled={!rewardName.trim()}
                onClick={async () => {
                  if (!auth.accessToken) return
                  await apiFetch<Reward>('/api/rewards/', {
                    method: 'POST',
                    token: auth.accessToken,
                    body: JSON.stringify({
                      name: rewardName.trim(),
                      description: '',
                      cost_points: Number(rewardCost || 100),
                      is_active: true,
                      stock: rewardStock.trim() ? Number(rewardStock) : null,
                    }),
                  })
                  setRewardName('')
                  await load()
                }}
              >
                Add reward
              </Button>
            </div>
          </div>
        ) : null}
        {!isLoading && rewards.length === 0 ? <div className="snSubtle">No rewards.</div> : null}
        {!isLoading && rewards.length > 0 ? (
          <table className="snTable">
            <thead>
              <tr>
                <th>Name</th>
                <th>Cost</th>
                <th>Stock</th>
                <th>Active</th>
              </tr>
            </thead>
            <tbody>
              {rewards.slice(0, 50).map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td className="snSubtle">{r.cost_points}</td>
                  <td className="snSubtle">{r.stock == null ? '∞' : r.stock}</td>
                  <td className="snSubtle">{r.is_active ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </Panel>
    </div>
  )
}

function AIAgentsConfigSection({ canConfigure }: { canConfigure: boolean }) {
  const auth = useAuth()
  const [enabled, setEnabled] = useState(true)
  const [maxResults, setMaxResults] = useState('5')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      if (!auth.accessToken || !canConfigure) {
        setIsLoading(false)
        return
      }
      setIsLoading(true)
      setError(null)
      try {
        const cfg = await loadSystemSetting(auth.accessToken, 'ai_agents')
        if (cfg) {
          setEnabled(Boolean(cfg.value?.enabled))
          setMaxResults(String((cfg.value?.max_results as number) ?? 5))
        }
      } catch {
        setError('Failed to load AI Agents config')
      } finally {
        setIsLoading(false)
      }
    }
    void load()
  }, [auth.accessToken, canConfigure])

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'grid', gap: 4 }}>
        <div style={{ fontWeight: 760 }}>AI Agents</div>
        <div className="snSubtle">Configure Virtual Agent behavior and result limits.</div>
      </div>
      {error ? <div style={{ color: 'rgba(255,255,255,0.84)' }}>{error}</div> : null}
      {!canConfigure ? <div className="snSubtle">Agent permissions required.</div> : null}
      {canConfigure ? (
        <>
          <ToggleRow label="Enable AI Agents" value={enabled} onChange={setEnabled} />
          <label style={{ display: 'grid', gap: 6, maxWidth: 320 }}>
            <span className="snSubtle">Max results</span>
            <Input value={maxResults} onChange={(e) => setMaxResults(e.target.value)} disabled={isLoading} />
          </label>
          <div className="snRowWrap" style={{ justifyContent: 'flex-end' }}>
            <Button
              type="button"
              variant="primary"
              onClick={async () => {
                if (!auth.accessToken) return
                await upsertSystemSetting(auth.accessToken, 'ai_agents', { enabled, max_results: Number(maxResults || 5) })
              }}
            >
              Save
            </Button>
          </div>
        </>
      ) : null}
    </div>
  )
}

function WorkflowsSection() {
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'grid', gap: 4 }}>
        <div style={{ fontWeight: 760 }}>Workflows</div>
        <div className="snSubtle">Create versions, run sandbox tests, deploy and rollback.</div>
      </div>
      <Panel title="Workflow Studio">
        <div className="snSubtle">Use Workflow Studio for automation and runbooks.</div>
        <div className="snRowWrap" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
          <Button type="button" variant="primary" onClick={() => window.location.assign('/workflows')}>
            Open Workflows
          </Button>
        </div>
      </Panel>
    </div>
  )
}

function ExportSchedulesSection({ canConfigure }: { canConfigure: boolean }) {
  const auth = useAuth()
  const [items, setItems] = useState<ReportSchedule[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!auth.accessToken) return
    setIsLoading(true)
    setError(null)
    try {
      const data = await apiFetch<ReportSchedule[]>('/api/report-schedules/', { token: auth.accessToken })
      setItems(data)
    } catch {
      setError('Failed to load export schedules')
    } finally {
      setIsLoading(false)
    }
  }, [auth.accessToken])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'grid', gap: 4 }}>
        <div style={{ fontWeight: 760 }}>Export Schedules</div>
        <div className="snSubtle">Scheduled report delivery for stakeholders.</div>
      </div>
      {error ? <div style={{ color: 'rgba(255,255,255,0.84)' }}>{error}</div> : null}
      <div className="snRowWrap" style={{ justifyContent: 'space-between' }}>
        <div className="snSubtle">{canConfigure ? 'Agent mode' : 'Read-only'}</div>
        <Button
          type="button"
          onClick={async () => {
            if (!auth.accessToken || !canConfigure) return
            await apiFetch('/api/report-schedules/run-due/', { method: 'POST', token: auth.accessToken })
            await load()
          }}
          disabled={!canConfigure}
        >
          Run due schedules
        </Button>
      </div>
      <Panel title="Schedules">
        {isLoading ? <div className="snSubtle">Loading…</div> : null}
        {!isLoading && items.length === 0 ? <div className="snSubtle">No schedules.</div> : null}
        {!isLoading && items.length > 0 ? (
          <table className="snTable">
            <thead>
              <tr>
                <th>Report</th>
                <th>Frequency</th>
                <th>Format</th>
                <th>Active</th>
                <th>Next</th>
              </tr>
            </thead>
            <tbody>
              {items.slice(0, 50).map((s) => (
                <tr key={s.id}>
                  <td>{s.report.name}</td>
                  <td className="snSubtle">{s.frequency}</td>
                  <td className="snSubtle">{s.format}</td>
                  <td className="snSubtle">{s.is_active ? 'Yes' : 'No'}</td>
                  <td className="snSubtle">{s.next_run_at ? new Date(s.next_run_at).toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </Panel>
    </div>
  )
}

type AdminRole = { name: string; label: string; description: string }
type AdminUser = {
  id: number
  username: string
  first_name: string
  last_name: string
  email: string
  is_staff: boolean
  is_superuser: boolean
  roles: string[]
}

function AccessManagementSection({ canConfigure }: { canConfigure: boolean }) {
  const auth = useAuth()
  const [roles, setRoles] = useState<AdminRole[]>([])
  const [users, setUsers] = useState<AdminUser[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const [newTeamName, setNewTeamName] = useState('')
  const [newTeamEmail, setNewTeamEmail] = useState('')

  const [newItemName, setNewItemName] = useState('')
  const [newItemCategory, setNewItemCategory] = useState('Hardware')
  const [newItemApproval, setNewItemApproval] = useState(false)
  const [newItemDesc, setNewItemDesc] = useState('')

  const load = useCallback(async () => {
    if (!auth.accessToken) return
    if (!canConfigure) return
    setIsLoading(true)
    setError(null)
    try {
      const [r, u, t, c] = await Promise.all([
        apiFetch<{ roles: AdminRole[] }>('/api/admin/roles/', { token: auth.accessToken }),
        apiFetch<AdminUser[]>('/api/admin/users/', { token: auth.accessToken }),
        apiFetch<Team[]>('/api/teams/', { token: auth.accessToken }),
        apiFetch<CatalogItem[]>('/api/catalog/items/', { token: auth.accessToken }),
      ])
      setRoles(r.roles)
      setUsers(u)
      setTeams(t)
      setCatalogItems(c)
    } catch {
      setError('Failed to load access management data')
    } finally {
      setIsLoading(false)
    }
  }, [auth.accessToken, canConfigure])

  useEffect(() => {
    void load()
  }, [load])

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return users
    return users.filter((u) => `${u.username} ${u.first_name} ${u.last_name} ${u.email}`.toLowerCase().includes(q))
  }, [search, users])

  if (!canConfigure) {
    return <div className="snSubtle">Privileged admin access required.</div>
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {error ? <div style={{ color: 'rgba(255,255,255,0.84)' }}>{error}</div> : null}

      <Panel title="Roles">
        {roles.length === 0 ? <div className="snSubtle">No roles.</div> : null}
        {roles.length > 0 ? (
          <div style={{ display: 'grid', gap: 10 }}>
            {roles.map((r) => (
              <div key={r.name} className="snPanel" style={{ padding: 12 }}>
                <div className="snRowWrap" style={{ justifyContent: 'space-between' }}>
                  <div style={{ fontWeight: 820 }}>{r.label}</div>
                  <Badge tone="neutral">{r.name}</Badge>
                </div>
                <div className="snSubtle" style={{ marginTop: 6 }}>
                  {r.description}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </Panel>

      <Panel
        title="Users"
        actions={
          <div className="snRowWrap">
            <div style={{ width: 280 }}>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search users…" />
            </div>
            <Button type="button" onClick={() => void load()} disabled={isLoading}>
              Refresh
            </Button>
          </div>
        }
      >
        {isLoading ? <div className="snSubtle">Loading…</div> : null}
        {!isLoading && filteredUsers.length === 0 ? <div className="snSubtle">No users.</div> : null}
        {!isLoading && filteredUsers.length > 0 ? (
          <table className="snTable">
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Flags</th>
                {roles.map((r) => (
                  <th key={r.name}>{r.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredUsers.slice(0, 60).map((u) => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 720 }}>{u.username}</td>
                  <td className="snSubtle">{u.email || '—'}</td>
                  <td className="snSubtle">
                    {u.is_superuser ? 'Superuser' : u.is_staff ? 'Staff' : 'User'}
                  </td>
                  {roles.map((r) => {
                    const checked = u.roles.includes(r.name)
                    const disabled = u.is_superuser
                    return (
                      <td key={r.name}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={async (e) => {
                            if (!auth.accessToken) return
                            const nextRoles = e.target.checked ? [...u.roles, r.name] : u.roles.filter((x) => x !== r.name)
                            const updated = await apiFetch<AdminUser>(`/api/admin/users/${u.id}/`, {
                              method: 'PATCH',
                              token: auth.accessToken,
                              body: JSON.stringify({ roles: nextRoles }),
                            })
                            setUsers((prev) => prev.map((x) => (x.id === u.id ? updated : x)))
                          }}
                        />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        <div className="snSubtle" style={{ marginTop: 10 }}>
          Superusers always have all privileges.
        </div>
      </Panel>

      <div className="snGrid2">
        <Panel title="Master Data: Teams">
          <div style={{ display: 'grid', gap: 10 }}>
            <div className="snGrid2">
              <Input value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} placeholder="Team name…" />
              <Input value={newTeamEmail} onChange={(e) => setNewTeamEmail(e.target.value)} placeholder="Team email…" />
            </div>
            <div className="snRowWrap" style={{ justifyContent: 'flex-end' }}>
              <Button
                type="button"
                variant="primary"
                disabled={!newTeamName.trim() || !auth.accessToken}
                onClick={async () => {
                  if (!auth.accessToken) return
                  await apiFetch<Team>('/api/teams/', {
                    method: 'POST',
                    token: auth.accessToken,
                    body: JSON.stringify({ name: newTeamName.trim(), email: newTeamEmail.trim(), is_active: true }),
                  })
                  setNewTeamName('')
                  setNewTeamEmail('')
                  await load()
                }}
              >
                Create
              </Button>
            </div>
            {teams.length > 0 ? (
              <table className="snTable">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Active</th>
                  </tr>
                </thead>
                <tbody>
                  {teams.slice(0, 30).map((t) => (
                    <tr key={t.id}>
                      <td>{t.name}</td>
                      <td className="snSubtle">{t.email || '—'}</td>
                      <td className="snSubtle">{t.is_active ? 'Yes' : 'No'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="snSubtle">No teams.</div>
            )}
          </div>
        </Panel>

        <Panel title="Master Data: Catalog Items">
          <div style={{ display: 'grid', gap: 10 }}>
            <Input value={newItemName} onChange={(e) => setNewItemName(e.target.value)} placeholder="Item name…" />
            <div className="snGrid2">
              <Select value={newItemCategory} onChange={(e) => setNewItemCategory(e.target.value)}>
                <option value="Hardware">Hardware</option>
                <option value="Software">Software</option>
                <option value="Access">Access</option>
                <option value="Email">Email</option>
                <option value="Network">Network</option>
              </Select>
              <Select value={newItemApproval ? 'yes' : 'no'} onChange={(e) => setNewItemApproval(e.target.value === 'yes')}>
                <option value="no">No approval</option>
                <option value="yes">Requires approval</option>
              </Select>
            </div>
            <Textarea value={newItemDesc} onChange={(e) => setNewItemDesc(e.target.value)} rows={3} />
            <div className="snRowWrap" style={{ justifyContent: 'flex-end' }}>
              <Button
                type="button"
                variant="primary"
                disabled={!newItemName.trim() || !auth.accessToken}
                onClick={async () => {
                  if (!auth.accessToken) return
                  await apiFetch<CatalogItem>('/api/catalog/items/', {
                    method: 'POST',
                    token: auth.accessToken,
                    body: JSON.stringify({
                      name: newItemName.trim(),
                      category: newItemCategory,
                      description: newItemDesc,
                      is_active: true,
                      requires_approval: newItemApproval,
                      fulfillment_instructions: 'Demo fulfillment instructions.',
                    }),
                  })
                  setNewItemName('')
                  setNewItemDesc('')
                  setNewItemApproval(false)
                  await load()
                }}
              >
                Create
              </Button>
            </div>
            {catalogItems.length === 0 ? <div className="snSubtle">No items.</div> : null}
            {catalogItems.length > 0 ? (
              <div style={{ display: 'grid', gap: 10 }}>
                {catalogItems.slice(0, 12).map((i) => (
                  <div key={i.id} className="snPanel" style={{ padding: 12 }}>
                    <div className="snRowWrap" style={{ justifyContent: 'space-between' }}>
                      <div style={{ fontWeight: 820 }}>{i.name}</div>
                      <div className="snRowWrap">
                        <Badge tone="neutral">{i.category}</Badge>
                        <Badge tone={i.is_active ? 'success' : 'neutral'}>{i.is_active ? 'Active' : 'Inactive'}</Badge>
                      </div>
                    </div>
                    {i.description ? <div className="snSubtle" style={{ marginTop: 6 }}>{i.description}</div> : null}
                    <div className="snSubtle" style={{ marginTop: 6 }}>
                      Approval: {i.requires_approval ? 'Required' : 'No'}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </Panel>
      </div>
    </div>
  )
}

function GlobalNotificationsSection({ canConfigure }: { canConfigure: boolean }) {
  const auth = useAuth()
  const [teams, setTeams] = useState('')
  const [slack, setSlack] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      if (!auth.accessToken || !canConfigure) {
        setIsLoading(false)
        return
      }
      setIsLoading(true)
      setError(null)
      try {
        const cfg = await loadSystemSetting(auth.accessToken, 'notifications')
        const v = cfg?.value ?? {}
        setTeams(String(v.teams_webhook_url ?? ''))
        setSlack(String(v.slack_webhook_url ?? ''))
      } catch {
        setError('Failed to load notification config')
      } finally {
        setIsLoading(false)
      }
    }
    void load()
  }, [auth.accessToken, canConfigure])

  if (!canConfigure) return null

  return (
    <Panel
      title="Global Webhooks"
      actions={
        <Button
          type="button"
          variant="primary"
          disabled={!auth.accessToken}
          onClick={async () => {
            if (!auth.accessToken) return
            setError(null)
            try {
              await upsertSystemSetting(auth.accessToken, 'notifications', { teams_webhook_url: teams, slack_webhook_url: slack })
            } catch {
              setError('Failed to save notification config')
            }
          }}
        >
          Save
        </Button>
      }
    >
      {error ? <div style={{ color: 'rgba(255,255,255,0.84)' }}>{error}</div> : null}
      <div style={{ display: 'grid', gap: 10 }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <span className="snSubtle">Teams webhook URL</span>
          <Input value={teams} onChange={(e) => setTeams(e.target.value)} disabled={isLoading} />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span className="snSubtle">Slack webhook URL</span>
          <Input value={slack} onChange={(e) => setSlack(e.target.value)} disabled={isLoading} />
        </label>
      </div>
    </Panel>
  )
}
