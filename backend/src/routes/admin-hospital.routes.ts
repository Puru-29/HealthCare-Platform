import { Router } from 'express'
import {
  createHospital,
  getHospital,
  getHospitals,
  updateHospital,
} from '../controllers/admin-management.controller.js'
import {
  createDraftHospitalsFromSourceReview,
  getUnlinkedSourceObservations,
  recordHospitalSourceReviewDecision,
} from '../controllers/hospital-source-review.controller.js'
import { requireAdminCsrf } from '../middleware/admin-auth.js'

export const adminHospitalRouter = Router()

adminHospitalRouter.get('/', getHospitals)
adminHospitalRouter.get('/source-observations', getUnlinkedSourceObservations)
adminHospitalRouter.post('/source-reviews/decisions', requireAdminCsrf, recordHospitalSourceReviewDecision)
adminHospitalRouter.post('/source-reviews/create-drafts', requireAdminCsrf, createDraftHospitalsFromSourceReview)
adminHospitalRouter.post('/', requireAdminCsrf, createHospital)
adminHospitalRouter.get('/:hospitalId', getHospital)
adminHospitalRouter.patch('/:hospitalId', requireAdminCsrf, updateHospital)
