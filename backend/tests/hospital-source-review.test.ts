import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ connect: vi.fn() }))
vi.mock('../src/db/pool.js', () => ({
  writePool: {
    connect: mocks.connect,
    query: vi.fn(),
  },
}))

import {
  createDraftHospitalsFromReviewedPair,
  expectedSourceReviewId,
  listUnlinkedSourceObservations,
  recordSourceObservationReviewDecision,
} from '../src/services/hospital-source-review.service.js'
import {
  createDraftHospitalsFromReviewSchema,
  hospitalSourceReviewDecisionSchema,
} from '../src/middleware/hospital-source-review-validation.js'

const sourceDocument = '202608041074356704.pdf'
const observationIds = [
  '00000000-0000-4000-8000-000000000023',
  '00000000-0000-4000-8000-000000000026',
]
const sourceValues = [
  {
    hospital_id: null,
    id: observationIds[0],
    source_system: 'pm-jay',
    source_hospital_id: 'HOSP6G177317',
    source_document: sourceDocument,
    source_date: '2026-08-03',
    source_page: 1,
    source_hospital_name: 'Primary Health center',
    source_ownership_type: 'Public',
    source_row_payload: {
      source_document: sourceDocument,
      source_date: '2026-08-03',
      source_page: '1',
      record_type: 'pmjay_empanelled_hospital',
      pdf_entry_number: '23',
      hospital_id: 'HOSP6G177317',
      hospital_name: 'Primary Health center',
      hospital_name_source: 'Primary Health center',
      hospital_type: 'Public',
      email: 'private-contact@example.test',
      email_source: 'private-contact@example.test',
      nodal_officer_name: 'Private Person',
      contact_number: '9999999999',
      contact_number_source: '9999999999',
      verification_status: 'unverified',
      extraction_review_status: 'extracted',
      extraction_notes: '',
    },
  },
  {
    hospital_id: null,
    id: observationIds[1],
    source_system: 'pm-jay',
    source_hospital_id: 'HOSP6G177370',
    source_document: sourceDocument,
    source_date: '2026-08-03',
    source_page: 1,
    source_hospital_name: 'Primary healthcare center',
    source_ownership_type: 'Public',
    source_row_payload: {
      source_document: sourceDocument,
      source_date: '2026-08-03',
      source_page: '1',
      record_type: 'pmjay_empanelled_hospital',
      pdf_entry_number: '26',
      hospital_id: 'HOSP6G177370',
      hospital_name: 'Primary healthcare center',
      hospital_name_source: 'Primary healthcare center',
      hospital_type: 'Public',
      email: 'another-private-contact@example.test',
      email_source: 'another-private-contact@example.test',
      nodal_officer_name: 'Another Private Person',
      contact_number: '8888888888',
      contact_number_source: '8888888888',
      verification_status: 'unverified',
      extraction_review_status: 'extracted',
      extraction_notes: '',
    },
  },
]
const reviewId = `${sourceDocument}#entries-23-26`

function fakeReviewDecision(decision: string) {
  return {
    id: '00000000-0000-4000-8000-000000000900',
    decision_number: '1',
    review_id: reviewId,
    source_observation_a_id: observationIds[0],
    source_observation_b_id: observationIds[1],
    decision,
    reason: 'Official facility records compared during manual review.',
    evidence_reference: 'official-registry#facility-records-23-26',
    reviewer: 'administrator',
    reviewed_at: new Date('2026-10-29T10:00:00.000Z'),
  }
}

function installFakeClient({
  decision = 'different_hospitals',
  existingHospitals = [],
  failOnHospitalInsert = null,
  linkedHospitalIds,
  endpoint = {
    database_name: 'healthcare_platform_test',
    server_address: '127.0.0.1/32',
    server_port: 5432,
  },
}: {
  decision?: string
  existingHospitals?: Array<{ id: string; public_name: string; public_source_reference: string | null }>
  failOnHospitalInsert?: number | null
  linkedHospitalIds?: string[]
  endpoint?: {
    database_name: string
    server_address: string | null
    server_port: number | null
  }
} = {}) {
  const calls: Array<{ sql: string; values: unknown[] }> = []
  let insertedHospitalCount = 0
  const fakeObservations = sourceValues.map((observation, index) => ({
    ...observation,
    hospital_id: linkedHospitalIds?.[index] ?? null,
  }))
  const client = {
    query: vi.fn(async (sql: string, values: unknown[] = []) => {
      const statement = sql.trim()
      calls.push({ sql: statement, values })
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(statement)) return { rows: [], rowCount: null }
      if (statement === 'BEGIN READ ONLY') return { rows: [], rowCount: null }
      if (statement.includes('current_database()')) return { rows: [endpoint], rowCount: 1 }
      if (statement.startsWith('SELECT COUNT(*)::int AS total')) {
        return { rows: [{ total: sourceValues.length }], rowCount: 1 }
      }
      if (statement.startsWith('SELECT') && statement.includes('FROM hospital_source_observations o')) {
        return {
          rows: fakeObservations.map((observation) => ({
            sourceObservationId: observation.id,
            sourceHospitalName: observation.source_hospital_name,
            reviewDecision: 'unresolved',
          })),
          rowCount: fakeObservations.length,
        }
      }
      if (statement.includes('FROM hospital_source_observation_review_decisions')) {
        return { rows: [fakeReviewDecision(decision)], rowCount: 1 }
      }
      if (statement.includes('FROM hospital_source_observations') && statement.includes('ANY($1::uuid[])')) {
        return { rows: fakeObservations, rowCount: fakeObservations.length }
      }
      if (statement.startsWith('INSERT INTO hospital_source_observation_review_decisions')) {
        return {
          rows: [{
            ...fakeReviewDecision(String(values[3])),
            review_id: String(values[0]),
            reason: String(values[4]),
            evidence_reference: String(values[5]),
            reviewer: String(values[6]),
          }],
          rowCount: 1,
        }
      }
      if (statement.startsWith('SELECT id::text, public_name, public_source_reference')) {
        return { rows: existingHospitals, rowCount: existingHospitals.length }
      }
      if (statement.startsWith('INSERT INTO hospitals')) {
        insertedHospitalCount += 1
        if (failOnHospitalInsert === insertedHospitalCount) throw new Error('injected hospital insert failure')
        return { rows: [{ id: `00000000-0000-4000-8000-00000000090${insertedHospitalCount}` }], rowCount: 1 }
      }
      if (statement.startsWith('UPDATE hospital_source_observations')) {
        return { rows: [], rowCount: 1 }
      }
      if (statement.startsWith('SELECT metadata')) {
        return {
          rows: linkedHospitalIds
            ? [{ metadata: { hospital_ids: linkedHospitalIds } }]
            : [],
          rowCount: linkedHospitalIds ? 1 : 0,
        }
      }
      if (statement.startsWith('INSERT INTO audit_logs')) return { rows: [], rowCount: 1 }
      throw new Error(`Unexpected SQL in fake database: ${statement}`)
    }),
    release: vi.fn(),
  }
  mocks.connect.mockResolvedValue(client)
  return { client, calls }
}

describe('hospital source review validation', () => {
  it('accepts only explicit supported pair decisions with evidence and a reason', () => {
    for (const decision of ['same_hospital', 'different_hospitals', 'needs_more_evidence']) {
      expect(hospitalSourceReviewDecisionSchema.safeParse({
        reviewId,
        sourceObservationIds: observationIds,
        decision,
        reason: 'Official facility registry references were compared.',
        evidenceReference: 'registry#reference-1',
      }).success).toBe(true)
    }
    expect(createDraftHospitalsFromReviewSchema.safeParse({ reviewId }).success).toBe(true)
  })

  it('rejects unsupported decisions, missing evidence, malformed IDs, and extra fields', () => {
    const valid = {
      reviewId,
      sourceObservationIds: observationIds,
      decision: 'different_hospitals',
      reason: 'Official facility registry references were compared.',
      evidenceReference: 'registry#reference-1',
    }
    expect(hospitalSourceReviewDecisionSchema.safeParse({ ...valid, decision: 'merge' }).success).toBe(false)
    expect(hospitalSourceReviewDecisionSchema.safeParse({
      ...valid,
      evidenceReference: '',
    }).success).toBe(false)
    expect(hospitalSourceReviewDecisionSchema.safeParse({
      ...valid,
      reason: 'same names',
    }).success).toBe(false)
    expect(hospitalSourceReviewDecisionSchema.safeParse({
      ...valid,
      sourceObservationIds: [observationIds[0], observationIds[0]],
    }).success).toBe(false)
    expect(hospitalSourceReviewDecisionSchema.safeParse({ ...valid, reviewer: 'spoofed' }).success).toBe(false)
    expect(createDraftHospitalsFromReviewSchema.safeParse({
      reviewId,
      decision: 'different_hospitals',
    }).success).toBe(false)
    expect(hospitalSourceReviewDecisionSchema.safeParse({
      ...valid,
      evidenceReference: 'reviewer@example.test',
    }).success).toBe(false)
    expect(hospitalSourceReviewDecisionSchema.safeParse({
      ...valid,
      reason: 'Reviewed records and phoned 9876543210 to confirm identity.',
    }).success).toBe(false)
    expect(hospitalSourceReviewDecisionSchema.safeParse({
      ...valid,
      evidenceReference: 'call log +91 (98765) 43210',
    }).success).toBe(false)
    expect(hospitalSourceReviewDecisionSchema.safeParse({
      ...valid,
      reason: 'Reviewed records using the administrator password.',
    }).success).toBe(false)
  })

  it('derives pair identity from document and PDF entry numbers, independent of input order', () => {
    expect(expectedSourceReviewId(
      { source_document: sourceDocument, source_row_payload: sourceValues[1].source_row_payload },
      { source_document: sourceDocument, source_row_payload: sourceValues[0].source_row_payload },
    )).toBe(reviewId)
  })
})

describe('hospital source review service', () => {
  beforeEach(() => {
    mocks.connect.mockReset()
  })

  it('records an evidenced decision and audit metadata without copying source contacts', async () => {
    const { client, calls } = installFakeClient()
    const result = await recordSourceObservationReviewDecision({
      reviewId,
      sourceObservationIds: observationIds,
      decision: 'different_hospitals',
      reason: 'Official facility registry references were compared.',
      evidenceReference: 'registry#reference-1',
    }, 'administrator')

    expect(result.decision).toBe('different_hospitals')
    expect(calls.map(({ sql }) => sql)).toContain('BEGIN')
    expect(calls.map(({ sql }) => sql)).toContain('COMMIT')
    const audit = calls.find(({ sql }) => sql.startsWith('INSERT INTO audit_logs'))
    expect(audit).toBeDefined()
    expect(JSON.stringify(audit?.values)).not.toContain('private-contact@example.test')
    expect(JSON.stringify(audit?.values)).not.toContain('9999999999')
    expect(JSON.stringify(audit?.values)).toContain('Official facility registry references were compared.')
    expect(client.release).toHaveBeenCalledOnce()
  })

  it('checks the actual connected test database endpoint before source-data queries', async () => {
    const { calls } = installFakeClient()
    await recordSourceObservationReviewDecision({
      reviewId,
      sourceObservationIds: observationIds,
      decision: 'different_hospitals',
      reason: 'Official facility registry references were compared.',
      evidenceReference: 'registry#reference-1',
    }, 'administrator')
    const endpointIndex = calls.findIndex(({ sql }) => sql.includes('current_database()'))
    const sourceIndex = calls.findIndex(({ sql }) => sql.includes('FROM hospital_source_observations'))

    expect(endpointIndex).toBeGreaterThan(0)
    expect(sourceIndex).toBeGreaterThan(endpointIndex)
  })

  it('uses a read-only transaction and target check for the unlinked-observation queue', async () => {
    const { calls } = installFakeClient()
    const result = await listUnlinkedSourceObservations(25, 0)

    expect(result.pagination.total).toBe(sourceValues.length)
    expect(result.data).toHaveLength(sourceValues.length)
    expect(result.data.every((row) => row.reviewDecision === 'unresolved')).toBe(true)
    expect(result.data.every((row) => !('email' in row) && !('contact_number' in row))).toBe(true)
    expect(calls[0]?.sql).toBe('BEGIN READ ONLY')
    expect(calls.findIndex(({ sql }) => sql.includes('current_database()')))
      .toBeLessThan(calls.findIndex(({ sql }) => sql.startsWith('SELECT COUNT(*)::int AS total')))
    expect(calls.map(({ sql }) => sql)).toContain('COMMIT')
    expect(calls.some(({ sql }) => /\bINSERT\b|\bUPDATE\b|\bDELETE\b/i.test(sql))).toBe(false)
  })

  it.each([
    ['production database', { database_name: 'healthcare_platform', server_address: '127.0.0.1', server_port: 5432 }],
    ['remote IPv4 endpoint', { database_name: 'healthcare_platform_test', server_address: '192.168.1.20', server_port: 5432 }],
    ['NULL endpoint', { database_name: 'healthcare_platform_test', server_address: null, server_port: 5432 }],
    ['malformed endpoint', { database_name: 'healthcare_platform_test', server_address: '127.0.0.1/129', server_port: 5432 }],
    ['IPv4-mapped non-loopback endpoint', { database_name: 'healthcare_platform_test', server_address: '::ffff:192.168.1.20', server_port: 5432 }],
    ['wrong port', { database_name: 'healthcare_platform_test', server_address: '127.0.0.1', server_port: 5433 }],
  ])('rejects a connected %s before reading observations', async (_label, endpoint) => {
    const { calls } = installFakeClient({ endpoint })
    await expect(recordSourceObservationReviewDecision({
      reviewId,
      sourceObservationIds: observationIds,
      decision: 'different_hospitals',
      reason: 'Official facility registry references were compared.',
      evidenceReference: 'registry#reference-1',
    }, 'administrator')).rejects.toMatchObject({ code: 'SOURCE_REVIEW_TARGET_REJECTED' })

    expect(calls.some(({ sql }) => sql.includes('FROM hospital_source_observations'))).toBe(false)
    expect(calls.some(({ sql }) => sql === 'ROLLBACK')).toBe(true)
    expect(calls.some(({ sql }) => sql === 'COMMIT')).toBe(false)
  })

  it.each(['127.24.1.2/32', '::1', '0:0:0:0:0:0:0:1'])(
    'accepts a valid loopback address representation %s',
    async (server_address) => {
      installFakeClient({
        endpoint: { database_name: 'healthcare_platform_test', server_address, server_port: 5432 },
      })
      await expect(recordSourceObservationReviewDecision({
        reviewId,
        sourceObservationIds: observationIds,
        decision: 'different_hospitals',
        reason: 'Official facility registry references were compared.',
        evidenceReference: 'registry#reference-1',
      }, 'administrator')).resolves.toMatchObject({ decision: 'different_hospitals' })
    },
  )

  it('creates unlinked-by-default draft hospital records only after a distinct-facility decision', async () => {
    const { calls } = installFakeClient()
    const result = await createDraftHospitalsFromReviewedPair(reviewId, 'administrator')
    const inserts = calls.filter(({ sql }) => sql.startsWith('INSERT INTO hospitals'))

    expect(result.alreadyCreated).toBe(false)
    expect(result.hospitalIds).toHaveLength(2)
    expect(inserts).toHaveLength(2)
    expect(inserts.map(({ values }) => values[0])).toEqual(sourceValues.map((row) => row.source_hospital_name))
    expect(inserts.every(({ sql }) =>
      sql.includes("'draft'") &&
      !/public_(?:address|phone|website|description|facility_type|location)/i.test(sql),
    )).toBe(true)
    expect(calls.filter(({ sql }) => sql.startsWith('UPDATE hospital_source_observations'))).toHaveLength(2)
    expect(calls.some(({ sql }) => sql.includes('hospital_verification_records'))).toBe(false)
    expect(calls.some(({ sql }) => sql.startsWith('INSERT INTO audit_logs'))).toBe(true)
  })

  it('keeps needs-more-evidence decisions unlinked and refuses draft creation', async () => {
    const { calls } = installFakeClient({ decision: 'needs_more_evidence' })
    await expect(createDraftHospitalsFromReviewedPair(reviewId, 'administrator'))
      .rejects.toMatchObject({ code: 'SOURCE_REVIEW_NOT_APPROVED' })
    expect(calls.some(({ sql }) => sql.startsWith('INSERT INTO hospitals'))).toBe(false)
    expect(calls.some(({ sql }) => sql.startsWith('UPDATE hospital_source_observations'))).toBe(false)
    expect(calls.some(({ sql }) => sql === 'ROLLBACK')).toBe(true)
  })

  it('keeps same-hospital decisions unlinked and refuses two-record draft creation', async () => {
    const { calls } = installFakeClient({ decision: 'same_hospital' })
    await expect(createDraftHospitalsFromReviewedPair(reviewId, 'administrator'))
      .rejects.toMatchObject({ code: 'SOURCE_REVIEW_NOT_APPROVED' })
    expect(calls.some(({ sql }) => sql.startsWith('INSERT INTO hospitals'))).toBe(false)
    expect(calls.some(({ sql }) => sql.startsWith('UPDATE hospital_source_observations'))).toBe(false)
  })

  it('returns existing linked draft IDs on a safe rerun without inserting duplicates', async () => {
    const hospitalIds = [
      '00000000-0000-4000-8000-000000000901',
      '00000000-0000-4000-8000-000000000902',
    ]
    const { calls } = installFakeClient({ linkedHospitalIds: hospitalIds })
    const result = await createDraftHospitalsFromReviewedPair(reviewId, 'administrator')

    expect(result).toEqual({ reviewId, hospitalIds, alreadyCreated: true })
    expect(calls.some(({ sql }) => sql.startsWith('INSERT INTO hospitals'))).toBe(false)
    expect(calls.some(({ sql }) => sql.startsWith('UPDATE hospital_source_observations'))).toBe(false)
  })

  it('blocks possible existing hospital duplicates rather than merging or linking them', async () => {
    const { calls } = installFakeClient({
      existingHospitals: [{
        id: '00000000-0000-4000-8000-000000000777',
        public_name: 'Primary Health Center',
        public_source_reference: null,
      }],
    })
    await expect(createDraftHospitalsFromReviewedPair(reviewId, 'administrator'))
      .rejects.toMatchObject({ code: 'POSSIBLE_HOSPITAL_DUPLICATE' })
    expect(calls.some(({ sql }) => sql.startsWith('INSERT INTO hospitals'))).toBe(false)
    expect(calls.some(({ sql }) => sql.startsWith('UPDATE hospital_source_observations'))).toBe(false)
  })

  it('rolls back both draft creation and source links on a later failure', async () => {
    const { calls } = installFakeClient({ failOnHospitalInsert: 2 })
    await expect(createDraftHospitalsFromReviewedPair(reviewId, 'administrator'))
      .rejects.toThrow('injected hospital insert failure')
    expect(calls.some(({ sql }) => sql === 'ROLLBACK')).toBe(true)
    expect(calls.some(({ sql }) => sql === 'COMMIT')).toBe(false)
  })
})
