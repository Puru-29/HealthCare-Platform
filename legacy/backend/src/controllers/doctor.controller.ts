import type { RequestHandler } from 'express'
import { AppError } from '../errors/app-error.js'
import type { DoctorIdLocals, DoctorQueryLocals } from '../middleware/validate.js'
import { findDoctorById, findDoctors } from '../services/doctor.service.js'

export const getDoctors: RequestHandler<
  Record<string, never>,
  unknown,
  unknown,
  Record<string, never>,
  DoctorQueryLocals
> = async (_request, response) => {
  const result = await findDoctors(response.locals.validatedQuery)
  response.status(200).json(result)
}

export const getDoctorById: RequestHandler<
  { doctorId: string },
  unknown,
  unknown,
  Record<string, never>,
  DoctorIdLocals
> = async (_request, response, next) => {
  const doctor = await findDoctorById(response.locals.doctorId)
  if (!doctor) {
    next(new AppError(
      404,
      'DOCTOR_NOT_FOUND',
      'The verified doctor listing was not found.',
    ))
    return
  }
  response.status(200).json({ data: doctor })
}
