import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type LatLng, type Meta } from './api'

// ---------- location ----------

export type LocationState =
  | { status: 'idle' | 'locating'; coords: (LatLng & { accuracy: number }) | null }
  | { status: 'ready'; coords: LatLng & { accuracy: number } }
  | { status: 'error'; message: string; coords: (LatLng & { accuracy: number }) | null }

const LOC_KEY = 'cp:lastLocation'

function readSaved(): (LatLng & { accuracy: number }) | null {
  try {
    const raw = localStorage.getItem(LOC_KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as LatLng & { accuracy: number; at: number }
    return Date.now() - v.at < 6 * 3600_000 ? { lat: v.lat, lng: v.lng, accuracy: v.accuracy } : null
  } catch {
    return null
  }
}

export function getPosition(highAccuracy = true): Promise<LatLng & { accuracy: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Location is not available on this device.'))
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const c = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }
        try { localStorage.setItem(LOC_KEY, JSON.stringify({ ...c, at: Date.now() })) } catch { /* storage unavailable */ }
        resolve(c)
      },
      (e) => reject(new Error(
        e.code === e.PERMISSION_DENIED
          ? 'Location permission is off. Turn it on in your browser settings so we can find help near you.'
          : 'Could not get your location. Move near a window or try again.',
      )),
      { enableHighAccuracy: highAccuracy, timeout: 12_000, maximumAge: 30_000 },
    )
  })
}

/** Shared location with a remembered fallback, so the home screen is useful instantly. */
export function useLocation(auto = true) {
  const [state, setState] = useState<LocationState>(() => {
    const saved = readSaved()
    return saved ? { status: 'ready', coords: saved } : { status: 'idle', coords: null }
  })
  const locate = useCallback(async () => {
    setState((s) => ({ status: 'locating', coords: s.coords }))
    try {
      const coords = await getPosition(false)
      setState({ status: 'ready', coords })
      return coords
    } catch (e) {
      setState((s) => ({ status: 'error', message: (e as Error).message, coords: s.coords }))
      return null
    }
  }, [])
  useEffect(() => {
    if (auto) void locate()
  }, [auto, locate])
  return { ...state, locate }
}

// ---------- data ----------

export function useApi<T>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(path !== null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (path === null) { setLoading(false); return }
    const ctrl = new AbortController()
    setLoading(true)
    setError(null)
    api.get<T>(path, ctrl.signal)
      .then((d) => { setData(d); setLoading(false) })
      .catch((e: Error) => { if (e.name !== 'AbortError') { setError(e.message); setLoading(false) } })
    return () => ctrl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, tick, ...deps])
  return { data, error, loading, reload: () => setTick((t) => t + 1) }
}

let metaCache: Promise<Meta> | null = null
export function useMeta() {
  const [meta, setMeta] = useState<Meta | null>(null)
  useEffect(() => {
    metaCache ??= api.get<Meta>('/meta')
    metaCache.then(setMeta).catch(() => { metaCache = null })
  }, [])
  return meta
}

// ---------- live updates ----------

/** Subscribe to a Server-Sent Events stream; reconnects automatically. */
export function useEventStream<T>(url: string | null, event: string, onMessage: (data: T) => void) {
  const handler = useRef(onMessage)
  handler.current = onMessage
  const [connected, setConnected] = useState(false)
  useEffect(() => {
    if (!url) return
    const es = new EventSource(url, { withCredentials: true })
    es.onopen = () => setConnected(true)
    es.onerror = () => setConnected(false)
    const listener = (e: MessageEvent) => handler.current(JSON.parse(e.data) as T)
    es.addEventListener(event, listener)
    return () => { es.removeEventListener(event, listener); es.close() }
  }, [url, event])
  return connected
}
