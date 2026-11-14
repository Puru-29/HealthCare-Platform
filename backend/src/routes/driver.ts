import { Router } from 'express'
import { z } from 'zod'
import { rateLimit } from '../lib/auth.js'
import { param, parse } from '../lib/http.js'
import { channels, subscribe } from '../lib/sse.js'
import type { Dispatcher } from '../services/dispatch.js'

// The driver's phone opens a capability link (/driver/<token>) sent by the
// hospital. No app install or login: the token is the credential.
export function driverRoutes(dispatcher: Dispatcher) {
  const r = Router()

  r.get('/:token', (req, res) => {
    const id = dispatcher.incidentForDriver(param(req, 'token'))
    res.json(dispatcher.driverView(id))
  })

  r.get('/:token/stream', (req, res) => {
    const id = dispatcher.incidentForDriver(param(req, 'token'))
    subscribe(req, res, [channels.incident(id)], { event: 'incident', data: dispatcher.view(id) })
  })

  r.post('/:token/location', rateLimit('driver-location', 60, 60_000), async (req, res) => {
    const body = parse(z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }), req.body)
    const id = dispatcher.incidentForDriver(param(req, 'token'))
    await dispatcher.updateLocation(id, body)
    res.json({ ok: true })
  })

  r.post('/:token/status', (req, res) => {
    const body = parse(z.object({ status: z.enum(['arrived', 'to_hospital', 'completed']) }), req.body)
    const id = dispatcher.incidentForDriver(param(req, 'token'))
    dispatcher.advance(id, body.status)
    res.json(dispatcher.driverView(id))
  })

  return r
}
