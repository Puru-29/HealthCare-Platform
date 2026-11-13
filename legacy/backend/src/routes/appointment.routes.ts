import { Router } from 'express'
import { cancelAppointmentRequest, getPatientAppointments } from '../controllers/appointment.controller.js'
import { requireAuthCsrf, requireAuthOrigin, requireUserSession } from '../middleware/user-auth.js'
import { validateAppointmentId } from '../middleware/validate.js'

export const appointmentRouter = Router()

appointmentRouter.use(requireUserSession)
appointmentRouter.get('/', getPatientAppointments)
appointmentRouter.patch(
  '/:appointmentId/cancel',
  requireAuthOrigin,
  requireAuthCsrf,
  validateAppointmentId,
  cancelAppointmentRequest,
)
