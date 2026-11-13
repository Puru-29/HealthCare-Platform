import { Router } from 'express'
import { requireAdminSession } from '../middleware/admin-auth.js'
import { getOverview } from '../controllers/admin-management.controller.js'
import { adminAuthRouter } from './admin-auth.routes.js'
import { adminAmbulanceRouter } from './admin-ambulance.routes.js'
import { adminHospitalRouter } from './admin-hospital.routes.js'

export const adminRouter = Router()

adminRouter.use((_request, response, next) => {
  response.setHeader('Cache-Control', 'no-store')
  next()
})
adminRouter.use('/auth', adminAuthRouter)
adminRouter.use(requireAdminSession)
adminRouter.get('/overview', getOverview)
adminRouter.use('/hospitals', adminHospitalRouter)
adminRouter.use('/ambulance', adminAmbulanceRouter)
