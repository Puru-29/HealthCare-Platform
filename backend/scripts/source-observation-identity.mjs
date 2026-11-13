import { createHash } from 'node:crypto'

export const SOURCE_ROW_FIELDS = [
  'source_document',
  'source_date',
  'source_page',
  'record_type',
  'pdf_entry_number',
  'hospital_id',
  'hospital_name',
  'hospital_name_source',
  'hospital_type',
  'email',
  'email_source',
  'nodal_officer_name',
  'contact_number',
  'contact_number_source',
  'verification_status',
  'extraction_review_status',
  'extraction_notes',
]

const OBSERVATION_FIELDS = [
  'source_system',
  'source_hospital_id',
  'source_document_sha256',
  'source_date',
  'source_hospital_name',
  'source_ownership_type',
  'source_email',
  'source_contact_phone',
  'source_nodal_officer_name',
  'source_document',
]

const CANONICAL_IDENTITY_PART = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/

export function normalizeSourceIdentityPart(value) {
  if (typeof value !== 'string' || !CANONICAL_IDENTITY_PART.test(value)) {
    throw new TypeError(
      'Source system and source hospital ID must use ASCII letters, digits, dot, underscore, colon, or hyphen, with no surrounding whitespace.',
    )
  }
  return value.toLowerCase()
}

export function calculateSourceDocumentSha256(contents) {
  if (!Buffer.isBuffer(contents) && !(contents instanceof Uint8Array)) {
    throw new TypeError('Source document contents must be a Buffer or Uint8Array.')
  }
  return createHash('sha256').update(contents).digest('hex')
}

export function sourceObservationIdentity(observation) {
  const hash = observation.source_document_sha256
  if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash)) {
    throw new TypeError('Source document SHA-256 must be 64 lowercase hexadecimal characters.')
  }
  return JSON.stringify([
    normalizeSourceIdentityPart(observation.source_system),
    normalizeSourceIdentityPart(observation.source_hospital_id),
    hash,
  ])
}

function canonicalSourcePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TypeError('Source row payload must be an object containing every source CSV field.')
  }
  for (const field of SOURCE_ROW_FIELDS) {
    if (typeof payload[field] !== 'string') {
      throw new TypeError(`Source row payload field ${field} must be a string.`)
    }
  }
  const entries = Object.entries(payload).sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0)
  if (entries.some(([, value]) => typeof value !== 'string')) {
    throw new TypeError('Every source row payload value must be a string.')
  }
  return JSON.stringify(entries)
}

function hasCompleteSourcePayload(payload) {
  return Boolean(
    payload &&
    typeof payload === 'object' &&
    !Array.isArray(payload) &&
    SOURCE_ROW_FIELDS.every((field) => typeof payload[field] === 'string') &&
    Object.values(payload).every((value) => typeof value === 'string'),
  )
}

function observationContent(observation) {
  const fields = OBSERVATION_FIELDS.map((field) => {
    const value = observation[field] ?? null
    if (field === 'source_system' || field === 'source_hospital_id') {
      return value === null ? null : normalizeSourceIdentityPart(value)
    }
    return value
  })
  return JSON.stringify([fields, canonicalSourcePayload(observation.source_row_payload)])
}

export function classifySourceObservationRepeat(existing, incoming) {
  if (sourceObservationIdentity(existing) !== sourceObservationIdentity(incoming)) {
    return 'new_observation'
  }
  if (
    !hasCompleteSourcePayload(existing.source_row_payload) ||
    !hasCompleteSourcePayload(incoming.source_row_payload)
  ) return 'conflicting_repeat'
  return observationContent(existing) === observationContent(incoming)
    ? 'already_imported'
    : 'conflicting_repeat'
}
