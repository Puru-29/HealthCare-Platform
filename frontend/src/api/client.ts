export interface Hospital {
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
  createdAt: string
  updatedAt: string
}

export interface HospitalPage {
  data: Hospital[]
  pagination: {
    limit: number
    offset: number
    total: number
  }
}

export interface HospitalFilters {
  search?: string
  city?: string
  facilityType?: string
  specialty?: string
  limit?: number
  offset?: number
}

export interface DoctorListing {
  id: string
  name: string
  specialty: string
  hospitalId: string
  hospitalName: string
  city: string
}

export interface DoctorPage {
  data: DoctorListing[]
  pagination: {
    limit: number
    offset: number
    total: number
  }
}

export interface DoctorAffiliation {
  hospitalId: string
  hospitalName: string
  city: string
  title: string | null
  address: string | null
  phone: string | null
  website: string | null
}

export interface DoctorDetail {
  id: string
  name: string
  specialty: string
  affiliations: DoctorAffiliation[]
}

export interface InsuranceNetworkListing {
  id: string
  providerName: string
  planName: string
  hospitalId: string
  hospitalName: string
  city: string
  verifiedAt: string
}

export interface InsuranceNetworkPage {
  data: InsuranceNetworkListing[]
  pagination: {
    limit: number
    offset: number
    total: number
  }
}

export interface PatientAppointment {
  id: string
  status: string
  mode: string
  startsAt: string
  doctorName: string | null
  specialty: string | null
  hospitalName: string | null
  city: string | null
}

interface ApiErrorResponse {
  error?: {
    code?: string
    message?: string
  }
}

export interface AuthUser {
  id: string
  displayName: string
  email: string
}

export interface UserSessionResponse {
  authenticated: true
  user: AuthUser
}

const apiBaseUrl = '/api'

function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined
  for (const part of document.cookie.split(';')) {
    const separator = part.indexOf('=')
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue
    try {
      return decodeURIComponent(part.slice(separator + 1).trim())
    } catch {
      return undefined
    }
  }
  return undefined
}

export class ApiError extends Error {
  readonly status: number
  readonly code?: string

  constructor(
    message: string,
    status: number,
    code?: string,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value))
}

function isHospital(value: unknown): value is Hospital {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    isNullableString(value.address) &&
    isNullableString(value.city) &&
    isNullableString(value.region) &&
    isNullableString(value.postalCode) &&
    isNullableString(value.phone) &&
    isNullableString(value.website) &&
    isNullableString(value.description) &&
    isNullableString(value.facilityType) &&
    isNullableNumber(value.latitude) &&
    isNullableNumber(value.longitude) &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string'
  )
}

async function requestJson<T>(
  path: string,
  options: {
    signal?: AbortSignal
    method?: string
    body?: unknown
    csrf?: boolean
  },
  validate: (value: unknown) => value is T,
): Promise<T> {
  let response: Response
  try {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (options.body !== undefined) headers['Content-Type'] = 'application/json'
    if (options.csrf) {
      const csrfToken = readCookie('carepath_user_csrf')
      if (!csrfToken) {
        throw new ApiError('Your session needs to be refreshed. Sign in again.', 401)
      }
      headers['X-Carepath-CSRF'] = csrfToken
    }
    response = await fetch(`${apiBaseUrl}${path}`, {
      headers,
      method: options.method ?? 'GET',
      credentials: 'include',
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }
    if (error instanceof ApiError) throw error
    throw new ApiError(
      'Unable to reach the CarePath API. Check that the local backend is running, then retry.',
      0,
    )
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new ApiError('The CarePath API returned an unreadable response.', response.status)
  }

  if (!response.ok) {
    const apiError = isRecord(body) ? (body as ApiErrorResponse).error : undefined
    throw new ApiError(
      apiError?.message ?? 'The CarePath API could not complete your request.',
      response.status,
      apiError?.code,
    )
  }

  if (!validate(body)) {
    throw new ApiError('The CarePath API returned data in an unexpected format.', response.status)
  }

  return body
}

function isHospitalPage(value: unknown): value is HospitalPage {
  if (!isRecord(value) || !Array.isArray(value.data) || !isRecord(value.pagination)) {
    return false
  }

  const { limit, offset, total } = value.pagination
  return (
    value.data.every(isHospital) &&
    typeof limit === 'number' &&
    typeof offset === 'number' &&
    typeof total === 'number'
  )
}

function isHospitalResponse(value: unknown): value is { data: Hospital } {
  return isRecord(value) && isHospital(value.data)
}

function isDoctor(value: unknown): value is DoctorListing {
  return isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.specialty === 'string' &&
    typeof value.hospitalId === 'string' &&
    typeof value.hospitalName === 'string' &&
    typeof value.city === 'string'
}

function isDoctorPage(value: unknown): value is DoctorPage {
  if (!isRecord(value) || !Array.isArray(value.data) || !isRecord(value.pagination)) return false
  const { limit, offset, total } = value.pagination
  return value.data.every(isDoctor) &&
    typeof limit === 'number' &&
    typeof offset === 'number' &&
    typeof total === 'number'
}

function isDoctorDetail(value: unknown): value is { data: DoctorDetail } {
  if (!isRecord(value) || !isRecord(value.data)) return false
  const doctor = value.data
  return typeof doctor.id === 'string' &&
    typeof doctor.name === 'string' &&
    typeof doctor.specialty === 'string' &&
    Array.isArray(doctor.affiliations) &&
    doctor.affiliations.every((affiliation: unknown) =>
      isRecord(affiliation) &&
      typeof affiliation.hospitalId === 'string' &&
      typeof affiliation.hospitalName === 'string' &&
      typeof affiliation.city === 'string' &&
      isNullableString(affiliation.title) &&
      isNullableString(affiliation.address) &&
      isNullableString(affiliation.phone) &&
      isNullableString(affiliation.website))
}

function isInsuranceNetwork(value: unknown): value is InsuranceNetworkListing {
  return isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.providerName === 'string' &&
    typeof value.planName === 'string' &&
    typeof value.hospitalId === 'string' &&
    typeof value.hospitalName === 'string' &&
    typeof value.city === 'string' &&
    typeof value.verifiedAt === 'string'
}

function isInsuranceNetworkPage(value: unknown): value is InsuranceNetworkPage {
  if (!isRecord(value) || !Array.isArray(value.data) || !isRecord(value.pagination)) return false
  const { limit, offset, total } = value.pagination
  return value.data.every(isInsuranceNetwork) &&
    typeof limit === 'number' &&
    typeof offset === 'number' &&
    typeof total === 'number'
}

function isPatientAppointment(value: unknown): value is PatientAppointment {
  return isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.status === 'string' &&
    typeof value.mode === 'string' &&
    typeof value.startsAt === 'string' &&
    isNullableString(value.doctorName) &&
    isNullableString(value.specialty) &&
    isNullableString(value.hospitalName) &&
    isNullableString(value.city)
}

function isPatientAppointmentsResponse(value: unknown): value is { data: PatientAppointment[] } {
  return isRecord(value) && Array.isArray(value.data) && value.data.every(isPatientAppointment)
}

export function getHospitals(
  filters: HospitalFilters,
  signal: AbortSignal,
): Promise<HospitalPage> {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') {
      query.set(key, String(value))
    }
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : ''
  return requestJson(`/hospitals${suffix}`, { signal }, isHospitalPage)
}

export async function getHospital(id: string, signal: AbortSignal): Promise<Hospital> {
  const result = await requestJson(
    `/hospitals/${encodeURIComponent(id)}`,
    { signal },
    isHospitalResponse,
  )
  return result.data
}

export function getDoctors(
  filters: { search?: string; specialty?: string; limit?: number; offset?: number },
  signal: AbortSignal,
): Promise<DoctorPage> {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') query.set(key, String(value))
  }
  const suffix = query.size ? `?${query.toString()}` : ''
  return requestJson(`/doctors${suffix}`, { signal }, isDoctorPage)
}

export async function getDoctor(id: string, signal: AbortSignal): Promise<DoctorDetail> {
  const result = await requestJson(
    `/doctors/${encodeURIComponent(id)}`,
    { signal },
    isDoctorDetail,
  )
  return result.data
}

export function getInsuranceNetworks(
  filters: {
    search?: string
    searchField?: 'all' | 'provider' | 'plan' | 'hospital'
    limit?: number
    offset?: number
  },
  signal: AbortSignal,
): Promise<InsuranceNetworkPage> {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') query.set(key, String(value))
  }
  const suffix = query.size ? `?${query.toString()}` : ''
  return requestJson(`/insurance/networks${suffix}`, { signal }, isInsuranceNetworkPage)
}

export function getPatientAppointments(signal: AbortSignal): Promise<{ data: PatientAppointment[] }> {
  return requestJson('/appointments', { signal }, isPatientAppointmentsResponse)
}

export function cancelAppointmentRequest(
  appointmentId: string,
): Promise<{ data: { id: string; status: 'cancelled' } }> {
  return requestJson(
    `/appointments/${encodeURIComponent(appointmentId)}/cancel`,
    { method: 'PATCH', csrf: true },
    (value): value is { data: { id: string; status: 'cancelled' } } =>
      isRecord(value) &&
      isRecord(value.data) &&
      typeof value.data.id === 'string' &&
      value.data.status === 'cancelled',
  )
}

function isAuthSessionResponse(value: unknown): value is UserSessionResponse {
  if (!isRecord(value) || value.authenticated !== true || !isRecord(value.user)) return false
  return (
    typeof value.user.id === 'string' &&
    typeof value.user.displayName === 'string' &&
    typeof value.user.email === 'string'
  )
}

export function getUserSession(signal?: AbortSignal): Promise<UserSessionResponse> {
  return requestJson('/auth/session', { signal }, isAuthSessionResponse)
}

export function registerUser(input: {
  displayName: string
  email: string
  password: string
}): Promise<UserSessionResponse> {
  return requestJson('/auth/register', {
    method: 'POST',
    body: input,
  }, isAuthSessionResponse)
}

export function loginUser(input: {
  email: string
  password: string
}): Promise<UserSessionResponse> {
  return requestJson('/auth/login', {
    method: 'POST',
    body: input,
  }, isAuthSessionResponse)
}

export function loginWithGoogle(credential: string): Promise<UserSessionResponse> {
  return requestJson('/auth/google', {
    method: 'POST',
    body: { credential },
  }, isAuthSessionResponse)
}

export function updateUserProfile(input: {
  displayName: string
  email: string
}): Promise<UserSessionResponse> {
  return requestJson('/auth/profile', {
    method: 'PATCH',
    body: input,
    csrf: true,
  }, isAuthSessionResponse)
}

export async function logoutUser(): Promise<void> {
  await requestJson('/auth/logout', {
    method: 'POST',
    csrf: true,
  }, (value): value is { authenticated: false } =>
    isRecord(value) && value.authenticated === false)
}

export function getHealth(signal?: AbortSignal): Promise<{ status: 'ok'; database: 'connected' }> {
  return requestJson('/health', { signal }, (value): value is { status: 'ok'; database: 'connected' } =>
    isRecord(value) && value.status === 'ok' && value.database === 'connected')
}
