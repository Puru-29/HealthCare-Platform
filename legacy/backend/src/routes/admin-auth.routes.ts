import { rateLimit } from 'express-rate-limit'
import { Router } from 'express'
import {
  getAdminSession,
  loginAdmin,
  logoutAdmin,
} from '../controllers/admin-auth.controller.js'
import { requireAdminCsrf, requireAdminSession } from '../middleware/admin-auth.js'

export const adminAuthRouter = Router()

adminAuthRouter.post('/login', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_request, response) => {
    response.status(429).json({
      error: {
        code: 'LOGIN_RATE_LIMITED',
        message: 'Too many sign-in attempts. Try again later.',
        requestId: response.locals.requestId ?? 'unknown',
      },
    })
  },
}), loginAdmin)
adminAuthRouter.get('/session', requireAdminSession, getAdminSession)
adminAuthRouter.post('/logout', requireAdminSession, requireAdminCsrf, logoutAdmin)
