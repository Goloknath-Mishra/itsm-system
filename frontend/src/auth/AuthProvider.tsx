import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../api'
import { AuthContext, type AuthState, type User } from './AuthContext'

type TokenResponse = { access: string; refresh: string }

const STORAGE_KEY = 'itsm.auth'

type StoredAuth = {
  accessToken: string | null
  refreshToken: string | null
}

function loadStoredAuth(): StoredAuth {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { accessToken: null, refreshToken: null }
    const parsed = JSON.parse(raw) as StoredAuth
    return {
      accessToken: typeof parsed.accessToken === 'string' ? parsed.accessToken : null,
      refreshToken: typeof parsed.refreshToken === 'string' ? parsed.refreshToken : null,
    }
  } catch {
    return { accessToken: null, refreshToken: null }
  }
}

function saveStoredAuth(auth: StoredAuth) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(auth))
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const stored = loadStoredAuth()

  const [state, setState] = useState<AuthState>({
    accessToken: stored.accessToken,
    refreshToken: stored.refreshToken,
    user: null,
    isLoading: true,
  })

  const refreshMe = useCallback(async () => {
    if (!state.accessToken) {
      setState((s) => ({ ...s, user: null, isLoading: false }))
      return
    }
    try {
      const user = await apiFetch<User>('/api/me/', { token: state.accessToken })
      setState((s) => ({ ...s, user, isLoading: false }))
    } catch {
      setState((s) => ({ ...s, user: null, accessToken: null, refreshToken: null, isLoading: false }))
      saveStoredAuth({ accessToken: null, refreshToken: null })
    }
  }, [state.accessToken])

  const login = useCallback(async (username: string, password: string) => {
    const tokens = await apiFetch<TokenResponse>('/api/token/', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
    saveStoredAuth({ accessToken: tokens.access, refreshToken: tokens.refresh })
    setState((s) => ({
      ...s,
      accessToken: tokens.access,
      refreshToken: tokens.refresh,
      isLoading: true,
    }))
  }, [])

  const logout = useCallback(() => {
    saveStoredAuth({ accessToken: null, refreshToken: null })
    setState({ accessToken: null, refreshToken: null, user: null, isLoading: false })
  }, [])

  useEffect(() => {
    let cancelled = false
    const token = state.accessToken

    async function run() {
      await Promise.resolve()
      if (cancelled) return

      if (!token) {
        setState((s) => ({ ...s, user: null, isLoading: false }))
        return
      }

      try {
        const user = await apiFetch<User>('/api/me/', { token })
        if (cancelled) return
        setState((s) => ({ ...s, user, isLoading: false }))
      } catch {
        if (cancelled) return
        setState((s) => ({ ...s, user: null, accessToken: null, refreshToken: null, isLoading: false }))
        saveStoredAuth({ accessToken: null, refreshToken: null })
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [state.accessToken])

  const value = useMemo(
    () => ({ ...state, login, logout, refreshMe }),
    [login, logout, refreshMe, state],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
