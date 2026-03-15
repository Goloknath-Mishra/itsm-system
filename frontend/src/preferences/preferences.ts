export type Theme = 'dark' | 'light'
export type Density = 'comfortable' | 'compact'
export type Accent = 'cyan' | 'purple' | 'green' | 'orange' | 'pink'

export type Preferences = {
  theme: Theme
  accent: Accent
  density: Density
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'dark',
  accent: 'cyan',
  density: 'comfortable',
}

const STORAGE_KEY = 'itsm.preferences'

export function loadPreferences(): Preferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_PREFERENCES
    const parsed = JSON.parse(raw) as Partial<Preferences>
    const theme: Theme = parsed.theme === 'light' ? 'light' : 'dark'
    const density: Density = parsed.density === 'compact' ? 'compact' : 'comfortable'
    const accent: Accent =
      parsed.accent === 'purple' || parsed.accent === 'green' || parsed.accent === 'orange' || parsed.accent === 'pink'
        ? parsed.accent
        : 'cyan'
    return { theme, accent, density }
  } catch {
    return DEFAULT_PREFERENCES
  }
}

export function savePreferences(prefs: Preferences) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
}

export function applyPreferencesToDocument(prefs: Preferences) {
  document.documentElement.dataset.theme = prefs.theme
  document.documentElement.dataset.density = prefs.density

  const palette: Record<Accent, { primary: string; primary2: string }> = {
    cyan: { primary: '#1fd2ff', primary2: '#00e4b5' },
    purple: { primary: '#8b7bff', primary2: '#c084fc' },
    green: { primary: '#1dd75e', primary2: '#00e4b5' },
    orange: { primary: '#ffb020', primary2: '#ff7a45' },
    pink: { primary: '#ff3d61', primary2: '#ff6bd6' },
  }

  const c = palette[prefs.accent]
  document.documentElement.style.setProperty('--primary', c.primary)
  document.documentElement.style.setProperty('--primary-2', c.primary2)
}

