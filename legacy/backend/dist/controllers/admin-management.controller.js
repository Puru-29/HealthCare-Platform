import { z } from 'zod';
import { AppError } from '../errors/app-error.js';
import { adminHospitalQuerySchema, adminHospitalSchema, ambulanceProviderSchema, ambulanceVehicleSchema, pageQuerySchema, uuidParamSchema, } from '../middleware/admin-validation.js';
import { getAdminHospital, getAdminOverview, listAdminHospitals, listAmbulanceProviders, listAmbulanceVehicles, saveAdminHospital, saveAmbulanceProvider, saveAmbulanceVehicle, } from '../services/admin-management.service.js';
function actor(response) {
    return response.locals.admin.username;
}
function parseId(value) {
    const parsed = uuidParamSchema.safeParse(value);
    if (!parsed.success)
        throw new AppError(400, 'INVALID_ID', 'The requested record ID is invalid.');
    return parsed.data;
}
function routeParam(value) {
    return typeof value === 'string' ? value : '';
}
export const getOverview = async (_request, response) => {
    response.status(200).json({ data: await getAdminOverview() });
};
export const getHospitals = async (request, response) => {
    const query = adminHospitalQuerySchema.parse(request.query);
    response.status(200).json(await listAdminHospitals(query));
};
export const getHospital = async (request, response) => {
    const hospital = await getAdminHospital(parseId(routeParam(request.params.hospitalId)));
    if (!hospital)
        throw new AppError(404, 'HOSPITAL_NOT_FOUND', 'Hospital was not found.');
    response.status(200).json({ data: hospital });
};
export const createHospital = async (request, response) => {
    const input = adminHospitalSchema.parse(request.body);
    const hospital = await saveAdminHospital(null, input, actor(response));
    response.status(201).json({ data: hospital });
};
export const updateHospital = async (request, response) => {
    const input = adminHospitalSchema.parse(request.body);
    const hospital = await saveAdminHospital(parseId(routeParam(request.params.hospitalId)), input, actor(response));
    response.status(200).json({ data: hospital });
};
export const getAmbulanceProviders = async (request, response) => {
    const query = pageQuerySchema.extend({ search: z.string().trim().max(120).optional() }).parse(request.query);
    response.status(200).json(await listAmbulanceProviders(query));
};
export const createAmbulanceProvider = async (request, response) => {
    const input = ambulanceProviderSchema.parse(request.body);
    const id = await saveAmbulanceProvider(null, input, actor(response));
    response.status(201).json({ data: { id } });
};
export const updateAmbulanceProvider = async (request, response) => {
    const id = await saveAmbulanceProvider(parseId(routeParam(request.params.providerId)), ambulanceProviderSchema.parse(request.body), actor(response));
    response.status(200).json({ data: { id } });
};
export const getAmbulanceVehicles = async (request, response) => {
    const query = pageQuerySchema.extend({ search: z.string().trim().max(120).optional() }).parse(request.query);
    response.status(200).json(await listAmbulanceVehicles(query));
};
export const createAmbulanceVehicle = async (request, response) => {
    const id = await saveAmbulanceVehicle(null, ambulanceVehicleSchema.parse(request.body), actor(response));
    response.status(201).json({ data: { id } });
};
export const updateAmbulanceVehicle = async (request, response) => {
    const id = await saveAmbulanceVehicle(parseId(routeParam(request.params.vehicleId)), ambulanceVehicleSchema.parse(request.body), actor(response));
    response.status(200).json({ data: { id } });
};
