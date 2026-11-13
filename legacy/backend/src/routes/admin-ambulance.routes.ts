import { Router } from 'express'
import {
  createAmbulanceProvider,
  createAmbulanceVehicle,
  getAmbulanceProviders,
  getAmbulanceVehicles,
  updateAmbulanceProvider,
  updateAmbulanceVehicle,
} from '../controllers/admin-management.controller.js'
import { requireAdminCsrf } from '../middleware/admin-auth.js'

export const adminAmbulanceRouter = Router()

adminAmbulanceRouter.get('/providers', getAmbulanceProviders)
adminAmbulanceRouter.post('/providers', requireAdminCsrf, createAmbulanceProvider)
adminAmbulanceRouter.patch('/providers/:providerId', requireAdminCsrf, updateAmbulanceProvider)
adminAmbulanceRouter.get('/vehicles', getAmbulanceVehicles)
adminAmbulanceRouter.post('/vehicles', requireAdminCsrf, createAmbulanceVehicle)
adminAmbulanceRouter.patch('/vehicles/:vehicleId', requireAdminCsrf, updateAmbulanceVehicle)
