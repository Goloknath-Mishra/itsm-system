import { createContext } from 'react'
import type { Preferences } from './preferences'

export type PreferencesContextValue = {
  preferences: Preferences
  setPreferences: (next: Preferences) => void
  saveToServer: (next?: Preferences) => Promise<void>
}

export const PreferencesContext = createContext<PreferencesContextValue | null>(null)

