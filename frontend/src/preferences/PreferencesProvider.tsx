import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../api'
import { useAuth } from '../auth/useAuth'
import { PreferencesContext } from './PreferencesContext'
import { type Preferences, applyPreferencesToDocument, loadPreferences, savePreferences } from './preferences'

type PreferencesResponse = Preferences & { updated_at?: string }

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const [preferences, setPreferencesState] = useState<Preferences>(() => loadPreferences())

  const setPreferences = useCallback((next: Preferences) => {
    setPreferencesState(next)
    savePreferences(next)
    applyPreferencesToDocument(next)
  }, [])

  const saveToServer = useCallback(
    async (next?: Preferences) => {
      if (!auth.accessToken) return
      const payload = next ?? preferences
      await apiFetch<PreferencesResponse>('/api/preferences/', {
        method: 'PATCH',
        token: auth.accessToken,
        body: JSON.stringify(payload),
      })
    },
    [auth.accessToken, preferences],
  )

  useEffect(() => {
    applyPreferencesToDocument(preferences)
  }, [preferences])

  useEffect(() => {
    async function loadFromServer() {
      if (!auth.accessToken) return
      try {
        const remote = await apiFetch<PreferencesResponse>('/api/preferences/', { token: auth.accessToken })
        const next: Preferences = { theme: remote.theme, accent: remote.accent, density: remote.density }
        setPreferences(next)
      } catch {
        return
      }
    }
    void loadFromServer()
  }, [auth.accessToken, setPreferences])

  const value = useMemo(() => ({ preferences, setPreferences, saveToServer }), [preferences, saveToServer, setPreferences])
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
}

