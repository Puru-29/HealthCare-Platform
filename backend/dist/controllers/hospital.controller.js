import { AppError } from '../errors/app-error.js';
import { findHospitalById, findHospitals } from '../services/hospital.service.js';
export const getHospitals = async (_request, response) => {
    const result = await findHospitals(response.locals.validatedQuery);
    response.status(200).json(result);
};
export const getHospitalById = async (_request, response) => {
    const hospital = await findHospitalById(response.locals.hospitalId);
    if (!hospital) {
        throw new AppError(404, 'HOSPITAL_NOT_FOUND', 'Hospital was not found.');
    }
    response.status(200).json({ data: hospital });
};
