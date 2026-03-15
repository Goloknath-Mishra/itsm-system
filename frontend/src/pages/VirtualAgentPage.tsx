import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../api'
import { useAuth } from '../auth/useAuth'
import { Badge, Button, Panel, Textarea } from '../components/ui'

type AgentResponse = {
  message: string
  knowledge: Array<{ id: string; title: string; category: string }>
  catalog: Array<{ id: string; name: string; category: string }>
}

type ChatItem =
  | { role: 'user'; text: string; at: string }
  | { role: 'agent'; text: string; at: string; payload?: AgentResponse }

export function VirtualAgentPage() {
  const auth = useAuth()
  const [text, setText] = useState('')
  const [chat, setChat] = useState<ChatItem[]>([
    { role: 'agent', text: 'Hi! Tell me what you need help with.', at: new Date().toISOString() },
  ])
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSend = useMemo(() => Boolean(auth.accessToken && text.trim()), [auth.accessToken, text])

  const send = useCallback(async () => {
    if (!auth.accessToken) return
    const msg = text.trim()
    if (!msg) return
    setText('')
    setError(null)
    setIsSending(true)
    setChat((prev) => [...prev, { role: 'user', text: msg, at: new Date().toISOString() }])
    try {
      const resp = await apiFetch<AgentResponse>('/api/virtual-agent/', {
        method: 'POST',
        token: auth.accessToken,
        body: JSON.stringify({ message: msg }),
      })
      setChat((prev) => [...prev, { role: 'agent', text: resp.message, at: new Date().toISOString(), payload: resp }])
    } catch {
      setError('Virtual Agent is unavailable')
    } finally {
      setIsSending(false)
    }
  }, [auth.accessToken, text])

  return (
    <div className="snPage" style={{ maxWidth: 1100 }}>
      <div style={{ display: 'grid', gap: 4 }}>
        <h1 className="snH1">Virtual Agent</h1>
        <div className="snSubtle">Conversational support for common IT requests.</div>
      </div>

      {error ? (
        <Panel title="Error">
          <div style={{ color: 'rgba(255,255,255,0.84)' }}>{error}</div>
        </Panel>
      ) : null}

      <Panel title="Chat">
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gap: 10 }}>
            {chat.map((c, idx) => (
              <div
                key={idx}
                style={{
                  alignSelf: c.role === 'user' ? 'end' : 'start',
                  maxWidth: '82%',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 16,
                  padding: 12,
                  background: c.role === 'user' ? 'rgba(31,210,255,0.08)' : 'rgba(255,255,255,0.02)',
                }}
              >
                <div className="snRowWrap" style={{ justifyContent: 'space-between' }}>
                  <Badge tone={c.role === 'user' ? 'info' : 'neutral'}>{c.role === 'user' ? 'You' : 'Agent'}</Badge>
                  <div className="snSubtle">{new Date(c.at).toLocaleTimeString()}</div>
                </div>
                <div style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{c.text}</div>

                {'payload' in c && c.payload ? (
                  <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
                    {c.payload.knowledge.length > 0 ? (
                      <div>
                        <div className="snSubtle">Suggested knowledge</div>
                        <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
                          {c.payload.knowledge.map((k) => (
                            <div key={k.id} className="snRowWrap" style={{ justifyContent: 'space-between' }}>
                              <span style={{ fontWeight: 650 }}>{k.title}</span>
                              <span className="snSubtle">{k.category || '—'}</span>
                            </div>
                          ))}
                          <Link to="/knowledge" className="snSubtle">
                            Open Knowledge →
                          </Link>
                        </div>
                      </div>
                    ) : null}

                    {c.payload.catalog.length > 0 ? (
                      <div>
                        <div className="snSubtle">Suggested catalog items</div>
                        <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
                          {c.payload.catalog.map((i) => (
                            <div key={i.id} className="snRowWrap" style={{ justifyContent: 'space-between' }}>
                              <span style={{ fontWeight: 650 }}>{i.name}</span>
                              <span className="snSubtle">{i.category || '—'}</span>
                            </div>
                          ))}
                          <Link to="/portal/catalog" className="snSubtle">
                            Open Catalog →
                          </Link>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              placeholder="Type your request… (e.g., reset password, VPN not working, new laptop)"
            />
            <div className="snRowWrap" style={{ justifyContent: 'space-between' }}>
              <div className="snSubtle">Tip: use short keywords for better matching.</div>
              <Button type="button" variant="primary" disabled={!canSend || isSending} onClick={() => void send()}>
                Send
              </Button>
            </div>
          </div>
        </div>
      </Panel>
    </div>
  )
}

