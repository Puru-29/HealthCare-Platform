import { findInsuranceNetworks } from '../services/insurance.service.js';
export const getInsuranceNetworks = async (_request, response) => {
    const result = await findInsuranceNetworks(response.locals.validatedQuery);
    response.status(200).json(result);
};
