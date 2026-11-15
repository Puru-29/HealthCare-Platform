import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { directionsUrl } from '../lib/format'
import { directionsOrigin, type Fix } from '../lib/hooks'
import { HospitalDetailPage } from '../pages/HospitalDetailPage'
import { fakeApi } from './fakeApi'

vi.mock('../components/MapView', () => ({ MapView: () => <div data-testid="map" /> }))

const SDH_GOHANA = { lat: 29.1381755, lng: 76.693045 }
const params = (url: string) => new URL(url).searchParams

function setPointer(coarse: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(pointer: coarse)' && coarse, media: q, addEventListener() {}, removeEventListener() {} }))
}
const fix = (over: Partial<Fix> = {}): Fix => ({ lat: 28.99, lng: 77.02, accuracy: 20, at: Date.now(), ...over })

afterEach(() => vi.unstubAllGlobals())

describe('Google Maps directions link', () => {
  it('always routes to the exact pin, never to a name Google might match elsewhere', () => {
    const p = params(directionsUrl(SDH_GOHANA))
    expect(p.get('destination')).toBe('29.1381755,76.693045')
    expect(p.get('destination')).not.toMatch(/[a-z]/i) // no hospital name in the query
    expect(p.get('api')).toBe('1')
    expect(p.get('travelmode')).toBe('driving')
    expect(p.has('origin')).toBe(false)
  })

  it('includes our own location as the start when given one', () => {
    expect(params(directionsUrl(SDH_GOHANA, { origin: { lat: 28.98, lng: 77.01 } })).get('origin')).toBe('28.980000,77.010000')
  })
})

describe('when to pass our location as the starting point', () => {
  it('on a computer, with a fresh accurate fix', () => {
    setPointer(false)
    expect(directionsOrigin(fix())).toEqual({ lat: 28.99, lng: 77.02 })
  })
  it('never on a phone — the Maps app navigates from live GPS', () => {
    setPointer(true)
    expect(directionsOrigin(fix())).toBeNull()
  })
  it('not from a stale or rough fix', () => {
    setPointer(false)
    expect(directionsOrigin(fix({ at: Date.now() - 6 * 60_000 }))).toBeNull()
    expect(directionsOrigin(fix({ accuracy: 2000 }))).toBeNull()
    expect(directionsOrigin(null)).toBeNull()
  })
})

describe('hospital page Directions button', () => {
  function renderHospital(over: Record<string, unknown> = {}) {
    fakeApi({
      'GET /api/hospitals/pmjay-hosp6g02452': {
        id: 'pmjay-hosp6g02452', name: 'SDH Gohana (Civil Hospital)', facilityType: 'sub_district_hospital', facilityTypeLabel: 'Sub-district hospital',
        ownership: 'public', address: 'Devi Nagar, Gohana', phone: null, location: SDH_GOHANA, locationPrecision: 'building', beds: 100, bedsSource: null,
        pmjay: null, specialties: [], insurers: [], verified: false, emergency24x7: null, ambulancesAvailable: 1, onCarePath: true,
        sources: ['OpenStreetMap'], notes: null, distanceKm: 51, etaMinutes: 96, ...over,
      },
    })
    render(
      <MemoryRouter initialEntries={['/app/hospitals/pmjay-hosp6g02452']}>
        <Routes><Route path="/app/hospitals/:id" element={<HospitalDetailPage />} /></Routes>
      </MemoryRouter>,
    )
  }

  it('routes to SDH Gohana’s own pin in Gohana, starting from where you are', async () => {
    setPointer(false)
    renderHospital()
    const p = params((await screen.findByRole('link', { name: /Directions/ })).getAttribute('href')!)
    expect(p.get('destination')).toBe('29.1381755,76.693045')
    // The test browser reports 28.995, 77.03 (see setup.ts): sent as the start so Google doesn't guess from the IP.
    expect(p.get('origin')).toBe('28.995000,77.030000')
    expect(screen.getByText(/Google may label it with a shop next door/)).toBeTruthy()
  })

  it('has no Directions button when the location is not confirmed', async () => {
    renderHospital({ location: null, locationPrecision: null, notes: 'Map location not confirmed' })
    await screen.findByRole('heading', { name: 'SDH Gohana (Civil Hospital)' })
    expect(screen.queryByRole('link', { name: /Directions/ })).toBeNull()
  })
})
