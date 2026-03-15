export type ApiError = {
  status: number
  message: string
}

function defaultApiBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location) {
    const { protocol, hostname } = window.location
    if (hostname.endsWith('.app.github.dev')) {
      const apiHost = hostname.replace(/-\d+\.app\.github\.dev$/, '-8000.app.github.dev')
      return `${protocol}//${apiHost}`
    }
    if (hostname === 'localhost' || hostname === '127.0.0.1') return 'http://localhost:8000'
  }
  return 'http://localhost:8000'
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? defaultApiBaseUrl()

export function buildApiUrl(path: string): string {
  const base = API_BASE_URL.replace(/\/+$/, '')
  const cleanedPath = path.startsWith('/') ? path : `/${path}`
  return `${base}${cleanedPath}`
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const url = buildApiUrl(path)
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (init.token) {
    headers.set('Authorization', `Bearer ${init.token}`)
  }

  const resp = await fetch(url, { ...init, headers })
  const contentType = resp.headers.get('content-type') ?? ''
  const isJson = contentType.includes('application/json')

  if (!resp.ok) {
    const message = isJson
      ? JSON.stringify(await resp.json().catch(() => ({})))
      : await resp.text().catch(() => '')
    throw { status: resp.status, message } satisfies ApiError
  }

  if (resp.status === 204) {
    return undefined as T
  }

  if (isJson) {
    return (await resp.json()) as T
  }
  return (await resp.text()) as T
}
