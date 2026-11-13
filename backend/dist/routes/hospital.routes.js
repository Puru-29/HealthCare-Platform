import { Router } from 'express';
import { getHospitalById, getHospitals } from '../controllers/hospital.controller.js';
import { validateHospitalId, validateHospitalQuery } from '../middleware/validate.js';
export const hospitalRouter = Router();
hospitalRouter.get('/', validateHospitalQuery, getHospitals);
hospitalRouter.get('/:hospitalId', validateHospitalId, getHospitalById);
