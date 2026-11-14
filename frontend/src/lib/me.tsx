import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, type Me } from './api'

interface MeState {
  me: Me | null
  loading: boolean
  reload: () => Promise<Me | null>
  setMe: (me: Me) => void
}

const MeContext = createContext<MeState | null>(null)

/** The current person (guest or signed in), shared by the sidebar, dashboard and profile. */
export function MeProvider({ children }: { children: ReactNode }) {
  const [me, setMeState] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)
  const reload = useCallback(async () => {
    try {
      const next = await api.get<Me>('/me')
      setMeState(next)
      return next
    } catch {
      return null
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { void reload() }, [reload])
  const setMe = useCallback((next: Me) => setMeState((prev) => ({ ...next, activeSosId: next.activeSosId ?? prev?.activeSosId ?? null })), [])
  const value = useMemo(() => ({ me, loading, reload, setMe }), [me, loading, reload, setMe])
  return <MeContext.Provider value={value}>{children}</MeContext.Provider>
}

export function useMe(): MeState {
  const ctx = useContext(MeContext)
  if (!ctx) throw new Error('useMe must be used inside <MeProvider>')
  return ctx
}

export function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return ((parts[0]![0] ?? '') + (parts.length > 1 ? parts[parts.length - 1]![0] ?? '' : '')).toUpperCase()
}

export function firstName(name: string | null | undefined): string | null {
  return name?.trim().split(/\s+/)[0] ?? null
}

/** 98XXX XXX21 style, so a phone on screen doesn't show the whole number. */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone || phone.length < 10) return phone ?? ''
  return `+91 ${phone.slice(0, 2)}XXX XXX${phone.slice(-2)}`
}
