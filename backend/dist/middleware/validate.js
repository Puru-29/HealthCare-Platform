import { z } from 'zod';
import { AppError } from '../errors/app-error.js';
export const hospitalQuerySchema = z.object({
    search: z.string().trim().min(1).max(120).optional(),
    city: z.string().trim().min(1).max(80)
        .refine((value) => value.toLocaleLowerCase() === 'sonipat', {
        message: 'The hospital directory is currently limited to Sonipat.',
    })
        .default('Sonipat'),
    facilityType: z.string().trim().min(1).max(80).optional(),
    specialty: z.string().trim().min(1).max(80).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
}).strict();
export const doctorQuerySchema = z.object({
    search: z.string().trim().min(1).max(120).optional(),
    specialty: z.string().trim().min(1).max(80).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
}).strict();
export const validateDoctorQuery = (request, response, next) => {
    const parsed = doctorQuerySchema.safeParse(request.query);
    if (!parsed.success) {
        next(new AppError(400, 'INVALID_QUERY', 'One or more doctor search parameters are invalid.'));
        return;
    }
    response.locals.validatedQuery = parsed.data;
    next();
};
export const validateDoctorId = (request, response, next) => {
    const parsed = z.string().uuid().safeParse(request.params.doctorId);
    if (!parsed.success) {
        next(new AppError(400, 'INVALID_DOCTOR_ID', 'Doctor ID must be a valid UUID.'));
        return;
    }
    response.locals.doctorId = parsed.data;
    next();
};
export const insuranceNetworkQuerySchema = z.object({
    search: z.string().trim().min(1).max(120).optional(),
    searchField: z.enum(['all', 'provider', 'plan', 'hospital']).default('all'),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
}).strict();
export const validateInsuranceNetworkQuery = (request, response, next) => {
    const parsed = insuranceNetworkQuerySchema.safeParse(request.query);
    if (!parsed.success) {
        next(new AppError(400, 'INVALID_QUERY', 'One or more insurance search parameters are invalid.'));
        return;
    }
    response.locals.validatedQuery = parsed.data;
    next();
};
export const validateHospitalQuery = (request, response, next) => {
    const parsed = hospitalQuerySchema.safeParse(request.query);
    if (!parsed.success) {
        next(new AppError(400, 'INVALID_QUERY', 'One or more query parameters are invalid.'));
        return;
    }
    response.locals.validatedQuery = parsed.data;
    next();
};
export const validateHospitalId = (request, response, next) => {
    const parsed = z.string().uuid().safeParse(request.params.hospitalId);
    if (!parsed.success) {
        next(new AppError(400, 'INVALID_HOSPITAL_ID', 'Hospital ID must be a valid UUID.'));
        return;
    }
    response.locals.hospitalId = parsed.data;
    next();
};
export const appointmentIdSchema = z.string().uuid();
export const validateAppointmentId = (request, response, next) => {
    const parsed = appointmentIdSchema.safeParse(request.params.appointmentId);
    if (!parsed.success) {
        next(new AppError(400, 'INVALID_APPOINTMENT_ID', 'Appointment ID must be a valid UUID.'));
        return;
    }
    response.locals.appointmentId = parsed.data;
    next();
};
