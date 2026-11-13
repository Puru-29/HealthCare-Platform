import { AppError } from '../errors/app-error.js';
import { findDoctorById, findDoctors } from '../services/doctor.service.js';
export const getDoctors = async (_request, response) => {
    const result = await findDoctors(response.locals.validatedQuery);
    response.status(200).json(result);
};
export const getDoctorById = async (_request, response, next) => {
    const doctor = await findDoctorById(response.locals.doctorId);
    if (!doctor) {
        next(new AppError(404, 'DOCTOR_NOT_FOUND', 'The verified doctor listing was not found.'));
        return;
    }
    response.status(200).json({ data: doctor });
};
