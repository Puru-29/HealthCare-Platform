import { AppError } from '../errors/app-error.js';
import { pool, writePool } from '../db/pool.js';
function hospitalColumns() {
    return `
    h.id,
    h.public_name AS "name",
    h.public_address AS "address",
    h.public_city AS "city",
    h.public_region AS "region",
    h.public_postal_code AS "postalCode",
    h.public_phone AS "phone",
    h.public_website AS "website",
    h.public_description AS "description",
    h.public_facility_type AS "facilityType",
    ST_Y(h.public_location::geometry)::double precision AS "latitude",
    ST_X(h.public_location::geometry)::double precision AS "longitude",
    h.public_listing_status::text AS "listingStatus",
    COALESCE(v.status::text, 'unverified') AS "verificationStatus",
    v.source_type::text AS "verificationSourceType",
    v.source_name AS "verificationSourceName",
    v.source_reference AS "verificationSourceReference",
    v.last_verified_at AS "lastVerifiedAt",
    v.expires_at AS "verificationExpiresAt",
    COALESCE((
      SELECT array_agg(hs.public_specialty_name ORDER BY lower(hs.public_specialty_name))
      FROM hospital_services hs
      WHERE hs.hospital_id = h.id AND hs.is_publicly_listed
    ), ARRAY[]::text[]) AS specialties,
    h.created_at AS "createdAt",
    h.updated_at AS "updatedAt"
  `;
}
function hospitalListWhere(query) {
    const clauses = ['TRUE'];
    const values = [];
    const add = (value) => {
        values.push(value);
        return `$${values.length}`;
    };
    if (query.search) {
        const term = add(`%${query.search}%`);
        clauses.push(`(
      h.public_name ILIKE ${term}
      OR COALESCE(h.public_city, '') ILIKE ${term}
      OR COALESCE(h.public_address, '') ILIKE ${term}
      OR COALESCE(h.public_phone, '') ILIKE ${term}
    )`);
    }
    if (query.listingStatus)
        clauses.push(`h.public_listing_status = ${add(query.listingStatus)}::hospital_listing_status`);
    if (query.verificationStatus === 'unverified') {
        clauses.push('v.status IS NULL');
    }
    else if (query.verificationStatus) {
        clauses.push(`v.status = ${add(query.verificationStatus)}::hospital_verification_status`);
    }
    return { where: clauses.join(' AND '), values };
}
export async function listAdminHospitals(query) {
    const { where, values } = hospitalListWhere(query);
    const count = await pool.query(`SELECT COUNT(*)::int AS total
     FROM hospitals h
     LEFT JOIN hospital_verification_records v ON v.hospital_id = h.id AND v.is_current
     WHERE ${where}`, values);
    const result = await pool.query(`SELECT ${hospitalColumns()}
     FROM hospitals h
     LEFT JOIN hospital_verification_records v ON v.hospital_id = h.id AND v.is_current
     WHERE ${where}
     ORDER BY h.updated_at DESC, h.id
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, [...values, query.limit, query.offset]);
    return {
        data: result.rows,
        pagination: { limit: query.limit, offset: query.offset, total: count.rows[0]?.total ?? 0 },
    };
}
export async function getAdminHospital(id) {
    const result = await pool.query(`SELECT ${hospitalColumns()}
     FROM hospitals h
     LEFT JOIN hospital_verification_records v ON v.hospital_id = h.id AND v.is_current
     WHERE h.id = $1`, [id]);
    return result.rows[0] ?? null;
}
async function writeAudit(client, username, action, entityType, entityId, changedFields) {
    await client.query(`INSERT INTO audit_logs (action, entity_type, entity_id, metadata)
     VALUES ($1, $2, $3, $4::jsonb)`, [action, entityType, entityId, JSON.stringify({
            admin_username: username,
            changed_fields: changedFields,
        })]);
}
export async function saveAdminHospital(id, input, username) {
    const client = await writePool.connect();
    try {
        await client.query('BEGIN');
        let hospitalId = id;
        const values = [
            input.name, input.address, input.city, input.region, input.postalCode,
            input.phone, input.website, input.description, input.facilityType,
            input.latitude, input.longitude, input.listingStatus,
        ];
        if (hospitalId) {
            const updated = await client.query(`UPDATE hospitals SET
           public_name = $1, public_address = $2, public_city = $3, public_region = $4,
           public_postal_code = $5, public_phone = $6, public_website = $7,
           public_description = $8, public_facility_type = $9,
           public_location = CASE WHEN $10::double precision IS NULL THEN NULL
             ELSE ST_SetSRID(ST_MakePoint($11, $10), 4326)::geography END,
           public_listing_status = $12, updated_at = now()
         WHERE id = $13`, [...values, hospitalId]);
            if (updated.rowCount === 0)
                throw new AppError(404, 'HOSPITAL_NOT_FOUND', 'Hospital was not found.');
        }
        else {
            const inserted = await client.query(`INSERT INTO hospitals (
           public_name, public_address, public_city, public_region, public_postal_code,
           public_phone, public_website, public_description, public_facility_type,
           public_location, public_listing_status
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9,
           CASE WHEN $10::double precision IS NULL THEN NULL
             ELSE ST_SetSRID(ST_MakePoint($11, $10), 4326)::geography END,
           $12
         ) RETURNING id`, values);
            hospitalId = inserted.rows[0].id;
        }
        await client.query('UPDATE hospital_services SET is_publicly_listed = false, updated_at = now() WHERE hospital_id = $1', [hospitalId]);
        for (const specialty of input.specialties) {
            const existing = await client.query(`UPDATE hospital_services
         SET public_specialty_name = $2, is_publicly_listed = true, updated_at = now()
         WHERE id = (
           SELECT id FROM hospital_services
           WHERE hospital_id = $1 AND lower(public_specialty_name) = lower($2)
           ORDER BY created_at, id LIMIT 1
         )
         RETURNING id`, [hospitalId, specialty]);
            if (existing.rowCount === 0) {
                await client.query(`INSERT INTO hospital_services (hospital_id, public_specialty_name)
           VALUES ($1, $2)`, [hospitalId, specialty]);
            }
        }
        const currentVerification = await client.query(`SELECT status::text, source_type::text, source_name, source_reference, expires_at
       FROM hospital_verification_records
       WHERE hospital_id = $1 AND is_current
       FOR UPDATE`, [hospitalId]);
        const existingVerification = currentVerification.rows[0];
        const sameVerification = input.verificationStatus !== 'unverified' &&
            existingVerification?.status === input.verificationStatus &&
            existingVerification.source_type === input.verificationSourceType &&
            existingVerification.source_name === input.verificationSourceName &&
            existingVerification.source_reference === input.verificationSourceReference &&
            (existingVerification.expires_at?.getTime() ?? null) ===
                (input.verificationExpiresAt === null ? null : Date.parse(input.verificationExpiresAt));
        if (input.verificationStatus === 'unverified') {
            if (existingVerification) {
                await client.query('UPDATE hospital_verification_records SET is_current = false WHERE hospital_id = $1 AND is_current', [hospitalId]);
            }
        }
        else if (!sameVerification) {
            if (input.verificationStatus === 'verified' &&
                input.verificationExpiresAt !== null &&
                Date.parse(input.verificationExpiresAt) < Date.now()) {
                throw new AppError(400, 'INVALID_VERIFICATION_EXPIRY', 'Verification expiry cannot be in the past.');
            }
            await client.query('UPDATE hospital_verification_records SET is_current = false WHERE hospital_id = $1 AND is_current', [hospitalId]);
            const verifiedSnapshot = input.verificationStatus === 'verified';
            const snapshot = verifiedSnapshot
                ? [
                    input.name, input.address, input.city, input.region, input.postalCode,
                    input.phone, input.website, input.facilityType, input.latitude, input.longitude,
                ]
                : Array(10).fill(null);
            await client.query(`INSERT INTO hospital_verification_records (
           hospital_id, status, source_type, source_name, source_reference,
           verified_name, verified_address, verified_city, verified_region,
           verified_postal_code, verified_phone, verified_website, verified_facility_type,
           verified_location, last_verified_at, expires_at, is_current
         ) VALUES (
           $1, $2::hospital_verification_status, $3::data_source_type, $4, $5,
           $6, $7, $8, $9, $10, $11, $12, $13,
           CASE WHEN $14::double precision IS NULL THEN NULL
             ELSE ST_SetSRID(ST_MakePoint($15, $14), 4326)::geography END,
           CASE WHEN $2 = 'verified' THEN now() ELSE NULL END,
           $16::timestamptz, true
         )`, [
                hospitalId, input.verificationStatus, input.verificationSourceType,
                input.verificationSourceName, input.verificationSourceReference,
                ...snapshot, input.verificationExpiresAt,
            ]);
        }
        await writeAudit(client, username, id ? 'hospital.updated' : 'hospital.created', 'hospital', hospitalId, ['public_fields', 'specialties', 'listing_status', 'verification']);
        const saved = await client.query(`SELECT ${hospitalColumns()}
       FROM hospitals h
       LEFT JOIN hospital_verification_records v ON v.hospital_id = h.id AND v.is_current
       WHERE h.id = $1`, [hospitalId]);
        await client.query('COMMIT');
        return saved.rows[0] ?? null;
    }
    catch (error) {
        await client.query('ROLLBACK');
        if (isUniqueViolation(error)) {
            throw new AppError(409, 'HOSPITAL_CONFLICT', 'The hospital could not be saved because a conflicting record exists.');
        }
        throw error;
    }
    finally {
        client.release();
    }
}
function isUniqueViolation(error) {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}
export async function listAmbulanceProviders(query) {
    const values = [];
    const where = query.search
        ? `WHERE p.name ILIKE $1 OR COALESCE(p.public_phone, '') ILIKE $1`
        : '';
    if (query.search)
        values.push(`%${query.search}%`);
    const count = await pool.query(`SELECT COUNT(*)::int AS total FROM ambulance_providers p ${where}`, values);
    const result = await pool.query(`SELECT p.id, p.name, p.public_phone AS phone, p.public_website AS website,
       p.status::text AS status,
       COUNT(v.id)::int AS "vehicleCount",
       p.created_at AS "createdAt", p.updated_at AS "updatedAt"
     FROM ambulance_providers p
     LEFT JOIN ambulance_vehicles v ON v.ambulance_provider_id = p.id
     ${where}
     GROUP BY p.id
     ORDER BY p.updated_at DESC, p.id
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, [...values, query.limit, query.offset]);
    return {
        data: result.rows,
        pagination: { limit: query.limit, offset: query.offset, total: count.rows[0]?.total ?? 0 },
    };
}
export async function saveAmbulanceProvider(id, input, username) {
    const client = await writePool.connect();
    try {
        await client.query('BEGIN');
        const result = id
            ? await client.query(`UPDATE ambulance_providers
         SET name = $1, public_phone = $2, public_website = $3, status = $4, updated_at = now()
         WHERE id = $5 RETURNING id`, [input.name, input.phone, input.website, input.status, id])
            : await client.query(`INSERT INTO ambulance_providers (name, public_phone, public_website, status)
         VALUES ($1, $2, $3, $4) RETURNING id`, [input.name, input.phone, input.website, input.status]);
        if (id && result.rowCount === 0)
            throw new AppError(404, 'AMBULANCE_PROVIDER_NOT_FOUND', 'Ambulance provider was not found.');
        const providerId = id ?? result.rows[0].id;
        await writeAudit(client, username, id ? 'ambulance_provider.updated' : 'ambulance_provider.created', 'ambulance_provider', providerId, ['name', 'public_contact', 'status']);
        await client.query('COMMIT');
        return providerId;
    }
    catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
    finally {
        client.release();
    }
}
export async function listAmbulanceVehicles(query) {
    const values = [];
    const where = query.search
        ? `WHERE v.vehicle_type ILIKE $1 OR COALESCE(v.registration_number, '') ILIKE $1 OR p.name ILIKE $1`
        : '';
    if (query.search)
        values.push(`%${query.search}%`);
    const count = await pool.query(`SELECT COUNT(*)::int AS total FROM ambulance_vehicles v JOIN ambulance_providers p ON p.id = v.ambulance_provider_id ${where}`, values);
    const result = await pool.query(`SELECT v.id, v.ambulance_provider_id AS "providerId", p.name AS "providerName",
       v.vehicle_type AS "vehicleType", v.registration_number AS "registrationNumber",
       v.status::text AS status,
       ST_Y(v.last_known_location::geometry)::double precision AS latitude,
       ST_X(v.last_known_location::geometry)::double precision AS longitude,
       v.location_updated_at AS "locationUpdatedAt",
       v.created_at AS "createdAt", v.updated_at AS "updatedAt"
     FROM ambulance_vehicles v
     JOIN ambulance_providers p ON p.id = v.ambulance_provider_id
     ${where}
     ORDER BY v.updated_at DESC, v.id
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, [...values, query.limit, query.offset]);
    return {
        data: result.rows,
        pagination: { limit: query.limit, offset: query.offset, total: count.rows[0]?.total ?? 0 },
    };
}
export async function saveAmbulanceVehicle(id, input, username) {
    const client = await writePool.connect();
    const isCreate = id === null;
    try {
        await client.query('BEGIN');
        const provider = await client.query('SELECT 1 FROM ambulance_providers WHERE id = $1', [input.providerId]);
        if (provider.rowCount === 0)
            throw new AppError(400, 'INVALID_PROVIDER', 'Select an existing ambulance provider.');
        if (id) {
            const result = await client.query(`UPDATE ambulance_vehicles SET
           ambulance_provider_id = $1, vehicle_type = $2, registration_number = $3,
           status = $4,
           last_known_location = CASE WHEN $5::double precision IS NULL THEN NULL
             ELSE ST_SetSRID(ST_MakePoint($6, $5), 4326)::geography END,
           location_updated_at = CASE WHEN $5::double precision IS NULL THEN NULL ELSE now() END,
           updated_at = now()
         WHERE id = $7 RETURNING id`, [input.providerId, input.vehicleType, input.registrationNumber, input.status, input.latitude, input.longitude, id]);
            if (result.rowCount === 0)
                throw new AppError(404, 'AMBULANCE_VEHICLE_NOT_FOUND', 'Ambulance vehicle was not found.');
        }
        else {
            const result = await client.query(`INSERT INTO ambulance_vehicles (
           ambulance_provider_id, vehicle_type, registration_number, status,
           last_known_location, location_updated_at
         ) VALUES (
           $1, $2, $3, $4,
           CASE WHEN $5::double precision IS NULL THEN NULL
             ELSE ST_SetSRID(ST_MakePoint($6, $5), 4326)::geography END,
           CASE WHEN $5::double precision IS NULL THEN NULL ELSE now() END
         ) RETURNING id`, [input.providerId, input.vehicleType, input.registrationNumber, input.status, input.latitude, input.longitude]);
            id = result.rows[0].id;
        }
        await writeAudit(client, username, isCreate ? 'ambulance_vehicle.created' : 'ambulance_vehicle.updated', 'ambulance_vehicle', id, ['provider', 'vehicle_type', 'registration_number', 'status', 'location']);
        await client.query('COMMIT');
        return id;
    }
    catch (error) {
        await client.query('ROLLBACK');
        if (isUniqueViolation(error)) {
            throw new AppError(409, 'VEHICLE_REGISTRATION_CONFLICT', 'This provider already has a vehicle with that registration number.');
        }
        throw error;
    }
    finally {
        client.release();
    }
}
export async function getAdminOverview() {
    const [hospitals, providers, vehicles, requests] = await Promise.all([
        pool.query(`SELECT public_listing_status::text AS status, COUNT(*)::int AS total
      FROM hospitals GROUP BY public_listing_status`),
        pool.query(`SELECT status::text AS status, COUNT(*)::int AS total
      FROM ambulance_providers GROUP BY status`),
        pool.query(`SELECT status::text AS status, COUNT(*)::int AS total
      FROM ambulance_vehicles GROUP BY status`),
        pool.query(`SELECT status::text AS status, COUNT(*)::int AS total
      FROM ambulance_requests GROUP BY status`),
    ]);
    return {
        hospitals: hospitals.rows,
        providers: providers.rows,
        vehicles: vehicles.rows,
        ambulanceRequests: requests.rows,
    };
}
