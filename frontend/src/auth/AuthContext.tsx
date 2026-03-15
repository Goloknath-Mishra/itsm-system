import { createContext } from 'react'

export type User = {
  id: number
  username: string
  first_name: string
  last_name: string
  email: string
  is_staff: boolean
  is_superuser: boolean
  roles: string[]
}

export type AuthState = {
  accessToken: string | null
  refreshToken: string | null
  user: User | null
  isLoading: boolean
}

export type AuthContextValue = AuthState & {
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  refreshMe: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
