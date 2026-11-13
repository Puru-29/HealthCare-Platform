import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildHospitalMasterImportPlan,
  executeHospitalMasterImport,
  parseHospitalMasterImportArguments,
  verifyHospitalMasterEndpoint,
} from './hospital-master-import.mjs'

const parseArgs = (args, environment = {}) =>
  parseHospitalMasterImportArguments(args, environment)

const sourceDocument = '202608041074356704.pdf'
const pairEntries = [
  ['23', 'HOSP6G177317'],
  ['26', 'HOSP6G177370'],
  ['44', 'HOSP6P02024'],
  ['63', 'HOSP6P131336'],
  ['59', 'HOSP6P101722'],
  ['62', 'HOSP6P131103'],
]

function makeObservation({
  id = '00000000-0000-4000-8000-000000000001',
  sourceId = `hosp-${id.slice(-3)}`,
  name = `Independent Clinic ${id.slice(-3)}`,
  document = 'independent.pdf',
  entry = '1',
  hospitalId = null,
  hash = 'a'.repeat(64),
  payloadOverrides = {},
  columnOverrides = {},
} = {}) {
  const payload = {
    source_document: document,
    source_date: '2026-08-03',
    source_page: '1',
    record_type: 'pmjay_empanelled_hospital',
    pdf_entry_number: entry,
    hospital_id: sourceId.toUpperCase(),
    hospital_name: name,
    hospital_name_source: name,
    hospital_type: 'Public',
    email: 'private-contact@example.test',
    email_source: 'private-contact@example.test',
    nodal_officer_name: '',
    contact_number: '',
    contact_number_source: '',
    verification_status: 'unverified',
    extraction_review_status: 'extracted',
    extraction_notes: '',
    ...payloadOverrides,
  }
  return {
    id,
    hospital_id: hospitalId,
    source_system: 'pm-jay',
    source_hospital_id: sourceId,
    source_document: document,
    source_document_sha256: hash,
    source_date: '2026-08-03',
    source_page: 1,
    source_hospital_name: name,
    source_ownership_type: 'Public',
    source_row_payload: payload,
    ...columnOverrides,
  }
}

function makeUnresolvedPairRows() {
  const namesByEntry = new Map([
    ['23', 'Primary Health center'],
    ['26', 'Primary healthcare center'],
    ['44', 'RAMA HOSPITAL'],
    ['63', 'RANA HOSPITAL'],
    ['59', 'Rai Multispeciality Hospital'],
    ['62', 'BHATIYA Multispeciality Hospital'],
  ])
  return pairEntries.map(([entry, sourceId], index) => makeObservation({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    sourceId: sourceId.toLowerCase(),
    name: namesByEntry.get(entry),
    document: sourceDocument,
    entry,
    hash: String(index + 1).repeat(64),
  }))
}

function emptySnapshot(observations = [], hospitals = [], reviewDecisions = []) {
  return { observations, hospitals, reviewDecisions }
}

function fakeClient({
  endpoint = {
    database_name: 'healthcare_platform_test',
    server_address: '127.0.0.1/32',
    server_port: 5432,
  },
  observations = [],
  hospitals = [],
  reviewDecisions = [],
  missingReviews = false,
  missingPayload = false,
  failOnSourceLink = false,
} = {}) {
  const state = {
    observations: structuredClone(observations),
    hospitals: structuredClone(hospitals),
    reviewDecisions: structuredClone(reviewDecisions),
    calls: [],
    writes: 0,
    transaction: null,
  }
  const client = {
    async query(sql, values = []) {
      const statement = sql.trim()
      state.calls.push({ sql: statement, values })
      if (statement.startsWith('SELECT current_database()')) {
        return { rows: [endpoint], rowCount: 1 }
      }
      if (statement === 'BEGIN READ ONLY') {
        state.transaction = 'read-only'
        return { rows: [], rowCount: null }
      }
      if (statement === 'BEGIN ISOLATION LEVEL SERIALIZABLE') {
        state.transaction = 'write'
        return { rows: [], rowCount: null }
      }
      if (statement === 'COMMIT' || statement === 'ROLLBACK') {
        state.transaction = null
        return { rows: [], rowCount: null }
      }
      if (statement.includes('to_regclass(')) {
        return {
          rows: [{
            observations: 'hospital_source_observations',
            reviews: missingReviews ? null : 'hospital_source_observation_review_decisions',
            hospitals: 'hospitals',
            verifications: 'hospital_verification_records',
            has_source_row_payload: !missingPayload,
          }],
          rowCount: 1,
        }
      }
      if (statement.includes('FROM public.hospital_source_observations')) {
        return { rows: state.observations, rowCount: state.observations.length }
      }
      if (statement.includes('FROM public.hospitals h')) {
        return { rows: state.hospitals, rowCount: state.hospitals.length }
      }
      if (statement.includes('FROM public.hospital_source_observation_review_decisions')) {
        return { rows: state.reviewDecisions, rowCount: state.reviewDecisions.length }
      }
      if (statement.startsWith('INSERT INTO public.hospitals')) {
        state.writes += 1
        const id = `00000000-0000-4000-8000-${String(900 + state.writes).padStart(12, '0')}`
        state.hospitals.push({
          id,
          public_name: values[0],
          public_listing_status: 'draft',
          public_source_reference: values[1],
          has_current_verification: false,
        })
        return { rows: [{ id }], rowCount: 1 }
      }
      if (statement.startsWith('UPDATE public.hospital_source_observations')) {
        if (failOnSourceLink) throw new Error('injected source-link failure')
        state.writes += 1
        const observation = state.observations.find((row) => row.id === values[1])
        if (!observation || observation.hospital_id) return { rows: [], rowCount: 0 }
        observation.hospital_id = values[0]
        return { rows: [], rowCount: 1 }
      }
      if (statement.startsWith('INSERT INTO public.audit_logs')) {
        state.writes += 1
        return { rows: [], rowCount: 1 }
      }
      throw new Error(`Unexpected SQL in fake client: ${statement}`)
    },
    release() {},
  }
  return { client, state }
}

describe('hospital master import argument safety', () => {
  it('requires explicit test database, loopback host, and port for dry-run', () => {
    const options = parseArgs([
      '--database', 'healthcare_platform_test',
      '--host', '127.0.0.1',
      '--port', '5432',
    ])
    assert.equal(options.writeMode, false)
    assert.equal(options.database, 'healthcare_platform_test')
    assert.throws(() => parseArgs(['--write']), /Explicit --database is required/)
  })

  it('requires explicit write and confirmation flags and rejects unknown or unsafe targets', () => {
    assert.throws(() => parseArgs([
      '--database', 'healthcare_platform_test', '--host', '127.0.0.1', '--port', '5432',
      '--confirm-write', 'healthcare_platform_test',
    ]), /valid only with --write/)
    assert.throws(() => parseArgs([
      '--database', 'healthcare_platform_test', '--host', '127.0.0.1', '--port', '5432', '--write',
    ]), /requires explicit --confirm-write/)
    assert.throws(() => parseArgs([
      '--database', 'healthcare_platform_test', '--host', '127.0.0.1', '--port', '5432', '--write',
      '--confirm-write', 'healthcare_platform_test', '--force',
    ]), /Unsupported argument/)
    assert.throws(() => parseArgs([
      '--database', 'healthcare_platform', '--host', '127.0.0.1', '--port', '5432',
    ]), /Target database/)
    assert.throws(() => parseArgs([
      '--database', 'healthcare_platform_test', '--host', '192.168.1.1', '--port', '5432',
    ]), /Target host/)
    assert.throws(() => parseArgs([
      '--database', 'healthcare_platform_test', '--host', '127.0.0.1', '--port', '5433',
    ]), /Target port/)
    assert.equal(parseArgs([
      '--database', 'healthcare_platform_test', '--host', '127.0.0.1', '--port', '5432',
      '--write', '--confirm-write', 'healthcare_platform_test',
    ]).writeMode, true)
    assert.throws(() => parseHospitalMasterImportArguments([
      '--database', 'healthcare_platform_test', '--host', '127.0.0.1', '--port', '5432',
    ], { PGDATABASE: 'healthcare_platform' }), /PGDATABASE conflicts/)
    assert.throws(() => parseHospitalMasterImportArguments([
      '--database', 'healthcare_platform_test', '--host', '127.0.0.1', '--port', '5432',
    ], { DATABASE_URL: 'redacted' }), /Connection override DATABASE_URL/)
  })
})

describe('hospital master import planning', () => {
  it('reports eligible, excluded, and all six unresolved rows without creating records', () => {
    const rows = makeUnresolvedPairRows()
    rows.push(makeObservation({
      id: '00000000-0000-4000-8000-000000000099',
      sourceId: 'independent-99',
      name: 'Independent Medical Institute',
      document: 'independent99.pdf',
    }))
    const report = buildHospitalMasterImportPlan(emptySnapshot(rows))

    assert.equal(report.mode, 'dry-run')
    assert.equal(report.databaseWritesPerformed, false)
    assert.equal(report.counts.totalObservations, 7)
    assert.equal(report.counts.eligibleObservations, 1)
    assert.equal(report.counts.excludedObservations, 6)
    assert.equal(report.counts.potentialDuplicates, 6)
    assert.equal(report.counts.unresolvedObservations, 6)
    assert.equal(report.counts.proposedDraftHospitalRecords, 1)
    assert.equal(report.potentialDuplicateGroups.length, 3)
    assert.equal(report.proposedDraftHospitalRecords[0].proposedHospitalName, 'Independent Medical Institute')
    assert.equal(report.proposedDraftHospitalRecords[0].listingStatus, 'draft')
    assert.equal(report.proposedDraftHospitalRecords[0].verificationStatus, 'unverified')
    assert.equal(JSON.stringify(report).includes('@'), false)
    assert.equal(JSON.stringify(report).includes('contact_number'), false)
    assert.equal(JSON.stringify(report).includes('private-contact@example.test'), false)
  })

  it('uses the latest recorded distinct-facility decision to release only its exact reviewed pair', () => {
    const rows = makeUnresolvedPairRows()
    const pair = rows.slice(0, 2)
    const reviewId = `${sourceDocument}#entries-23-26`
    const report = buildHospitalMasterImportPlan({
      ...emptySnapshot(rows),
      reviewDecisions: [{
        review_id: reviewId,
        source_observation_a_id: pair[0].id,
        source_observation_b_id: pair[1].id,
        decision_number: '1',
        decision: 'different_hospitals',
      }],
    })

    assert.equal(report.counts.unresolvedObservations, 4)
    assert.equal(report.counts.eligibleObservations, 2)
    assert.deepEqual(
      report.proposedDraftHospitalRecords.flatMap((record) => record.sourceObservationIds).sort(),
      pair.map((observation) => observation.id).sort(),
    )
  })

  it('keeps same-hospital decisions out of automatic creation without a reviewed canonical name', () => {
    const rows = makeUnresolvedPairRows()
    const pair = rows.slice(0, 2)
    const report = buildHospitalMasterImportPlan({
      ...emptySnapshot(rows),
      reviewDecisions: [{
        review_id: `${sourceDocument}#entries-23-26`,
        source_observation_a_id: pair[0].id,
        source_observation_b_id: pair[1].id,
        decision_number: '1',
        decision: 'same_hospital',
      }],
    })
    assert.equal(report.counts.eligibleObservations, 0)
    assert.equal(report.counts.unresolvedObservations, 4)
    assert.equal(report.excludedObservations
      .filter((observation) => observation.reasons.includes('same_hospital_requires_canonical_name'))
      .length, 2)
  })

  it('fails closed on a malformed source identity or mismatched payload', () => {
    const malformed = makeObservation({
      payloadOverrides: { hospital_id: 'different-source-id' },
    })
    const report = buildHospitalMasterImportPlan(emptySnapshot([malformed]))
    assert.equal(report.counts.conflicts, 1)
    assert.equal(report.counts.eligibleObservations, 0)
    assert.equal(report.conflicts[0].reasons.includes('source_identity_or_payload_mismatch'), true)
  })

  it('detects conflicting payloads for a repeated exact identity', () => {
    const first = makeObservation({
      id: '00000000-0000-4000-8000-000000000001',
      sourceId: 'same-source',
      document: 'same.pdf',
      name: 'Same Hospital Source',
    })
    const second = makeObservation({
      id: '00000000-0000-4000-8000-000000000002',
      sourceId: 'same-source',
      document: 'same.pdf',
      name: 'Same Hospital Source',
      payloadOverrides: { extraction_notes: 'changed payload value' },
    })
    const report = buildHospitalMasterImportPlan(emptySnapshot([first, second]))
    assert.equal(report.counts.conflicts, 2)
    assert.equal(report.counts.eligibleObservations, 0)
    assert.equal(report.proposedDraftHospitalRecords.length, 0)
  })

  it('aborts the write transaction on any detected conflict before inserting records', async () => {
    const conflictingRows = [
      makeObservation({
        id: '00000000-0000-4000-8000-000000000001',
        sourceId: 'same-source',
        document: 'same.pdf',
        name: 'Same Hospital Source',
      }),
      makeObservation({
        id: '00000000-0000-4000-8000-000000000002',
        sourceId: 'same-source',
        document: 'same.pdf',
        name: 'Same Hospital Source',
        payloadOverrides: { extraction_notes: 'changed payload value' },
      }),
    ]
    const { client, state } = fakeClient({ observations: conflictingRows })
    await assert.rejects(
      () => executeHospitalMasterImport(client, { writeMode: true }),
      (error) => {
        assert.match(error.message, /conflicts require manual review/)
        assert.equal(error.report.counts.conflicts, 2)
        return true
      },
    )
    assert.equal(state.writes, 0)
    assert.equal(state.calls.at(-1).sql, 'ROLLBACK')
  })

  it('treats a repeated source ID across documents as a possible duplicate, not a merge', () => {
    const first = makeObservation({
      id: '00000000-0000-4000-8000-000000000001',
      sourceId: 'same-source',
      document: 'first.pdf',
      name: 'Same Source Hospital',
    })
    const second = makeObservation({
      id: '00000000-0000-4000-8000-000000000002',
      sourceId: 'same-source',
      document: 'second.pdf',
      name: 'Same Source Hospital',
    })
    const report = buildHospitalMasterImportPlan(emptySnapshot([first, second]))
    assert.equal(report.counts.potentialDuplicates, 2)
    assert.equal(report.counts.eligibleObservations, 0)
    assert.equal(report.proposedDraftHospitalRecords.length, 0)
  })

  it('flags similar names for manual review instead of merging or proposing drafts', () => {
    const rows = [
      makeObservation({
        id: '00000000-0000-4000-8000-000000000001',
        sourceId: 'name-one',
        name: 'Rama Multi Speciality Hospital',
        document: 'one.pdf',
      }),
      makeObservation({
        id: '00000000-0000-4000-8000-000000000002',
        sourceId: 'name-two',
        name: 'Rana Multi Speciality Hospital',
        document: 'two.pdf',
      }),
    ]
    const report = buildHospitalMasterImportPlan(emptySnapshot(rows))
    assert.equal(report.counts.potentialDuplicates, 2)
    assert.equal(report.counts.proposedDraftHospitalRecords, 0)
    assert.equal(report.potentialDuplicateGroups.length, 1)
  })

  it('recognizes a valid existing draft link and never proposes a duplicate on rerun', () => {
    const observation = makeObservation({
      hospitalId: '00000000-0000-4000-8000-000000000900',
    })
    const hospital = {
      id: observation.hospital_id,
      public_name: observation.source_hospital_name,
      public_listing_status: 'draft',
      public_source_reference: `${observation.source_document}#page=1&entry=1`,
      has_current_verification: false,
    }
    const report = buildHospitalMasterImportPlan(emptySnapshot([observation], [hospital]))
    assert.equal(report.counts.alreadyLinkedObservations, 1)
    assert.equal(report.counts.eligibleObservations, 0)
    assert.equal(report.counts.proposedDraftHospitalRecords, 0)
  })

  it('treats a pre-linked unresolved observation as a conflict, not an accepted import', () => {
    const observations = makeUnresolvedPairRows()
    const linked = observations[0]
    linked.hospital_id = '00000000-0000-4000-8000-000000000900'
    const hospitals = [{
      id: linked.hospital_id,
      public_name: linked.source_hospital_name,
      public_listing_status: 'draft',
      public_source_reference: `${linked.source_document}#page=1&entry=${linked.source_row_payload.pdf_entry_number}`,
      has_current_verification: false,
    }]
    const report = buildHospitalMasterImportPlan(emptySnapshot(observations, hospitals))
    assert.equal(report.counts.unresolvedObservations, 6)
    assert.equal(report.counts.conflicts, 1)
    assert.equal(report.counts.alreadyLinkedObservations, 0)
  })
})

describe('hospital master import database boundaries', () => {
  it('verifies the live endpoint before reading and keeps dry-run transactions read-only', async () => {
    const observation = makeObservation()
    const { client, state } = fakeClient({ observations: [observation] })
    const report = await executeHospitalMasterImport(client)
    const endpointIndex = state.calls.findIndex(({ sql }) => sql.startsWith('SELECT current_database()'))
    const sourceIndex = state.calls.findIndex(({ sql }) => sql.includes('FROM public.hospital_source_observations'))

    assert.equal(state.calls[0].sql, 'BEGIN READ ONLY')
    assert.ok(endpointIndex > 0 && endpointIndex < sourceIndex)
    assert.equal(state.writes, 0)
    assert.equal(report.databaseWritesPerformed, false)
    assert.equal(report.counts.eligibleObservations, 1)
    for (let index = 1; index < state.calls.length; index += 1) {
      const { sql } = state.calls[index]
      if (/^(?:SELECT|INSERT|UPDATE|DELETE)\b/i.test(sql) &&
          !sql.startsWith('SELECT current_database()')) {
        assert.match(state.calls[index - 1].sql, /^SELECT current_database\(\)/)
      }
    }
  })

  it('rejects a wrong actual endpoint before any schema or source read', async () => {
    const { client, state } = fakeClient({
      endpoint: {
        database_name: 'healthcare_platform',
        server_address: '127.0.0.1',
        server_port: 5432,
      },
      observations: [makeObservation()],
    })
    await assert.rejects(() => executeHospitalMasterImport(client), /Connected PostgreSQL endpoint rejected/)
    assert.equal(state.calls.some(({ sql }) => sql.includes('to_regclass(')), false)
    assert.equal(state.calls.some(({ sql }) => sql.includes('FROM public.hospital_source_observations')), false)
    assert.equal(state.calls.at(-1).sql, 'ROLLBACK')
  })

  it('requires migration 006 before reading source observations', async () => {
    const { client, state } = fakeClient({ missingReviews: true })
    await assert.rejects(() => executeHospitalMasterImport(client), /Migration 006 is required/)
    assert.equal(state.calls.some(({ sql }) => sql.includes('FROM public.hospital_source_observations')), false)
    assert.equal(state.calls.at(-1).sql, 'ROLLBACK')
  })

  it('requires migration 005 source payloads before reading observations', async () => {
    const { client, state } = fakeClient({ missingPayload: true })
    await assert.rejects(() => executeHospitalMasterImport(client), /Migration 005 is required/)
    assert.equal(state.calls.some(({ sql }) => sql.includes('FROM public.hospital_source_observations')), false)
    assert.equal(state.calls.at(-1).sql, 'ROLLBACK')
  })

  for (const [label, server_address] of [
    ['NULL address', null],
    ['non-loopback IPv4', '192.168.1.10'],
    ['malformed CIDR', '127.0.0.1/33'],
    ['IPv4-mapped non-loopback', '::ffff:192.168.1.10'],
  ]) {
    it(`rejects a connected ${label}`, async () => {
      const client = {
        query: async () => ({
          rows: [{
            database_name: 'healthcare_platform_test',
            server_address,
            server_port: 5432,
          }],
        }),
      }
      await assert.rejects(() => verifyHospitalMasterEndpoint(client), /Connected PostgreSQL endpoint rejected/)
    })
  }

  it('accepts IPv4 and IPv6 loopback endpoint representations', async () => {
    for (const server_address of ['127.0.0.1/32', '127.42.1.9', '::1', '0:0:0:0:0:0:0:1']) {
      const client = {
        query: async () => ({
          rows: [{
            database_name: 'healthcare_platform_test',
            server_address,
            server_port: 5432,
          }],
        }),
      }
      await verifyHospitalMasterEndpoint(client)
    }
  })

  it('creates only draft records, links provenance, and a rerun sees the existing link', async () => {
    const observation = makeObservation()
    const { client, state } = fakeClient({ observations: [observation] })
    const first = await executeHospitalMasterImport(client, { writeMode: true })
    assert.equal(first.mode, 'write')
    assert.equal(first.databaseWritesPerformed, true)
    assert.equal(first.createdDraftHospitalRecords.length, 1)
    assert.equal(state.writes, 3)
    assert.equal(state.observations[0].hospital_id, first.createdDraftHospitalRecords[0].hospitalId)
    assert.equal(state.hospitals[0].public_listing_status, 'draft')
    assert.equal(state.calls.some(({ sql }) => /public_(?:address|phone|website|facility_type|location)/i.test(sql)), false)

    const second = await executeHospitalMasterImport(client, { writeMode: true })
    assert.equal(second.databaseWritesPerformed, false)
    assert.equal(second.counts.alreadyLinkedObservations, 1)
    assert.equal(second.counts.proposedDraftHospitalRecords, 0)
    assert.equal(state.writes, 3)
  })

  it('rolls back draft creation if provenance linking fails', async () => {
    const { client, state } = fakeClient({
      observations: [makeObservation()],
      failOnSourceLink: true,
    })
    await assert.rejects(() => executeHospitalMasterImport(client, { writeMode: true }), /injected source-link failure/)
    assert.equal(state.calls.at(-1).sql, 'ROLLBACK')
    assert.equal(state.calls.some(({ sql }) => sql === 'COMMIT'), false)
  })
})
