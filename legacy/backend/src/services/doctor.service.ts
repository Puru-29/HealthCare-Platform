import type { QueryResultRow } from 'pg'
import { pool } from '../db/pool.js'
import { assertSafeDatabaseEndpoint } from '../db/target.js'
import type { DoctorQuery } from '../middleware/validate.js'

export interface DoctorListing {
  id: string
  name: string
  specialty: string
  hospitalId: string
  hospitalName: string
  city: string
}

interface DoctorRow extends QueryResultRow, DoctorListing {}

export interface DoctorPage {
  data: DoctorListing[]
  pagination: {
    limit: number
    offset: number
    total: number
  }
}

export interface DoctorAffiliation {
  hospitalId: string
  hospitalName: string
  city: string
  title: string | null
  address: string | null
  phone: string | null
  website: string | null
}

export interface DoctorDetail {
  id: string
  name: string
  specialty: string
  affiliations: DoctorAffiliation[]
}

function buildDoctorFilters(
  query: DoctorQuery,
  doctorId?: string,
): { clauses: string[]; values: (string | number)[] } {
  const clauses = [
    'd.is_publicly_listed',
    "d.verification_status = 'verified'",
    'd.verified_display_name IS NOT NULL',
    'd.verified_specialty IS NOT NULL',
    "a.status = 'active'",
    'a.is_publicly_listed',
    "h.public_listing_status = 'published'",
    "v.status = 'verified'",
    '(v.expires_at IS NULL OR v.expires_at > now())',
    "lower(btrim(COALESCE(v.verified_city, ''))) = 'sonipat'",
  ]
  const values: (string | number)[] = []
  const addValue = (value: string): string => {
    values.push(value)
    return `$${values.length}`
  }

  if (query.search) {
    const term = addValue(`%${query.search}%`)
    clauses.push(`(d.verified_display_name ILIKE ${term} OR d.verified_specialty ILIKE ${term})`)
  }
  if (query.specialty) {
    clauses.push(`d.verified_specialty ILIKE ${addValue(`%${query.specialty}%`)}`)
  }
  if (doctorId) clauses.push(`d.id = ${addValue(doctorId)}`)
  return { clauses, values }
}

const doctorSelect = `
  d.id,
  d.verified_display_name AS "name",
  d.verified_specialty AS "specialty",
  h.id AS "hospitalId",
  v.verified_name AS "hospitalName",
  v.verified_city AS "city"
`

const doctorJoins = `
  FROM doctors AS d
  JOIN doctor_hospital_affiliations AS a ON a.doctor_id = d.id
  JOIN hospitals AS h ON h.id = a.hospital_id
  JOIN current_hospital_verification AS v ON v.hospital_id = h.id
`

export async function findDoctors(query: DoctorQuery): Promise<DoctorPage> {
  await assertSafeDatabaseEndpoint(pool)
  const { clauses, values } = buildDoctorFilters(query)
  const whereClause = clauses.join(' AND ')
  const countResult = await pool.query<{ total: number }>(
    `SELECT COUNT(*)::int AS total ${doctorJoins} WHERE ${whereClause}`,
    values,
  )
  const pageValues = [...values, query.limit, query.offset]
  const result = await pool.query<DoctorRow>(
    `SELECT ${doctorSelect}
     ${doctorJoins}
     WHERE ${whereClause}
     ORDER BY lower(d.verified_display_name), h.id
     LIMIT $${pageValues.length - 1}
     OFFSET $${pageValues.length}`,
    pageValues,
  )

  return {
    data: result.rows,
    pagination: {
      limit: query.limit,
      offset: query.offset,
      total: countResult.rows[0]?.total ?? 0,
    },
  }
}

export async function findDoctorById(doctorId: string): Promise<DoctorDetail | null> {
  await assertSafeDatabaseEndpoint(pool)
  const { clauses, values } = buildDoctorFilters({
    limit: 1,
    offset: 0,
  }, doctorId)
  const result = await pool.query<DoctorListing & {
    title: string | null
    address: string | null
    phone: string | null
    website: string | null
  }>(
    `SELECT ${doctorSelect},
            a.public_title AS "title",
            v.verified_address AS "address",
            v.verified_phone AS "phone",
            v.verified_website AS "website"
     ${doctorJoins}
     WHERE ${clauses.join(' AND ')}
     ORDER BY lower(v.verified_name), h.id`,
    values,
  )

  const rows = result.rows
  const first = rows[0]
  if (!first) return null

  return {
    id: first.id,
    name: first.name,
    specialty: first.specialty,
    affiliations: rows.map((row) => ({
      hospitalId: row.hospitalId,
      hospitalName: row.hospitalName,
      city: row.city,
      title: row.title,
      address: row.address,
      phone: row.phone,
      website: row.website,
    })),
  }
}
