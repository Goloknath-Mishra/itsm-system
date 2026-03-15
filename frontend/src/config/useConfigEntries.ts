/**
 * Reusable config loader for admin-managed master data (ConfigNamespace/ConfigEntry).
 *
 * This hook intentionally caches results per namespace for the session so enum-label lookups
 * don't trigger repeated network calls across pages/components.
 */
import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../api'
import { useAuth } from '../auth/useAuth'
import type { ConfigEntry } from '../itsmTypes'

const cache = new Map<string, ConfigEntry[]>()

export function useConfigEntries(namespaceKey: string) {
  const auth = useAuth()
  const [entries, setEntries] = useState<ConfigEntry[]>(() => cache.get(namespaceKey) || [])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const cached = cache.get(namespaceKey)
    if (cached) {
      setEntries(cached)
      return
    }
    if (!auth.accessToken || !namespaceKey) return
    let cancelled = false
    async function load() {
      setIsLoading(true)
      setError(null)
      try {
        const data = await apiFetch<ConfigEntry[]>(
          `/api/config/entries/?namespace_key=${encodeURIComponent(namespaceKey)}`,
          { token: auth.accessToken },
        )
        const active = data.filter((d) => d.is_active)
        cache.set(namespaceKey, active)
        if (!cancelled) setEntries(active)
      } catch {
        if (!cancelled) setError(`Failed to load config: ${namespaceKey}`)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [auth.accessToken, namespaceKey])

  const byKey = useMemo(() => {
    const map: Record<string, ConfigEntry> = {}
    for (const e of entries) map[e.key] = e
    return map
  }, [entries])

  return { entries, byKey, isLoading, error }
}

