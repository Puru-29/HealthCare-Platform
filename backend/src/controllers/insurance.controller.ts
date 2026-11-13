import type { RequestHandler } from 'express'
import type { InsuranceNetworkQueryLocals } from '../middleware/validate.js'
import { findInsuranceNetworks } from '../services/insurance.service.js'

export const getInsuranceNetworks: RequestHandler<
  Record<string, never>,
  unknown,
  unknown,
  Record<string, never>,
  InsuranceNetworkQueryLocals
> = async (_request, response) => {
  const result = await findInsuranceNetworks(response.locals.validatedQuery)
  response.status(200).json(result)
}
