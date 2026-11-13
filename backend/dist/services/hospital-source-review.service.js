import { isIP } from 'node:net';
import { AppError } from '../errors/app-error.js';
import { writePool } from '../db/pool.js';
const REVIEW_TARGET = {
    database: 'healthcare_platform_test',
    port: 5432,
};
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
];
const SOURCE_OBSERVATION_SELECT = `
  SELECT
    id::text,
    hospital_id::text,
    source_system,
    source_hospital_id,
    source_document,
    source_date::text AS source_date,
    source_page,
    source_hospital_name,
    source_ownership_type,
    source_row_payload
  FROM hospital_source_observations
`;
function entryNumber(observation) {
    const value = observation.source_row_payload?.pdf_entry_number;
    if (typeof value !== 'string' || !/^\d+$/.test(value)) {
        throw new AppError(409, 'SOURCE_REVIEW_INVALID', 'The source observation has no valid PDF entry number.');
    }
    return value;
}
function compareEntryNumbers(left, right) {
    return Number(left) - Number(right);
}
export function expectedSourceReviewId(first, second) {
    if (first.source_document !== second.source_document) {
        throw new AppError(400, 'SOURCE_REVIEW_PAIR_MISMATCH', 'The observations must reference the same source document.');
    }
    const firstEntry = first.source_row_payload?.pdf_entry_number;
    const secondEntry = second.source_row_payload?.pdf_entry_number;
    if (typeof firstEntry !== 'string' || !/^\d+$/.test(firstEntry) ||
        typeof secondEntry !== 'string' || !/^\d+$/.test(secondEntry)) {
        throw new AppError(409, 'SOURCE_REVIEW_INVALID', 'The source observations have invalid PDF entry numbers.');
    }
    const entries = [firstEntry, secondEntry]
        .sort(compareEntryNumbers);
    if (entries[0] === entries[1]) {
        throw new AppError(400, 'SOURCE_REVIEW_PAIR_MISMATCH', 'The observations must have distinct PDF entry numbers.');
    }
    return `${first.source_document}#entries-${entries.join('-')}`;
}
function assertObservationIsUnverified(observation) {
    const payload = observation.source_row_payload;
    const completePayload = payload &&
        typeof payload === 'object' &&
        !Array.isArray(payload) &&
        SOURCE_ROW_FIELDS.every((field) => typeof payload[field] === 'string') &&
        Object.values(payload).every((value) => typeof value === 'string');
    if (!completePayload ||
        payload.verification_status !== 'unverified' ||
        typeof payload.hospital_name !== 'string' ||
        payload.hospital_name !== observation.source_hospital_name ||
        typeof payload.hospital_id !== 'string' ||
        payload.hospital_id.toLowerCase() !== observation.source_hospital_id.toLowerCase() ||
        payload.source_document !== observation.source_document ||
        payload.source_date !== observation.source_date ||
        !/^[A-Za-z0-9][A-Za-z0-9._-]*\.pdf$/i.test(observation.source_document) ||
        observation.source_system !== 'pm-jay') {
        throw new AppError(409, 'SOURCE_OBSERVATION_NOT_ELIGIBLE', 'The source observation is incomplete or not unverified.');
    }
}
function normalizeHospitalName(value) {
    return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
}
function isLoopbackServerAddress(address) {
    if (typeof address !== 'string')
        return false;
    const [ipAddress, prefix, ...extra] = address.split('/');
    if (extra.length || !ipAddress)
        return false;
    const version = isIP(ipAddress);
    if (!version)
        return false;
    if (prefix !== undefined &&
        (!/^\d+$/.test(prefix) || Number(prefix) > (version === 4 ? 32 : 128)))
        return false;
    if (version === 4)
        return Number(ipAddress.split('.')[0]) === 127;
    if (ipAddress.includes('%') || ipAddress.includes('.'))
        return false;
    const halves = ipAddress.split('::');
    if (halves.length > 2)
        return false;
    const left = halves[0] ? halves[0].split(':') : [];
    const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
    const explicit = [...left, ...right];
    if (explicit.some((group) => !/^[0-9a-f]{1,4}$/i.test(group)))
        return false;
    if (halves.length === 1 && explicit.length !== 8)
        return false;
    if (halves.length === 2 && explicit.length >= 8)
        return false;
    const groups = halves.length === 1
        ? explicit
        : [...left, ...Array(8 - explicit.length).fill('0'), ...right];
    return groups.length === 8 &&
        groups.slice(0, 7).every((group) => Number.parseInt(group, 16) === 0) &&
        Number.parseInt(groups[7], 16) === 1;
}
function compactName(value) {
    return normalizeHospitalName(value).replace(/[^\p{L}\p{N}]+/gu, '');
}
function editDistance(left, right) {
    let previous = Array.from({ length: right.length + 1 }, (_value, index) => index);
    for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
        const current = [leftIndex];
        for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
            current[rightIndex] = Math.min(current[rightIndex - 1] + 1, previous[rightIndex] + 1, previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1));
        }
        previous = current;
    }
    return previous[right.length];
}
function arePossibleDuplicateNames(left, right) {
    const normalizedLeft = compactName(left);
    const normalizedRight = compactName(right);
    if (!normalizedLeft || !normalizedRight)
        return false;
    if (normalizedLeft === normalizedRight)
        return true;
    const maximumLength = Math.max(normalizedLeft.length, normalizedRight.length);
    if (maximumLength < 5)
        return false;
    if (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft))
        return true;
    return 1 - editDistance(normalizedLeft, normalizedRight) / maximumLength >= 0.88;
}
async function writeAudit(client, action, entityId, metadata) {
    await client.query(`INSERT INTO audit_logs (action, entity_type, entity_id, metadata)
     VALUES ($1, 'hospital_source_observation_review', $2, $3::jsonb)`, [action, entityId, JSON.stringify(metadata)]);
}
async function withTransaction(client, operation, readOnly = false) {
    await client.query(readOnly ? 'BEGIN READ ONLY' : 'BEGIN');
    try {
        const endpoint = await client.query(`
      SELECT current_database() AS database_name,
             inet_server_addr()::text AS server_address,
             inet_server_port() AS server_port
    `);
        const connected = endpoint.rows[0];
        if (connected?.database_name !== REVIEW_TARGET.database ||
            !isLoopbackServerAddress(connected.server_address) ||
            Number(connected.server_port) !== REVIEW_TARGET.port) {
            throw new AppError(503, 'SOURCE_REVIEW_TARGET_REJECTED', 'Source review writes require the local healthcare_platform_test database.');
        }
        const result = await operation();
        await client.query('COMMIT');
        return result;
    }
    catch (error) {
        try {
            await client.query('ROLLBACK');
        }
        catch (rollbackError) {
            throw new AggregateError([error, rollbackError], 'Hospital source-review operation failed and rollback also failed.');
        }
        throw error;
    }
}
export async function listUnlinkedSourceObservations(limit, offset) {
    const client = await writePool.connect();
    try {
        return await withTransaction(client, async () => {
            const count = await client.query(`SELECT COUNT(*)::int AS total
         FROM hospital_source_observations
         WHERE hospital_id IS NULL`);
            const rows = await client.query(`SELECT
           o.id::text AS "sourceObservationId",
           o.source_system AS "sourceSystem",
           o.source_hospital_id AS "sourceHospitalId",
           o.source_document AS "sourceDocument",
           o.source_date::text AS "sourceDate",
           o.source_page AS "sourcePage",
           o.source_hospital_name AS "sourceHospitalName",
           o.source_ownership_type AS "sourceOwnershipType",
           o.source_row_payload ->> 'pdf_entry_number' AS "pdfEntryNumber",
           COALESCE(latest.decision, 'unresolved') AS "reviewDecision",
           latest.reason AS "reviewReason",
           latest.evidence_reference AS "evidenceReference",
           latest.reviewer AS "reviewer",
           latest.reviewed_at AS "reviewedAt"
         FROM hospital_source_observations o
         LEFT JOIN LATERAL (
           SELECT d.decision, d.reason, d.evidence_reference, d.reviewer, d.reviewed_at
           FROM hospital_source_observation_review_decisions d
           WHERE d.source_observation_a_id = o.id
              OR d.source_observation_b_id = o.id
           ORDER BY d.decision_number DESC
           LIMIT 1
         ) latest ON true
         WHERE o.hospital_id IS NULL
         ORDER BY o.source_date DESC, o.source_document, o.source_page NULLS LAST, o.id
         LIMIT $1 OFFSET $2`, [limit, offset]);
            return {
                data: rows.rows,
                pagination: { limit, offset, total: count.rows[0]?.total ?? 0 },
            };
        }, true);
    }
    finally {
        client.release();
    }
}
export async function recordSourceObservationReviewDecision(input, reviewer) {
    const client = await writePool.connect();
    try {
        return await withTransaction(client, async () => {
            const sortedIds = [...input.sourceObservationIds].sort();
            const observations = await client.query(`${SOURCE_OBSERVATION_SELECT}
         WHERE id = ANY($1::uuid[])
         ORDER BY id
         FOR UPDATE`, [sortedIds]);
            if (observations.rows.length !== 2) {
                throw new AppError(404, 'SOURCE_OBSERVATION_NOT_FOUND', 'Both source observations must exist.');
            }
            const first = observations.rows[0];
            const second = observations.rows[1];
            if (!first || !second) {
                throw new AppError(404, 'SOURCE_OBSERVATION_NOT_FOUND', 'Both source observations must exist.');
            }
            assertObservationIsUnverified(first);
            assertObservationIsUnverified(second);
            if (first.hospital_id || second.hospital_id) {
                throw new AppError(409, 'SOURCE_OBSERVATION_ALREADY_LINKED', 'Linked source observations cannot be re-reviewed as an unlinked pair.');
            }
            const expectedReviewId = expectedSourceReviewId(first, second);
            if (first.source_system !== second.source_system) {
                throw new AppError(400, 'SOURCE_REVIEW_PAIR_MISMATCH', 'The observations must use the same source system.');
            }
            if (input.reviewId !== expectedReviewId) {
                throw new AppError(400, 'SOURCE_REVIEW_PAIR_MISMATCH', 'Review ID does not match the selected source entries.');
            }
            const inserted = await client.query(`INSERT INTO hospital_source_observation_review_decisions (
           review_id, source_observation_a_id, source_observation_b_id,
           decision, reason, evidence_reference, reviewer
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id::text, review_id, source_observation_a_id::text,
                   source_observation_b_id::text, decision_number::text, decision, reason,
                   evidence_reference, reviewer, reviewed_at`, [
                input.reviewId,
                first.id,
                second.id,
                input.decision,
                input.reason,
                input.evidenceReference,
                reviewer,
            ]);
            const decision = inserted.rows[0];
            if (!decision)
                throw new Error('Review decision insert did not return a row.');
            await writeAudit(client, 'hospital_source_review.decision_recorded', decision.id, {
                admin_username: reviewer,
                review_id: decision.review_id,
                decision: decision.decision,
                reason: decision.reason,
                source_observation_ids: [decision.source_observation_a_id, decision.source_observation_b_id],
                evidence_reference: decision.evidence_reference,
            });
            return {
                id: decision.id,
                reviewId: decision.review_id,
                decision: decision.decision,
                reviewer: decision.reviewer,
                reviewedAt: decision.reviewed_at,
            };
        });
    }
    finally {
        client.release();
    }
}
export async function createDraftHospitalsFromReviewedPair(reviewId, reviewer) {
    const client = await writePool.connect();
    try {
        return await withTransaction(client, async () => {
            const currentDecision = await client.query(`SELECT
           id::text, review_id, source_observation_a_id::text,
           source_observation_b_id::text, decision_number::text, decision, reason,
           evidence_reference, reviewer, reviewed_at
         FROM hospital_source_observation_review_decisions
         WHERE review_id = $1
         ORDER BY decision_number DESC
         LIMIT 1
         `, [reviewId]);
            const initialDecision = currentDecision.rows[0];
            if (!initialDecision) {
                throw new AppError(404, 'SOURCE_REVIEW_NOT_FOUND', 'A recorded review decision was not found.');
            }
            const observations = await client.query(`${SOURCE_OBSERVATION_SELECT}
         WHERE id = ANY($1::uuid[])
         ORDER BY id
         FOR UPDATE`, [[initialDecision.source_observation_a_id, initialDecision.source_observation_b_id]]);
            if (observations.rows.length !== 2) {
                throw new AppError(409, 'SOURCE_REVIEW_PAIR_MISMATCH', 'The reviewed source observations are no longer available.');
            }
            const first = observations.rows[0];
            const second = observations.rows[1];
            if (!first || !second) {
                throw new AppError(409, 'SOURCE_REVIEW_PAIR_MISMATCH', 'The reviewed source observations are no longer available.');
            }
            const latestDecision = await client.query(`SELECT
           id::text, review_id, source_observation_a_id::text,
           source_observation_b_id::text, decision_number::text, decision, reason,
           evidence_reference, reviewer, reviewed_at
         FROM hospital_source_observation_review_decisions
         WHERE review_id = $1
         ORDER BY decision_number DESC
         LIMIT 1
         FOR UPDATE`, [reviewId]);
            const decision = latestDecision.rows[0];
            if (!decision || decision.id !== initialDecision.id) {
                throw new AppError(409, 'SOURCE_REVIEW_CHANGED', 'The review decision changed while the operation was starting; retry after review.');
            }
            if (decision.decision !== 'different_hospitals') {
                throw new AppError(409, 'SOURCE_REVIEW_NOT_APPROVED', 'Only a reviewed different_hospitals decision can create draft records.');
            }
            if (expectedSourceReviewId(first, second) !== reviewId) {
                throw new AppError(409, 'SOURCE_REVIEW_PAIR_MISMATCH', 'The review no longer matches its source entries.');
            }
            for (const observation of observations.rows)
                assertObservationIsUnverified(observation);
            if (first.hospital_id || second.hospital_id) {
                if (first.hospital_id && second.hospital_id) {
                    const previousCreation = await client.query(`SELECT metadata
             FROM audit_logs
             WHERE action = 'hospital_source_review.draft_pair_created'
               AND entity_type = 'hospital_source_observation_review'
               AND entity_id = $1
             LIMIT 1`, [decision.id]);
                    const priorHospitalIds = previousCreation.rows[0]?.metadata.hospital_ids;
                    if (priorHospitalIds?.length === 2 &&
                        priorHospitalIds.includes(first.hospital_id) &&
                        priorHospitalIds.includes(second.hospital_id)) {
                        return { reviewId, hospitalIds: priorHospitalIds, alreadyCreated: true };
                    }
                }
                throw new AppError(409, 'SOURCE_OBSERVATION_ALREADY_LINKED', 'One or both source observations are already linked.');
            }
            const hospitalNames = await client.query(`SELECT id::text, public_name, public_source_reference
         FROM hospitals`);
            const candidates = observations.rows.map((observation) => {
                const entry = entryNumber(observation);
                const reference = `${observation.source_document}#page=${observation.source_page ?? 'unknown'}&entry=${entry}`;
                const name = observation.source_hospital_name;
                return { observation, entry, reference, name };
            });
            const firstCandidate = candidates[0];
            const secondCandidate = candidates[1];
            if (!firstCandidate || !secondCandidate) {
                throw new AppError(409, 'SOURCE_REVIEW_PAIR_MISMATCH', 'The reviewed source observations are no longer available.');
            }
            if (normalizeHospitalName(firstCandidate.name) === normalizeHospitalName(secondCandidate.name)) {
                throw new AppError(409, 'POSSIBLE_HOSPITAL_DUPLICATE', 'The reviewed entries have identical names; a separate duplicate review is required.');
            }
            for (const candidate of candidates) {
                const possibleMatches = hospitalNames.rows.filter((hospital) => hospital.public_source_reference === candidate.reference ||
                    arePossibleDuplicateNames(hospital.public_name, candidate.name));
                if (possibleMatches.length) {
                    throw new AppError(409, 'POSSIBLE_HOSPITAL_DUPLICATE', 'A possible existing hospital match requires separate manual review.');
                }
            }
            const hospitalIds = [];
            for (const candidate of candidates) {
                const created = await client.query(`INSERT INTO hospitals (
             public_name, public_listing_status, public_source_name, public_source_reference
           ) VALUES ($1, 'draft', 'PM-JAY source observation', $2)
           RETURNING id::text`, [candidate.name, candidate.reference]);
                const hospitalId = created.rows[0]?.id;
                if (!hospitalId)
                    throw new Error('Hospital draft insert did not return an ID.');
                const linked = await client.query(`UPDATE hospital_source_observations
           SET hospital_id = $1
           WHERE id = $2 AND hospital_id IS NULL`, [hospitalId, candidate.observation.id]);
                if (linked.rowCount !== 1) {
                    throw new AppError(409, 'SOURCE_OBSERVATION_ALREADY_LINKED', 'A source observation was linked concurrently.');
                }
                hospitalIds.push(hospitalId);
            }
            await writeAudit(client, 'hospital_source_review.draft_pair_created', decision.id, {
                admin_username: reviewer,
                review_id: reviewId,
                decision: decision.decision,
                reason: decision.reason,
                evidence_reference: decision.evidence_reference,
                source_observation_ids: [first.id, second.id],
                hospital_ids: hospitalIds,
                created_fields: ['public_name', 'public_listing_status', 'public_source_name', 'public_source_reference'],
            });
            return { reviewId, hospitalIds, alreadyCreated: false };
        });
    }
    finally {
        client.release();
    }
}
