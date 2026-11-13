import { Router } from 'express'
import { getInsuranceNetworks } from '../controllers/insurance.controller.js'
import { validateInsuranceNetworkQuery } from '../middleware/validate.js'

export const insuranceRouter = Router()

insuranceRouter.get('/networks', validateInsuranceNetworkQuery, getInsuranceNetworks)
