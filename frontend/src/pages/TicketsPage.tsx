import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../api'
import { useAuth } from '../auth/useAuth'
import type { Ticket } from '../itsmTypes'
import { useConfigEntries } from '../config/useConfigEntries'

type TicketCreatePayload = {
  title: string
  description: string
  kind: Ticket['kind']
  priority: Ticket['priority']
}

export function TicketsPage() {
  const auth = useAuth()
  const kindConfig = useConfigEntries('ticket_kinds')
  const priorityConfig = useConfigEntries('ticket_priorities')

  const [tickets, setTickets] = useState<Ticket[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [kind, setKind] = useState<Ticket['kind']>('INCIDENT')
  const [priority, setPriority] = useState<Ticket['priority']>('P3')

  const loadTickets = useCallback(async () => {
    if (!auth.accessToken) {
      setTickets([])
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const data = await apiFetch<Ticket[]>('/api/tickets/', { token: auth.accessToken })
      setTickets(data)
    } catch {
      setError('Failed to load tickets')
    } finally {
      setIsLoading(false)
    }
  }, [auth.accessToken])

  useEffect(() => {
    void loadTickets()
  }, [loadTickets])

  if (!auth.user) {
    return (
      <div>
        <h2>Tickets</h2>
        <p>
          Please <Link to="/login">log in</Link>.
        </p>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 16 }}>
        <div>
          <h2 style={{ marginBottom: 4 }}>Tickets</h2>
          <div style={{ color: '#666' }}>{auth.user.is_staff ? 'Agent view (all tickets)' : 'My tickets'}</div>
        </div>
        <button type="button" onClick={() => void loadTickets()} disabled={isLoading}>
          Refresh
        </button>
      </div>

      <section style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>Create ticket</h3>
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (!auth.accessToken) return
            setError(null)
            const payload: TicketCreatePayload = { title, description, kind, priority }
            try {
              await apiFetch<Ticket>('/api/tickets/', {
                method: 'POST',
                token: auth.accessToken,
                body: JSON.stringify(payload),
              })
              setTitle('')
              setDescription('')
              setKind('INCIDENT')
              setPriority('P3')
              await loadTickets()
            } catch {
              setError('Failed to create ticket')
            }
          }}
          style={{ display: 'grid', gap: 10 }}
        >
          <label style={{ display: 'grid', gap: 6 }}>
            Title
            <input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            Kind
            <select value={kind} onChange={(e) => setKind(e.target.value as Ticket['kind'])}>
              {(kindConfig.entries.length > 0 ? kindConfig.entries : [{ id: 'current', key: kind, label: kind }]).map((k) => (
                <option key={k.id} value={k.key}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            Priority
            <select value={priority} onChange={(e) => setPriority(e.target.value as Ticket['priority'])}>
              {(priorityConfig.entries.length > 0 ? priorityConfig.entries : [{ id: 'current', key: priority, label: priority }]).map((p) => (
                <option key={p.id} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            Description
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
          </label>
          <button type="submit">Create</button>
        </form>
      </section>

      {error ? <div style={{ color: 'crimson' }}>{error}</div> : null}

      <section style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>List</h3>
        {isLoading ? (
          <div>Loading…</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #eee', padding: 8 }}>Number</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #eee', padding: 8 }}>Title</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #eee', padding: 8 }}>Kind</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #eee', padding: 8 }}>Status</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #eee', padding: 8 }}>Priority</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id}>
                  <td style={{ padding: 8 }}>
                    <Link to={`/tickets/${t.id}`}>{t.number}</Link>
                  </td>
                  <td style={{ padding: 8 }}>{t.title}</td>
                  <td style={{ padding: 8 }}>{t.kind}</td>
                  <td style={{ padding: 8 }}>{t.status}</td>
                  <td style={{ padding: 8 }}>{t.priority}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
