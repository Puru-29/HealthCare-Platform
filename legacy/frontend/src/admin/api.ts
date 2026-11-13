export type ListingStatus = 'draft' | 'published' | 'hidden'
export type VerificationStatus =
  | 'unverified'
  | 'pending'
  | 'verified'
  | 'rejected'
  | 'expired'
  | 'disputed'

export interface AdminHospital {
  id: string
  name: string
  address: string | null
  city: string | null
  region: string | null
  postalCode: string | null
  phone: string | null
  website: string | null
  description: string | null
  facilityType: string | null
  latitude: number | null
  longitude: number | null
  listingStatus: ListingStatus
  verificationStatus: VerificationStatus
  verificationSourceType: string | null
  verificationSourceName: string | null
  verificationSourceReference: string | null
  lastVerifiedAt: string | null
  verificationExpiresAt: string | null
  specialties: string[]
  createdAt: string
  updatedAt: string
}

export interface AdminHospitalInput {
  name: string
  address: string | null
  city: string | null
  region: string | null
  postalCode: string | null
  phone: string | null
  website: string | null
  description: string | null
  facilityType: string | null
  latitude: number | null
  longitude: number | null
  listingStatus: ListingStatus
  specialties: string[]
  verificationStatus: VerificationStatus
  verificationSourceType: string | null
  verificationSourceName: string | null
  verificationSourceReference: string | null
  verificationExpiresAt: string | null
}

export interface AmbulanceProvider {
  id: string
  name: string
  phone: string | null
  website: string | null
  status: 'active' | 'inactive' | 'suspended'
  vehicleCount: number
  createdAt: string
  updatedAt: string
}

export interface AmbulanceVehicle {
  id: string
  providerId: string
  providerName: string
  vehicleType: string
  registrationNumber: string | null
  status: 'available' | 'assigned' | 'unavailable' | 'maintenance'
  latitude: number | null
  longitude: number | null
  locationUpdatedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface Page<T> {
  data: T[]
  pagination: { limit: number; offset: number; total: number }
}

export interface AdminSession {
  authenticated: true
  username: string
  csrfToken: string
}

interface ApiErrorBody {
  error?: { code?: string; message?: string }
}

const apiBaseUrl = '/api'
let csrfToken: string | null = null

export class AdminApiError extends Error {
  readonly status: number
  readonly code?: string

  constructor(
    message: string,
    status: number,
    code?: string,
  ) {
    super(message)
    this.name = 'AdminApiError'
    this.status = status
    this.code = code
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const method = options.method ?? 'GET'
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  if (method !== 'GET' && method !== 'HEAD' && path !== '/admin/auth/login') {
    if (!csrfToken) throw new AdminApiError('Your admin session needs to be refreshed.', 401)
    headers['X-Carepath-CSRF'] = csrfToken
  }

  let response: Response
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      method,
      headers,
      credentials: 'include',
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new AdminApiError('Unable to reach the admin service. Please try again.', 0)
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new AdminApiError('The admin service returned an unreadable response.', response.status)
  }

  if (!response.ok) {
    const apiError = isRecord(body) ? (body as ApiErrorBody).error : undefined
    throw new AdminApiError(
      apiError?.message ?? 'The admin service could not complete your request.',
      response.status,
      apiError?.code,
    )
  }

  return body as T
}

export async function adminLogin(username: string, password: string): Promise<AdminSession> {
  const session = await request<AdminSession>('/admin/auth/login', {
    method: 'POST',
    body: { username, password },
  })
  csrfToken = session.csrfToken
  return session
}

export async function getAdminSession(signal?: AbortSignal): Promise<AdminSession> {
  const session = await request<AdminSession>('/admin/auth/session', { signal })
  csrfToken = session.csrfToken
  return session
}

export async function adminLogout(): Promise<void> {
  await request<{ authenticated: false }>('/admin/auth/logout', { method: 'POST' })
  csrfToken = null
}

function queryString(params: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, String(value))
  }
  return query.size ? `?${query.toString()}` : ''
}

export function getAdminOverview(signal?: AbortSignal) {
  return request<{ data: Record<string, Array<{ status: string; total: number }>> }>(
    '/admin/overview',
    { signal },
  )
}

export function getAdminHospitals(
  params: {
    search?: string
    listingStatus?: string
    verificationStatus?: string
    limit?: number
    offset?: number
  },
  signal?: AbortSignal,
) {
  return request<Page<AdminHospital>>(`/admin/hospitals${queryString(params)}`, { signal })
}

export function getAdminHospital(id: string, signal?: AbortSignal) {
  return request<{ data: AdminHospital }>(
    `/admin/hospitals/${encodeURIComponent(id)}`,
    { signal },
  )
}

export function saveAdminHospital(input: AdminHospitalInput, id?: string) {
  return request<{ data: AdminHospital }>(
    id ? `/admin/hospitals/${encodeURIComponent(id)}` : '/admin/hospitals',
    { method: id ? 'PATCH' : 'POST', body: input },
  )
}

export function getAmbulanceProviders(params: { search?: string; limit?: number; offset?: number }, signal?: AbortSignal) {
  return request<Page<AmbulanceProvider>>(
    `/admin/ambulance/providers${queryString(params)}`,
    { signal },
  )
}

export function saveAmbulanceProvider(
  input: Pick<AmbulanceProvider, 'name' | 'phone' | 'website' | 'status'>,
  id?: string,
) {
  return request<{ data: { id: string } }>(
    id ? `/admin/ambulance/providers/${encodeURIComponent(id)}` : '/admin/ambulance/providers',
    { method: id ? 'PATCH' : 'POST', body: input },
  )
}

export function getAmbulanceVehicles(params: { search?: string; limit?: number; offset?: number }, signal?: AbortSignal) {
  return request<Page<AmbulanceVehicle>>(
    `/admin/ambulance/vehicles${queryString(params)}`,
    { signal },
  )
}

export function saveAmbulanceVehicle(
  input: {
    providerId: string
    vehicleType: string
    registrationNumber: string | null
    status: AmbulanceVehicle['status']
    latitude: number | null
    longitude: number | null
  },
  id?: string,
) {
  return request<{ data: { id: string } }>(
    id ? `/admin/ambulance/vehicles/${encodeURIComponent(id)}` : '/admin/ambulance/vehicles',
    { method: id ? 'PATCH' : 'POST', body: input },
  )
}
