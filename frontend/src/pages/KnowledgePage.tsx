import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { apiFetch } from '../api'
import { useAuth } from '../auth/useAuth'
import type { KnowledgeArticle, KnowledgeFeedback } from '../itsmTypes'
import { Badge, Button, Input, Modal, Panel, Select, Tabs } from '../components/ui'
import { isAgent } from '../auth/roles'

export function KnowledgePage() {
  const auth = useAuth()
  const canEdit = isAgent(auth.user)
  const location = useLocation()
  const [didInitFromQuery, setDidInitFromQuery] = useState(false)

  const [articles, setArticles] = useState<KnowledgeArticle[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'ALL' | 'PUBLISHED' | 'DRAFT'>('ALL')

  // Deep-link support: allow global search to pre-populate the knowledge search box.
  useEffect(() => {
    if (didInitFromQuery) return
    setDidInitFromQuery(true)
    const qs = new URLSearchParams(location.search)
    const qSearch = qs.get('search')
    if (qSearch) setSearch(qSearch)
  }, [didInitFromQuery, location.search])

  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [createTitle, setCreateTitle] = useState('')
  const [createCategory, setCreateCategory] = useState('')
  const [createStatus, setCreateStatus] = useState<'DRAFT' | 'PUBLISHED'>('DRAFT')
  const [createBody, setCreateBody] = useState('')

  const [activeArticle, setActiveArticle] = useState<KnowledgeArticle | null>(null)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [editStatus, setEditStatus] = useState<'DRAFT' | 'PUBLISHED'>('DRAFT')
  const [editBody, setEditBody] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [feedback, setFeedback] = useState<KnowledgeFeedback[]>([])
  const [myRating, setMyRating] = useState<number>(5)
  const [myHelpful, setMyHelpful] = useState(true)
  const [myComment, setMyComment] = useState('')
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false)

  const load = useCallback(async () => {
    if (!auth.accessToken) {
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams()
      if (canEdit && status !== 'ALL') qs.set('status', status)
      if (search) qs.set('search', search)
      const path = qs.toString() ? `/api/knowledge/?${qs.toString()}` : '/api/knowledge/'
      const data = await apiFetch<KnowledgeArticle[]>(path, { token: auth.accessToken })
      setArticles(data)
    } catch {
      setError('Failed to load knowledge base')
    } finally {
      setIsLoading(false)
    }
  }, [auth.accessToken, canEdit, search, status])

  useEffect(() => {
    void load()
  }, [load])

  const statusTabs = useMemo(() => {
    if (!canEdit) return [{ value: 'ALL' as const, label: 'Published' }]
    return [
      { value: 'ALL' as const, label: 'All' },
      { value: 'PUBLISHED' as const, label: 'Published' },
      { value: 'DRAFT' as const, label: 'Drafts' },
    ]
  }, [canEdit])

  if (!auth.user) {
    return (
      <div className="snPage">
        <Panel title="Knowledge">
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
          <h1 className="snH1">Knowledge</h1>
          <div className="snSubtle">Searchable articles to reduce ticket volume and speed up resolution.</div>
        </div>
        <div className="snRowWrap">
          <Button type="button" onClick={() => void load()} disabled={isLoading}>
            Refresh
          </Button>
          {canEdit ? (
            <Button type="button" variant="primary" onClick={() => setIsCreateOpen(true)}>
              New Article
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
        title="Library"
        actions={
          <div className="snRowWrap">
            <Tabs value={status} options={statusTabs} onChange={setStatus} />
            <div style={{ width: 280 }}>
              <Input
                placeholder="Search articles…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
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
        {!isLoading ? (
          <table className="snTable">
            <thead>
              <tr>
                <th>Title</th>
                <th>Category</th>
                <th>Status</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {articles.map((a) => (
                <tr
                  key={a.id}
                  onClick={() => {
                    setActiveArticle(a)
                    setEditTitle(a.title)
                    setEditCategory(a.category || '')
                    setEditStatus(a.status)
                    setEditBody(a.body)
                    setFeedback([])
                    setMyRating(5)
                    setMyHelpful(true)
                    setMyComment('')
                    setIsEditOpen(true)
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <td style={{ fontWeight: 680 }}>{a.title}</td>
                  <td className="snSubtle">{a.category || '—'}</td>
                  <td>
                    <Badge tone={a.status === 'PUBLISHED' ? 'success' : 'warning'}>
                      {a.status === 'PUBLISHED' ? 'Published' : 'Draft'}
                    </Badge>
                  </td>
                  <td className="snSubtle">{new Date(a.updated_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {!isLoading && articles.length === 0 ? <div style={{ color: 'var(--muted)' }}>No articles found.</div> : null}
      </Panel>

      <Modal title="New Knowledge Article" isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)}>
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (!auth.accessToken) return
            setError(null)
            try {
              await apiFetch<KnowledgeArticle>('/api/knowledge/', {
                method: 'POST',
                token: auth.accessToken,
                body: JSON.stringify({
                  title: createTitle,
                  category: createCategory,
                  status: createStatus,
                  body: createBody,
                }),
              })
              setIsCreateOpen(false)
              setCreateTitle('')
              setCreateCategory('')
              setCreateStatus('DRAFT')
              setCreateBody('')
              await load()
            } catch {
              setError('Failed to create article')
            }
          }}
          style={{ display: 'grid', gap: 12 }}
        >
          <label style={{ display: 'grid', gap: 6 }}>
            Title
            <Input value={createTitle} onChange={(e) => setCreateTitle(e.target.value)} required />
          </label>
          <div className="snRowWrap">
            <label style={{ display: 'grid', gap: 6, flex: '1 1 260px' }}>
              Category
              <Input value={createCategory} onChange={(e) => setCreateCategory(e.target.value)} />
            </label>
            <label style={{ display: 'grid', gap: 6, flex: '1 1 220px' }}>
              Status
              <Select value={createStatus} onChange={(e) => setCreateStatus(e.target.value as 'DRAFT' | 'PUBLISHED')}>
                <option value="DRAFT">Draft</option>
                <option value="PUBLISHED">Published</option>
              </Select>
            </label>
          </div>
          <label style={{ display: 'grid', gap: 6 }}>
            Body
            <textarea
              className="snInput"
              value={createBody}
              onChange={(e) => setCreateBody(e.target.value)}
              rows={10}
              required
            />
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
        title={activeArticle ? `Article · ${activeArticle.title}` : 'Article'}
        isOpen={isEditOpen}
        onClose={() => {
          setIsEditOpen(false)
          setActiveArticle(null)
        }}
      >
        {activeArticle && auth.accessToken ? (
          <div style={{ marginBottom: 12 }}>
            <div className="snRowWrap" style={{ justifyContent: 'space-between' }}>
              <div className="snRowWrap">
                <Badge tone="info">
                  Rating: {activeArticle.rating_avg ? activeArticle.rating_avg.toFixed(1) : '—'} ({activeArticle.rating_count})
                </Badge>
                <Badge tone={activeArticle.status === 'PUBLISHED' ? 'success' : 'warning'}>
                  {activeArticle.status === 'PUBLISHED' ? 'Published' : 'Draft'}
                </Badge>
              </div>
              <Button
                type="button"
                onClick={async () => {
                  if (!auth.accessToken || !activeArticle) return
                  setError(null)
                  try {
                    const list = await apiFetch<KnowledgeFeedback[]>(`/api/knowledge/${activeArticle.id}/feedback/`, { token: auth.accessToken })
                    setFeedback(Array.isArray(list) ? list : [])
                    const mine = (Array.isArray(list) ? list : []).find((f) => f.user.id === auth.user?.id)
                    if (mine) {
                      setMyRating(mine.rating)
                      setMyHelpful(mine.helpful)
                      setMyComment(mine.comment || '')
                    }
                  } catch {
                    setError('Failed to load feedback')
                  }
                }}
              >
                Refresh feedback
              </Button>
            </div>
          </div>
        ) : null}

        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (!auth.accessToken || !activeArticle) return
            if (!canEdit) return
            setIsSaving(true)
            setError(null)
            try {
              await apiFetch<KnowledgeArticle>(`/api/knowledge/${activeArticle.id}/`, {
                method: 'PATCH',
                token: auth.accessToken,
                body: JSON.stringify({
                  title: editTitle,
                  category: editCategory,
                  status: editStatus,
                  body: editBody,
                }),
              })
              setIsEditOpen(false)
              setActiveArticle(null)
              await load()
            } catch {
              setError('Failed to update article')
            } finally {
              setIsSaving(false)
            }
          }}
          style={{ display: 'grid', gap: 12 }}
        >
          <label style={{ display: 'grid', gap: 6 }}>
            Title
            <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} disabled={!canEdit || isSaving} />
          </label>
          <div className="snRowWrap">
            <label style={{ display: 'grid', gap: 6, flex: '1 1 260px' }}>
              Category
              <Input value={editCategory} onChange={(e) => setEditCategory(e.target.value)} disabled={!canEdit || isSaving} />
            </label>
            <label style={{ display: 'grid', gap: 6, flex: '1 1 220px' }}>
              Status
              <Select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as 'DRAFT' | 'PUBLISHED')}
                disabled={!canEdit || isSaving}
              >
                <option value="DRAFT">Draft</option>
                <option value="PUBLISHED">Published</option>
              </Select>
            </label>
          </div>
          <label style={{ display: 'grid', gap: 6 }}>
            Body
            <textarea
              className="snInput"
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              rows={12}
              disabled={!canEdit || isSaving}
            />
          </label>

          {activeArticle ? (
            <Panel title="Feedback">
              <div style={{ display: 'grid', gap: 12 }}>
                <div className="snRowWrap" style={{ justifyContent: 'space-between' }}>
                  <div className="snRowWrap">
                    <span className="snSubtle">Your rating</span>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setMyRating(n)}
                        className="snBtn"
                        style={{
                          padding: '6px 10px',
                          borderRadius: 999,
                          background: n <= myRating ? 'color-mix(in oklab, var(--primary) 18%, rgba(255,255,255,0.02))' : 'rgba(255,255,255,0.02)',
                        }}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <div className="snRowWrap">
                    <span className="snSubtle">Helpful</span>
                    <Select value={myHelpful ? 'yes' : 'no'} onChange={(e) => setMyHelpful(e.target.value === 'yes')}>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </Select>
                  </div>
                </div>

                <label style={{ display: 'grid', gap: 6 }}>
                  <span className="snSubtle">Comment</span>
                  <textarea className="snInput" value={myComment} onChange={(e) => setMyComment(e.target.value)} rows={3} />
                </label>

                <div className="snRowWrap" style={{ justifyContent: 'flex-end' }}>
                  <Button
                    type="button"
                    variant="primary"
                    disabled={isSubmittingFeedback || !auth.accessToken}
                    onClick={async () => {
                      if (!auth.accessToken || !activeArticle) return
                      setIsSubmittingFeedback(true)
                      setError(null)
                      try {
                        await apiFetch<KnowledgeFeedback>(`/api/knowledge/${activeArticle.id}/feedback/`, {
                          method: 'POST',
                          token: auth.accessToken,
                          body: JSON.stringify({ rating: myRating, helpful: myHelpful, comment: myComment }),
                        })
                        await load()
                        const list = await apiFetch<KnowledgeFeedback[]>(`/api/knowledge/${activeArticle.id}/feedback/`, { token: auth.accessToken })
                        setFeedback(Array.isArray(list) ? list : [])
                      } catch {
                        setError('Failed to submit feedback')
                      } finally {
                        setIsSubmittingFeedback(false)
                      }
                    }}
                  >
                    Submit feedback
                  </Button>
                </div>

                <div style={{ display: 'grid', gap: 10 }}>
                  {feedback.length === 0 ? <div className="snSubtle">No feedback yet.</div> : null}
                  {feedback.slice(0, 6).map((f) => (
                    <div key={f.id} style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10 }}>
                      <div className="snRow" style={{ justifyContent: 'space-between' }}>
                        <div style={{ fontWeight: 720, fontSize: 13 }}>{f.user.username}</div>
                        <div className="snSubtle">{new Date(f.created_at).toLocaleString()}</div>
                      </div>
                      <div className="snRowWrap" style={{ marginTop: 8 }}>
                        <Badge tone="info">{f.rating}/5</Badge>
                        <Badge tone={f.helpful ? 'success' : 'warning'}>{f.helpful ? 'Helpful' : 'Not helpful'}</Badge>
                      </div>
                      {f.comment ? <div style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{f.comment}</div> : null}
                    </div>
                  ))}
                </div>
              </div>
            </Panel>
          ) : null}

          <div className="snRowWrap" style={{ justifyContent: 'space-between' }}>
            <div className="snSubtle">{canEdit ? 'Edit and publish knowledge articles.' : 'Read-only access.'}</div>
            <div className="snRowWrap">
              <Button
                type="button"
                onClick={() => {
                  setIsEditOpen(false)
                  setActiveArticle(null)
                }}
              >
                Close
              </Button>
              {canEdit ? (
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
