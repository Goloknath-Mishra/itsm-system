import type { User } from './AuthContext'

export type Role = 'ITSM_ADMIN' | 'ITSM_AGENT' | 'ITSM_REQUESTER'

export function hasRole(user: User | null | undefined, role: Role): boolean {
  // UI helper: mirrors backend RBAC (Django Groups + superuser override).
  if (!user) return false
  if (user.is_superuser) return true
  return Array.isArray(user.roles) && user.roles.includes(role)
}

export function isAgent(user: User | null | undefined): boolean {
  // Operational permissions: agents and privileged admins (plus legacy is_staff).
  return Boolean(user?.is_staff || hasRole(user, 'ITSM_AGENT') || hasRole(user, 'ITSM_ADMIN'))
}

export function isPrivileged(user: User | null | undefined): boolean {
  // Privileged admin permissions: ITSM_ADMIN or superuser.
  return Boolean(user?.is_superuser || hasRole(user, 'ITSM_ADMIN'))
}
