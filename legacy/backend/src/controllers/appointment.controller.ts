import type { RequestHandler } from 'express'
import type { AppointmentIdLocals } from '../middleware/validate.js'
import type { UserAuthLocals } from '../middleware/user-auth.js'
import {
  cancelPatientAppointment,
  listPatientAppointments,
} from '../services/appointment.service.js'

export const getPatientAppointments: RequestHandler<
  Record<string, never>,
  unknown,
  unknown,
  Record<string, never>,
  UserAuthLocals
> = async (_request, response) => {
  const { user } = response.locals
  const data = await listPatientAppointments(user.id)
  response.setHeader('Cache-Control', 'no-store')
  response.status(200).json({ data })
}

export const cancelAppointmentRequest: RequestHandler<
  { appointmentId: string },
  unknown,
  unknown,
  Record<string, never>,
  UserAuthLocals & AppointmentIdLocals
> = async (_request, response) => {
  const { user, appointmentId } = response.locals
  await cancelPatientAppointment(user.id, appointmentId)
  response.status(200).json({ data: { id: appointmentId, status: 'cancelled' } })
}
