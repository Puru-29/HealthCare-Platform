import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// Live updates: tests drive state through fetch responses, so the stream is a no-op.
class FakeEventSource {
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  addEventListener() {}
  removeEventListener() {}
  close() {}
}
vi.stubGlobal('EventSource', FakeEventSource)

Object.defineProperty(navigator, 'geolocation', {
  configurable: true,
  value: {
    getCurrentPosition: (ok: PositionCallback) => ok({ coords: { latitude: 28.995, longitude: 77.03, accuracy: 15 } } as GeolocationPosition),
    watchPosition: () => 0,
    clearWatch: () => undefined,
  },
})
Object.defineProperty(navigator, 'vibrate', { configurable: true, value: () => true })

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.stubGlobal('EventSource', FakeEventSource)
  localStorage.clear()
  sessionStorage.clear()
})
