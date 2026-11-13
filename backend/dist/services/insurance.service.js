import { pool } from '../db/pool.js';
import { assertSafeDatabaseEndpoint } from '../db/target.js';
const joins = `
  FROM insurance_hospital_networks AS n
  JOIN insurance_providers AS p ON p.id = n.insurance_provider_id AND p.is_active
  JOIN hospitals AS h ON h.id = n.hospital_id AND h.public_listing_status = 'published'
  JOIN current_hospital_verification AS v ON v.hospital_id = h.id
`;
const trustedNetworkClauses = [
    "n.status = 'in_network'",
    "n.source_type = 'insurer'",
    "n.source_name IS NOT NULL",
    "n.source_reference IS NOT NULL",
    'n.last_verified_at IS NOT NULL',
    '(n.valid_from IS NULL OR n.valid_from <= CURRENT_DATE)',
    '(n.valid_until IS NULL OR n.valid_until >= CURRENT_DATE)',
    "v.status = 'verified'",
    '(v.expires_at IS NULL OR v.expires_at > now())',
    "lower(btrim(COALESCE(v.verified_city, ''))) = 'sonipat'",
];
export async function findInsuranceNetworks(query) {
    await assertSafeDatabaseEndpoint(pool);
    const clauses = [...trustedNetworkClauses];
    const values = [];
    if (query.search) {
        values.push(`%${query.search}%`);
        const term = `$${values.length}`;
        const searchableFields = query.searchField === 'provider'
            ? [`p.name ILIKE ${term}`]
            : query.searchField === 'plan'
                ? [`n.plan_name ILIKE ${term}`]
                : query.searchField === 'hospital'
                    ? [`v.verified_name ILIKE ${term}`]
                    : [`p.name ILIKE ${term}`, `n.plan_name ILIKE ${term}`, `v.verified_name ILIKE ${term}`];
        clauses.push(`(${searchableFields.join(' OR ')})`);
    }
    const whereClause = clauses.join(' AND ');
    const count = await pool.query(`SELECT COUNT(*)::int AS total ${joins} WHERE ${whereClause}`, values);
    const pageValues = [...values, query.limit, query.offset];
    const result = await pool.query(`SELECT n.id,
            p.name AS "providerName",
            n.plan_name AS "planName",
            h.id AS "hospitalId",
            v.verified_name AS "hospitalName",
            v.verified_city AS "city",
            n.last_verified_at AS "verifiedAt"
     ${joins}
     WHERE ${whereClause}
     ORDER BY lower(p.name), lower(n.plan_name), h.id
     LIMIT $${pageValues.length - 1}
     OFFSET $${pageValues.length}`, pageValues);
    return {
        data: result.rows,
        pagination: {
            limit: query.limit,
            offset: query.offset,
            total: count.rows[0]?.total ?? 0,
        },
    };
}
