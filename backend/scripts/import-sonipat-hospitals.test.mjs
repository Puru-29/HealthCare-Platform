import assert from 'node:assert/strict'
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  rmdir,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, it } from 'node:test'
import {
  buildDryRunReport,
  assertConnectedDryRunEndpoint,
  assertSafeDryRunTarget,
  BLOCKED_CONNECTION_ENVIRONMENT,
  DATABASE_TRANSACTION_MODE,
  DEFAULT_DRY_RUN_TARGET,
  DRY_RUN_REPORT_DIRECTORY,
  ensureCanonicalReportDirectory,
  EXISTING_SOURCE_OBSERVATIONS_SQL,
  EXISTING_HOSPITALS_SQL,
  INSERT_SOURCE_OBSERVATION_SQL,
  observationFromCsvRecord,
  MANUAL_REVIEW_DECISIONS,
  parseDryRunArguments,
  parseCsv,
  performSourceObservationImport,
  prepareSourceObservationImport,
  readManualReviewDecisions,
  resolveDryRunReportPath,
  SOURCE_CSV_HEADERS,
  WRITE_MODE_CONFIRMATION,
  writeDryRunReport,
} from './import-sonipat-hospitals.mjs'
import {
  calculateSourceDocumentSha256,
  classifySourceObservationRepeat,
  sourceObservationIdentity,
} from './source-observation-identity.mjs'

const header = SOURCE_CSV_HEADERS.join(',')
const validRow = (overrides = {}) => ({
  source_document: 'source.pdf',
  source_date: '2026-08-03',
  source_page: '1',
  record_type: 'pmjay_empanelled_hospital',
  pdf_entry_number: '1',
  hospital_id: 'HOSP12345',
  hospital_name: 'Example Facility',
  hospital_name_source: 'Example Facility',
  hospital_type: 'Public',
  email: 'contact@example.test',
  email_source: 'contact@example.test',
  nodal_officer_name: 'Example Officer',
  contact_number: '9876543210',
  contact_number_source: '9876543210',
  verification_status: 'unverified',
  extraction_review_status: 'extracted',
  extraction_notes: '',
  ...overrides,
})

const csvRow = (values) =>
  SOURCE_CSV_HEADERS.map((column) => `"${String(values[column] ?? '').replaceAll('"', '""')}"`).join(',')

function createReport(records, existingHospitals = [], options = {}) {
  return buildDryRunReport({
    sourcePath: 'source.csv',
    headers: SOURCE_CSV_HEADERS,
    records: records.map((values, index) => ({
      rowNumber: index + 2,
      sourceLine: index + 2,
      values,
      parseErrors: [],
    })),
    existingHospitals,
    existingSourceObservations: options.existingSourceObservations ?? [],
    sourceDocumentHashes: options.sourceDocumentHashes ?? {},
    manualReviewDecisions: options.manualReviewDecisions ?? [],
    schemaSnapshot: {},
    generatedAt: '2026-10-29T00:00:00.000Z',
  })
}

function schemaColumnRows() {
  const required = {
    hospitals: [
      'id', 'public_name', 'public_phone', 'public_facility_type',
      'public_listing_status', 'public_source_name', 'public_source_reference',
    ],
    hospital_verification_records: [
      'hospital_id', 'status', 'source_type', 'source_name',
      'source_reference', 'last_verified_at', 'is_current',
    ],
    hospital_source_observations: [
      'hospital_id', 'source_system', 'source_hospital_id', 'source_document',
      'source_document_sha256', 'source_date', 'source_page',
      'source_hospital_name', 'source_ownership_type', 'source_email',
      'source_contact_phone', 'source_nodal_officer_name', 'source_row_payload',
    ],
  }
  return Object.entries(required).flatMap(([table_name, names]) =>
    names.map((column_name) => ({
      table_name,
      column_name,
      data_type: column_name === 'source_row_payload' ? 'jsonb' : 'text',
    })))
}

function createFakeImportClient({
  existing = [],
  failOnInsert = null,
  endpoint = {
    database_name: 'healthcare_platform_test',
    server_address: '127.0.0.1/32',
    server_port: 5432,
  },
} = {}) {
  let observations = new Map(existing.map((row) => [
    JSON.stringify([row.source_system, row.source_hospital_id, row.source_document_sha256]),
    structuredClone(row),
  ]))
  let transactionSnapshot = null
  let insertCount = 0
  const calls = []
  const query = async (sql, values = []) => {
    const statement = sql.trim()
    calls.push({ statement, values })
    if (statement === 'BEGIN') {
      transactionSnapshot = structuredClone(observations)
      return { rows: [] }
    }
    if (statement === 'COMMIT') return { rows: [] }
    if (statement === 'ROLLBACK') {
      observations = transactionSnapshot
      return { rows: [] }
    }
    if (statement.startsWith('SELECT current_database()')) {
      return { rows: [endpoint] }
    }
    if (statement.startsWith('SELECT table_name, column_name')) {
      return { rows: schemaColumnRows() }
    }
    if (statement.startsWith('SELECT tablename, indexname, indexdef')) {
      return {
        rows: [{
          tablename: 'hospital_source_observations',
          indexname: 'hospital_source_observations_identity_unique_idx',
          indexdef: 'CREATE UNIQUE INDEX hospital_source_observations_identity_unique_idx ON public.hospital_source_observations USING btree (source_system COLLATE "C", source_hospital_id COLLATE "C", source_document_sha256 COLLATE "C")',
        }],
      }
    }
    if (statement.startsWith('SELECT event_object_table')) return { rows: [] }
    if (statement.startsWith('SELECT t.typname AS enum_name')) {
      return {
        rows: [
          { enum_name: 'hospital_listing_status', enum_value: 'draft' },
          { enum_name: 'hospital_verification_status', enum_value: 'pending' },
          { enum_name: 'data_source_type', enum_value: 'government_registry' },
        ],
      }
    }
    if (statement === EXISTING_HOSPITALS_SQL.trim()) return { rows: [] }
    if (statement === EXISTING_SOURCE_OBSERVATIONS_SQL.trim()) {
      return { rows: [...observations.values()] }
    }
    if (statement === INSERT_SOURCE_OBSERVATION_SQL.trim()) {
      insertCount += 1
      if (failOnInsert === insertCount) throw new Error('injected insert failure')
      const [
        hospital_id,
        source_system,
        source_hospital_id,
        source_document,
        source_document_sha256,
        source_date,
        source_page,
        source_hospital_name,
        source_ownership_type,
        source_email,
        source_contact_phone,
        source_nodal_officer_name,
        payload,
      ] = values
      const identity = JSON.stringify([source_system, source_hospital_id, source_document_sha256])
      if (observations.has(identity)) return { rows: [] }
      observations.set(identity, {
        hospital_id,
        source_system,
        source_hospital_id,
        source_document,
        source_document_sha256,
        source_date,
        source_page,
        source_hospital_name,
        source_ownership_type,
        source_email,
        source_contact_phone,
        source_nodal_officer_name,
        source_row_payload: JSON.parse(payload),
      })
      return { rows: [{ id: `fake-${insertCount}` }] }
    }
    if (statement.includes('WHERE source_system = $1')) {
      const identity = JSON.stringify(values)
      const match = observations.get(identity)
      return { rows: match ? [match] : [] }
    }
    throw new Error(`Unexpected SQL in fake database: ${statement.slice(0, 100)}`)
  }
  return {
    query,
    calls,
    snapshot: () => [...observations.values()],
  }
}

describe('Sonipat hospital CSV dry-run importer', () => {
  it('parses quoted commas, escaped quotes, and embedded newlines', () => {
    const parsed = parseCsv(
      `${header}\r\n${csvRow(validRow({ hospital_name: 'Example, "North"\nFacility' }))}\r\n`,
    )
    assert.equal(parsed.records.length, 1)
    assert.equal(parsed.records[0].values.hospital_name, 'Example, "North"\nFacility')
    assert.deepEqual(parsed.errors, [])
  })

  it('preserves every original source column in parser data without emitting PII or payload in the report', () => {
    const sourceValues = validRow({
      hospital_name: '  PHC Banwasa  ',
      hospital_name_source: 'Phc banwasa',
      email_source: 'phcbanwasa@gmail.com',
      extraction_notes: '',
    })
    const parsed = parseCsv(`${header}\n${csvRow(sourceValues)}\n`)
    const report = buildDryRunReport({
      sourcePath: 'source.csv',
      ...parsed,
      existingHospitals: [],
    })

    assert.deepEqual(parsed.headers, SOURCE_CSV_HEADERS)
    assert.deepEqual(parsed.records[0].values, sourceValues)
    assert.deepEqual(report.source.preservedSourceColumns, SOURCE_CSV_HEADERS)
    const reportJson = JSON.stringify(report)
    assert.doesNotMatch(reportJson, /phcbanwasa@gmail\.com|9876543210|Aman Singh/)
    assert.doesNotMatch(reportJson, /sourceRowPayload/)
  })

  it('recognizes and preserves all 76 rows and 17 columns in the actual CSV offline', async () => {
    const csvPath = resolve(
      process.cwd(),
      '..',
      'data',
      'processed',
      'sonipat_pmjay_empanelled_hospitals.csv',
    )
    const parsed = parseCsv(await readFile(csvPath, 'utf8'))
    const report = buildDryRunReport({
      sourcePath: csvPath,
      ...parsed,
      existingHospitals: [],
    })

    assert.deepEqual(parsed.headers, SOURCE_CSV_HEADERS)
    assert.equal(parsed.records.length, 76)
    assert.equal(report.allRows.length, 76)
    const expectedManualPairs = [
      [
        { entry: '23', hospitalId: 'HOSP6G177317', page: '1' },
        { entry: '26', hospitalId: 'HOSP6G177370', page: '1' },
      ],
      [
        { entry: '44', hospitalId: 'HOSP6P02024', page: '2' },
        { entry: '63', hospitalId: 'HOSP6P131336', page: '3' },
      ],
      [
        { entry: '59', hospitalId: 'HOSP6P101722', page: '3' },
        { entry: '62', hospitalId: 'HOSP6P131103', page: '3' },
      ],
    ]
    assert.equal(report.validation.manualReviewRecords.length, expectedManualPairs.length)
    for (const [left, right] of expectedManualPairs) {
      const review = report.validation.manualReviewRecords.find((candidate) =>
        candidate.reviewId.endsWith(`entries-${left.entry}-${right.entry}`))
      assert.ok(review, `missing manual review record for entries ${left.entry} and ${right.entry}`)
      assert.equal(review.reviewerDecision, 'unresolved')
      assert.deepEqual(
        review.candidates.map(({ pdfEntryNumber, hospitalId }) => [pdfEntryNumber, hospitalId]),
        [[left.entry, left.hospitalId], [right.entry, right.hospitalId]],
      )
      for (const [index, candidate] of review.candidates.entries()) {
        assert.equal(candidate.sourceDocument, '202608041074356704.pdf')
        assert.equal(candidate.sourcePage, [left, right][index].page)
        assert.ok(candidate.originalSourceName)
        assert.equal(candidate.proposedNormalization, null)
        assert.ok(report.allRows[candidate.csvRowNumber - 2].reasons.includes('manual_identity_review_unresolved'))
      }
    }
    for (const [index, record] of parsed.records.entries()) {
      assert.deepEqual(Object.keys(record.values), SOURCE_CSV_HEADERS)
      assert.equal(record.values.hospital_id, parsed.records[index].values.hospital_id)
    }
    const reportJson = JSON.stringify(report)
    assert.doesNotMatch(reportJson, /sourceRowPayload/)
    for (const record of parsed.records) {
      for (const field of ['email', 'contact_number', 'nodal_officer_name']) {
        const value = record.values[field]
        if (value) assert.equal(reportJson.includes(value), false, `${field} leaked into report`)
      }
    }
  })

  it('keeps the evidence packet side-by-side, evidenced, and unresolved', async () => {
    const reportPath = resolve(
      process.cwd(),
      '..',
      'data',
      'reports',
      'sonipat_hospital_manual_review_evidence_20261029.json',
    )
    const csvPath = resolve(
      process.cwd(),
      '..',
      'data',
      'processed',
      'sonipat_pmjay_empanelled_hospitals.csv',
    )
    const packet = JSON.parse(await readFile(reportPath, 'utf8'))
    const parsed = parseCsv(await readFile(csvPath, 'utf8'))
    const expectedCodes = ['same_hospital', 'different_hospitals', 'needs_more_evidence']

    assert.equal(packet.decisionVocabulary.status, 'proposed-review-options-not-importer-input')
    assert.deepEqual(packet.decisionVocabulary.possibleCodes, expectedCodes)
    assert.equal(packet.pairs.length, 3)
    for (const pair of packet.pairs) {
      assert.equal(pair.recordedStatus, 'unresolved')
      assert.equal(pair.selectedDecision, null)
      assert.equal(pair.recommendedTriageCode, 'needs_more_evidence')
      assert.ok(pair.reason.trim())
      assert.ok(pair.evidenceReferences.length)
      assert.deepEqual(pair.decisionOptions.map((option) => option.code), expectedCodes)
      for (const option of pair.decisionOptions) {
        assert.ok(option.reason.trim())
        assert.ok(option.evidenceReferences.length)
      }
      for (const candidate of pair.candidates) {
        const source = parsed.records[candidate.csvRowNumber - 2].values
        assert.equal(candidate.sourceDocument, source.source_document)
        assert.equal(candidate.sourcePage, source.source_page)
        assert.equal(candidate.pdfEntryNumber, source.pdf_entry_number)
        assert.equal(candidate.hospitalId, source.hospital_id)
        assert.equal(candidate.hospitalName, source.hospital_name)
        assert.equal(candidate.email, source.email)
        assert.equal(candidate.contactNumber, source.contact_number)
      }
    }
    assert.equal(packet.safety.databaseAccessed, false)
    assert.equal(packet.safety.databaseWritten, false)
    assert.equal(packet.safety.hospitalRecordsCreated, false)
  })

  it('records an auditable decision without changing source names or clearing review flags', async () => {
    const csvPath = resolve(
      process.cwd(),
      '..',
      'data',
      'processed',
      'sonipat_pmjay_empanelled_hospitals.csv',
    )
    const parsed = parseCsv(await readFile(csvPath, 'utf8'))
    const unresolved = buildDryRunReport({
      sourcePath: csvPath,
      ...parsed,
      existingHospitals: [],
    })
    const chosenReview = unresolved.validation.manualReviewRecords.find((review) =>
      review.reviewId.endsWith('entries-23-26'))
    const records = parsed.records.map((record) => record.values)
    const selectedCandidate = chosenReview.candidates[0]
    const proposedName = 'Primary Health Center'
    const report = createReport(records, [], {
      manualReviewDecisions: [{
        reviewId: chosenReview.reviewId,
        reviewerDecision: 'confirmed_distinct_facilities',
        evidenceReference: '202608041074356704.pdf#page=1',
        reviewer: 'reviewer-01',
        reviewedAt: '2026-10-29T12:00:00.000Z',
        proposedNormalizations: {
          [selectedCandidate.csvRowNumber]: proposedName,
        },
      }],
    })
    const decided = report.validation.manualReviewRecords.find(
      (review) => review.reviewId === chosenReview.reviewId,
    )

    assert.ok(MANUAL_REVIEW_DECISIONS.includes(decided.reviewerDecision))
    assert.equal(decided.reviewerDecision, 'confirmed_distinct_facilities')
    assert.equal(decided.evidenceReference, '202608041074356704.pdf#page=1')
    assert.equal(decided.reviewer, 'reviewer-01')
    assert.equal(decided.reviewedAt, '2026-10-29T12:00:00.000Z')
    const normalizedCandidate = decided.candidates.find(
      (candidate) => candidate.csvRowNumber === selectedCandidate.csvRowNumber,
    )
    assert.equal(normalizedCandidate.originalSourceName, selectedCandidate.originalSourceName)
    assert.equal(normalizedCandidate.proposedNormalization, proposedName)
    assert.ok(report.allRows[selectedCandidate.csvRowNumber - 2].reasons.includes(
      'manual_identity_review_recorded_no_auto_action',
    ))
    assert.equal(report.allRows[selectedCandidate.csvRowNumber - 2].status, 'requires_review')
  })

  it('rejects invalid decision values, incomplete audit metadata, and normalization references', async () => {
    const csvPath = resolve(
      process.cwd(),
      '..',
      'data',
      'processed',
      'sonipat_pmjay_empanelled_hospitals.csv',
    )
    const parsed = parseCsv(await readFile(csvPath, 'utf8'))
    const current = buildDryRunReport({
      sourcePath: csvPath,
      ...parsed,
      existingHospitals: [],
    }).validation.manualReviewRecords[0]
    const validDecision = {
      reviewId: current.reviewId,
      reviewerDecision: 'confirmed_same_facility',
      evidenceReference: '202608041074356704.pdf#page=1',
      reviewer: 'reviewer-01',
      reviewedAt: '2026-10-29T12:00:00.000Z',
    }
    const reportOptions = (decision) => ({
      sourcePath: csvPath,
      ...parsed,
      existingHospitals: [],
      manualReviewDecisions: [decision],
    })

    assert.throws(
      () => buildDryRunReport(reportOptions({ ...validDecision, reviewerDecision: 'merge' })),
      /Unsupported manual review decision/,
    )
    for (const omittedField of ['evidenceReference', 'reviewer', 'reviewedAt']) {
      const incomplete = { ...validDecision }
      delete incomplete[omittedField]
      assert.throws(
        () => buildDryRunReport(reportOptions(incomplete)),
        /requires evidence, reviewer, and a timestamp/,
      )
    }
    assert.throws(
      () => buildDryRunReport(reportOptions({
        ...validDecision,
        reviewedAt: '2026-10-29 12:00:00',
      })),
      /requires evidence, reviewer, and a timestamp/,
    )
    assert.throws(
      () => buildDryRunReport(reportOptions({
        ...validDecision,
        reviewer: 'reviewer\nforged',
      })),
      /requires evidence, reviewer, and a timestamp/,
    )
    assert.throws(
      () => buildDryRunReport(reportOptions({
        ...validDecision,
        evidenceReference: `source.pdf\nsecret@example.test`,
      })),
      /requires evidence, reviewer, and a timestamp/,
    )
    assert.throws(
      () => buildDryRunReport(reportOptions({
        ...validDecision,
        proposedNormalizations: { '999': 'Name' },
      })),
      /non-candidate row/,
    )
    assert.throws(
      () => buildDryRunReport(reportOptions({
        ...validDecision,
        email: 'not-allowed@example.test',
      })),
      /unsupported fields/,
    )
    assert.throws(
      () => buildDryRunReport(reportOptions({
        ...validDecision,
        proposedNormalizations: { [current.candidates[0].csvRowNumber]: 123 },
      })),
      /invalid proposed normalization/,
    )
    assert.throws(
      () => buildDryRunReport({
        ...reportOptions(validDecision),
        manualReviewDecisions: [validDecision, validDecision],
      }),
      /Duplicate manual review decisions/,
    )
    assert.throws(
      () => buildDryRunReport(reportOptions({
        ...validDecision,
        reviewId: 'not-a-current-review',
      })),
      /does not match a current review candidate/,
    )
    assert.ok(MANUAL_REVIEW_DECISIONS.includes('unresolved'))
  })

  it('loads a review decision JSON file through the protected report-directory path', async () => {
    const csvPath = resolve(
      process.cwd(),
      '..',
      'data',
      'processed',
      'sonipat_pmjay_empanelled_hospitals.csv',
    )
    const parsed = parseCsv(await readFile(csvPath, 'utf8'))
    const review = buildDryRunReport({
      sourcePath: csvPath,
      ...parsed,
      existingHospitals: [],
    }).validation.manualReviewRecords[0]
    const fileName = `manual-review-${randomUUID()}.json`
    const reviewPath = resolveDryRunReportPath(fileName)
    const decision = {
      reviewId: review.reviewId,
      reviewerDecision: 'source_extraction_error',
      evidenceReference: '202608041074356704.pdf#page=1',
      reviewer: 'reviewer-02',
      reviewedAt: '2026-10-29T12:30:00+05:30',
      proposedNormalizations: {},
    }

    try {
      await writeFile(reviewPath, JSON.stringify([decision]), { flag: 'wx' })
      assert.deepEqual(await readManualReviewDecisions(reviewPath), [decision])
      await writeFile(reviewPath, '{"invalid":', 'utf8')
      await assert.rejects(readManualReviewDecisions(reviewPath), /not valid JSON/)
      await writeFile(reviewPath, JSON.stringify([{ ...decision, email: 'private@example.test' }]), 'utf8')
      await assert.rejects(readManualReviewDecisions(reviewPath), /unsupported fields/)
      await writeFile(reviewPath, JSON.stringify({ decisions: [decision] }), 'utf8')
      await assert.rejects(readManualReviewDecisions(reviewPath), /JSON array/)
    } finally {
      await unlink(reviewPath).catch(() => {})
    }
  })

  it('accepts the checked-in unresolved Sonipat review template for all three candidate pairs', async () => {
    const templatePath = resolveDryRunReportPath('sonipat_pmjay_manual_review_template.json')
    const decisions = await readManualReviewDecisions(templatePath)

    assert.deepEqual(decisions, [
      {
        reviewId: '202608041074356704.pdf#entries-23-26',
        reviewerDecision: 'unresolved',
      },
      {
        reviewId: '202608041074356704.pdf#entries-44-63',
        reviewerDecision: 'unresolved',
      },
      {
        reviewId: '202608041074356704.pdf#entries-59-62',
        reviewerDecision: 'unresolved',
      },
    ])
  })

  it('reports absent required fields and malformed email, phone, and type values', () => {
    const report = createReport([
      validRow({
        hospital_id: 'HOSP-INVALID',
        email: 'not-an-email',
        contact_number: '123',
        hospital_type: 'Unknown',
      }),
      validRow({ hospital_id: 'HOSP-MISSING', hospital_name: '' }),
    ])
    assert.equal(report.summary.invalidRows, 2)
    assert.deepEqual(report.validation.invalidRows[0].reasons, [
      'invalid_email',
      'invalid_indian_mobile_number',
      'unrecognized_hospital_type',
    ])
    assert.ok(report.validation.invalidRows[1].reasons.includes('missing_hospital_name'))
  })

  it('flags duplicate source IDs, exact names, and similar names without merging rows', () => {
    const report = createReport([
      validRow({ hospital_id: 'HOSP-DUP', hospital_name: 'Example Facility' }),
      validRow({ hospital_id: 'hosp-dup', hospital_name: 'Example Facility' }),
      validRow({ hospital_id: 'HOSP-OTHER', hospital_name: 'Example Faciliti' }),
    ])
    assert.equal(report.validation.duplicateSourceIds.length, 1)
    assert.equal(report.validation.duplicateNames.length, 1)
    assert.equal(report.validation.similarNameCandidates.length, 2)
    assert.equal(report.summary.rowsRequiringReview, 3)
    assert.equal(report.allRows.length, 3)
  })

  it('preserves migration identity and repeat/conflict behavior for duplicate source rows', () => {
    const pdfBytes = Buffer.from('%PDF-1.7 source')
    const hash = calculateSourceDocumentSha256(pdfBytes)
    const rowValues = validRow()
    const record = { values: rowValues }
    const first = observationFromCsvRecord(record, hash)
    first.source_system = 'PM-JAY'
    const identical = structuredClone(first)
    const payloadConflict = structuredClone(first)
    payloadConflict.source_row_payload.email_source = 'updated@example.test'
    const renamedReference = structuredClone(first)
    renamedReference.source_document = 'renamed-copy.pdf'
    renamedReference.source_row_payload.source_document = 'renamed-copy.pdf'
    const conflicting = {
      ...first,
      source_email: 'changed@example.test',
      source_row_payload: {
        ...first.source_row_payload,
        email: 'changed@example.test',
      },
    }

    assert.equal(sourceObservationIdentity(first), sourceObservationIdentity(identical))
    assert.equal(classifySourceObservationRepeat(first, identical), 'already_imported')
    assert.equal(classifySourceObservationRepeat(first, conflicting), 'conflicting_repeat')
    assert.equal(classifySourceObservationRepeat(first, payloadConflict), 'conflicting_repeat')
    assert.equal(classifySourceObservationRepeat(first, renamedReference), 'conflicting_repeat')
    assert.equal(
      classifySourceObservationRepeat(first, {
        ...first,
        source_document_sha256: calculateSourceDocumentSha256(Buffer.from('%PDF-1.7 revised')),
      }),
      'new_observation',
    )
  })

  it('classifies existing source observations using exact full payload and document reference', () => {
    const hash = calculateSourceDocumentSha256(Buffer.from('%PDF-1.7 source'))
    const record = { values: validRow() }
    const existing = observationFromCsvRecord(record, hash)
    existing.source_system = 'pm-jay'
    const report = createReport([validRow()], [], {
      sourceDocumentHashes: { 'source.pdf': hash },
      existingSourceObservations: [existing],
    })

    assert.deepEqual(report.validation.sourceObservationRepeats, [
      { rowNumber: 2, classification: 'already_imported' },
    ])
    assert.ok(report.allRows[0].reasons.includes('source_identity_already_imported_review_only'))
    assert.equal(report.allRows[0].status, 'requires_review')
  })

  it('aborts classification with a sanitized error for malformed existing source identities', () => {
    const hash = calculateSourceDocumentSha256(Buffer.from('%PDF-1.7 source'))
    const malformedExisting = observationFromCsvRecord({ values: validRow() }, hash)
    malformedExisting.source_system = 'private@example.test'

    assert.throws(
      () => createReport([validRow()], [], {
        sourceDocumentHashes: { 'source.pdf': hash },
        existingSourceObservations: [malformedExisting],
      }),
      (error) => {
        assert.match(error.message, /malformed identity data/)
        assert.doesNotMatch(error.message, /private@example\.test/)
        return true
      },
    )
  })

  it('reports payload and renamed-document conflicts without exposing source values', () => {
    const hash = calculateSourceDocumentSha256(Buffer.from('%PDF-1.7 source'))
    const incoming = observationFromCsvRecord({ values: validRow() }, hash)
    const existing = {
      ...incoming,
      source_system: 'pm-jay',
      source_row_payload: {
        ...incoming.source_row_payload,
        email_source: 'different@example.test',
      },
    }
    const report = createReport([validRow()], [], {
      sourceDocumentHashes: { 'source.pdf': hash },
      existingSourceObservations: [existing],
    })
    assert.equal(report.validation.sourceObservationRepeats[0].classification, 'conflicting_repeat')
    assert.ok(report.allRows[0].reasons.includes('source_identity_conflicting_repeat'))
    assert.doesNotMatch(JSON.stringify(report), /different@example\.test|contact@example\.test/)
  })

  it('keeps duplicate source IDs and similar-name candidates as review flags without merging', () => {
    const duplicate = validRow({ hospital_id: 'HOSP12345', hospital_name: 'Example Facility' })
    const similar = validRow({ hospital_id: 'HOSPOTHER', hospital_name: 'Example Faciliti' })
    const report = createReport([duplicate, { ...duplicate }, similar])
    assert.equal(report.summary.duplicateSourceIdGroups, 1)
    assert.ok(report.summary.similarNamePairs > 0)
    assert.equal(report.allRows.length, 3)
    assert.ok(report.allRows.every((row) => row.status !== 'merged'))
    assert.equal('proposedDatabaseRecord' in report.allRows[0], false)
  })

  it('rejects unsafe target flags and conflicting connection environment without connecting', () => {
    assert.deepEqual(
      parseDryRunArguments([
        '--database', 'healthcare_platform_test',
        '--host', 'localhost',
        '--port', '5432',
      ]),
      {
        ...DEFAULT_DRY_RUN_TARGET,
        host: 'localhost',
        csvPath: resolve(process.cwd(), '..', 'data', 'processed', 'sonipat_pmjay_empanelled_hospitals.csv'),
        reportPath: resolve(process.cwd(), '..', 'data', 'reports', 'sonipat_hospital_import_dry_run.json'),
        reviewDecisionsPath: null,
        writeMode: false,
        writeConfirmation: null,
      },
    )
    assert.deepEqual(
      parseDryRunArguments([]),
      {
        ...DEFAULT_DRY_RUN_TARGET,
        csvPath: resolve(process.cwd(), '..', 'data', 'processed', 'sonipat_pmjay_empanelled_hospitals.csv'),
        reportPath: resolve(process.cwd(), '..', 'data', 'reports', 'sonipat_hospital_import_dry_run.json'),
        reviewDecisionsPath: null,
        writeMode: false,
        writeConfirmation: null,
      },
    )
    assert.equal(
      parseDryRunArguments(['--review-decisions', 'manual-review.json']).reviewDecisionsPath,
      resolve(DRY_RUN_REPORT_DIRECTORY, 'manual-review.json'),
    )
    assert.throws(() => parseDryRunArguments(['--write']), /requires explicit --database/)
    assert.throws(() => parseDryRunArguments([
      '--write',
      '--database', 'healthcare_platform_test',
      '--host', '127.0.0.1',
      '--port', '5432',
    ]), /requires explicit --confirm-write/)
    assert.deepEqual(
      parseDryRunArguments([
        '--write',
        '--confirm-write', WRITE_MODE_CONFIRMATION,
        '--database', 'healthcare_platform_test',
        '--host', '127.0.0.1',
        '--port', '5432',
      ]),
      {
        ...DEFAULT_DRY_RUN_TARGET,
        csvPath: resolve(process.cwd(), '..', 'data', 'processed', 'sonipat_pmjay_empanelled_hospitals.csv'),
        reportPath: resolve(process.cwd(), '..', 'data', 'reports', 'sonipat_hospital_import_dry_run.json'),
        reviewDecisionsPath: null,
        writeMode: true,
        writeConfirmation: WRITE_MODE_CONFIRMATION,
      },
    )
    assert.throws(() => parseDryRunArguments([
      '--write', '--dry-run',
      '--confirm-write', WRITE_MODE_CONFIRMATION,
      '--database', 'healthcare_platform_test', '--host', '127.0.0.1', '--port', '5432',
    ]), /cannot be combined/)
    assert.throws(() => parseDryRunArguments([
      '--write',
      '--confirm-write', WRITE_MODE_CONFIRMATION,
      '--database', 'healthcare_platform_test', '--host', 'remote', '--port', '5432',
    ]), /target host/)
    assert.throws(() => parseDryRunArguments(['--unknown']), /Unsupported argument/)
    assert.throws(() => parseDryRunArguments(['--database', 'healthcare_platform']), /target must be database/)
    assert.throws(() => parseDryRunArguments(['--host', 'db.example.test']), /target host/)
    assert.throws(() => parseDryRunArguments(['--port', '5433']), /target port/)
    assert.throws(() => assertSafeDryRunTarget(DEFAULT_DRY_RUN_TARGET, {
      PGDATABASE: 'healthcare_platform',
    }), /conflicts/)
    for (const setting of BLOCKED_CONNECTION_ENVIRONMENT) {
      assert.throws(() => assertSafeDryRunTarget(DEFAULT_DRY_RUN_TARGET, {
        [setting]: 'redirect',
      }), new RegExp(setting))
    }
  })

  it('excludes invalid rows with explicit reasons before attempting observation inserts', () => {
    const hash = calculateSourceDocumentSha256(Buffer.from('original PDF bytes'))
    const record = {
      rowNumber: 2,
      sourceLine: 2,
      values: validRow({ hospital_name: '', hospital_id: '' }),
      parseErrors: [],
    }
    const plan = prepareSourceObservationImport({
      records: [record],
      headers: SOURCE_CSV_HEADERS,
      parseErrors: [],
      sourceDocumentHashes: { 'source.pdf': hash },
    })
    assert.equal(plan.candidates.length, 0)
    assert.deepEqual(plan.excludedRows[0].reasons, [
      'missing_hospital_id',
      'missing_hospital_name',
      'invalid_source_hospital_id',
    ])
  })

  it('imports only source observations with the complete original payload and no hospital/public writes', async () => {
    const values = validRow({
      hospital_id: 'HOSP12345',
      hospital_name: '  Example Facility  ',
      extraction_notes: '',
    })
    const record = { rowNumber: 2, sourceLine: 2, values, parseErrors: [] }
    const hash = calculateSourceDocumentSha256(Buffer.from('exact source PDF bytes'))
    const client = createFakeImportClient()
    const report = await performSourceObservationImport(client, {
      sourcePath: 'source.csv',
      headers: SOURCE_CSV_HEADERS,
      records: [record],
      parseErrors: [],
      sourceDocumentHashes: { 'source.pdf': hash },
    })

    assert.equal(report.mode, 'write')
    assert.equal(report.operation, 'source-observation-import')
    assert.equal(report.import.insertedRows, 1)
    assert.equal(report.database.databaseWritesPerformed, true)
    assert.equal(report.import.hospitalRecordsWritten, 0)
    assert.equal(report.import.hospitalVerificationRecordsWritten, 0)
    assert.equal(report.import.hospitalLinksCreated, 0)
    assert.equal(client.snapshot().length, 1)
    assert.equal(client.snapshot()[0].source_hospital_id, 'hosp12345')
    assert.equal(client.snapshot()[0].source_document_sha256, hash)
    assert.deepEqual(client.snapshot()[0].source_row_payload, values)
    assert.equal(client.snapshot()[0].source_row_payload.extraction_notes, '')
    assert.equal(client.snapshot()[0].hospital_id, null)
    assert.ok(client.calls.findIndex(({ statement }) => statement.startsWith('SELECT current_database()')) <
      client.calls.findIndex(({ statement }) => statement === EXISTING_HOSPITALS_SQL.trim()))
    const writes = client.calls.filter(({ statement }) => /\bINSERT\b/i.test(statement))
    assert.equal(writes.length, 1)
    assert.match(writes[0].statement, /INSERT INTO hospital_source_observations/)
    assert.doesNotMatch(writes[0].statement, /\b(UPDATE|DELETE|MERGE|CREATE|ALTER|DROP)\b/i)
    assert.doesNotMatch(JSON.stringify(report), /contact@example\.test|9876543210|Example Officer/)
  })

  it('rolls back every staged observation after an unexpected insert error', async () => {
    const hash = calculateSourceDocumentSha256(Buffer.from('source PDF'))
    const records = [
      { rowNumber: 2, sourceLine: 2, values: validRow({ hospital_id: 'HOSP1' }), parseErrors: [] },
      { rowNumber: 3, sourceLine: 3, values: validRow({ hospital_id: 'HOSP2' }), parseErrors: [] },
    ]
    const client = createFakeImportClient({ failOnInsert: 2 })

    await assert.rejects(performSourceObservationImport(client, {
      sourcePath: 'source.csv',
      headers: SOURCE_CSV_HEADERS,
      records,
      parseErrors: [],
      sourceDocumentHashes: { 'source.pdf': hash },
    }), /injected insert failure/)
    assert.equal(client.snapshot().length, 0)
    assert.ok(client.calls.some(({ statement }) => statement === 'ROLLBACK'))
    assert.equal(client.calls.some(({ statement }) => statement === 'COMMIT'), false)
  })

  it('surfaces duplicate input identities and rolls back conflicting duplicate rows', async () => {
    const hash = calculateSourceDocumentSha256(Buffer.from('source PDF'))
    const first = { rowNumber: 2, sourceLine: 2, values: validRow(), parseErrors: [] }
    const exactDuplicate = { rowNumber: 3, sourceLine: 3, values: validRow(), parseErrors: [] }
    const exactClient = createFakeImportClient()
    const exactReport = await performSourceObservationImport(exactClient, {
      sourcePath: 'source.csv',
      headers: SOURCE_CSV_HEADERS,
      records: [first, exactDuplicate],
      parseErrors: [],
      sourceDocumentHashes: { 'source.pdf': hash },
    })
    assert.equal(exactClient.snapshot().length, 1)
    assert.equal(exactReport.summary.duplicateSourceIdGroups, 1)
    assert.equal(exactReport.allRows[0].sourceObservationImportResult, 'inserted')
    assert.equal(exactReport.allRows[1].sourceObservationImportResult, 'already_imported')

    const conflictingDuplicate = {
      rowNumber: 3,
      sourceLine: 3,
      values: validRow({ hospital_name: 'Conflicting Facility Name' }),
      parseErrors: [],
    }
    const conflictClient = createFakeImportClient()
    await assert.rejects(performSourceObservationImport(conflictClient, {
      sourcePath: 'source.csv',
      headers: SOURCE_CSV_HEADERS,
      records: [first, conflictingDuplicate],
      parseErrors: [],
      sourceDocumentHashes: { 'source.pdf': hash },
    }), /Conflicting source observation at CSV row 3/)
    assert.equal(conflictClient.snapshot().length, 0)
    assert.ok(conflictClient.calls.some(({ statement }) => statement === 'ROLLBACK'))
  })

  it('treats exact reruns idempotently and keeps all six similar-name rows unresolved', async () => {
    const csvPath = resolve(process.cwd(), '..', 'data', 'processed', 'sonipat_pmjay_empanelled_hospitals.csv')
    const parsed = parseCsv(await readFile(csvPath, 'utf8'))
    const pdfPath = resolve(process.cwd(), '..', 'data', 'raw', '202608041074356704.pdf')
    const hash = calculateSourceDocumentSha256(await readFile(pdfPath))
    const sourceDocumentHashes = { '202608041074356704.pdf': hash }
    const client = createFakeImportClient()
    const input = {
      sourcePath: csvPath,
      headers: parsed.headers,
      records: parsed.records,
      parseErrors: parsed.errors,
      sourceDocumentHashes,
    }
    const firstReport = await performSourceObservationImport(client, input)
    const storedCount = client.snapshot().length
    const secondReport = await performSourceObservationImport(client, input)

    assert.equal(parsed.records.length, 76)
    assert.equal(firstReport.import.insertedRows, storedCount)
    assert.equal(secondReport.import.insertedRows, 0)
    assert.equal(secondReport.import.alreadyImportedRows, storedCount)
    assert.equal(client.snapshot().length, storedCount)
    assert.ok(client.snapshot().every((row) => row.source_document_sha256 === hash))
    assert.equal(firstReport.import.unresolvedReviewIds.length, 3)
    for (const review of firstReport.validation.manualReviewRecords) {
      assert.equal(review.reviewerDecision, 'unresolved')
      for (const candidate of review.candidates) {
        const row = firstReport.allRows.find((item) => item.rowNumber === candidate.csvRowNumber)
        assert.equal(row.status, 'requires_review')
        assert.ok(row.reasons.includes('manual_identity_review_unresolved'))
        assert.notEqual(row.sourceObservationImportResult, 'excluded')
      }
    }
    const reportJson = JSON.stringify(firstReport)
    for (const record of parsed.records) {
      for (const field of ['email', 'email_source', 'contact_number', 'contact_number_source', 'nodal_officer_name']) {
        const privateValue = record.values[field]
        if (privateValue) assert.equal(reportJson.includes(privateValue), false)
      }
    }
  })

  it('fails closed and rolls back when an existing source identity has conflicting payload', async () => {
    const hash = calculateSourceDocumentSha256(Buffer.from('source PDF'))
    const values = validRow()
    const record = { rowNumber: 2, sourceLine: 2, values, parseErrors: [] }
    const existing = observationFromCsvRecord(record, hash)
    existing.source_row_payload = { ...existing.source_row_payload, hospital_name_source: 'Changed source text' }
    const client = createFakeImportClient({ existing: [existing] })
    const before = client.snapshot()

    await assert.rejects(performSourceObservationImport(client, {
      sourcePath: 'source.csv',
      headers: SOURCE_CSV_HEADERS,
      records: [record],
      parseErrors: [],
      sourceDocumentHashes: { 'source.pdf': hash },
    }), /Conflicting source observation at CSV row 2/)
    assert.deepEqual(client.snapshot(), before)
    assert.ok(client.calls.some(({ statement }) => statement === 'ROLLBACK'))
    assert.equal(client.calls.some(({ statement }) => statement === 'COMMIT'), false)
  })

  it('checks the connected target before reading hospital or source-observation data', async () => {
    const hash = calculateSourceDocumentSha256(Buffer.from('source PDF'))
    const client = createFakeImportClient({
      endpoint: {
        database_name: 'healthcare_platform',
        server_address: '127.0.0.1/32',
        server_port: 5432,
      },
    })
    await assert.rejects(performSourceObservationImport(client, {
      sourcePath: 'source.csv',
      headers: SOURCE_CSV_HEADERS,
      records: [{ rowNumber: 2, sourceLine: 2, values: validRow(), parseErrors: [] }],
      parseErrors: [],
      sourceDocumentHashes: { 'source.pdf': hash },
    }), /other than healthcare_platform_test/)
    const statements = client.calls.map(({ statement }) => statement)
    assert.equal(statements[0], 'BEGIN')
    assert.match(statements[1], /^SELECT current_database\(\)/)
    assert.equal(statements[2], 'ROLLBACK')
    assert.equal(statements.some((statement) =>
      statement === EXISTING_HOSPITALS_SQL.trim() ||
      statement === EXISTING_SOURCE_OBSERVATIONS_SQL.trim()), false)
  })

  it('restricts report output to a direct file in the dedicated report directory', () => {
    assert.equal(
      resolveDryRunReportPath('custom-review.json'),
      resolve(DRY_RUN_REPORT_DIRECTORY, 'custom-review.json'),
    )
    assert.throws(
      () => parseDryRunArguments(['--report', '..\\outside.json']),
      /path traversal/,
    )
    assert.throws(
      () => parseDryRunArguments(['--report', resolve(process.cwd(), 'outside-report.json')]),
      /inside the dedicated report directory/,
    )
    assert.throws(
      () => parseDryRunArguments(['--report', 'nested\\report.json']),
      /directly inside the dedicated report directory/,
    )
    assert.throws(
      () => resolveDryRunReportPath('C:\\outside\\report.json'),
      /inside the dedicated report directory/,
    )
    assert.throws(
      () => resolveDryRunReportPath('C:outside-report.json'),
      /drive-qualified or UNC/,
    )
    assert.throws(
      () => resolveDryRunReportPath('\\\\server\\share\\report.json'),
      /drive-qualified or UNC|inside the dedicated report directory/,
    )
  })

  it('rejects report-directory symlink redirection where supported', async (context) => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'sonipat-report-path-'))
    const projectRoot = join(temporaryRoot, 'project')
    const dataDirectory = join(projectRoot, 'data')
    const redirectedDirectory = join(temporaryRoot, 'redirected-reports')
    await mkdir(dataDirectory, { recursive: true })
    await mkdir(redirectedDirectory)
    try {
      try {
        await symlink(redirectedDirectory, join(dataDirectory, 'reports'), 'junction')
      } catch (error) {
        if (['EPERM', 'EACCES', 'ENOTSUP', 'EOPNOTSUPP'].includes(error?.code)) {
          context.skip(`Symlink/reparse point creation is unavailable: ${error.code}`)
          return
        }
        throw error
      }

      await assert.rejects(
        ensureCanonicalReportDirectory(projectRoot),
        /canonical data\/reports directory/,
      )
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true })
    }
  })

  it('refuses to overwrite an existing report and preserves its contents', async () => {
    let reportDirectoryExisted = true
    try {
      await access(DRY_RUN_REPORT_DIRECTORY)
    } catch {
      reportDirectoryExisted = false
    }

    const reportPath = resolveDryRunReportPath(`overwrite-check-${randomUUID()}.json`)
    const originalContents = 'existing report must remain unchanged'
    try {
      await mkdir(DRY_RUN_REPORT_DIRECTORY, { recursive: true })
      await writeFile(reportPath, originalContents, { flag: 'wx' })
      await assert.rejects(writeDryRunReport(reportPath, 'replacement'), { code: 'EEXIST' })
      assert.equal(await readFile(reportPath, 'utf8'), originalContents)
    } finally {
      await unlink(reportPath).catch(() => {})
      if (!reportDirectoryExisted) {
        await rmdir(DRY_RUN_REPORT_DIRECTORY).catch(() => {})
      }
    }
  })

  it('uses exclusive creation for the default report path', async () => {
    const defaultReportPath = parseDryRunArguments([]).reportPath
    let reportDirectoryExisted = true
    try {
      await access(DRY_RUN_REPORT_DIRECTORY)
    } catch {
      reportDirectoryExisted = false
    }
    let createdFixture = false
    let originalContents
    try {
      await mkdir(DRY_RUN_REPORT_DIRECTORY, { recursive: true })
      originalContents = `default report fixture ${randomUUID()}`
      try {
        await writeFile(defaultReportPath, originalContents, { flag: 'wx' })
        createdFixture = true
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error
        originalContents = await readFile(defaultReportPath, 'utf8')
      }

      await assert.rejects(writeDryRunReport(defaultReportPath, 'replacement'), { code: 'EEXIST' })
      assert.equal(await readFile(defaultReportPath, 'utf8'), originalContents)
    } finally {
      if (createdFixture) await unlink(defaultReportPath)
      if (!reportDirectoryExisted) await rmdir(DRY_RUN_REPORT_DIRECTORY).catch(() => {})
    }
  })

  it('validates actual connected database address and port before database reads', () => {
    assert.doesNotThrow(() => assertConnectedDryRunEndpoint({
      database_name: 'healthcare_platform_test',
      server_address: '127.0.0.1/32',
      server_port: 5432,
    }))
    assert.doesNotThrow(() => assertConnectedDryRunEndpoint({
      database_name: 'healthcare_platform_test',
      server_address: '127.24.3.8/32',
      server_port: 5432,
    }))
    assert.doesNotThrow(() => assertConnectedDryRunEndpoint({
      database_name: 'healthcare_platform_test',
      server_address: '::1/128',
      server_port: '5432',
    }))
    assert.doesNotThrow(() => assertConnectedDryRunEndpoint({
      database_name: 'healthcare_platform_test',
      server_address: '0:0:0:0:0:0:0:1',
      server_port: '5432',
    }))
    assert.throws(() => assertConnectedDryRunEndpoint({
      database_name: 'healthcare_platform',
      server_address: '127.0.0.1',
      server_port: 5432,
    }), /database/)
    assert.throws(() => assertConnectedDryRunEndpoint({
      database_name: 'healthcare_platform_test',
      server_address: '10.0.0.5',
      server_port: 5432,
    }), /non-loopback/)
    assert.throws(() => assertConnectedDryRunEndpoint({
      database_name: 'healthcare_platform_test',
      server_address: '::ffff:10.0.0.5',
      server_port: 5432,
    }), /non-loopback/)
    for (const malformedAddress of [
      '127.0.0.1/not-a-prefix',
      '127.0.0.1/33',
      '127.0.0.999/32',
      '::1/129',
      '0:0:0:0:0:0:0:xyz',
      '127.0.0.1/32/extra',
    ]) {
      assert.throws(() => assertConnectedDryRunEndpoint({
        database_name: 'healthcare_platform_test',
        server_address: malformedAddress,
        server_port: 5432,
      }), /non-loopback/)
    }
    assert.throws(() => assertConnectedDryRunEndpoint({
      database_name: 'healthcare_platform_test',
      server_address: null,
      server_port: null,
    }), /non-loopback/)
    assert.throws(() => assertConnectedDryRunEndpoint({
      database_name: 'healthcare_platform_test',
      server_address: '127.0.0.1',
      server_port: 5433,
    }), /port/)
  })

  it('keeps dry-run strictly read-only and limits write SQL to source observations', async () => {
    const script = await readFile(resolve(process.cwd(), 'scripts', 'import-sonipat-hospitals.mjs'), 'utf8')
    assert.match(script, /DATABASE_TRANSACTION_MODE = 'READ ONLY'/)
    assert.match(script, /default_transaction_read_only=on/)
    assert.match(script, /current_database\(\)[\s\S]*inet_server_addr\(\)[\s\S]*inet_server_port\(\)/)
    const dryRunDatabaseReader = script.match(/async function inspectDatabase\(client\) \{[\s\S]*?\n\}/)?.[0]
    assert.ok(dryRunDatabaseReader)
    assert.match(dryRunDatabaseReader, /BEGIN \$\{DATABASE_TRANSACTION_MODE\}/)
    assert.doesNotMatch(
      dryRunDatabaseReader,
      /\b(?:INSERT\s+INTO|UPDATE\s+[\w.]+\s+SET|DELETE\s+FROM|MERGE\s+INTO|TRUNCATE|CREATE|ALTER|DROP)\b/i,
    )
    assert.match(INSERT_SOURCE_OBSERVATION_SQL.trim(), /^INSERT INTO hospital_source_observations\b/i)
    assert.doesNotMatch(
      INSERT_SOURCE_OBSERVATION_SQL,
      /\b(?:UPDATE|DELETE|MERGE|TRUNCATE|CREATE|ALTER|DROP)\b/i,
    )
    assert.doesNotMatch(script, /\bINSERT\s+INTO\s+(?:hospitals|hospital_verification_records)\b/i)
    assert.ok(
      script.indexOf('assertConnectedDryRunEndpoint(endpoint)') <
        script.indexOf('client.query(SCHEMA_COLUMNS_SQL)'),
      'connected endpoint must be validated before schema and hospital data reads',
    )
    for (const sql of [EXISTING_HOSPITALS_SQL, EXISTING_SOURCE_OBSERVATIONS_SQL]) {
      assert.match(sql.trim(), /^SELECT\b/i)
      assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|MERGE|TRUNCATE)\b/i)
    }
  })

  it('marks the entire report review-only and does not imply publication, verification, or import', () => {
    const report = createReport([validRow()])
    assert.equal(report.operation, 'read-only-review-only')
    assert.equal(report.mode, 'dry-run')
    assert.equal(report.database.databaseWritesPerformed, false)
    assert.equal(report.summary.importExecuted, false)
    assert.equal(report.readiness.writeModeAvailable, false)
    assert.equal(report.readiness.importAvailable, false)
    assert.equal(report.allRows[0].status, 'review_only_no_flags')
    assert.equal('proposedDatabaseRecord' in report.allRows[0], false)
    assert.equal('proposedDatabaseState' in report, false)
    assert.equal(report.database.endpointVerified, false)
    assert.equal(DATABASE_TRANSACTION_MODE, 'READ ONLY')
  })
  it('detects existing exact source-ID, exact-name, and similar-name candidates as review only', () => {
    const report = createReport(
      [validRow()],
      [
        {
          id: 'existing-id-1',
          public_name: 'Example Facility',
          public_source_reference: null,
          verification_source_reference: null,
        },
        {
          id: 'existing-id-2',
          public_name: 'Different Facility',
          public_source_reference: 'HOSP12345',
          verification_source_reference: null,
        },
      ],
    )
    assert.equal(report.summary.possibleDatabaseMatchRows, 1)
    assert.deepEqual(
      report.validation.possibleDatabaseMatches[0].matches.map((match) => match.type).sort(),
      ['exact_name', 'exact_source_id'],
    )
    assert.equal(report.summary.rowsRequiringReview, 1)
    assert.equal(report.validation.possibleDatabaseMatches[0].reviewOnly, true)
  })

  it('reports malformed CSV column counts instead of silently dropping a row', () => {
    const parsed = parseCsv(`${header}\nonly-one-value\n`)
    assert.equal(parsed.records.length, 1)
    assert.equal(parsed.records[0].parseErrors.length, 1)
    assert.match(parsed.errors[0].message, /Expected .* columns/)
    const report = buildDryRunReport({
      sourcePath: 'source.csv',
      ...parsed,
      existingHospitals: [],
    })
    assert.equal(report.summary.rowsRequiringReview, 1)
  })

  it('requires all 17 source columns before marking a row review-only without flags', () => {
    const incompleteHeaders = SOURCE_CSV_HEADERS.filter((column) => column !== 'extraction_notes')
    const report = buildDryRunReport({
      sourcePath: 'source.csv',
      headers: incompleteHeaders,
      records: [{
        rowNumber: 2,
        sourceLine: 2,
        values: validRow(),
        parseErrors: [],
      }],
      existingHospitals: [],
    })

    assert.deepEqual(report.source.missingColumns, ['extraction_notes'])
    assert.equal(report.summary.rowsWithoutReviewFlags, 0)
    assert.ok(report.allRows[0].reasons.some((reason) => reason.startsWith('missing_source_columns:')))
  })
})
