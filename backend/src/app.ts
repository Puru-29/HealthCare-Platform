import express from 'express'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { config } from './config.js'
import type { DB } from './db.js'
import { requireJsonForWrites } from './lib/auth.js'
import { errorHandler, notFound } from './lib/http.js'
import { consoleRoutes } from './routes/console.js'
import { driverRoutes } from './routes/driver.js'
import { patientRoutes } from './routes/patient.js'
import { publicRoutes } from './routes/public.js'
import type { Dispatcher } from './services/dispatch.js'

export function createApp(db: DB, dispatcher: Dispatcher) {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 'loopback')
  app.use((_req, res, next) => {
    res.setHeader('x-content-type-options', 'nosniff')
    res.setHeader('referrer-policy', 'same-origin')
    res.setHeader('x-frame-options', 'DENY')
    // Location is needed for SOS; camera/mic are not.
    res.setHeader('permissions-policy', 'geolocation=(self), camera=(), microphone=()')
    next()
  })
  app.use(express.json({ limit: '64kb' }))

  const api = express.Router()
  api.use(requireJsonForWrites)
  api.use(publicRoutes(db))
  api.use(patientRoutes(db, dispatcher))
  api.use('/console', consoleRoutes(db, dispatcher))
  api.use('/driver', driverRoutes(dispatcher))
  api.use(() => { throw notFound('No such API route') })
  app.use('/api', api)

  // In production, serve the built frontend from the same origin.
  const frontendDist = resolve(config.backendRoot, '../frontend/dist')
  if (existsSync(frontendDist)) {
    app.use(express.static(frontendDist, { index: false, maxAge: '1h' }))
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(resolve(frontendDist, 'index.html')))
  }

  app.use(errorHandler)
  return app
}
