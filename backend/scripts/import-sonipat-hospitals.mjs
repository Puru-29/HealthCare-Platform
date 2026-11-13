import { lstat, mkdir, open, readFile, realpath } from 'node:fs/promises'
import { isIP } from 'node:net'
import { isAbsolute, relative, resolve, dirname, sep, win32 } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import {
  calculateSourceDocumentSha256,
  classifySourceObservationRepeat,
  sourceObservationIdentity,
} from './source-observation-identity.mjs'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const backendDirectory = resolve(scriptDirectory, '..')
const projectDirectory = resolve(backendDirectory, '..')
const defaultCsvPath = resolve(
  projectDirectory,
  'data',
  'processed',
  'sonipat_pmjay_empanelled_hospitals.csv',
)
export const DRY_RUN_REPORT_DIRECTORY = resolve(
  projectDirectory,
  'data',
  'reports',
)
const defaultReportPath = resolve(
  DRY_RUN_REPORT_DIRECTORY,
  'sonipat_hospital_import_dry_run.json',
)

export const SIMILARITY_THRESHOLD = 0.9
export const DATABASE_TRANSACTION_MODE = 'READ ONLY'
export const WRITE_MODE_CONFIRMATION = 'healthcare_platform_test'
export const MANUAL_REVIEW_DECISIONS = [
  'unresolved',
  'confirmed_same_facility',
  'confirmed_distinct_facilities',
  'source_extraction_error',
]
const CURATED_MANUAL_REVIEW_CASES = [
  {
    sourceDocument: '202608041074356704.pdf',
    candidates: [
      { pdfEntryNumber: '23', hospitalId: 'HOSP6G177317', sourcePage: '1' },
      { pdfEntryNumber: '26', hospitalId: 'HOSP6G177370', sourcePage: '1' },
    ],
  },
  {
    sourceDocument: '202608041074356704.pdf',
    candidates: [
      { pdfEntryNumber: '44', hospitalId: 'HOSP6P02024', sourcePage: '2' },
      { pdfEntryNumber: '63', hospitalId: 'HOSP6P131336', sourcePage: '3' },
    ],
  },
  {
    sourceDocument: '202608041074356704.pdf',
    candidates: [
      { pdfEntryNumber: '59', hospitalId: 'HOSP6P101722', sourcePage: '3' },
      { pdfEntryNumber: '62', hospitalId: 'HOSP6P131103', sourcePage: '3' },
    ],
  },
]
export const DEFAULT_DRY_RUN_TARGET = Object.freeze({
  database: 'healthcare_platform_test',
  host: '127.0.0.1',
  port: '5432',
})
export const BLOCKED_CONNECTION_ENVIRONMENT = [
  'DATABASE_URL',
  'PGHOSTADDR',
  'PGSERVICE',
  'PGSERVICEFILE',
  'PGOPTIONS',
  'PGTARGETSESSIONATTRS',
  'PGLOADBALANCEHOSTS',
]

export const SOURCE_CSV_HEADERS = [
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

export const REQUIRED_CSV_HEADERS = [
  'source_document',
  'source_date',
  'source_page',
  'pdf_entry_number',
  'hospital_id',
  'hospital_name',
  'hospital_type',
  'email',
  'contact_number',
  'verification_status',
]

export const FIELD_MAPPINGS = [
  {
    csvField: 'all 17 CSV columns',
    table: 'hospital_source_observations',
    column: 'source_row_payload',
    mapping: 'stored only in source_row_payload by explicit write mode; never mapped to public hospital fields',
  },
]

export const UNMAPPED_FIELDS = [
  {
    csvField: 'hospital_type',
    reason: 'Preserved in source_row_payload and source_ownership_type; it is not a verified facility type.',
    doNotMapTo: 'hospitals.public_facility_type',
  },
  {
    csvField: 'email',
    reason: 'Preserved as source-only email; do not copy it to a public hospital field.',
  },
  {
    csvField: 'nodal_officer_name',
    reason: 'Preserved as source-only metadata; do not copy it to a public hospital field.',
  },
]

export const FIELD_LIMITATIONS = [
  {
    csvField: 'all 17 CSV columns',
    reason: 'Dry-run does not persist rows; explicit write mode stores eligible rows only as unlinked source observations.',
  },
  {
    csvField: 'hospital_id',
    reason: 'Preserve as text in source_hospital_id; uniqueness is source system + source ID + exact document hash.',
  },
]

export const EXISTING_HOSPITALS_SQL = `
  SELECT
    h.id::text AS id,
    h.public_name,
    h.public_source_reference,
    v.source_reference AS verification_source_reference
  FROM hospitals h
  LEFT JOIN hospital_verification_records v
    ON v.hospital_id = h.id AND v.is_current
  ORDER BY h.id
`

export const EXISTING_SOURCE_OBSERVATIONS_SQL = `
  SELECT
    source_system,
    source_hospital_id,
    source_document,
    source_document_sha256,
    source_date::text AS source_date,
    source_hospital_name,
    source_ownership_type,
    source_email,
    source_contact_phone,
    source_nodal_officer_name,
    source_row_payload
  FROM hospital_source_observations
  ORDER BY id
`

const SOURCE_OBSERVATION_BY_IDENTITY_SQL = `
  SELECT
    source_system,
    source_hospital_id,
    source_document,
    source_document_sha256,
    source_date::text AS source_date,
    source_hospital_name,
    source_ownership_type,
    source_email,
    source_contact_phone,
    source_nodal_officer_name,
    source_row_payload
  FROM hospital_source_observations
  WHERE source_system = $1
    AND source_hospital_id = $2
    AND source_document_sha256 = $3
  LIMIT 2
`

export const INSERT_SOURCE_OBSERVATION_SQL = `
  INSERT INTO hospital_source_observations (
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
    source_row_payload
  ) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb
  )
  ON CONFLICT DO NOTHING
  RETURNING id
`

const SCHEMA_COLUMNS_SQL = `
  SELECT table_name, column_name, data_type, udt_name, is_nullable
  FROM information_schema.columns
  WHERE table_schema = current_schema()
    AND table_name IN ('hospitals', 'hospital_verification_records', 'hospital_source_observations')
  ORDER BY table_name, ordinal_position
`

const SCHEMA_CONSTRAINTS_SQL = `
  SELECT c.relname AS table_name, con.conname AS constraint_name,
         con.contype AS type, pg_get_constraintdef(con.oid) AS definition
  FROM pg_constraint con
  JOIN pg_class c ON c.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = current_schema()
    AND c.relname IN ('hospitals', 'hospital_verification_records', 'hospital_source_observations')
  ORDER BY c.relname, con.conname
`

const SCHEMA_INDEXES_SQL = `
  SELECT tablename, indexname, indexdef
  FROM pg_indexes
  WHERE schemaname = current_schema()
    AND tablename IN ('hospitals', 'hospital_verification_records', 'hospital_source_observations')
  ORDER BY tablename, indexname
`

const SCHEMA_TRIGGERS_SQL = `
  SELECT event_object_table AS table_name, trigger_name, action_timing,
         event_manipulation
  FROM information_schema.triggers
  WHERE trigger_schema = current_schema()
    AND event_object_table IN ('hospitals', 'hospital_verification_records', 'hospital_source_observations')
  ORDER BY event_object_table, trigger_name
`

const SCHEMA_ENUMS_SQL = `
  SELECT t.typname AS enum_name, e.enumlabel AS enum_value
  FROM pg_type t
  JOIN pg_enum e ON e.enumtypid = t.oid
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = current_schema()
    AND t.typname IN (
      'hospital_listing_status',
      'hospital_verification_status',
      'data_source_type'
    )
  ORDER BY t.typname, e.enumsortorder
`

const EMAIL_PATTERN =
  /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i
const PHONE_PATTERN = /^(?:\+?91[ -]?)?[6-9]\d{9}$/
const ALLOWED_SOURCE_HOSPITAL_TYPES = new Set(['public', 'private'])
const REQUIRED_HOSPITAL_COLUMNS = new Set([
  'id',
  'public_name',
  'public_phone',
  'public_facility_type',
  'public_listing_status',
  'public_source_name',
  'public_source_reference',
])
const REQUIRED_VERIFICATION_COLUMNS = new Set([
  'hospital_id',
  'status',
  'source_type',
  'source_name',
  'source_reference',
  'last_verified_at',
  'is_current',
])
const REQUIRED_SOURCE_OBSERVATION_COLUMNS = new Set([
  'hospital_id',
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
  'source_row_payload',
])

export function parseDryRunArguments(args) {
  const options = {
    ...DEFAULT_DRY_RUN_TARGET,
    csvPath: defaultCsvPath,
    reportPath: defaultReportPath,
    reviewDecisionsPath: null,
    writeMode: false,
    writeConfirmation: null,
  }
  const seen = new Set()
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--dry-run' || argument === '--write') {
      if (seen.has(argument)) throw new Error(`Duplicate argument: ${argument}.`)
      seen.add(argument)
      if (argument === '--write') options.writeMode = true
      continue
    }
    const optionNames = {
      '--database': 'database',
      '--host': 'host',
      '--port': 'port',
      '--csv': 'csvPath',
      '--report': 'reportPath',
      '--review-decisions': 'reviewDecisionsPath',
      '--confirm-write': 'writeConfirmation',
    }
    const optionName = optionNames[argument]
    if (!optionName) {
      throw new Error(`Unsupported argument: ${argument}. Use only documented importer options.`)
    }
    if (seen.has(argument)) throw new Error(`Duplicate argument: ${argument}.`)
    seen.add(argument)
    const value = args[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`Missing value after ${argument}.`)
    options[optionName] = optionName === 'csvPath'
      ? resolve(process.cwd(), value)
      : optionName === 'reportPath' || optionName === 'reviewDecisionsPath'
        ? resolveDryRunReportPath(value)
        : value
    index += 1
  }
  assertSafeDryRunTarget(options)
  if (options.writeMode) {
    if (seen.has('--dry-run')) throw new Error('--write cannot be combined with --dry-run.')
    for (const requiredFlag of ['--database', '--host', '--port', '--confirm-write']) {
      if (!seen.has(requiredFlag)) {
        throw new Error(`Write mode requires explicit ${requiredFlag}.`)
      }
    }
    if (options.writeConfirmation !== WRITE_MODE_CONFIRMATION) {
      throw new Error(`Write mode requires --confirm-write ${WRITE_MODE_CONFIRMATION}.`)
    }
    if (seen.has('--report')) {
      throw new Error('Write-mode results are emitted as JSON to stdout; --report is available only in dry-run mode.')
    }
  } else if (seen.has('--confirm-write')) {
    throw new Error('--confirm-write is valid only with --write.')
  }
  return options
}

function validateManualReviewDecisionShape(decisions) {
  if (!Array.isArray(decisions)) {
    throw new TypeError('Manual review decision file must contain a JSON array.')
  }
  const allowedFields = new Set([
    'reviewId',
    'reviewerDecision',
    'evidenceReference',
    'reviewer',
    'reviewedAt',
    'proposedNormalizations',
  ])
  for (const decision of decisions) {
    if (!decision || typeof decision !== 'object' || Array.isArray(decision)) {
      throw new TypeError('Each manual review decision must be a JSON object.')
    }
    if (Object.keys(decision).some((field) => !allowedFields.has(field))) {
      throw new Error('Manual review decision contains unsupported fields.')
    }
    if (typeof decision.reviewId !== 'string' || !decision.reviewId.trim()) {
      throw new TypeError('Each manual review decision must identify a review record.')
    }
    if (!MANUAL_REVIEW_DECISIONS.includes(decision.reviewerDecision)) {
      throw new Error(`Unsupported manual review decision for ${decision.reviewId}.`)
    }
    const hasAuditDetails = [
      decision.evidenceReference,
      decision.reviewer,
      decision.reviewedAt,
    ].some((value) => value !== undefined && value !== null && value !== '')
    if (decision.reviewerDecision !== 'unresolved' || hasAuditDetails) {
      const hasValidTimestamp = typeof decision.reviewedAt === 'string' &&
        /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(decision.reviewedAt) &&
        !Number.isNaN(Date.parse(decision.reviewedAt))
      if (
        typeof decision.evidenceReference !== 'string' ||
        !decision.evidenceReference.trim() ||
        decision.evidenceReference.length > 500 ||
        /[\r\n]/.test(decision.evidenceReference) ||
        typeof decision.reviewer !== 'string' ||
        !decision.reviewer.trim() ||
        decision.reviewer.length > 120 ||
        /[\r\n@]/.test(decision.reviewer) ||
        !hasValidTimestamp
      ) {
        throw new Error(
          `Manual review ${decision.reviewId} requires evidence, reviewer, and a timestamp with timezone.`,
        )
      }
    }
    if (
      decision.proposedNormalizations !== undefined &&
      (!decision.proposedNormalizations ||
        typeof decision.proposedNormalizations !== 'object' ||
        Array.isArray(decision.proposedNormalizations))
    ) {
      throw new TypeError(`Manual review ${decision.reviewId} normalizations must be an object.`)
    }
    for (const [rowNumber, normalization] of Object.entries(decision.proposedNormalizations ?? {})) {
      if (!/^\d+$/.test(rowNumber) || typeof normalization !== 'string' || !normalization.trim()) {
        throw new Error(`Manual review ${decision.reviewId} has an invalid proposed normalization.`)
      }
    }
  }
  return decisions
}

export async function readManualReviewDecisions(decisionsPath) {
  if (!decisionsPath) return []
  const safePath = resolveDryRunReportPath(decisionsPath)
  await ensureCanonicalReportDirectory()
  const fileStat = await lstat(safePath)
  if (!fileStat.isFile() || isReparsePoint(fileStat) || await realpath(safePath) !== safePath) {
    throw new Error('Manual review decisions must be a regular file in the canonical report directory.')
  }
  let contents
  try {
    contents = await readFile(safePath, 'utf8')
  } catch {
    throw new Error('Unable to read the manual review decision file.')
  }
  let decisions
  try {
    decisions = JSON.parse(contents)
  } catch {
    throw new Error('Manual review decision file is not valid JSON.')
  }
  return validateManualReviewDecisionShape(decisions)
}

export function resolveDryRunReportPath(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Report path must be a non-empty path inside the dedicated report directory.')
  }
  if (value.split(/[\\/]+/).includes('..')) {
    throw new Error('Report path traversal is not allowed.')
  }
  if ((win32.isAbsolute(value) || /^[A-Za-z]:/.test(value)) && !isAbsolute(value)) {
    throw new Error('Windows drive-qualified or UNC report paths must resolve inside the dedicated report directory.')
  }

  const reportPath = resolve(DRY_RUN_REPORT_DIRECTORY, value)
  const reportRelativePath = relative(DRY_RUN_REPORT_DIRECTORY, reportPath)
  if (
    !reportRelativePath ||
    isAbsolute(reportRelativePath) ||
    reportRelativePath === '..' ||
    reportRelativePath.startsWith(`..${sep}`) ||
    reportRelativePath.includes(sep)
  ) {
    throw new Error('Report output must be a file directly inside the dedicated report directory.')
  }
  return reportPath
}

function isReparsePoint(stat) {
  return stat.isSymbolicLink() ||
    (typeof stat.attributes === 'number' && (stat.attributes & 0x400) !== 0)
}

export async function ensureCanonicalReportDirectory(rootDirectory = projectDirectory) {
  const canonicalRoot = await realpath(rootDirectory)
  const dataDirectory = resolve(canonicalRoot, 'data')
  const reportDirectory = resolve(dataDirectory, 'reports')

  const dataStat = await lstat(dataDirectory)
  if (!dataStat.isDirectory() || isReparsePoint(dataStat) || await realpath(dataDirectory) !== dataDirectory) {
    throw new Error('Report parent directory must be a real, canonical project data directory.')
  }

  try {
    await mkdir(reportDirectory)
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error
  }

  const reportStat = await lstat(reportDirectory)
  if (
    !reportStat.isDirectory() ||
    isReparsePoint(reportStat) ||
    await realpath(reportDirectory) !== reportDirectory
  ) {
    throw new Error('Report directory must be the canonical data/reports directory, not a symlink or reparse point.')
  }
  return reportDirectory
}

export async function writeDryRunReport(reportPath, contents) {
  const safeReportPath = resolveDryRunReportPath(reportPath)
  const reportDirectory = await ensureCanonicalReportDirectory()
  if (dirname(safeReportPath) !== reportDirectory) {
    throw new Error('Report output must resolve directly inside the canonical report directory.')
  }

  const reportFile = await open(safeReportPath, 'wx')
  try {
    await reportFile.writeFile(contents, 'utf8')
  } finally {
    await reportFile.close()
  }
}

export async function readSourceDocumentHashes(records) {
  const rawDirectory = resolve(projectDirectory, 'data', 'raw')
  const hashes = {}
  for (const documentName of new Set(records.map((record) => String(record.values.source_document ?? '')))) {
    if (!documentName || documentName !== documentName.trim()) {
      throw new Error('Each source document reference must be a non-empty filename.')
    }
    const documentPath = resolve(rawDirectory, documentName)
    const documentRelativePath = relative(rawDirectory, documentPath)
    if (
      isAbsolute(documentRelativePath) ||
      documentRelativePath === '..' ||
      documentRelativePath.startsWith(`..${sep}`) ||
      documentName.includes('/') ||
      documentName.includes('\\') ||
      !/\.pdf$/i.test(documentName)
    ) {
      throw new Error('Source document references must name a PDF directly inside data/raw.')
    }
    hashes[documentName] = calculateSourceDocumentSha256(await readFile(documentPath))
  }
  return hashes
}

export async function readSourceDocumentHashesForImport(records) {
  const rawDirectory = resolve(projectDirectory, 'data', 'raw')
  const hashes = {}
  const failures = {}
  const documentNames = new Set(records.map((record) => String(record.values.source_document ?? '')))
  for (const documentName of documentNames) {
    if (!documentName || documentName !== documentName.trim()) {
      failures[documentName] = 'invalid_source_document_reference'
      continue
    }
    const documentPath = resolve(rawDirectory, documentName)
    const documentRelativePath = relative(rawDirectory, documentPath)
    if (
      isAbsolute(documentRelativePath) ||
      documentRelativePath === '..' ||
      documentRelativePath.startsWith(`..${sep}`) ||
      documentName.includes('/') ||
      documentName.includes('\\') ||
      !/\.pdf$/i.test(documentName)
    ) {
      failures[documentName] = 'invalid_source_document_reference'
      continue
    }
    try {
      hashes[documentName] = calculateSourceDocumentSha256(await readFile(documentPath))
    } catch {
      failures[documentName] = 'source_document_unavailable'
    }
  }
  return { hashes, failures }
}

export function assertSafeDryRunTarget(options, environment = process.env) {
  if (options.database !== DEFAULT_DRY_RUN_TARGET.database) {
    throw new Error(`Importer target must be database '${DEFAULT_DRY_RUN_TARGET.database}'.`)
  }
  if (!['127.0.0.1', 'localhost'].includes(options.host)) {
    throw new Error('Importer target host must be 127.0.0.1 or localhost.')
  }
  if (String(options.port) !== DEFAULT_DRY_RUN_TARGET.port) {
    throw new Error(`Importer target port must be ${DEFAULT_DRY_RUN_TARGET.port}.`)
  }

  for (const [name, expected] of [
    ['PGDATABASE', options.database],
    ['PGPORT', String(options.port)],
  ]) {
    if (environment[name] && environment[name] !== expected) {
      throw new Error(`Environment setting ${name} conflicts with the explicit importer target.`)
    }
    if (environment.PGHOST && !['127.0.0.1', 'localhost'].includes(environment.PGHOST)) {
      throw new Error('Environment setting PGHOST conflicts with the local target requirement.')
    }
  }
  for (const name of BLOCKED_CONNECTION_ENVIRONMENT) {
    if (environment[name]) {
      throw new Error(`Importer refuses connection override setting ${name}.`)
    }
  }
}

function isLoopbackServerAddress(address) {
  if (typeof address !== 'string') return false

  const [ipAddress, prefix, ...extra] = address.split('/')
  if (extra.length > 0) return false
  const ipVersion = isIP(ipAddress)
  if (ipVersion === 0) return false
  if (
    prefix !== undefined &&
    (!/^\d+$/.test(prefix) || Number(prefix) > (ipVersion === 4 ? 32 : 128))
  ) return false

  if (ipVersion === 4) {
    const octets = ipAddress.split('.').map(Number)
    return octets.length === 4 && octets[0] === 127
  }

  if (ipAddress.includes('%') || ipAddress.includes('.')) return false
  const halves = ipAddress.split('::')
  if (halves.length > 2) return false
  const leftGroups = halves[0] ? halves[0].split(':') : []
  const rightGroups = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const explicitGroups = [...leftGroups, ...rightGroups]
  if (explicitGroups.some((group) => !/^[0-9a-f]{1,4}$/i.test(group))) return false
  if (halves.length === 1 && explicitGroups.length !== 8) return false
  if (halves.length === 2 && explicitGroups.length >= 8) return false

  const groups = halves.length === 1
    ? explicitGroups
    : [
        ...leftGroups,
        ...Array(8 - explicitGroups.length).fill('0'),
        ...rightGroups,
      ]
  return groups.length === 8 &&
    groups.slice(0, 7).every((group) => Number.parseInt(group, 16) === 0) &&
    Number.parseInt(groups[7], 16) === 1
}

export function assertConnectedDryRunEndpoint(endpoint) {
  if (endpoint?.database_name !== DEFAULT_DRY_RUN_TARGET.database) {
    throw new Error(`Refusing to inspect a database other than ${DEFAULT_DRY_RUN_TARGET.database}.`)
  }
  if (!isLoopbackServerAddress(endpoint.server_address)) {
    throw new Error('Refusing to inspect a non-loopback PostgreSQL endpoint.')
  }
  if (Number(endpoint.server_port) !== Number(DEFAULT_DRY_RUN_TARGET.port)) {
    throw new Error(`Refusing to inspect PostgreSQL on a port other than ${DEFAULT_DRY_RUN_TARGET.port}.`)
  }
}

function isLineBreak(character) {
  return character === '\r' || character === '\n'
}

function consumeLineBreak(text, index) {
  if (text[index] === '\r' && text[index + 1] === '\n') return index + 2
  return index + 1
}

export function parseCsv(text) {
  const contents = text.replace(/^\uFEFF/, '')
  const parsedRows = []
  const errors = []
  let fields = []
  let field = ''
  let insideQuotes = false
  let afterQuote = false
  let physicalLine = 1
  let recordStartLine = 1

  const recordError = (message) => {
    errors.push({
      rowNumber: parsedRows.length + 1,
      sourceLine: recordStartLine,
      message,
    })
  }

  const finishField = () => {
    fields.push(field)
    field = ''
    afterQuote = false
  }

  const finishRow = () => {
    finishField()
    parsedRows.push({ values: fields, sourceLine: recordStartLine })
    fields = []
    recordStartLine = physicalLine
  }

  for (let index = 0; index < contents.length; index += 1) {
    const character = contents[index]

    if (insideQuotes) {
      if (character === '"' && contents[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (character === '"') {
        insideQuotes = false
        afterQuote = true
      } else if (isLineBreak(character)) {
        field += '\n'
        if (character === '\r' && contents[index + 1] === '\n') index += 1
        physicalLine += 1
      } else {
        field += character
      }
      continue
    }

    if (afterQuote && character !== ',' && !isLineBreak(character)) {
      if (!/\s/.test(character)) recordError('Unexpected character after a closing quote.')
      afterQuote = false
      field += character
    } else if (character === '"') {
      if (field.length > 0) recordError('Quote found inside an unquoted field.')
      insideQuotes = true
    } else if (character === ',') {
      finishField()
    } else if (isLineBreak(character)) {
      finishRow()
      if (character === '\r' && contents[index + 1] === '\n') index += 1
      physicalLine += 1
      recordStartLine = physicalLine
    } else {
      field += character
    }
  }

  if (insideQuotes) recordError('CSV ended before a quoted field was closed.')
  if (field.length > 0 || fields.length > 0 || afterQuote) finishRow()

  if (parsedRows.length === 0) {
    return { headers: [], records: [], errors: [{ rowNumber: 1, sourceLine: 1, message: 'CSV is empty.' }] }
  }

  const headers = parsedRows[0].values.map((header) => header.trim())
  if (headers.some((header) => !header)) {
    errors.push({ rowNumber: 1, sourceLine: 1, message: 'CSV contains a blank column header.' })
  }
  if (new Set(headers).size !== headers.length) {
    errors.push({ rowNumber: 1, sourceLine: 1, message: 'CSV contains duplicate column headers.' })
  }

  const records = parsedRows.slice(1).map((parsedRow, index) => {
    const rowNumber = index + 2
    const rowErrors = []
    if (parsedRow.values.length !== headers.length) {
      const message =
        `Expected ${headers.length} columns but found ${parsedRow.values.length}.`
      rowErrors.push(message)
      errors.push({
        rowNumber,
        sourceLine: parsedRow.sourceLine,
        message,
      })
    }

    const values = Object.fromEntries(
      headers.map((header, columnIndex) => [header, parsedRow.values[columnIndex] ?? '']),
    )
    if (parsedRow.values.length > headers.length) {
      values._extra_columns = parsedRow.values.slice(headers.length)
    }
    return {
      rowNumber,
      sourceLine: parsedRow.sourceLine,
      values,
      parseErrors: rowErrors,
    }
  })

  return { headers, records, errors }
}

function normalizeText(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en')
}

function normalizePhone(value) {
  return String(value ?? '').trim().replace(/[ ()-]/g, '')
}

function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
}

function groupByNormalizedValue(records, field) {
  const groups = new Map()
  for (const record of records) {
    const value = normalizeText(record.values[field])
    if (!value) continue
    const group = groups.get(value) ?? []
    group.push(record)
    groups.set(value, group)
  }
  return [...groups.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([normalizedValue, group]) => ({
      normalizedValue,
      rowNumbers: group.map((record) => record.rowNumber),
      hospitalIds: group.map((record) => String(record.values.hospital_id ?? '').trim()),
      hospitalNames: group.map((record) => String(record.values.hospital_name ?? '').trim()),
    }))
}

function longestCommonBlock(left, right) {
  let previous = new Array(right.length + 1).fill(0)
  let longest = { leftStart: 0, rightStart: 0, length: 0 }

  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    const current = new Array(right.length + 1).fill(0)
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      if (left[leftIndex] !== right[rightIndex]) continue
      current[rightIndex + 1] = previous[rightIndex] + 1
      if (current[rightIndex + 1] > longest.length) {
        longest = {
          leftStart: leftIndex - current[rightIndex + 1] + 1,
          rightStart: rightIndex - current[rightIndex + 1] + 1,
          length: current[rightIndex + 1],
        }
      }
    }
    previous = current
  }
  return longest
}

function sequenceSimilarity(left, right) {
  const pending = [[0, left.length, 0, right.length]]
  let matchedLength = 0
  while (pending.length) {
    const [leftStart, leftEnd, rightStart, rightEnd] = pending.pop()
    const leftPart = left.slice(leftStart, leftEnd)
    const rightPart = right.slice(rightStart, rightEnd)
    const block = longestCommonBlock(leftPart, rightPart)
    if (block.length === 0) continue
    matchedLength += block.length
    pending.push(
      [leftStart, leftStart + block.leftStart, rightStart, rightStart + block.rightStart],
      [
        leftStart + block.leftStart + block.length,
        leftEnd,
        rightStart + block.rightStart + block.length,
        rightEnd,
      ],
    )
  }
  const totalLength = left.length + right.length
  return totalLength === 0 ? 1 : (2 * matchedLength) / totalLength
}

function findSimilarNamePairs(records, nameAccessor) {
  const pairs = []
  for (let leftIndex = 0; leftIndex < records.length; leftIndex += 1) {
    const left = records[leftIndex]
    const leftName = normalizeText(nameAccessor(left))
    if (!leftName) continue

    for (let rightIndex = leftIndex + 1; rightIndex < records.length; rightIndex += 1) {
      const right = records[rightIndex]
      const rightName = normalizeText(nameAccessor(right))
      if (!rightName || leftName === rightName) continue
      const similarity = sequenceSimilarity(leftName, rightName)
      if (similarity >= SIMILARITY_THRESHOLD) {
        pairs.push({
          left,
          right,
          similarity: Number(similarity.toFixed(3)),
        })
      }
    }
  }
  return pairs
}

function validateRecord(record) {
  const values = record.values
  const errors = []
  for (const header of REQUIRED_CSV_HEADERS) {
    if (!String(values[header] ?? '').trim()) errors.push(`missing_${header}`)
  }
  if (!String(values.hospital_name ?? '').trim()) errors.push('missing_hospital_name')

  const email = String(values.email ?? '').trim()
  if (email && !EMAIL_PATTERN.test(email)) errors.push('invalid_email')

  const phone = String(values.contact_number ?? '').trim()
  if (phone && !PHONE_PATTERN.test(normalizePhone(phone))) errors.push('invalid_indian_mobile_number')

  const type = normalizeText(values.hospital_type)
  if (type && !ALLOWED_SOURCE_HOSPITAL_TYPES.has(type)) {
    errors.push('unrecognized_hospital_type')
  }

  const sourceDate = String(values.source_date ?? '').trim()
  if (sourceDate && !isValidIsoDate(sourceDate)) errors.push('invalid_source_date')

  const sourceHospitalId = String(values.hospital_id ?? '')
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(sourceHospitalId)) {
    errors.push('invalid_source_hospital_id')
  }

  const sourcePage = Number(String(values.source_page ?? '').trim())
  if (String(values.source_page ?? '').trim() && (!Number.isInteger(sourcePage) || sourcePage < 1)) {
    errors.push('invalid_source_page')
  }

  if (normalizeText(values.verification_status) !== 'unverified') {
    errors.push('source_status_not_unverified')
  }

  return errors
}

function existingMatchSignals(record, existingHospitals) {
  const sourceId = normalizeText(record.values.hospital_id)
  const hospitalName = normalizeText(record.values.hospital_name)
  const signals = []

  for (const existing of existingHospitals) {
    const references = [
      existing.public_source_reference,
      existing.verification_source_reference,
    ]
    if (references.some((reference) => normalizeText(reference) === sourceId)) {
      signals.push({
        type: 'exact_source_id',
        existingHospitalId: existing.id,
        existingHospitalName: existing.public_name,
      })
    }

    const existingName = normalizeText(existing.public_name)
    if (hospitalName && existingName === hospitalName) {
      signals.push({
        type: 'exact_name',
        existingHospitalId: existing.id,
        existingHospitalName: existing.public_name,
      })
    } else if (hospitalName && existingName) {
      const similarity = sequenceSimilarity(hospitalName, existingName)
      if (similarity >= SIMILARITY_THRESHOLD) {
        signals.push({
          type: 'similar_name',
          similarity: Number(similarity.toFixed(3)),
          existingHospitalId: existing.id,
          existingHospitalName: existing.public_name,
        })
      }
    }
  }
  return signals
}

export function observationFromCsvRecord(record, sourceDocumentSha256) {
  const values = record.values
  const sourceRowPayload = Object.fromEntries(
    SOURCE_CSV_HEADERS.map((field) => [field, values[field] ?? '']),
  )
  return {
    source_system: 'pm-jay',
    source_hospital_id: String(values.hospital_id ?? '').toLowerCase(),
    source_document: String(values.source_document ?? ''),
    source_document_sha256: sourceDocumentSha256,
    source_date: String(values.source_date ?? ''),
    source_page: String(values.source_page ?? '') ? Number(values.source_page) : null,
    source_hospital_name: String(values.hospital_name ?? ''),
    source_ownership_type: normalizeText(values.hospital_type) === 'public'
      ? 'Public'
      : normalizeText(values.hospital_type) === 'private'
        ? 'Private'
        : null,
    source_email: String(values.email ?? '').trim() || null,
    source_contact_phone: String(values.contact_number ?? '').trim() || null,
    source_nodal_officer_name: String(values.nodal_officer_name ?? '').trim() || null,
    source_row_payload: sourceRowPayload,
  }
}

export function prepareSourceObservationImport({
  records,
  headers,
  parseErrors = [],
  sourceDocumentHashes,
  sourceDocumentFailures = {},
}) {
  const missingHeaders = SOURCE_CSV_HEADERS.filter((header) => !headers.includes(header))
  const parseErrorsByRow = new Map()
  for (const error of parseErrors) {
    const affectedRows = error.rowNumber <= 1
      ? records.map((record) => record.rowNumber)
      : [error.rowNumber]
    for (const rowNumber of affectedRows) {
      const rowErrors = parseErrorsByRow.get(rowNumber) ?? []
      rowErrors.push(`csv_parse_error:${error.message}`)
      parseErrorsByRow.set(rowNumber, rowErrors)
    }
  }

  const candidates = []
  const excludedRows = []
  for (const record of records) {
    const reasons = [
      ...record.parseErrors.map((error) => `csv_parse_error:${error}`),
      ...(parseErrorsByRow.get(record.rowNumber) ?? []),
      ...validateRecord(record),
    ]
    if (missingHeaders.length) {
      reasons.push(`missing_source_columns:${missingHeaders.join(',')}`)
    }
    const sourceDocument = String(record.values.source_document ?? '')
    if (!sourceDocumentHashes[sourceDocument]) {
      reasons.push(sourceDocumentFailures[sourceDocument] ?? 'source_document_unavailable')
    }
    const sourceRowPayload = Object.fromEntries(
      SOURCE_CSV_HEADERS.map((field) => [field, record.values[field] ?? '']),
    )
    if (SOURCE_CSV_HEADERS.some((field) => typeof sourceRowPayload[field] !== 'string')) {
      reasons.push('invalid_source_payload')
    }
    const uniqueReasons = [...new Set(reasons)]
    if (uniqueReasons.length) {
      excludedRows.push({
        rowNumber: record.rowNumber,
        pdfEntryNumber: String(record.values.pdf_entry_number ?? '').trim(),
        hospitalId: String(record.values.hospital_id ?? '').trim(),
        reasons: uniqueReasons,
      })
      continue
    }
    candidates.push({
      record,
      observation: observationFromCsvRecord(record, sourceDocumentHashes[sourceDocument]),
    })
  }
  return { candidates, excludedRows }
}

function reviewPairId(pair) {
  const entryNumbers = [pair.left, pair.right]
    .map((record) => String(record.values.pdf_entry_number ?? '').trim())
    .sort((left, right) => left.localeCompare(right, 'en'))
  return `${String(pair.left.values.source_document ?? '').trim()}#entries-${entryNumbers.join('-')}`
}

function collectManualReviewPairs(records, similarPairs) {
  const pairsByRows = new Map()
  for (const pair of similarPairs) {
    pairsByRows.set([pair.left.rowNumber, pair.right.rowNumber].sort((a, b) => a - b).join(':'), pair)
  }

  for (const reviewCase of CURATED_MANUAL_REVIEW_CASES) {
    const sourceRows = records.filter(
      (record) => String(record.values.source_document ?? '').trim() === reviewCase.sourceDocument,
    )
    if (!sourceRows.length) continue

    const candidates = reviewCase.candidates.map((candidate) => {
      const matches = sourceRows.filter((record) =>
        String(record.values.pdf_entry_number ?? '').trim() === candidate.pdfEntryNumber &&
        String(record.values.hospital_id ?? '').trim() === candidate.hospitalId &&
        String(record.values.source_page ?? '').trim() === candidate.sourcePage)
      if (matches.length !== 1) {
        throw new Error('A curated source-document review candidate is missing or ambiguous.')
      }
      return matches[0]
    })
    const key = candidates.map((record) => record.rowNumber).sort((a, b) => a - b).join(':')
    if (!pairsByRows.has(key)) {
      pairsByRows.set(key, { left: candidates[0], right: candidates[1] })
    }
  }
  return [...pairsByRows.values()]
}

function buildManualReviewRecords(reviewPairs, decisions) {
  validateManualReviewDecisionShape(decisions)
  const decisionsById = new Map()
  for (const decision of decisions) {
    if (!decision || typeof decision !== 'object' || typeof decision.reviewId !== 'string') {
      throw new TypeError('Each manual review decision must identify a review record.')
    }
    if (decisionsById.has(decision.reviewId)) {
      throw new Error('Duplicate manual review decisions are not allowed.')
    }
    decisionsById.set(decision.reviewId, decision)
  }

  const reviewIds = new Set()
  const output = reviewPairs.map((pair) => {
    const reviewId = reviewPairId(pair)
    reviewIds.add(reviewId)
    const decision = decisionsById.get(reviewId) ?? {}
    const reviewerDecision = decision.reviewerDecision ?? 'unresolved'
    if (!MANUAL_REVIEW_DECISIONS.includes(reviewerDecision)) {
      throw new Error(`Unsupported manual review decision for ${reviewId}.`)
    }

    const candidates = [pair.left, pair.right].map((record) => {
      const values = record.values
      const proposedNormalization = decision.proposedNormalizations?.[String(record.rowNumber)] ?? null
      if (proposedNormalization !== null &&
        (typeof proposedNormalization !== 'string' || !proposedNormalization.trim())) {
        throw new Error(`Manual review ${reviewId} has an invalid proposed normalization.`)
      }
      return {
        csvRowNumber: record.rowNumber,
        sourceDocument: String(values.source_document ?? '').trim(),
        sourceDate: String(values.source_date ?? '').trim(),
        sourcePage: String(values.source_page ?? '').trim(),
        pdfEntryNumber: String(values.pdf_entry_number ?? '').trim(),
        hospitalId: String(values.hospital_id ?? '').trim(),
        originalSourceName: String(values.hospital_name ?? ''),
        proposedNormalization,
      }
    })
    const candidateRowNumbers = new Set(candidates.map((candidate) => String(candidate.csvRowNumber)))
    if (Object.keys(decision.proposedNormalizations ?? {}).some((rowNumber) =>
      !candidateRowNumbers.has(rowNumber))) {
      throw new Error(`Manual review ${reviewId} normalization references a non-candidate row.`)
    }
    return {
      reviewId,
      reviewerDecision,
      evidenceReference: decision.evidenceReference ?? null,
      reviewer: decision.reviewer ?? null,
      reviewedAt: decision.reviewedAt ?? null,
      candidates,
    }
  })

  for (const reviewId of decisionsById.keys()) {
    if (!reviewIds.has(reviewId)) {
      throw new Error('A manual review decision does not match a current review candidate.')
    }
  }
  return output
}

export function buildDryRunReport({
  sourcePath,
  headers,
  records,
  parseErrors = [],
  existingHospitals = [],
  existingSourceObservations = [],
  sourceDocumentHashes = {},
  manualReviewDecisions = [],
  schemaSnapshot = {},
  generatedAt = new Date().toISOString(),
}) {
  const missingHeaders = SOURCE_CSV_HEADERS.filter((header) => !headers.includes(header))
  const idsByValue = groupByNormalizedValue(records, 'hospital_id')
  const namesByValue = groupByNormalizedValue(records, 'hospital_name')
  const similarPairs = findSimilarNamePairs(records, (record) => record.values.hospital_name)
  const manualReviewPairs = collectManualReviewPairs(records, similarPairs)
  const manualReviewRecords = buildManualReviewRecords(manualReviewPairs, manualReviewDecisions)
  const reasonsByRow = new Map()

  const addReason = (rowNumber, reason) => {
    const reasons = reasonsByRow.get(rowNumber) ?? []
    reasons.push(reason)
    reasonsByRow.set(rowNumber, reasons)
  }

  for (const record of records) {
    for (const error of [...record.parseErrors, ...validateRecord(record)]) {
      addReason(record.rowNumber, error)
    }
    if (missingHeaders.length) {
      addReason(record.rowNumber, `missing_source_columns:${missingHeaders.join(',')}`)
    }
  }

  for (const parseError of parseErrors) {
    const reason = `csv_parse_error: ${parseError.message}`
    if (parseError.rowNumber <= 1) {
      for (const record of records) addReason(record.rowNumber, reason)
    } else {
      addReason(parseError.rowNumber, reason)
    }
  }

  for (const group of idsByValue) {
    for (const rowNumber of group.rowNumbers) addReason(rowNumber, 'duplicate_source_id_in_csv')
  }
  for (const group of namesByValue) {
    for (const rowNumber of group.rowNumbers) addReason(rowNumber, 'duplicate_name_in_csv')
  }
  for (const pair of similarPairs) {
    addReason(pair.left.rowNumber, 'similar_name_in_csv_review')
    addReason(pair.right.rowNumber, 'similar_name_in_csv_review')
  }
  for (const pair of manualReviewPairs) {
    const decision = manualReviewRecords.find((review) => review.reviewId === reviewPairId(pair))
    const reason = decision?.reviewerDecision === 'unresolved'
      ? 'manual_identity_review_unresolved'
      : 'manual_identity_review_recorded_no_auto_action'
    addReason(pair.left.rowNumber, reason)
    addReason(pair.right.rowNumber, reason)
  }

  const databaseMatches = []
  const repeatClassifications = []
  const existingObservationsByIdentity = new Map()
  for (const observation of existingSourceObservations) {
    let identity
    try {
      identity = sourceObservationIdentity(observation)
    } catch {
      throw new Error(
        'An existing source observation has malformed identity data; report classification was aborted.',
      )
    }
    const observations = existingObservationsByIdentity.get(identity) ?? []
    observations.push(observation)
    existingObservationsByIdentity.set(identity, observations)
  }
  const priorCandidatesByIdentity = new Map()
  for (const record of records) {
    const signals = existingMatchSignals(record, existingHospitals)
    if (signals.length) {
      databaseMatches.push({
        rowNumber: record.rowNumber,
        hospitalId: String(record.values.hospital_id ?? '').trim(),
        hospitalName: String(record.values.hospital_name ?? '').trim(),
        reviewOnly: true,
        matches: signals,
      })
      for (const signal of signals) {
        addReason(record.rowNumber, `review_only_possible_database_match_${signal.type}`)
      }
    }

    const sourceDocument = String(record.values.source_document ?? '')
    const hash = sourceDocumentHashes[sourceDocument]
    if (hash) {
      const incomingObservation = observationFromCsvRecord(record, hash)
      if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(incomingObservation.source_hospital_id)) {
        continue
      }
      const identity = sourceObservationIdentity(incomingObservation)
      const existing = [
        ...(existingObservationsByIdentity.get(identity) ?? []),
        ...(priorCandidatesByIdentity.get(identity) ?? []),
      ][0]
      if (existing) {
        const classification = classifySourceObservationRepeat(existing, incomingObservation)
        repeatClassifications.push({
          rowNumber: record.rowNumber,
          classification,
        })
        if (classification === 'conflicting_repeat') {
          addReason(record.rowNumber, 'source_identity_conflicting_repeat')
        } else {
          addReason(record.rowNumber, 'source_identity_already_imported_review_only')
        }
      }
      const priorCandidates = priorCandidatesByIdentity.get(identity) ?? []
      priorCandidates.push(incomingObservation)
      priorCandidatesByIdentity.set(identity, priorCandidates)
    }
  }

  const rows = records.map((record) => {
    const values = record.values
    const reasons = reasonsByRow.get(record.rowNumber) ?? []
    return {
      rowNumber: record.rowNumber,
      pdfEntryNumber: String(values.pdf_entry_number ?? '').trim(),
      hospitalId: String(values.hospital_id ?? '').trim(),
      hospitalName: String(values.hospital_name ?? '').trim(),
      sourceDocument: String(values.source_document ?? '').trim(),
      sourcePage: String(values.source_page ?? '').trim(),
      status: reasons.length ? 'requires_review' : 'review_only_no_flags',
      reasons: [...new Set(reasons)],
    }
  })

  const invalidRows = rows
    .filter((row) => row.reasons.some((reason) => reason.startsWith('missing_') ||
      reason.startsWith('invalid_') ||
      reason.startsWith('unrecognized_') ||
      reason === 'source_status_not_unverified' ||
      reason.startsWith('csv_parse_error:') ||
      reason.startsWith('Expected ') ||
      reason.startsWith('Quote ') ||
      reason.startsWith('Unexpected character')))
    .map(({ rowNumber, pdfEntryNumber, hospitalId, reasons }) => ({
      rowNumber,
      pdfEntryNumber,
      hospitalId,
      reasons,
    }))

  const rowsWithoutReviewFlags = rows.filter((row) => row.status === 'review_only_no_flags')
  const reviewRows = rows.filter((row) => row.status === 'requires_review')

  return {
    generatedAt,
    mode: 'dry-run',
    operation: 'read-only-review-only',
    database: {
      targetName: DEFAULT_DRY_RUN_TARGET.database,
      endpointVerified: Boolean(schemaSnapshot.endpoint),
      endpoint: schemaSnapshot.endpoint ?? null,
      transactionMode: DATABASE_TRANSACTION_MODE,
      databaseWritesPerformed: false,
      existingHospitalCount: existingHospitals.length,
      existingSourceObservationCount: existingSourceObservations.length,
    },
    source: {
      file: sourcePath,
      rowCount: records.length,
      requiredColumns: REQUIRED_CSV_HEADERS,
      preservedSourceColumns: SOURCE_CSV_HEADERS,
      missingColumns: missingHeaders,
      parsingErrors: parseErrors,
    },
    summary: {
      totalRows: records.length,
      rowsWithoutReviewFlags: rowsWithoutReviewFlags.length,
      rowsRequiringReview: reviewRows.length,
      invalidRows: invalidRows.length,
      duplicateSourceIdGroups: idsByValue.length,
      duplicateNameGroups: namesByValue.length,
      similarNamePairs: similarPairs.length,
      possibleDatabaseMatchRows: databaseMatches.length,
      importExecuted: false,
    },
    readiness: {
      writeModeAvailable: false,
      importAvailable: false,
      eligibleRowsDefinition:
        'Rows are shown for review only. No hospital or source-observation records are proposed or imported.',
      blockers: [
        'This utility is strictly read-only; a separate reviewed implementation would be required to write source observations.',
      ],
    },
    schema: {
      inspectedFromLiveDatabase: Boolean(schemaSnapshot.endpoint),
      columns: schemaSnapshot.columns ?? [],
      constraints: schemaSnapshot.constraints ?? [],
      indexes: schemaSnapshot.indexes ?? [],
      triggers: schemaSnapshot.triggers ?? [],
      enums: schemaSnapshot.enums ?? [],
      sourceIdentifier: {
        field: 'hospital_source_observations.source_hospital_id',
        dedicatedFieldExists: true,
        uniqueConstraintExists: true,
        recommendation: 'Identity includes canonical source system, source hospital ID, and the exact PDF SHA-256.',
      },
    },
    fieldMappings: FIELD_MAPPINGS,
    unmappedFields: UNMAPPED_FIELDS,
    fieldLimitations: FIELD_LIMITATIONS,
    validation: {
      invalidRows,
      sourceObservationRepeats: repeatClassifications,
      duplicateSourceIds: idsByValue,
      duplicateNames: namesByValue,
      similarNameCandidates: similarPairs.map((pair) => ({
        rowNumbers: [pair.left.rowNumber, pair.right.rowNumber],
        pdfEntryNumbers: [
          String(pair.left.values.pdf_entry_number ?? '').trim(),
          String(pair.right.values.pdf_entry_number ?? '').trim(),
        ],
        hospitalIds: [
          String(pair.left.values.hospital_id ?? '').trim(),
          String(pair.right.values.hospital_id ?? '').trim(),
        ],
        hospitalNames: [
          String(pair.left.values.hospital_name ?? '').trim(),
          String(pair.right.values.hospital_name ?? '').trim(),
        ],
        similarity: pair.similarity,
      })),
      manualReviewRecords,
      possibleDatabaseMatches: databaseMatches,
    },
    rowsWithoutReviewFlags,
    rowsRequiringReview: reviewRows,
    allRows: rows,
  }
}

function assertSchemaCompatible(columns, enums) {
  const columnsByTable = new Map()
  for (const column of columns) {
    const tableColumns = columnsByTable.get(column.table_name) ?? new Set()
    tableColumns.add(column.column_name)
    columnsByTable.set(column.table_name, tableColumns)
  }
  const missingHospitalColumns = [...REQUIRED_HOSPITAL_COLUMNS].filter(
    (column) => !columnsByTable.get('hospitals')?.has(column),
  )
  const missingVerificationColumns = [...REQUIRED_VERIFICATION_COLUMNS].filter(
    (column) => !columnsByTable.get('hospital_verification_records')?.has(column),
  )
  const missingSourceObservationColumns = [...REQUIRED_SOURCE_OBSERVATION_COLUMNS].filter(
    (column) => !columnsByTable.get('hospital_source_observations')?.has(column),
  )
  if (missingHospitalColumns.length || missingVerificationColumns.length || missingSourceObservationColumns.length) {
    throw new Error(
      `Unexpected live schema; missing hospitals columns: ${missingHospitalColumns.join(', ') || 'none'}; ` +
      `missing verification columns: ${missingVerificationColumns.join(', ') || 'none'}; ` +
      `missing source observation columns: ${missingSourceObservationColumns.join(', ') || 'none'}.`,
    )
  }

  const enumValues = new Map()
  for (const enumRow of enums) {
    const values = enumValues.get(enumRow.enum_name) ?? new Set()
    values.add(enumRow.enum_value)
    enumValues.set(enumRow.enum_name, values)
  }
  const requiredEnumValues = [
    ['hospital_listing_status', 'draft'],
    ['hospital_verification_status', 'pending'],
    ['data_source_type', 'government_registry'],
  ]
  const missingEnumValues = requiredEnumValues.filter(
    ([enumName, enumValue]) => !enumValues.get(enumName)?.has(enumValue),
  )
  if (missingEnumValues.length) {
    throw new Error('Unexpected live schema; a safe draft/pending source status is unavailable.')
  }
}

function assertSourceObservationWriteSchema(columns, indexes, triggers) {
  const payloadColumn = columns.find((column) =>
    column.table_name === 'hospital_source_observations' &&
    column.column_name === 'source_row_payload')
  if (payloadColumn?.data_type !== 'jsonb') {
    throw new Error('Write mode requires hospital_source_observations.source_row_payload to be JSONB.')
  }

  const identityIndexExists = indexes.some((index) => {
    if (index.tablename !== 'hospital_source_observations') return false
    const definition = String(index.indexdef ?? '').replace(/\s+/g, ' ')
    return /CREATE UNIQUE INDEX/i.test(definition) &&
      /\(source_system COLLATE "C", source_hospital_id COLLATE "C", source_document_sha256 COLLATE "C"\)/i
        .test(definition)
  })
  if (!identityIndexExists) {
    throw new Error('Write mode requires the source-observation identity unique index.')
  }
  if (triggers.some((trigger) => trigger.table_name === 'hospital_source_observations')) {
    throw new Error('Write mode refuses source-observation triggers with unreviewed side effects.')
  }
}

function createSourceObservationImportReport(baseReport, plan, statuses, insertedCount, alreadyImportedCount) {
  const statusesByRow = new Map(statuses.map((status) => [status.rowNumber, status]))
  const excludedByRow = new Map(plan.excludedRows.map((row) => [row.rowNumber, row]))
  const allRows = baseReport.allRows.map((row) => {
    const status = statusesByRow.get(row.rowNumber)
    if (status) return { ...row, sourceObservationImportResult: status.result }
    const excluded = excludedByRow.get(row.rowNumber)
    return {
      ...row,
      sourceObservationImportResult: 'excluded',
      sourceObservationImportExclusionReasons: excluded?.reasons ?? ['not_eligible_for_import'],
    }
  })
  const unresolvedReviewIds = baseReport.validation.manualReviewRecords
    .filter((review) => review.reviewerDecision === 'unresolved')
    .map((review) => review.reviewId)

  return {
    ...baseReport,
    mode: 'write',
    operation: 'source-observation-import',
    database: {
      ...baseReport.database,
      transactionMode: 'READ WRITE',
      databaseWritesPerformed: insertedCount > 0,
    },
    summary: {
      ...baseReport.summary,
      importExecuted: true,
      importedSourceObservations: insertedCount,
      alreadyImportedSourceObservations: alreadyImportedCount,
      excludedImportRows: plan.excludedRows.length,
    },
    readiness: {
      writeModeAvailable: true,
      importAvailable: true,
      eligibleRowsDefinition:
        'Only rows with valid required source fields, all 17 string payload fields, and a readable source PDF are imported as unlinked source observations.',
      blockers: [],
    },
    import: {
      eligibleRows: plan.candidates.length,
      insertedRows: insertedCount,
      alreadyImportedRows: alreadyImportedCount,
      excludedRows: plan.excludedRows,
      unresolvedReviewIds,
      hospitalRecordsWritten: 0,
      hospitalVerificationRecordsWritten: 0,
      hospitalLinksCreated: 0,
    },
    allRows,
    rowsWithoutReviewFlags: allRows.filter((row) => row.status === 'review_only_no_flags'),
    rowsRequiringReview: allRows.filter((row) => row.status === 'requires_review'),
  }
}

export async function performSourceObservationImport(client, {
  sourcePath,
  headers,
  records,
  parseErrors,
  sourceDocumentHashes,
  sourceDocumentFailures = {},
  manualReviewDecisions = [],
}) {
  const plan = prepareSourceObservationImport({
    records,
    headers,
    parseErrors,
    sourceDocumentHashes,
    sourceDocumentFailures,
  })
  await client.query('BEGIN')
  try {
    const connection = await client.query(`
      SELECT current_database() AS database_name,
             inet_server_addr()::text AS server_address,
             inet_server_port() AS server_port
    `)
    const endpoint = connection.rows[0]
    assertConnectedDryRunEndpoint(endpoint)

    const columns = await client.query(SCHEMA_COLUMNS_SQL)
    const indexes = await client.query(SCHEMA_INDEXES_SQL)
    const triggers = await client.query(SCHEMA_TRIGGERS_SQL)
    const enums = await client.query(SCHEMA_ENUMS_SQL)
    assertSchemaCompatible(columns.rows, enums.rows)
    assertSourceObservationWriteSchema(columns.rows, indexes.rows, triggers.rows)

    const existingHospitals = await client.query(EXISTING_HOSPITALS_SQL)
    const existingSourceObservations = await client.query(EXISTING_SOURCE_OBSERVATIONS_SQL)
    const baseReport = buildDryRunReport({
      sourcePath,
      headers,
      records,
      parseErrors,
      existingHospitals: existingHospitals.rows,
      existingSourceObservations: existingSourceObservations.rows,
      sourceDocumentHashes,
      manualReviewDecisions,
      schemaSnapshot: {
        columns: columns.rows,
        indexes: indexes.rows,
        triggers: triggers.rows,
        enums: enums.rows,
        endpoint: {
          database: endpoint.database_name,
          address: endpoint.server_address,
          port: Number(endpoint.server_port),
        },
      },
    })

    const observationsByIdentity = new Map()
    for (const observation of existingSourceObservations.rows) {
      const identity = sourceObservationIdentity(observation)
      const observations = observationsByIdentity.get(identity) ?? []
      observations.push(observation)
      observationsByIdentity.set(identity, observations)
    }

    const statuses = []
    let insertedCount = 0
    let alreadyImportedCount = 0
    for (const candidate of plan.candidates) {
      const incoming = candidate.observation
      const identity = sourceObservationIdentity(incoming)
      const matches = observationsByIdentity.get(identity) ?? []
      if (matches.length > 1) {
        throw new Error(`Conflicting duplicate source identity at CSV row ${candidate.record.rowNumber}.`)
      }
      if (matches.length === 1) {
        const classification = classifySourceObservationRepeat(matches[0], incoming)
        if (classification !== 'already_imported') {
          throw new Error(`Conflicting source observation at CSV row ${candidate.record.rowNumber}; transaction rolled back.`)
        }
        statuses.push({ rowNumber: candidate.record.rowNumber, result: 'already_imported' })
        alreadyImportedCount += 1
        continue
      }

      const values = incoming
      const insert = await client.query(INSERT_SOURCE_OBSERVATION_SQL, [
        null,
        values.source_system,
        values.source_hospital_id,
        values.source_document,
        values.source_document_sha256,
        values.source_date,
        values.source_page,
        values.source_hospital_name,
        values.source_ownership_type,
        values.source_email,
        values.source_contact_phone,
        values.source_nodal_officer_name,
        JSON.stringify(values.source_row_payload),
      ])
      if (insert.rows.length) {
        observationsByIdentity.set(identity, [incoming])
        statuses.push({ rowNumber: candidate.record.rowNumber, result: 'inserted' })
        insertedCount += 1
        continue
      }

      const conflict = await client.query(SOURCE_OBSERVATION_BY_IDENTITY_SQL, [
        values.source_system,
        values.source_hospital_id,
        values.source_document_sha256,
      ])
      if (conflict.rows.length !== 1) {
        throw new Error(`Unexpected source-observation identity conflict at CSV row ${candidate.record.rowNumber}; transaction rolled back.`)
      }
      const classification = classifySourceObservationRepeat(conflict.rows[0], incoming)
      if (classification !== 'already_imported') {
        throw new Error(`Conflicting source observation at CSV row ${candidate.record.rowNumber}; transaction rolled back.`)
      }
      observationsByIdentity.set(identity, conflict.rows)
      statuses.push({ rowNumber: candidate.record.rowNumber, result: 'already_imported' })
      alreadyImportedCount += 1
    }

    const report = createSourceObservationImportReport(
      baseReport,
      plan,
      statuses,
      insertedCount,
      alreadyImportedCount,
    )
    await client.query('COMMIT')
    return report
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        'Source-observation import failed and transaction rollback also failed.',
      )
    }
    throw error
  }
}

async function inspectDatabase(client) {
  await client.query(`BEGIN ${DATABASE_TRANSACTION_MODE}`)
  try {
    const connection = await client.query(`
      SELECT current_database() AS database_name,
             inet_server_addr()::text AS server_address,
             inet_server_port() AS server_port
    `)
    const endpoint = connection.rows[0]
    assertConnectedDryRunEndpoint(endpoint)

    const columns = await client.query(SCHEMA_COLUMNS_SQL)
    const constraints = await client.query(SCHEMA_CONSTRAINTS_SQL)
    const indexes = await client.query(SCHEMA_INDEXES_SQL)
    const triggers = await client.query(SCHEMA_TRIGGERS_SQL)
    const enums = await client.query(SCHEMA_ENUMS_SQL)
    const existingHospitals = await client.query(EXISTING_HOSPITALS_SQL)
    const existingSourceObservations = await client.query(EXISTING_SOURCE_OBSERVATIONS_SQL)
    assertSchemaCompatible(columns.rows, enums.rows)
    return {
      existingHospitals: existingHospitals.rows,
      existingSourceObservations: existingSourceObservations.rows,
      schemaSnapshot: {
        columns: columns.rows,
        constraints: constraints.rows,
        indexes: indexes.rows,
        triggers: triggers.rows,
        enums: enums.rows,
        endpoint: {
          database: endpoint.database_name,
          address: endpoint.server_address,
          port: Number(endpoint.server_port),
        },
      },
    }
  } finally {
    await client.query('ROLLBACK')
  }
}

async function runDryRun(args = process.argv.slice(2)) {
  const options = parseDryRunArguments(args)
  const manualReviewDecisions = await readManualReviewDecisions(options.reviewDecisionsPath)
  const csvContents = await readFile(options.csvPath, 'utf8')
  const parsed = parseCsv(csvContents)
  if (options.writeMode) {
    const { hashes, failures } = await readSourceDocumentHashesForImport(parsed.records)
    const { Pool } = pg
    const pool = new Pool({
      host: options.host,
      port: Number(options.port),
      database: options.database,
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD,
      max: 1,
      connectionTimeoutMillis: 5000,
      statement_timeout: 10000,
      application_name: 'sonipat-hospital-source-observation-import',
    })
    let report
    try {
      const client = await pool.connect()
      try {
        report = await performSourceObservationImport(client, {
          sourcePath: options.csvPath,
          headers: parsed.headers,
          records: parsed.records,
          parseErrors: parsed.errors,
          sourceDocumentHashes: hashes,
          sourceDocumentFailures: failures,
          manualReviewDecisions,
        })
      } finally {
        client.release()
      }
    } finally {
      await pool.end()
    }
    console.log(JSON.stringify(report, null, 2))
    return
  }

  const sourceDocumentHashes = await readSourceDocumentHashes(parsed.records)
  const { Pool } = pg
  const pool = new Pool({
    host: options.host,
    port: Number(options.port),
    database: options.database,
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD,
    max: 1,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
    application_name: 'sonipat-hospital-read-only-dry-run',
    options: '-c default_transaction_read_only=on',
  })

  let databaseSnapshot
  try {
    const client = await pool.connect()
    try {
      databaseSnapshot = await inspectDatabase(client)
    } finally {
      client.release()
    }
  } finally {
    await pool.end()
  }

  const report = buildDryRunReport({
    sourcePath: options.csvPath,
    ...parsed,
    existingHospitals: databaseSnapshot.existingHospitals,
    existingSourceObservations: databaseSnapshot.existingSourceObservations,
    sourceDocumentHashes,
    manualReviewDecisions,
    schemaSnapshot: databaseSnapshot.schemaSnapshot,
  })
  await writeDryRunReport(options.reportPath, `${JSON.stringify(report, null, 2)}\n`)

  console.log(JSON.stringify({
    mode: report.mode,
    operation: report.operation,
    target: report.database.targetName,
    databaseWritesPerformed: report.database.databaseWritesPerformed,
    totalRows: report.summary.totalRows,
    rowsWithoutReviewFlags: report.summary.rowsWithoutReviewFlags,
    rowsRequiringReview: report.summary.rowsRequiringReview,
    invalidRows: report.summary.invalidRows,
    possibleDatabaseMatchRows: report.summary.possibleDatabaseMatchRows,
    report: options.reportPath,
  }, null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runDryRun().catch((error) => {
    const code = error?.code ? ` (code ${error.code})` : ''
    console.error(`Hospital CSV importer failed${code}: ${error?.message ?? 'unknown error'}`)
    process.exitCode = 1
  })
}
