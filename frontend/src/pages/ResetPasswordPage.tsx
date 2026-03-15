import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiFetch } from '../api'
import { useAuthBackground } from '../auth/useAuthBackground'
import { Badge, Button, Input, Panel } from '../components/ui'

type ConfirmResponse = { detail: string }

export function ResetPasswordPage() {
  const { uid, token } = useParams()
  const navigate = useNavigate()
  const bg = useAuthBackground()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const validParams = useMemo(() => Boolean(uid && token), [token, uid])

  return (
    <div className="snAuthBg">
      {bg.fileInput}
      <div className="snAuthCard">
        <div className="snAuthBrand">
          <div>
            <div className="snAuthTitle">Set New Password</div>
            <div className="snSubtle">Choose a strong password for your account.</div>
          </div>
          <Badge tone="info">Command Center</Badge>
        </div>

        <Panel title="Reset Password">
          {!validParams ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ color: 'rgba(255, 61, 97, 0.95)', fontSize: 13 }}>Invalid reset link.</div>
              <Link to="/forgot-password" className="snSubtle">
                Request a new reset link
              </Link>
            </div>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault()
                setError(null)
                setStatus(null)
                if (password.length < 8) {
                  setError('Password must be at least 8 characters')
                  return
                }
                if (password !== confirm) {
                  setError('Passwords do not match')
                  return
                }
                setIsSubmitting(true)
                try {
                  const resp = await apiFetch<ConfirmResponse>('/api/auth/password-reset/confirm/', {
                    method: 'POST',
                    body: JSON.stringify({ uid, token, new_password: password }),
                  })
                  setStatus(resp.detail)
                  window.setTimeout(() => navigate('/login'), 600)
                } catch {
                  setError('Failed to reset password')
                } finally {
                  setIsSubmitting(false)
                }
              }}
              style={{ display: 'grid', gap: 12 }}
            >
              <label style={{ display: 'grid', gap: 6 }}>
                New password
                <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="new-password" />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                Confirm password
                <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} type="password" autoComplete="new-password" />
              </label>

              {status ? <div style={{ color: 'rgba(29,215,94,0.9)', fontSize: 13 }}>{status}</div> : null}
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
                  Reset password
                </Button>
              </div>
              </div>
            </form>
          )}
        </Panel>
      </div>
    </div>
  )
}
