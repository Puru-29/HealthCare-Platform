import { Router } from 'express';
import { getDoctorById, getDoctors } from '../controllers/doctor.controller.js';
import { validateDoctorId, validateDoctorQuery } from '../middleware/validate.js';
export const doctorRouter = Router();
doctorRouter.get('/', validateDoctorQuery, getDoctors);
doctorRouter.get('/:doctorId', validateDoctorId, getDoctorById);
