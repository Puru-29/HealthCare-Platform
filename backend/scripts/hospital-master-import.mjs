import { isIP } from 'node:net'
import pg from 'pg'
import { pathToFileURL } from 'node:url'

export const HOSPITAL_MASTER_TARGET = Object.freeze({
  database: 'healthcare_platform_test',
  port: '5432',
})

export const HOSPITAL_MASTER_WRITE_CONFIRMATION = 'healthcare_platform_test'

export const BLOCKED_CONNECTION_ENVIRONMENT = [
  'DATABASE_URL',
  'PGHOSTADDR',
  'PGSERVICE',
  'PGSERVICEFILE',
  'PGOPTIONS',
  'PGTARGETSESSIONATTRS',
  'PGLOADBALANCEHOSTS',
]

export const CURATED_UNRESOLVED_PAIRS = [
  {
    sourceDocument: '202608041074356704.pdf',
    candidates: [
      { entry: '23', sourceHospitalId: 'HOSP6G177317' },
      { entry: '26', sourceHospitalId: 'HOSP6G177370' },
    ],
  },
  {
    sourceDocument: '202608041074356704.pdf',
    candidates: [
      { entry: '44', sourceHospitalId: 'HOSP6P02024' },
      { entry: '63', sourceHospitalId: 'HOSP6P131336' },
    ],
  },
  {
    sourceDocument: '202608041074356704.pdf',
    candidates: [
      { entry: '59', sourceHospitalId: 'HOSP6P101722' },
      { entry: '62', sourceHospitalId: 'HOSP6P131103' },
    ],
  },
]

const SOURCE_ROW_FIELDS = [
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

const ENDPOINT_SQL = `
  SELECT current_database() AS database_name,
         inet_server_addr()::text AS server_address,
         inet_server_port() AS server_port
`

const REQUIRED_RELATIONS_SQL = `
  SELECT to_regclass('public.hospital_source_observations')::text AS observations,
         to_regclass('public.hospital_source_observation_review_decisions')::text AS reviews,
         to_regclass('public.hospitals')::text AS hospitals,
         to_regclass('public.hospital_verification_records')::text AS verifications,
         EXISTS (
           SELECT 1
           FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = 'hospital_source_observations'
             AND column_name = 'source_row_payload'
         ) AS has_source_row_payload
`

const SOURCE_OBSERVATIONS_SQL = `
  SELECT id::text AS id,
         hospital_id::text AS hospital_id,
         source_system,
         source_hospital_id,
         source_document,
         source_document_sha256,
         source_date::text AS source_date,
         source_page,
         source_hospital_name,
         source_ownership_type,
         source_row_payload
  FROM public.hospital_source_observations
  ORDER BY id
  FOR UPDATE
`

const EXISTING_HOSPITALS_SQL = `
  SELECT h.id::text AS id,
         h.public_name,
         h.public_listing_status,
         h.public_source_reference,
         bool_or(v.is_current) AS has_current_verification
  FROM public.hospitals h
  LEFT JOIN public.hospital_verification_records v ON v.hospital_id = h.id
  GROUP BY h.id, h.public_name, h.public_listing_status, h.public_source_reference
  ORDER BY h.id
`

const REVIEW_DECISIONS_SQL = `
  SELECT review_id,
         source_observation_a_id::text AS source_observation_a_id,
         source_observation_b_id::text AS source_observation_b_id,
         decision_number::text AS decision_number,
         decision
  FROM public.hospital_source_observation_review_decisions
  ORDER BY decision_number
`

export function parseHospitalMasterImportArguments(args, environment = process.env) {
  const options = {
    database: null,
    host: null,
    port: null,
    writeMode: false,
    writeConfirmation: null,
    explicitDryRun: false,
  }
  const seen = new Set()
  const valueOptions = new Map([
    ['--database', 'database'],
    ['--host', 'host'],
    ['--port', 'port'],
    ['--confirm-write', 'writeConfirmation'],
  ])

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--dry-run' || argument === '--write') {
      if (seen.has(argument)) throw new Error(`Duplicate argument: ${argument}.`)
      seen.add(argument)
      if (argument === '--write') options.writeMode = true
      else options.explicitDryRun = true
      continue
    }

    const property = valueOptions.get(argument)
    if (!property) throw new Error(`Unsupported argument: ${argument}.`)
    if (seen.has(argument)) throw new Error(`Duplicate argument: ${argument}.`)
    seen.add(argument)
    const value = args[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`Missing value after ${argument}.`)
    options[property] = value
    index += 1
  }

  for (const requiredFlag of ['--database', '--host', '--port']) {
    if (!seen.has(requiredFlag)) throw new Error(`Explicit ${requiredFlag} is required.`)
  }
  if (options.writeMode) {
    if (options.explicitDryRun) throw new Error('--write cannot be combined with --dry-run.')
    if (!seen.has('--confirm-write')) {
      throw new Error('Write mode requires explicit --confirm-write healthcare_platform_test.')
    }
    if (options.writeConfirmation !== HOSPITAL_MASTER_WRITE_CONFIRMATION) {
      throw new Error('Write mode confirmation must be healthcare_platform_test.')
    }
  } else if (seen.has('--confirm-write')) {
    throw new Error('--confirm-write is valid only with --write.')
  }

  assertHospitalMasterTarget(options, environment)
  return options
}

export function assertHospitalMasterTarget(options, environment = process.env) {
  if (options.database !== HOSPITAL_MASTER_TARGET.database) {
    throw new Error(`Target database must be ${HOSPITAL_MASTER_TARGET.database}.`)
  }
  if (!['127.0.0.1', 'localhost'].includes(options.host)) {
    throw new Error('Target host must be 127.0.0.1 or localhost.')
  }
  if (String(options.port) !== HOSPITAL_MASTER_TARGET.port) {
    throw new Error(`Target port must be ${HOSPITAL_MASTER_TARGET.port}.`)
  }

  for (const [name, expected] of [
    ['PGDATABASE', options.database],
    ['PGPORT', String(options.port)],
  ]) {
    if (environment[name] && environment[name] !== expected) {
      throw new Error(`Environment setting ${name} conflicts with the explicit target.`)
    }
  }
  if (environment.PGHOST && !['127.0.0.1', 'localhost'].includes(environment.PGHOST)) {
    throw new Error('Environment setting PGHOST conflicts with the loopback target.')
  }
  for (const name of BLOCKED_CONNECTION_ENVIRONMENT) {
    if (environment[name]) throw new Error(`Connection override ${name} is not permitted.`)
  }
}

export function isLoopbackServerAddress(address) {
  if (typeof address !== 'string') return false
  const [ipAddress, prefix, ...extra] = address.split('/')
  if (!ipAddress || extra.length > 0) return false
  const version = isIP(ipAddress)
  if (!version) return false
  if (
    prefix !== undefined &&
    (!/^\d+$/.test(prefix) || Number(prefix) > (version === 4 ? 32 : 128))
  ) return false
  if (version === 4) return Number(ipAddress.split('.')[0]) === 127

  if (ipAddress.includes('%') || ipAddress.includes('.')) return false
  const halves = ipAddress.split('::')
  if (halves.length > 2) return false
  const left = halves[0] ? halves[0].split(':') : []
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const explicit = [...left, ...right]
  if (explicit.some((group) => !/^[0-9a-f]{1,4}$/i.test(group))) return false
  if (halves.length === 1 && explicit.length !== 8) return false
  if (halves.length === 2 && explicit.length >= 8) return false
  const groups = halves.length === 1
    ? explicit
    : [...left, ...Array(8 - explicit.length).fill('0'), ...right]
  return groups.length === 8 &&
    groups.slice(0, 7).every((group) => Number.parseInt(group, 16) === 0) &&
    Number.parseInt(groups[7], 16) === 1
}

function normalizedName(value) {
  if (typeof value !== 'string') return ''
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en')
}

function compactName(value) {
  return normalizedName(value).replace(/[^\p{L}\p{N}]+/gu, '')
}

function editDistance(left, right) {
  let previous = Array.from({ length: right.length + 1 }, (_value, index) => index)
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex]
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      )
    }
    previous = current
  }
  return previous[right.length]
}

function arePossibleDuplicateNames(left, right) {
  const normalizedLeft = compactName(left)
  const normalizedRight = compactName(right)
  if (!normalizedLeft || !normalizedRight) return false
  if (normalizedLeft === normalizedRight) return true
  const maximumLength = Math.max(normalizedLeft.length, normalizedRight.length)
  if (maximumLength < 5) return false
  if (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) return true
  return 1 - editDistance(normalizedLeft, normalizedRight) / maximumLength >= 0.88
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function observationEntry(observation) {
  const value = observation.source_row_payload?.pdf_entry_number
  return typeof value === 'string' && /^\d+$/.test(value) ? value : null
}

function sourceKey(observation) {
  return `${observation.source_system}\u0000${observation.source_hospital_id}`
}

function exactIdentityKey(observation) {
  return `${sourceKey(observation)}\u0000${observation.source_document_sha256}`
}

function observationReviewId(first, second) {
  const firstEntry = observationEntry(first)
  const secondEntry = observationEntry(second)
  if (!firstEntry || !secondEntry || first.source_document !== second.source_document) return null
  const entries = [firstEntry, secondEntry].sort((left, right) => Number(left) - Number(right))
  if (entries[0] === entries[1]) return null
  return `${first.source_document}#entries-${entries.join('-')}`
}

function validateObservation(observation) {
  const payload = observation.source_row_payload
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { type: 'conflict', reason: 'source_payload_missing_or_malformed' }
  }
  if (SOURCE_ROW_FIELDS.some((field) => typeof payload[field] !== 'string')) {
    return { type: 'excluded', reason: 'source_payload_incomplete' }
  }
  if (
    typeof observation.source_system !== 'string' ||
    typeof observation.source_hospital_id !== 'string' ||
    typeof observation.source_document !== 'string' ||
    typeof observation.source_date !== 'string' ||
    typeof observation.source_hospital_name !== 'string' ||
    typeof observation.source_document_sha256 !== 'string' ||
    observation.source_system !== 'pm-jay' ||
    !/^[a-z0-9][a-z0-9._:-]*$/.test(observation.source_hospital_id) ||
    payload.hospital_id.toLowerCase() !== observation.source_hospital_id ||
    payload.source_document !== observation.source_document ||
    payload.source_date !== observation.source_date ||
    payload.source_page !== String(observation.source_page) ||
    payload.hospital_name !== observation.source_hospital_name ||
    !observation.source_hospital_name.trim() ||
    !/^[a-f0-9]{64}$/.test(observation.source_document_sha256) ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*\.pdf$/i.test(observation.source_document) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(observation.source_date) ||
    !Number.isInteger(observation.source_page) ||
    observation.source_page < 1 ||
    !observationEntry(observation)
  ) {
    return { type: 'conflict', reason: 'source_identity_or_payload_mismatch' }
  }
  if (payload.verification_status !== 'unverified') {
    return { type: 'excluded', reason: 'source_status_not_unverified' }
  }
  if (!['Public', 'Private'].includes(observation.source_ownership_type) ||
      payload.hospital_type !== observation.source_ownership_type) {
    return { type: 'excluded', reason: 'source_ownership_value_invalid' }
  }
  return null
}

function sourceReference(observation) {
  return `${observation.source_document}#page=${observation.source_page}&entry=${observationEntry(observation)}`
}

function curatedPairKey(pair) {
  return `${pair.sourceDocument}#entries-${pair.candidates.map((candidate) => candidate.entry).join('-')}`
}

function safeObservationReference(observation) {
  return {
    sourceObservationId: observation.id,
    sourceSystem: observation.source_system,
    sourceHospitalId: observation.source_hospital_id,
    sourceDocument: observation.source_document,
    sourcePage: observation.source_page,
    pdfEntryNumber: observationEntry(observation),
    sourceHospitalName: observation.source_hospital_name,
  }
}

export function buildHospitalMasterImportPlan({
  observations,
  hospitals,
  reviewDecisions,
}) {
  const flags = new Map(observations.map((observation) => [observation.id, new Set()]))
  const reasons = new Map(observations.map((observation) => [observation.id, new Set()]))
  const potentialDuplicateGroups = new Map()
  const flag = (id, name, reason) => {
    if (!flags.has(id)) return
    flags.get(id).add(name)
    reasons.get(id).add(reason)
  }
  const addPotentialGroup = (observationsInGroup, reason) => {
    const ids = [...new Set(observationsInGroup.map((observation) => observation.id))].sort()
    if (ids.length < 1) return
    const key = `${reason}:${ids.join(':')}`
    potentialDuplicateGroups.set(key, {
      reason,
      observations: observationsInGroup.map(safeObservationReference),
    })
    for (const id of ids) flag(id, 'potentialDuplicate', reason)
  }
  const byId = new Map(observations.map((observation) => [observation.id, observation]))
  const latestDecisions = new Map()
  for (const decision of reviewDecisions) {
    const current = latestDecisions.get(decision.review_id)
    if (!current || BigInt(decision.decision_number) > BigInt(current.decision_number)) {
      latestDecisions.set(decision.review_id, decision)
    }
  }

  const pairByObservation = new Map()
  const explicitDistinctPairs = new Set()
  const processedReviewIds = new Set()
  const applyPairDecision = (reviewId, observationIds, decision) => {
    const pair = { reviewId, observationIds }
    for (const id of observationIds) {
      if (pairByObservation.has(id)) {
        for (const pairId of observationIds) flag(pairId, 'conflict', 'overlapping_review_pairs')
        flag(id, 'conflict', 'overlapping_review_pairs')
      } else {
        pairByObservation.set(id, pair)
      }
    }
    if (!decision || decision.decision === 'needs_more_evidence') {
      for (const id of observationIds) flag(id, 'unresolved', 'manual_identity_review_unresolved')
      addPotentialGroup(
        observationIds.map((id) => byId.get(id)).filter(Boolean),
        'unresolved_manual_identity_review',
      )
    } else if (decision.decision === 'different_hospitals') {
      explicitDistinctPairs.add([...observationIds].sort().join('\u0000'))
    } else if (decision.decision === 'same_hospital') {
      for (const id of observationIds) {
        flag(id, 'excluded', 'same_hospital_requires_canonical_name')
      }
    } else {
      for (const id of observationIds) flag(id, 'conflict', 'unsupported_review_decision')
    }
  }

  for (const curatedPair of CURATED_UNRESOLVED_PAIRS) {
    const reviewId = curatedPairKey(curatedPair)
    const candidateRowGroups = curatedPair.candidates.map((candidate) =>
      observations.filter((observation) =>
        observation.source_document === curatedPair.sourceDocument &&
        typeof observation.source_hospital_id === 'string' &&
        observation.source_hospital_id.toLowerCase() === candidate.sourceHospitalId.toLowerCase() &&
        observationEntry(observation) === candidate.entry))
    const exactPairRows = candidateRowGroups.flat()
    if (candidateRowGroups.some((group) => group.length !== 1)) {
      const sourceIdRows = observations.filter((observation) =>
        curatedPair.candidates.some((candidate) =>
          typeof observation.source_hospital_id === 'string' &&
          observation.source_hospital_id.toLowerCase() === candidate.sourceHospitalId.toLowerCase()))
      for (const observation of [...new Set([...exactPairRows, ...sourceIdRows])]) {
        flag(observation.id, 'unresolved', 'manual_identity_review_unresolved')
        flag(observation.id, 'conflict', 'curated_review_pair_mismatch')
      }
      continue
    }
    const ids = exactPairRows.map((observation) => observation.id)
    if (ids.length !== 2) {
      for (const observation of exactPairRows) {
        flag(observation.id, 'unresolved', 'manual_identity_review_unresolved')
        flag(observation.id, 'conflict', 'curated_review_pair_mismatch')
      }
      continue
    }
    const decision = latestDecisions.get(reviewId)
    if (decision) {
      const actualIds = [decision.source_observation_a_id, decision.source_observation_b_id].sort()
      if (actualIds[0] !== [...ids].sort()[0] || actualIds[1] !== [...ids].sort()[1]) {
        for (const id of ids) flag(id, 'conflict', 'review_decision_source_pair_mismatch')
        processedReviewIds.add(reviewId)
        continue
      }
    }
    processedReviewIds.add(reviewId)
    applyPairDecision(reviewId, ids, decision)
  }

  for (const [reviewId, decision] of latestDecisions) {
    if (processedReviewIds.has(reviewId)) continue
    const first = byId.get(decision.source_observation_a_id)
    const second = byId.get(decision.source_observation_b_id)
    if (!first || !second || observationReviewId(first, second) !== reviewId) {
      flag(first?.id, 'conflict', 'review_decision_source_pair_mismatch')
      flag(second?.id, 'conflict', 'review_decision_source_pair_mismatch')
      continue
    }
    applyPairDecision(reviewId, [first.id, second.id], decision)
  }

  for (const observation of observations) {
    const validation = validateObservation(observation)
    if (validation) {
      flag(observation.id, validation.type, validation.reason)
    }
  }

  const exactIdentityGroups = new Map()
  const sourceIdentityGroups = new Map()
  for (const observation of observations) {
    const exactKey = exactIdentityKey(observation)
    const exactGroup = exactIdentityGroups.get(exactKey) ?? []
    exactGroup.push(observation)
    exactIdentityGroups.set(exactKey, exactGroup)

    const sourceGroup = sourceIdentityGroups.get(sourceKey(observation)) ?? []
    sourceGroup.push(observation)
    sourceIdentityGroups.set(sourceKey(observation), sourceGroup)
  }
  for (const group of exactIdentityGroups.values()) {
    if (group.length < 2) continue
    const payloads = new Set(group.map((observation) => stableJson(observation.source_row_payload)))
    const reason = payloads.size > 1
      ? 'same_source_identity_has_conflicting_payloads'
      : 'duplicate_source_identity'
    for (const observation of group) {
      flag(observation.id, payloads.size > 1 ? 'conflict' : 'potentialDuplicate', reason)
    }
  }
  for (const group of sourceIdentityGroups.values()) {
    if (group.length < 2) continue
    const distinctNames = new Set(group.map((observation) => normalizedName(observation.source_hospital_name)))
    const conflictingName = distinctNames.size > 1
    for (const observation of group) {
      flag(observation.id, conflictingName ? 'conflict' : 'potentialDuplicate',
        conflictingName ? 'source_id_has_conflicting_names' : 'source_id_has_multiple_document_observations')
    }
  }

  const hospitalById = new Map(hospitals.map((hospital) => [hospital.id, hospital]))
  const observationHospitalLinks = new Map()
  for (const observation of observations) {
    if (!observation.hospital_id) continue
    const links = observationHospitalLinks.get(sourceKey(observation)) ?? new Set()
    links.add(observation.hospital_id)
    observationHospitalLinks.set(sourceKey(observation), links)
  }
  for (const links of observationHospitalLinks.values()) {
    if (links.size > 1) {
      for (const observation of observations) {
        if (observationHospitalLinks.get(sourceKey(observation)) === links) {
          flag(observation.id, 'conflict', 'source_identity_linked_to_multiple_hospitals')
        }
      }
    }
  }

  const alreadyLinkedIds = new Set()
  for (const observation of observations) {
    if (!observation.hospital_id) continue
    if (
      flags.get(observation.id).has('unresolved') ||
      flags.get(observation.id).has('conflict')
    ) {
      if (flags.get(observation.id).has('unresolved')) {
        flag(observation.id, 'conflict', 'unresolved_observation_already_linked')
      }
      continue
    }
    const hospital = hospitalById.get(observation.hospital_id)
    if (
      !hospital ||
      hospital.public_listing_status !== 'draft' ||
      hospital.public_name !== observation.source_hospital_name ||
      hospital.public_source_reference !== sourceReference(observation) ||
      hospital.has_current_verification
    ) {
      flag(observation.id, 'conflict', 'existing_hospital_link_is_not_expected_unverified_draft')
    } else {
      alreadyLinkedIds.add(observation.id)
    }
  }

  const candidateRows = observations.filter((observation) =>
    !observation.hospital_id &&
    ![...flags.get(observation.id)].some((value) =>
      ['conflict', 'unresolved', 'potentialDuplicate', 'excluded'].includes(value)))
  for (const candidate of candidateRows) {
    for (const existing of hospitals) {
      if (existing.id === candidate.hospital_id) continue
      if (arePossibleDuplicateNames(candidate.source_hospital_name, existing.public_name)) {
        addPotentialGroup([candidate], 'possible_existing_hospital_name_match')
      }
    }
  }
  const namedObservations = observations.filter((observation) =>
    typeof observation.source_hospital_name === 'string' &&
    observation.source_hospital_name.trim())
  for (const left of candidateRows) {
    for (const right of namedObservations) {
      if (left.id === right.id) continue
      if (left.source_system === right.source_system &&
          left.source_hospital_id === right.source_hospital_id) continue
      const pairKey = [left.id, right.id].sort().join('\u0000')
      const exactNameMatch =
        normalizedName(left.source_hospital_name) === normalizedName(right.source_hospital_name)
      if (
        arePossibleDuplicateNames(left.source_hospital_name, right.source_hospital_name) &&
        (!explicitDistinctPairs.has(pairKey) || exactNameMatch)
      ) {
        addPotentialGroup([left, right], 'possible_source_name_match')
      }
    }
  }

  const eligible = observations.filter((observation) =>
    !observation.hospital_id && flags.get(observation.id).size === 0)
  const eligibleRecords = eligible.map((observation) => ({
    sourceObservationIds: [observation.id],
    sourceHospitalIds: [observation.source_hospital_id],
    sourceSystem: observation.source_system,
    sourceDocument: observation.source_document,
    sourcePage: observation.source_page,
    pdfEntryNumber: observationEntry(observation),
    sourceName: observation.source_hospital_name,
    proposedHospitalName: observation.source_hospital_name,
    publicSourceReference: sourceReference(observation),
    listingStatus: 'draft',
    verificationStatus: 'unverified',
  }))

  const unresolvedIds = observations
    .filter((observation) => flags.get(observation.id).has('unresolved'))
    .map((observation) => observation.id)
  const conflictIds = observations
    .filter((observation) => flags.get(observation.id).has('conflict'))
    .map((observation) => observation.id)
  const potentialDuplicateIds = observations
    .filter((observation) => flags.get(observation.id).has('potentialDuplicate'))
    .map((observation) => observation.id)
  const excludedIds = observations
    .filter((observation) =>
      flags.get(observation.id).size > 0 &&
      !alreadyLinkedIds.has(observation.id))
    .map((observation) => observation.id)

  return {
    mode: 'dry-run',
    databaseWritesPerformed: false,
    counts: {
      totalObservations: observations.length,
      eligibleObservations: eligible.length,
      excludedObservations: excludedIds.length,
      potentialDuplicates: potentialDuplicateIds.length,
      conflicts: conflictIds.length,
      unresolvedObservations: unresolvedIds.length,
      alreadyLinkedObservations: alreadyLinkedIds.size,
      proposedDraftHospitalRecords: eligibleRecords.length,
    },
    proposedDraftHospitalRecords: eligibleRecords,
    unresolvedObservations: observations
      .filter((observation) => unresolvedIds.includes(observation.id))
      .map((observation) => ({
        ...safeObservationReference(observation),
        reasons: [...reasons.get(observation.id)],
      })),
    potentialDuplicateGroups: [...potentialDuplicateGroups.values()],
    conflicts: observations
      .filter((observation) => conflictIds.includes(observation.id))
      .map((observation) => ({
        ...safeObservationReference(observation),
        reasons: [...reasons.get(observation.id)],
      })),
    excludedObservations: observations
      .filter((observation) => excludedIds.includes(observation.id))
      .map((observation) => ({
        ...safeObservationReference(observation),
        reasons: [...reasons.get(observation.id)],
      })),
    alreadyLinkedObservationIds: [...alreadyLinkedIds],
  }
}

export async function verifyHospitalMasterEndpoint(client) {
  const result = await client.query(ENDPOINT_SQL)
  const endpoint = result.rows[0]
  if (
    endpoint?.database_name !== HOSPITAL_MASTER_TARGET.database ||
    !isLoopbackServerAddress(endpoint.server_address) ||
    Number(endpoint.server_port) !== Number(HOSPITAL_MASTER_TARGET.port)
  ) {
    throw new Error('Connected PostgreSQL endpoint rejected; only local healthcare_platform_test on port 5432 is permitted.')
  }
}

async function guardedQuery(client, sql, values = []) {
  await verifyHospitalMasterEndpoint(client)
  return client.query(sql, values)
}

async function assertRequiredSchema(client) {
  const relations = await guardedQuery(client, REQUIRED_RELATIONS_SQL)
  const schema = relations.rows[0]
  if (!schema?.observations || !schema?.hospitals || !schema?.verifications) {
    throw new Error('Required hospital/source schema is missing; review and apply the prerequisite migrations before running this workflow.')
  }
  if (!schema.has_source_row_payload) {
    throw new Error('Migration 005 is required: the bulk planner needs the original source payload for fail-closed validation.')
  }
  if (!schema.reviews) {
    throw new Error('Migration 006 is required: the bulk planner must read reviewed pair decisions before releasing unresolved observations.')
  }
}

async function readImportSnapshot(client, { lockObservations = false } = {}) {
  await assertRequiredSchema(client)
  const observationsQuery = lockObservations
    ? `${SOURCE_OBSERVATIONS_SQL}`
    : SOURCE_OBSERVATIONS_SQL.replace(/\s+FOR UPDATE\s*$/i, '')
  const observationResult = await guardedQuery(client, observationsQuery)
  const hospitalResult = await guardedQuery(client, EXISTING_HOSPITALS_SQL)
  const reviewResult = await guardedQuery(client, REVIEW_DECISIONS_SQL)
  return {
    observations: observationResult.rows,
    hospitals: hospitalResult.rows,
    reviewDecisions: reviewResult.rows,
  }
}

async function withTransaction(client, mode, operation) {
  await client.query(mode === 'read-only' ? 'BEGIN READ ONLY' : 'BEGIN ISOLATION LEVEL SERIALIZABLE')
  try {
    const result = await operation()
    await client.query('COMMIT')
    return result
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Hospital master import failed and transaction rollback also failed.')
    }
    throw error
  }
}

export async function executeHospitalMasterImport(client, { writeMode = false } = {}) {
  return withTransaction(client, writeMode ? 'write' : 'read-only', async () => {
    const snapshot = await readImportSnapshot(client, { lockObservations: writeMode })
    const plan = buildHospitalMasterImportPlan(snapshot)
    if (!writeMode) return plan
    if (plan.counts.conflicts > 0) {
      const error = new Error('Write mode stopped because source identity or provenance conflicts require manual review.')
      error.report = plan
      throw error
    }

    const created = []
    for (const proposed of plan.proposedDraftHospitalRecords) {
      const insert = await guardedQuery(
        client,
        `INSERT INTO public.hospitals (
           public_name, public_listing_status, public_source_name, public_source_reference
         ) VALUES ($1, 'draft', 'PM-JAY source observation', $2)
         RETURNING id::text AS id`,
        [proposed.proposedHospitalName, proposed.publicSourceReference],
      )
      const hospitalId = insert.rows[0]?.id
      if (!hospitalId) throw new Error('Draft hospital insert did not return an ID.')

      const link = await guardedQuery(
        client,
        `UPDATE public.hospital_source_observations
         SET hospital_id = $1
         WHERE id = $2 AND hospital_id IS NULL`,
        [hospitalId, proposed.sourceObservationIds[0]],
      )
      if (link.rowCount !== 1) {
        throw new Error('A source observation link changed during the transaction; all changes were rolled back.')
      }

      await guardedQuery(
        client,
        `INSERT INTO public.audit_logs (action, entity_type, entity_id, metadata)
         VALUES (
           'hospital_master_import.draft_created',
           'hospital',
           $1,
           $2::jsonb
         )`,
        [
          hospitalId,
          JSON.stringify({
            source_observation_ids: proposed.sourceObservationIds,
            source_system: proposed.sourceSystem,
            source_hospital_ids: proposed.sourceHospitalIds,
            source_document: proposed.sourceDocument,
            source_page: proposed.sourcePage,
            pdf_entry_number: proposed.pdfEntryNumber,
            public_source_reference: proposed.publicSourceReference,
            listing_status: 'draft',
          }),
        ],
      )
      created.push({
        hospitalId,
        sourceObservationIds: proposed.sourceObservationIds,
      })
    }

    return {
      ...plan,
      mode: 'write',
      databaseWritesPerformed: created.length > 0,
      createdDraftHospitalRecords: created,
    }
  })
}

export async function runHospitalMasterImport(args = process.argv.slice(2), environment = process.env) {
  const options = parseHospitalMasterImportArguments(args)
  assertHospitalMasterTarget(options, environment)
  const { Pool } = pg
  const pool = new Pool({
    host: options.host,
    port: Number(options.port),
    database: options.database,
    user: environment.PGUSER || 'postgres',
    password: environment.PGPASSWORD,
    max: 1,
    connectionTimeoutMillis: 5000,
    statement_timeout: 15000,
    application_name: 'hospital-master-import',
  })

  try {
    const client = await pool.connect()
    try {
      const report = await executeHospitalMasterImport(client, { writeMode: options.writeMode })
      console.log(JSON.stringify(report, null, 2))
      return report
    } catch (error) {
      if (error?.report) console.log(JSON.stringify(error.report, null, 2))
      throw error
    } finally {
      client.release()
    }
  } finally {
    await pool.end()
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  runHospitalMasterImport().catch((error) => {
    const code = error?.code ? ` (${error.code})` : ''
    console.error(`Hospital master import failed${code}: ${error?.message ?? 'unknown error'}`)
    process.exitCode = 1
  })
}
