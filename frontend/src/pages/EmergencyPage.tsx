import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  LocateFixed,
  MapPin,
  Phone,
  RotateCcw,
  ShieldAlert,
  Truck,
  WifiOff,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getHospitals, type Hospital } from '../api/client'
import { DirectoryState } from '../components/DirectoryState'
import { PageIntro } from '../components/PageIntro'

type EmergencyPageProps = {
  basePath?: string
}

type Coordinates = {
  latitude: number
  longitude: number
  accuracy: number
}

type LocationState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'available'; coordinates: Coordinates }
  | { status: 'error'; message: string }

type HospitalLoadState = {
  hospitals: Hospital[] | null
  total: number
  error: string | null
}

function hasValidCoordinates(
  hospital: Hospital,
): hospital is Hospital & { latitude: number; longitude: number } {
  return hospital.latitude !== null &&
    hospital.longitude !== null &&
    Number.isFinite(hospital.latitude) &&
    Number.isFinite(hospital.longitude) &&
    hospital.latitude >= -90 &&
    hospital.latitude <= 90 &&
    hospital.longitude >= -180 &&
    hospital.longitude <= 180
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function distanceInKilometers(from: Coordinates, latitude: number, longitude: number): number {
  const radians = (degrees: number) => degrees * Math.PI / 180
  const earthRadiusKilometers = 6371
  const latitudeDifference = radians(latitude - from.latitude)
  const longitudeDifference = radians(longitude - from.longitude)
  const haversine =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(radians(from.latitude)) *
    Math.cos(radians(latitude)) *
    Math.sin(longitudeDifference / 2) ** 2
  return 2 * earthRadiusKilometers * Math.asin(Math.sqrt(Math.min(1, haversine)))
}

function requestDeviceLocation(): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Location is not available in this browser. You can still call emergency services or browse verified hospitals.'))
      return
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy: coords.accuracy,
      }),
      (error) => {
        const message = error.code === error.PERMISSION_DENIED
          ? 'Location permission was denied. You can still call 112 or browse the hospital directory.'
          : error.code === error.POSITION_UNAVAILABLE
            ? 'Your device could not determine a location. You can still call 112 or browse the hospital directory.'
            : 'The location request timed out. You can still call 112 or browse the hospital directory.'
        reject(new Error(message))
      },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 10_000 },
    )
  })
}

export function EmergencyPage({ basePath = '' }: EmergencyPageProps) {
  const [hospitalState, setHospitalState] = useState<HospitalLoadState | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [locationState, setLocationState] = useState<LocationState>({ status: 'idle' })
  const [locating, setLocating] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    getHospitals({ city: 'Sonipat', limit: 100, offset: 0 }, controller.signal)
      .then(({ data, pagination }) => setHospitalState({
        hospitals: data,
        total: pagination.total,
        error: null,
      }))
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setHospitalState({
          hospitals: null,
          total: 0,
          error: cause instanceof Error ? cause.message : 'Could not load published hospital contact options.',
        })
      })
    return () => controller.abort()
  }, [retryCount])

  const hospitals = hospitalState?.hospitals ?? null
  const sortedHospitals = useMemo(() => {
    if (!hospitals) return []
    const location = locationState.status === 'available' ? locationState.coordinates : null
    return hospitals
      .map((hospital) => ({
        hospital,
        distance: location && hasValidCoordinates(hospital)
          ? distanceInKilometers(location, hospital.latitude, hospital.longitude)
          : null,
      }))
      .sort((first, second) => {
        if (first.distance === null) return second.distance === null ? 0 : 1
        if (second.distance === null) return -1
        return first.distance - second.distance
      })
  }, [hospitals, locationState])

  async function findNearbyHospitals() {
    setLocating(true)
    setLocationState({ status: 'loading' })
    try {
      const coordinates = await requestDeviceLocation()
      setLocationState({ status: 'available', coordinates })
    } catch (cause) {
      setLocationState({
        status: 'error',
        message: cause instanceof Error ? cause.message : 'Could not access device location.',
      })
    } finally {
      setLocating(false)
    }
  }

  return (
    <div className="emergency-page">
      <PageIntro
        description="Emergency guidance and published hospital contact details for Sonipat. CarePath is not an emergency service and cannot dispatch help."
        eyebrow="Emergency assistance · Sonipat"
        title="Get urgent help."
      />

      <section aria-labelledby="call-emergency-heading" className="emergency-sos-panel">
        <div className="emergency-sos-copy">
          <span className="emergency-sos-icon"><AlertTriangle aria-hidden="true" size={25} /></span>
          <div>
            <p className="emergency-eyebrow">INDIA EMERGENCY NUMBER</p>
            <h2 id="call-emergency-heading">Immediate danger? Call 112.</h2>
            <p>If someone is in immediate danger or needs urgent assistance, contact emergency services now. This opens your device’s phone app; CarePath does not place the call or send your location automatically.</p>
          </div>
        </div>
        <a aria-label="Call India's emergency number 112" className="emergency-call-button" href="tel:112">
          <Phone aria-hidden="true" size={19} /> Call 112
        </a>
      </section>

      <div className="emergency-guidance-grid">
        <section className="emergency-guidance-card">
          <span><ShieldAlert aria-hidden="true" size={18} /></span>
          <div>
            <h2>While seeking help</h2>
            <p>Follow instructions from emergency responders. If it is safe, ask someone nearby to call or accompany you. Do not rely on this page to assess a medical situation.</p>
          </div>
        </section>
        <section className="emergency-guidance-card emergency-guidance-card--muted">
          <span><Truck aria-hidden="true" size={18} /></span>
          <div>
            <h2>Ambulance dispatch is not connected</h2>
            <p>CarePath cannot request, dispatch, or track an ambulance. No live ambulance provider or availability data is connected.</p>
          </div>
        </section>
      </div>

      <section aria-labelledby="emergency-hospitals-heading" className="emergency-hospitals-panel">
        <div className="emergency-hospitals-heading">
          <div>
            <p className="emergency-eyebrow">PUBLISHED DIRECTORY RECORDS</p>
            <h2 id="emergency-hospitals-heading">Hospital contact options</h2>
            <p>Only published, currently verified Sonipat hospital listings are shown. Contact the hospital directly to confirm availability.</p>
          </div>
          <button
            className="glass-button emergency-location-button"
            disabled={locating}
            onClick={() => void findNearbyHospitals()}
            type="button"
          >
            <LocateFixed aria-hidden="true" size={16} />
            {locating ? 'Finding location…' : locationState.status === 'available' ? 'Refresh nearby sort' : 'Use my location'}
          </button>
        </div>

        <p className="emergency-privacy-note">
          <MapPin aria-hidden="true" size={14} />
          {locationState.status === 'available'
            ? `Nearby sorting uses your device location in this page only (accuracy about ${Math.round(locationState.coordinates.accuracy)} m). It is not sent to CarePath.`
            : 'Location is optional. If allowed, it is used only in this page to sort directory listings by distance; it is not sent to CarePath.'}
        </p>
        {hospitals && hospitalState && hospitalState.total > hospitals.length && (
          <p className="emergency-results-note">
            Showing the first {hospitals.length} verified listings. The full directory has {hospitalState.total} records and may include other nearby options.
            {' '}<Link to={`${basePath}/hospitals`}>Browse all listings <ArrowRight aria-hidden="true" size={13} /></Link>
          </p>
        )}
        {locationState.status === 'error' && <p className="emergency-location-error" role="status">{locationState.message}</p>}

        {hospitals === null ? (
          hospitalState?.error ? (
            <div className="emergency-load-error">
              <DirectoryState message={hospitalState.error} title="Could not load hospital contacts" type="error" />
              <button className="glass-button glass-button-primary" onClick={() => setRetryCount((count) => count + 1)} type="button">
                <RotateCcw aria-hidden="true" size={15} /> Try again
              </button>
            </div>
          ) : (
            <DirectoryState message="Loading verified hospital contact options." title="Loading hospitals" type="loading" />
          )
        ) : sortedHospitals.length ? (
          <div className="emergency-hospital-list">
            {sortedHospitals.map(({ hospital, distance }) => {
              const hasCoordinates = hasValidCoordinates(hospital)
              const directionsUrl = hasCoordinates
                ? `https://www.google.com/maps/dir/?api=1&destination=${hospital.latitude},${hospital.longitude}`
                : null
              return (
                <article className="emergency-hospital-card" key={hospital.id}>
                  <div className="emergency-hospital-main">
                    <span className="emergency-hospital-type">{hospital.facilityType || 'Verified hospital listing'}</span>
                    <h3>{hospital.name}</h3>
                    <p className="emergency-hospital-address">
                      <MapPin aria-hidden="true" size={14} />
                      {[hospital.address, hospital.city, hospital.region].filter(Boolean).join(', ') || 'Address not listed'}
                    </p>
                    {distance !== null && <span className="emergency-distance">{distance.toFixed(1)} km from your device location</span>}
                  </div>
                  <div className="emergency-hospital-actions">
                    {hospital.phone && (
                      <a className="emergency-contact-link" href={`tel:${hospital.phone}`}>
                        <Phone aria-hidden="true" size={14} /> Call hospital
                      </a>
                    )}
                    {directionsUrl && (
                      <a className="emergency-contact-link" href={directionsUrl} rel="noreferrer" target="_blank">
                        <ArrowUpRight aria-hidden="true" size={14} /> Directions
                      </a>
                    )}
                    {hospital.website && isHttpUrl(hospital.website) && (
                      <a className="emergency-contact-link" href={hospital.website} rel="noreferrer" target="_blank">
                        <ArrowUpRight aria-hidden="true" size={14} /> Website
                      </a>
                    )}
                    <Link className="emergency-contact-link" to={`${basePath}/hospitals/${encodeURIComponent(hospital.id)}`}>
                      Details <ArrowRight aria-hidden="true" size={14} />
                    </Link>
                  </div>
                </article>
              )
            })}
          </div>
        ) : (
          <DirectoryState
            message="No published, currently verified hospital listings are available in the directory. For an emergency, call 112."
            title="No verified hospital contacts available"
            type="empty"
          />
        )}
      </section>

      <p className="emergency-page-note">
        <WifiOff aria-hidden="true" size={14} />
        Hospital listing data is not a live availability or emergency response feed. If you cannot reach a hospital, call 112.
        {' '}<Link to={`${basePath}/hospitals`}>Open hospital directory <ArrowRight aria-hidden="true" size={13} /></Link>
      </p>
    </div>
  )
}
