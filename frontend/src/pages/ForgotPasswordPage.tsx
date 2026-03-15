import { useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../api'
import { useAuthBackground } from '../auth/useAuthBackground'
import { Badge, Button, Input, Panel } from '../components/ui'

type ResetResponse = { detail: string; debug_reset_url?: string }

export function ForgotPasswordPage() {
  const bg = useAuthBackground()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [debugLink, setDebugLink] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  return (
    <div className="snAuthBg">
      {bg.fileInput}
      <div className="snAuthCard">
        <div className="snAuthBrand">
          <div>
            <div className="snAuthTitle">Reset Password</div>
            <div className="snSubtle">Enter your email or username to receive a reset link.</div>
          </div>
          <Badge tone="info">Command Center</Badge>
        </div>

        <Panel title="Forgot Password">
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              setError(null)
              setStatus(null)
              setDebugLink(null)
              setIsSubmitting(true)
              try {
                const resp = await apiFetch<ResetResponse>('/api/auth/password-reset/', {
                  method: 'POST',
                  body: JSON.stringify({ email }),
                })
                setStatus(resp.detail)
                if (resp.debug_reset_url) setDebugLink(resp.debug_reset_url)
              } catch {
                setError('Failed to request password reset')
              } finally {
                setIsSubmitting(false)
              }
            }}
            style={{ display: 'grid', gap: 12 }}
          >
            <label style={{ display: 'grid', gap: 6 }}>
              Email or username
              <Input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </label>

            {status ? <div style={{ color: 'rgba(255,255,255,0.84)', fontSize: 13 }}>{status}</div> : null}
            {debugLink ? (
              <div style={{ fontSize: 13 }}>
                <span className="snSubtle">Dev reset link: </span>
                <a href={debugLink} style={{ color: 'rgba(31,210,255,0.95)' }}>
                  {debugLink}
                </a>
              </div>
            ) : null}
            {error ? <div style={{ color: 'rgba(255, 61, 97, 0.95)', fontSize: 13 }}>{error}</div> : null}

            <div className="snRowWrap" style={{ justifyContent: 'space-between' }}>
              <Link to="/login" className="snSubtle">
                Back to sign in
              </Link>
              <div className="snRowWrap">
                <button type="button" className="snBtn" style={{ padding: '7px 10px' }} onClick={bg.openPicker}>
                  Change background
                </button>
                {bg.isCustom ? (
                  <button type="button" className="snBtn" style={{ padding: '7px 10px' }} onClick={bg.clear}>
                    Reset
                  </button>
                ) : null}
                <Button type="submit" variant="primary" disabled={isSubmitting}>
                  Send reset link
                </Button>
              </div>
            </div>
          </form>
        </Panel>
      </div>
    </div>
  )
}
