import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, it } from 'node:test'
import {
  calculateSourceDocumentSha256,
  classifySourceObservationRepeat,
  normalizeSourceIdentityPart,
  sourceObservationIdentity,
} from './source-observation-identity.mjs'

const migrationPath = resolve(
  process.cwd(),
  '..',
  'database',
  'migrations',
  '004_hospital_source_observations.sql',
)
const payloadMigrationPath = resolve(
  process.cwd(),
  '..',
  'database',
  'migrations',
  '005_source_observation_csv_payload.sql',
)
const reviewMigrationPath = resolve(
  process.cwd(),
  '..',
  'database',
  'migrations',
  '006_hospital_source_observation_reviews.sql',
)
const runnerPath = resolve(
  process.cwd(),
  '..',
  'database',
  'scripts',
  'db-migrate.ps1',
)
const integrationSqlPath = resolve(
  process.cwd(),
  '..',
  'database',
  'tests',
  '004_hospital_source_observations.integration.sql',
)

const baseObservation = {
  hospital_id: null,
  source_system: 'PM-JAY',
  source_hospital_id: 'HOSP123',
  source_document: 'source.pdf',
  source_document_sha256: 'a'.repeat(64),
  source_date: '2026-08-03',
  source_page: 1,
  source_hospital_name: 'Example Hospital',
  source_ownership_type: 'Public',
  source_email: 'example@example.test',
  source_contact_phone: '9876543210',
  source_nodal_officer_name: 'Example Officer',
  source_row_payload: {
    source_document: 'source.pdf',
    source_date: '2026-08-03',
    source_page: '1',
    record_type: 'pmjay_empanelled_hospital',
    pdf_entry_number: '1',
    hospital_id: 'HOSP123',
    hospital_name: 'Example Hospital',
    hospital_name_source: 'Example Hospital',
    hospital_type: 'Public',
    email: 'example@example.test',
    email_source: 'example@example.test',
    nodal_officer_name: 'Example Officer',
    contact_number: '9876543210',
    contact_number_source: '9876543210',
    verification_status: 'unverified',
    extraction_review_status: 'extracted',
    extraction_notes: '',
  },
}

describe('hospital source observation migration and identity', () => {
  it('adds only the new source-observation table and preserves source/verified separation', async () => {
    const sql = await readFile(migrationPath, 'utf8')
    assert.match(sql, /CREATE TABLE hospital_source_observations\s*\(/i)
    assert.match(sql, /hospital_id uuid REFERENCES hospitals\(id\) ON DELETE RESTRICT/i)
    for (const column of [
      'source_system',
      'source_hospital_id',
      'source_document',
      'source_document_sha256',
      'source_date',
      'source_page',
      'source_hospital_name',
      'source_ownership_type',
      'source_email',
      'source_contact_phone',
      'source_nodal_officer_name',
    ]) {
      assert.match(sql, new RegExp(`\\b${column}\\b`))
    }
    assert.doesNotMatch(sql, /\bALTER\s+TABLE\b/i)
    assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE)\s+INTO?\b/i)
    assert.doesNotMatch(sql, /\bDROP\b/i)
  })

  it('enforces valid SHA-256, source fields, ownership, page, and optional-text constraints', async () => {
    const sql = await readFile(migrationPath, 'utf8')
    assert.match(sql, /source_document_sha256 ~ '\^\[0-9a-f\]\{64\}\$'/)
    assert.match(sql, /source_page IS NULL OR source_page > 0/)
    assert.match(sql, /source_ownership_type IN \('Public', 'Private'\)/)
    assert.match(sql, /source_system ~ '\^\[a-z0-9\]\[a-z0-9\._:-\]\*\$'/)
    assert.match(sql, /source_hospital_id ~ '\^\[a-z0-9\]\[a-z0-9\._:-\]\*\$'/)
    assert.match(sql, /length\(btrim\(source_document\)\) > 0/)
    assert.match(sql, /length\(btrim\(source_hospital_name\)\) > 0/)
    assert.match(
      sql,
      /hospital_id uuid REFERENCES hospitals\(id\) ON DELETE RESTRICT/i,
    )
    assert.match(
      sql,
      /hospital_source_observations_hospital_history_idx\s+ON hospital_source_observations\s*\(hospital_id, source_date DESC\)\s+WHERE hospital_id IS NOT NULL/i,
    )
  })

  it('uses source system, source ID, and content hash as the import uniqueness identity', async () => {
    const sql = await readFile(migrationPath, 'utf8')
    assert.match(
      sql,
      /CREATE UNIQUE INDEX hospital_source_observations_identity_unique_idx\s+ON hospital_source_observations\s*\(\s*source_system COLLATE "C",\s*source_hospital_id COLLATE "C",\s*source_document_sha256 COLLATE "C"\s*\)/i,
    )
    assert.equal(normalizeSourceIdentityPart('PM-JAY'), 'pm-jay')
    assert.equal(normalizeSourceIdentityPart('HOSP.123_X:9'), 'hosp.123_x:9')
    assert.throws(() => normalizeSourceIdentityPart(' PM-JAY'), /ASCII letters/)
    assert.throws(() => normalizeSourceIdentityPart('PM JAY'), /ASCII letters/)
    assert.throws(() => normalizeSourceIdentityPart('HÔSP123'), /ASCII letters/)
    assert.throws(() => normalizeSourceIdentityPart('HOSP\u00a0123'), /ASCII letters/)
    assert.match(sql, /source_system ~ '\^\[a-z0-9\]\[a-z0-9\._:-\]\*\$'/)
    assert.match(sql, /source_hospital_id ~ '\^\[a-z0-9\]\[a-z0-9\._:-\]\*\$'/)
    assert.equal(sourceObservationIdentity(baseObservation), '["pm-jay","hosp123","' + 'a'.repeat(64) + '"]')
  })

  it('recognizes renamed copies by their SHA-256 and distinguishes changed file content', () => {
    assert.equal(
      calculateSourceDocumentSha256(Buffer.from('abc', 'utf8')),
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
    const originalPdf = Buffer.from('%PDF-1.7 sample source document', 'utf8')
    const renamedPdf = Buffer.from('%PDF-1.7 sample source document', 'utf8')
    const modifiedPdf = Buffer.from('%PDF-1.7 modified source document', 'utf8')
    const original = {
      ...baseObservation,
      source_document_sha256: calculateSourceDocumentSha256(originalPdf),
    }
    const renamed = {
      ...baseObservation,
      source_document: 'renamed-copy.pdf',
      source_document_sha256: calculateSourceDocumentSha256(renamedPdf),
    }
    const modified = {
      ...baseObservation,
      source_document_sha256: calculateSourceDocumentSha256(modifiedPdf),
    }

    assert.equal(original.source_document_sha256, renamed.source_document_sha256)
    assert.equal(classifySourceObservationRepeat(original, renamed), 'conflicting_repeat')
    assert.notEqual(original.source_document_sha256, modified.source_document_sha256)
    assert.equal(classifySourceObservationRepeat(original, modified), 'new_observation')
  })

  it('treats identical bytes with a different source date as a conflicting duplicate, not a new snapshot', () => {
    const sameBytesDifferentDate = {
      ...baseObservation,
      source_date: '2026-09-01',
    }
    assert.equal(
      classifySourceObservationRepeat(baseObservation, sameBytesDifferentDate),
      'conflicting_repeat',
    )
  })

  it('preserves changed-byte historical snapshots and never treats adjudication links as source changes', () => {
    const laterDocument = {
      ...baseObservation,
      source_document_sha256: 'b'.repeat(64),
      source_date: '2026-09-01',
    }
    assert.equal(classifySourceObservationRepeat(baseObservation, laterDocument), 'new_observation')
    assert.equal(
      classifySourceObservationRepeat(baseObservation, {
        ...baseObservation,
        source_document: 'renamed-copy.pdf',
      }),
      'conflicting_repeat',
    )
    assert.equal(
      classifySourceObservationRepeat(baseObservation, {
        ...baseObservation,
        hospital_id: 'adjudicated-hospital-uuid',
      }),
      'already_imported',
    )
    assert.equal(
      classifySourceObservationRepeat(baseObservation, {
        ...baseObservation,
        source_email: 'changed@example.test',
      }),
      'conflicting_repeat',
    )
    assert.equal(
      classifySourceObservationRepeat(baseObservation, {
        ...baseObservation,
        source_row_payload: {
          ...baseObservation.source_row_payload,
          extraction_notes: 'changed notes',
        },
      }),
      'conflicting_repeat',
    )
    assert.equal(
      classifySourceObservationRepeat(baseObservation, {
        ...baseObservation,
        source_hospital_id: 'HOSP-OTHER',
      }),
      'new_observation',
    )
  })

  it('defines runner preflight for migration 004 dependencies and conflicting objects', async () => {
    const runner = await readFile(runnerPath, 'utf8')
    const migration004Case = runner.match(
      /'004_hospital_source_observations\.sql'\s*\{([\s\S]*?)\n\s*\}\s*default\s*\{/,
    )
    assert.ok(migration004Case, 'migration runner must define a 004 preflight case')
    const preflight = migration004Case[1]
    assert.match(preflight, /hospital_source_observations/i)
    assert.match(preflight, /hospital_source_observations_identity_unique_idx/i)
    assert.match(preflight, /hospital_source_observations_document_hash_idx/i)
    assert.match(preflight, /hospital_source_observations_hospital_history_idx/i)
    assert.match(preflight, /hospital_source_observations_unlinked_review_idx/i)
    assert.match(preflight, /hospitals/i)
    assert.match(preflight, /pg_attribute/i)
    assert.match(preflight, /a\.attname = 'id'/i)
    assert.match(preflight, /t\.typname = 'uuid'/i)
    assert.match(preflight, /gen_random_uuid/i)
    assert.match(preflight, /001_extensions_and_types\.sql/i)
    assert.match(preflight, /002_initial_schema\.sql/i)
    assert.match(preflight, /003_indexes_triggers_and_search\.sql/i)
    assert.match(preflight, /relkind IN \('r', 'p'\)/i)
    assert.match(preflight, /'conflict'/)
    assert.match(preflight, /'missing_dependency'/)
    assert.match(preflight, /'ready'/)
    assert.match(runner, /migrationObjectsExist -eq 'conflict'/)
    assert.match(runner, /migrationObjectsExist -ne 'ready'/)
  })

  it('adds an optional, validated JSONB payload for all original PM-JAY CSV columns', async () => {
    const sql = await readFile(payloadMigrationPath, 'utf8')
    const csvColumns = [
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

    assert.match(sql, /ALTER TABLE hospital_source_observations\s+ADD COLUMN source_row_payload jsonb/i)
    assert.match(sql, /source_row_payload IS NULL/i)
    assert.match(sql, /jsonb_typeof\(source_row_payload\) = 'object'/i)
    assert.match(sql, /source_row_payload \?& ARRAY\s*\[/i)
    for (const column of csvColumns) {
      assert.match(sql, new RegExp(`'${column}'`))
      assert.match(
        sql,
        new RegExp(`jsonb_typeof\\(source_row_payload -> '${column}'\\) = 'string'`),
      )
    }
    assert.doesNotMatch(sql, /^\s*(?:DROP|DELETE|UPDATE|INSERT|UPSERT)\b/im)
  })

  it('preflights migration 005 dependencies and conflicting column or constraint names', async () => {
    const runner = await readFile(runnerPath, 'utf8')
    const migration005Case = runner.match(
      /'005_source_observation_csv_payload\.sql'\s*\{([\s\S]*?)\n\s*\}\s*default\s*\{/,
    )
    assert.ok(migration005Case, 'migration runner must define a 005 preflight case')
    const preflight = migration005Case[1]
    assert.match(preflight, /hospital_source_observations/i)
    assert.match(preflight, /source_row_payload/i)
    assert.match(preflight, /hospital_source_observations_source_row_payload_valid/i)
    assert.match(preflight, /004_hospital_source_observations\.sql/i)
    assert.match(preflight, /'conflict'/)
    assert.match(preflight, /'missing_dependency'/)
    assert.match(preflight, /'ready'/)
    assert.match(runner, /migrationObjectsExist -eq 'conflict'/)
    assert.match(runner, /migrationObjectsExist -ne 'ready'/)
  })

  it('defines migration 006 review history and preflights its migration 005 dependency', async () => {
    const [sql, runner] = await Promise.all([
      readFile(reviewMigrationPath, 'utf8'),
      readFile(runnerPath, 'utf8'),
    ])
    assert.match(sql, /CREATE TABLE hospital_source_observation_review_decisions/i)
    assert.match(sql, /source_observation_a_id uuid NOT NULL\s+REFERENCES hospital_source_observations\(id\) ON DELETE RESTRICT/i)
    assert.match(sql, /source_observation_b_id uuid NOT NULL\s+REFERENCES hospital_source_observations\(id\) ON DELETE RESTRICT/i)
    assert.match(sql, /decision IN \('same_hospital', 'different_hospitals', 'needs_more_evidence'\)/i)
    assert.match(sql, /reviewer text NOT NULL/i)
    assert.match(sql, /evidence_reference text NOT NULL/i)
    assert.match(sql, /decision_number bigint GENERATED ALWAYS AS IDENTITY/i)
    assert.doesNotMatch(sql, /^\s*(?:DROP|DELETE|UPDATE|INSERT|UPSERT)\b/im)

    const migration006Case = runner.match(
      /'006_hospital_source_observation_reviews\.sql'\s*\{([\s\S]*?)\n\s*\}\s*default\s*\{/,
    )
    assert.ok(migration006Case, 'migration runner must define a 006 preflight case')
    assert.match(migration006Case[1], /005_source_observation_csv_payload\.sql/i)
    assert.match(migration006Case[1], /hospital_source_observation_review_decisions/i)
    assert.match(migration006Case[1], /hospital_source_observations/i)
    assert.match(runner, /migrationObjectsExist -eq 'conflict'/)
    assert.match(runner, /migrationObjectsExist -ne 'ready'/)
  })

  it('keeps migration checksum verification and schema ledger insertion in one transaction', async () => {
    const runner = await readFile(runnerPath, 'utf8')
    assert.match(runner, /Get-FileHash[\s\S]*?-Algorithm SHA256/)
    assert.match(runner, /if \(\$appliedChecksum -ne \$checksum\)[\s\S]*?Applied migration/)
    assert.match(runner, /BEGIN;\s*\$body\s*INSERT INTO public\.schema_migrations[\s\S]*?COMMIT;/)
    assert.match(runner, /The migration transaction was rolled back/)
  })

  it('provides disposable-database constraint checks that roll back their test rows', async () => {
    const sql = await readFile(integrationSqlPath, 'utf8')
    assert.match(sql, /^BEGIN;/)
    assert.match(sql, /ROLLBACK;\s*$/)
    assert.match(sql, /hospital_id IS NULL/)
    assert.match(sql, /Multiple source observations could not link to one hospital/)
    assert.match(sql, /duplicate source identity to be rejected/)
    assert.match(sql, /foreign key to be rejected/)
    assert.match(sql, /noncanonical source identity to be rejected/)
    assert.match(sql, /invalid source page to be rejected/)
    assert.match(sql, /invalid ownership to be rejected/)
  })

  it('covers migration 005 payload acceptance, rejection cases, and rollback in the integration fixture', async () => {
    const sql = await readFile(integrationSqlPath, 'utf8')
    const fixtureMatch = sql.match(/payload_fixture jsonb := \$payload\$([\s\S]*?)\$payload\$::jsonb/)
    assert.ok(fixtureMatch, 'integration SQL must define a JSON payload fixture')

    const expectedHeaders = [
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
    const payload = JSON.parse(fixtureMatch[1])
    assert.deepEqual(Object.keys(payload).sort(), [...expectedHeaders].sort())
    assert.ok(Object.values(payload).every((value) => typeof value === 'string'))
    assert.equal(payload.extraction_notes, '')

    for (const rejectionCase of [
      'missing-required-key',
      'numeric-value',
      'boolean-value',
      'json-null-value',
      'nested-object-value',
      'top-level-array',
      'top-level-scalar',
      'top-level-json-null',
    ]) {
      assert.ok(sql.includes(`'${rejectionCase}'`), `integration test must reject ${rejectionCase}`)
    }
    assert.match(sql, /ERRCODE\s*=\s*'P0001'/)
    assert.match(sql, /EXCEPTION WHEN check_violation THEN/)
    assert.match(sql, /source_row_payload IS NULL/)
    assert.match(sql, /ROLLBACK;\s*$/)
  })
})
