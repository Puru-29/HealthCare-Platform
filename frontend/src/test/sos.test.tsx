import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { SosSheet } from '../components/SosSheet'
import { MeProvider } from '../lib/me'
import { ROAD_ACCIDENT_ADVISORY } from '../lib/sos'
import { SosPage } from '../pages/SosPage'
import { TrackPage } from '../pages/TrackPage'
import { fakeApi, GUEST, incident } from './fakeApi'

// Leaflet can't draw in jsdom; the map is covered by the backend tests and the browser.
vi.mock('../components/MapView', () => ({ MapView: () => <div data-testid="map" /> }))

const ME = { ...GUEST, name: 'Asha Devi', phone: '9812345678', emergencyContactName: 'Ravi', emergencyContactPhone: '9876500000' }

function renderSheet(onSent = vi.fn()) {
  render(<SosSheet me={ME} coords={{ lat: 28.995, lng: 77.03, accuracy: 15 }} onClose={vi.fn()} onSent={onSent} />)
  return onSent
}

describe('SOS sheet quick buttons', () => {
  it('offers the six quick buttons, one selectable at a time', () => {
    renderSheet()
    const labels = ['Chest pain', 'Breathing', 'Unconscious', 'Accident', 'Pregnancy', 'Other']
    for (const l of labels) expect(screen.getByRole('button', { name: l })).toHaveProperty('ariaPressed', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'Chest pain' }))
    expect(screen.getByRole('button', { name: 'Chest pain' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Breathing' }))
    expect(screen.getByRole('button', { name: 'Chest pain' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: 'Breathing' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('shows the road-accident notice only for Accident', () => {
    renderSheet()
    expect(screen.queryByText(ROAD_ACCIDENT_ADVISORY)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Chest pain' }))
    expect(screen.queryByText(ROAD_ACCIDENT_ADVISORY)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Accident' }))
    expect(screen.getByRole('note').textContent).toBe(ROAD_ACCIDENT_ADVISORY)
    expect(ROAD_ACCIDENT_ADVISORY).toContain('₹1.5 lakh for 7 days')
  })

  it('tells serious cases we look for an ALS ambulance first, without promising to wait', () => {
    renderSheet()
    fireEvent.click(screen.getByRole('button', { name: 'Unconscious' }))
    expect(screen.getByText(/advanced life-support ambulance first — and any ambulance if none is free/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Pregnancy' }))
    expect(screen.queryByText(/advanced life-support/)).toBeNull()
  })

  it('sends the chosen category with the SOS, and mentions the family SMS', async () => {
    const calls = fakeApi({ 'POST /api/sos': incident({ id: 'new-sos' }) })
    const onSent = renderSheet()
    expect(screen.getByText(/Ravi will get an SMS with a live tracking link/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Accident' }))
    fireEvent.click(screen.getByRole('button', { name: 'Send SOS now' }))
    await waitFor(() => expect(onSent).toHaveBeenCalledWith('new-sos'))
    expect(calls.find((c) => c.path === '/api/sos')!.body).toMatchObject({ category: 'accident', phone: '9812345678', lat: 28.995 })
  })

  it('sends no category if none was tapped (never required)', async () => {
    const calls = fakeApi({ 'POST /api/sos': incident() })
    const onSent = renderSheet()
    fireEvent.click(screen.getByRole('button', { name: 'Send SOS now' }))
    await waitFor(() => expect(onSent).toHaveBeenCalled())
    expect(calls.find((c) => c.path === '/api/sos')!.body).toMatchObject({ category: null })
  })
})

function renderSos(view: ReturnType<typeof incident>) {
  fakeApi({ 'GET /api/me': GUEST, 'GET /api/meta': { specialties: [], demoMode: false, assistant: { aiAvailable: false, reason: null }, attribution: '' }, 'GET /api/sos/inc-1': view })
  render(
    <MemoryRouter initialEntries={['/app/sos/inc-1']}>
      <MeProvider><Routes><Route path="/app/sos/:id" element={<SosPage />} /></Routes></MeProvider>
    </MemoryRouter>,
  )
}

describe('SOS screen', () => {
  const CARD = /No hospital accepted yet — call 108 now, we’re still searching/

  it('shows the big call-108 card once the first ring went unanswered, with a tap-to-call button', async () => {
    renderSos(incident({ search: { wave: 2, radiusKm: 15, noAcceptanceYet: true } }))
    const heading = await screen.findByRole('heading', { name: CARD })
    const card = heading.closest('section')!
    expect(within(card).getByRole('link', { name: /Call 108/ }).getAttribute('href')).toBe('tel:108')
    expect(screen.getByRole('heading', { name: 'Finding the nearest ambulance' })).toBeTruthy() // still searching
  })

  it('does not show it during the first ring', async () => {
    renderSos(incident())
    await screen.findByRole('heading', { name: 'Finding the nearest ambulance' })
    expect(screen.queryByRole('heading', { name: CARD })).toBeNull()
  })

  it('does not show it once a hospital has accepted', async () => {
    renderSos(incident({ status: 'assigned', search: { wave: 2, noAcceptanceYet: false }, hospital: { id: 'h', name: 'District Civil Hospital, Sonipat', phone: null, address: null, location: null } }))
    await screen.findByRole('heading', { name: 'Ambulance on the way' })
    expect(screen.queryByRole('heading', { name: CARD })).toBeNull()
  })

  it('shows the road-accident notice for accident SOS', async () => {
    renderSos(incident({ category: 'accident', categoryLabel: 'Accident', advisories: [{ id: 'road_accident_cashless', text: ROAD_ACCIDENT_ADVISORY }] }))
    expect(await screen.findByText(ROAD_ACCIDENT_ADVISORY)).toBeTruthy()
  })

  it('tells the patient their emergency contact can follow along', async () => {
    renderSos(incident({ familyTracking: true }))
    expect(await screen.findByText('Your emergency contact has a live tracking link.')).toBeTruthy()
  })
})

function renderTrack(response: unknown) {
  fakeApi({ 'GET /api/track/tok123': response })
  render(
    <MemoryRouter initialEntries={['/track/tok123']}>
      <Routes><Route path="/track/:token" element={<TrackPage />} /></Routes>
    </MemoryRouter>,
  )
}

const TRACK = {
  status: 'assigned', createdAt: new Date().toISOString(), pickup: { lat: 28.995, lng: 77.03 },
  search: { wave: 1, totalWaves: 3, radiusKm: 8, contactedThisWave: 2, noAcceptanceYet: false },
  hospital: { name: 'District Civil Hospital, Sonipat', location: { lat: 28.99, lng: 77.03 } },
  ambulance: { vehicleNumber: 'HR 10 AB 1234', kind: 'ALS', location: { lat: 28.99, lng: 77.02 }, locationAt: new Date().toISOString() },
  eta: { minutes: 7, distanceKm: 2.1, source: 'osrm', path: [] }, traffic: null,
  timeline: [{ at: new Date().toISOString(), type: 'assigned', message: 'A hospital accepted. The ambulance is on the way.' }],
  endedAt: null, expiresAt: null,
}

describe('family tracking page', () => {
  it('shows status, hospital, ambulance and ETA', async () => {
    renderTrack(TRACK)
    expect(await screen.findByRole('heading', { name: 'Ambulance on the way' })).toBeTruthy()
    expect(screen.getByText('HR 10 AB 1234')).toBeTruthy()
    expect(screen.getAllByText(/District Civil Hospital, Sonipat/).length).toBeGreaterThan(0)
    expect(screen.getByText('7 min')).toBeTruthy()
    expect(screen.getByTestId('map')).toBeTruthy()
  })

  it('offers no way to call anyone except the public 112/108 numbers', async () => {
    renderTrack(TRACK)
    await screen.findByRole('heading', { name: 'Ambulance on the way' })
    const tels = screen.getAllByRole('link').map((a) => a.getAttribute('href')).filter((h) => h?.startsWith('tel:'))
    expect(new Set(tels)).toEqual(new Set(['tel:112', 'tel:108']))
  })

  it('explains an expired link', async () => {
    renderTrack([410, { error: { code: 'expired', message: 'This tracking link has expired' } }])
    expect(await screen.findByRole('heading', { name: 'This tracking link has expired' })).toBeTruthy()
    expect(screen.getByText(/12 hours after the trip ends/)).toBeTruthy()
  })

  it('explains an invalid link', async () => {
    renderTrack([404, { error: { code: 'not_found', message: 'nope' } }])
    expect(await screen.findByRole('heading', { name: 'This link isn’t valid' })).toBeTruthy()
  })
})
