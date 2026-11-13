import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ApiError, getUserSession, logoutUser, type AuthUser } from '../api/client'
import { AuthContext, type AuthStatus } from './auth-context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [user, setUser] = useState<AuthUser | null>(null)

  const acceptSession = useCallback((session: Awaited<ReturnType<typeof getUserSession>>) => {
    setUser(session.user)
    setStatus('authenticated')
  }, [])

  const rejectSession = useCallback((error: unknown) => {
    setUser(null)
    setStatus(error instanceof ApiError && error.status === 401
      ? 'unauthenticated'
      : 'unavailable')
  }, [])

  const refresh = useCallback(async () => {
    try {
      acceptSession(await getUserSession())
    } catch (error) {
      rejectSession(error)
    }
  }, [acceptSession, rejectSession])

  useEffect(() => {
    const controller = new AbortController()
    getUserSession(controller.signal)
      .then(acceptSession)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) rejectSession(error)
      })
    return () => controller.abort()
  }, [acceptSession, rejectSession])

  const acceptUser = useCallback((nextUser: AuthUser) => {
    setUser(nextUser)
    setStatus('authenticated')
  }, [])

  const signOut = useCallback(async () => {
    await logoutUser()
    setUser(null)
    setStatus('unauthenticated')
  }, [])

  const value = useMemo(
    () => ({ status, user, refresh, acceptUser, signOut }),
    [acceptUser, refresh, signOut, status, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
