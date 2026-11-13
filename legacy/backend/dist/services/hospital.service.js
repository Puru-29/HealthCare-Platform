import { pool } from '../db/pool.js';
import { assertSafeDatabaseEndpoint } from '../db/target.js';
function buildHospitalFilters(query) {
    const clauses = [
        "h.public_listing_status = 'published'",
        "v.status = 'verified'",
        '(v.expires_at IS NULL OR v.expires_at > now())',
        'lower(btrim(COALESCE(v.verified_city, \'\'))) = lower($1)',
    ];
    const values = [];
    values.push(query.city);
    const addValue = (value) => {
        values.push(value);
        return `$${values.length}`;
    };
    if (query.search) {
        const parameter = addValue(`%${query.search}%`);
        clauses.push(`(
      v.verified_name ILIKE ${parameter}
      OR COALESCE(v.verified_address, '') ILIKE ${parameter}
      OR COALESCE(v.verified_city, '') ILIKE ${parameter}
      OR COALESCE(v.verified_region, '') ILIKE ${parameter}
      OR COALESCE(v.verified_postal_code, '') ILIKE ${parameter}
      OR COALESCE(v.verified_facility_type, '') ILIKE ${parameter}
    )`);
    }
    if (query.facilityType) {
        clauses.push(`v.verified_facility_type ILIKE ${addValue(`%${query.facilityType}%`)}`);
    }
    if (query.specialty) {
        const parameter = addValue(`%${query.specialty}%`);
        clauses.push(`EXISTS (
      SELECT 1
      FROM hospital_services AS hs
      WHERE hs.hospital_id = h.id
        AND hs.is_publicly_listed
        AND hs.verification_status = 'verified'
        AND hs.verified_specialty_name ILIKE ${parameter}
    )`);
    }
    return { clauses, values };
}
const hospitalSelect = `
  h.id,
  v.verified_name AS "name",
  v.verified_address AS "address",
  v.verified_city AS "city",
  v.verified_region AS "region",
  v.verified_postal_code AS "postalCode",
  v.verified_phone AS "phone",
  v.verified_website AS "website",
  NULL::text AS "description",
  v.verified_facility_type AS "facilityType",
  ST_Y(v.verified_location::geometry)::double precision AS "latitude",
  ST_X(v.verified_location::geometry)::double precision AS "longitude",
  h.created_at AS "createdAt",
  h.updated_at AS "updatedAt"
`;
export async function findHospitals(query) {
    await assertSafeDatabaseEndpoint(pool);
    const { clauses, values } = buildHospitalFilters(query);
    const whereClause = clauses.join(' AND ');
    const countResult = await pool.query(`SELECT COUNT(*)::int AS total
     FROM hospitals AS h
     JOIN current_hospital_verification AS v ON v.hospital_id = h.id
     WHERE ${whereClause}`, values);
    const pageValues = [...values, query.limit, query.offset];
    const result = await pool.query(`SELECT ${hospitalSelect}
     FROM hospitals AS h
     JOIN current_hospital_verification AS v ON v.hospital_id = h.id
     WHERE ${whereClause}
     ORDER BY lower(v.verified_name), h.id
     LIMIT $${pageValues.length - 1}
     OFFSET $${pageValues.length}`, pageValues);
    return {
        data: result.rows,
        pagination: {
            limit: query.limit,
            offset: query.offset,
            total: countResult.rows[0]?.total ?? 0,
        },
    };
}
export async function findHospitalById(id) {
    await assertSafeDatabaseEndpoint(pool);
    const result = await pool.query(`SELECT ${hospitalSelect}
     FROM hospitals AS h
     JOIN current_hospital_verification AS v ON v.hospital_id = h.id
     WHERE h.id = $1
       AND h.public_listing_status = 'published'
       AND v.status = 'verified'
       AND (v.expires_at IS NULL OR v.expires_at > now())
       AND lower(btrim(COALESCE(v.verified_city, ''))) = 'sonipat'`, [id]);
    return result.rows[0] ?? null;
}
