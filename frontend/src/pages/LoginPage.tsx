import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthBackground } from '../auth/useAuthBackground'
import { useAuth } from '../auth/useAuth'
import { Badge, Button, Input, Panel } from '../components/ui'

export function LoginPage() {
  const auth = useAuth()
  const bg = useAuthBackground()
  const navigate = useNavigate()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="snAuthBg">
      {bg.fileInput}
      <div className="snAuthCard">
        <div className="snAuthBrand">
          <div>
            <div className="snAuthTitle">IT Service Hub</div>
            <div className="snSubtle">Sign in to your account</div>
          </div>
          <Badge tone="info">Command Center</Badge>
        </div>

        <Panel title="Access">
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              setError(null)
              try {
                await auth.login(username, password)
                await auth.refreshMe()
                navigate('/dashboard')
              } catch {
                setError('Login failed')
              }
            }}
            style={{ display: 'grid', gap: 12 }}
          >
            <label style={{ display: 'grid', gap: 6 }}>
              Username
              <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              Password
              <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" />
            </label>

            <div className="snRowWrap" style={{ justifyContent: 'space-between' }}>
              <Link to="/forgot-password" className="snSubtle">
                Forgot password?
              </Link>
              <div className="snRowWrap" style={{ justifyContent: 'flex-end' }}>
                <button type="button" className="snBtn" style={{ padding: '7px 10px' }} onClick={bg.openPicker}>
                  Change background
                </button>
                {bg.isCustom ? (
                  <button type="button" className="snBtn" style={{ padding: '7px 10px' }} onClick={bg.clear}>
                    Reset
                  </button>
                ) : null}
              </div>
            </div>

            {error ? <div style={{ color: 'rgba(255, 61, 97, 0.95)', fontSize: 13 }}>{error}</div> : null}

            <div className="snSubtle">Demo: agent / Agent123! or user / User123!</div>

            <div className="snRowWrap" style={{ justifyContent: 'flex-end', marginTop: 2 }}>
              <Button type="submit" variant="primary" disabled={auth.isLoading}>
                Sign in
              </Button>
            </div>
          </form>
        </Panel>
      </div>
    </div>
  )
}
