import { createContext } from 'react'
import type { AuthUser } from '../api/client'

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'unavailable'

export interface AuthContextValue {
  status: AuthStatus
  user: AuthUser | null
  refresh: () => Promise<void>
  acceptUser: (user: AuthUser) => void
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
