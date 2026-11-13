import type { PoolClient, QueryResultRow } from 'pg'
import { AppError } from '../errors/app-error.js'
import { pool, writePool } from '../db/pool.js'
import { assertSafeDatabaseEndpoint } from '../db/target.js'

export interface PatientAppointment {
  id: string
  status: string
  mode: string
  startsAt: Date
  doctorName: string | null
  specialty: string | null
  hospitalName: string | null
  city: string | null
}

interface PatientAppointmentRow extends QueryResultRow, PatientAppointment {}

async function inWriteTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await writePool.connect()
  let transactionStarted = false
  try {
    await client.query('BEGIN')
    transactionStarted = true
    await assertSafeDatabaseEndpoint(client)
    const result = await work(client)
    await client.query('COMMIT')
    transactionStarted = false
    return result
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query('ROLLBACK')
      } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], 'Appointment transaction and rollback both failed.')
      }
    }
    throw error
  } finally {
    client.release()
  }
}

export async function listPatientAppointments(userId: string): Promise<PatientAppointment[]> {
  await assertSafeDatabaseEndpoint(pool)
  const result = await pool.query<PatientAppointmentRow>(
    `SELECT a.id,
            a.status::text AS status,
            a.mode::text AS mode,
            a.starts_at AS "startsAt",
            d.verified_display_name AS "doctorName",
            d.verified_specialty AS specialty,
            v.verified_name AS "hospitalName",
            v.verified_city AS city
     FROM appointments AS a
     LEFT JOIN doctors AS d
       ON d.id = a.doctor_id
      AND d.is_publicly_listed
      AND d.verification_status = 'verified'
     LEFT JOIN hospitals AS h
       ON h.id = a.hospital_id
      AND h.public_listing_status = 'published'
     LEFT JOIN current_hospital_verification AS v
       ON v.hospital_id = h.id
      AND v.status = 'verified'
      AND (v.expires_at IS NULL OR v.expires_at > now())
      AND lower(btrim(COALESCE(v.verified_city, ''))) = 'sonipat'
     WHERE a.user_id = $1
     ORDER BY a.starts_at DESC, a.id`,
    [userId],
  )
  return result.rows
}

export async function cancelPatientAppointment(
  userId: string,
  appointmentId: string,
): Promise<void> {
  await inWriteTransaction(async (client) => {
    const updated = await client.query(
      `UPDATE appointments
       SET status = 'cancelled'
       WHERE id = $1 AND user_id = $2 AND status = 'requested'
       RETURNING id`,
      [appointmentId, userId],
    )
    if (updated.rowCount !== 1) {
      const current = await client.query<{ status: string }>(
        'SELECT status::text FROM appointments WHERE id = $1 AND user_id = $2',
        [appointmentId, userId],
      )
      if (!current.rowCount) {
        throw new AppError(404, 'APPOINTMENT_NOT_FOUND', 'Appointment request was not found.')
      }
      throw new AppError(409, 'APPOINTMENT_NOT_CANCELLABLE', 'Only a pending appointment request can be cancelled here.')
    }
    await client.query(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id)
       VALUES ($1, 'appointment.request_cancelled', 'appointment', $2)`,
      [userId, appointmentId],
    )
  })
}
