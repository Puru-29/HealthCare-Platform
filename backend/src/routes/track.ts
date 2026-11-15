import { Router } from 'express'
import { rateLimit } from '../lib/auth.js'
import { param } from '../lib/http.js'
import { channels, subscribe } from '../lib/sse.js'
import type { Dispatcher } from '../services/dispatch.js'

// Read-only family tracking: the link texted to the patient's emergency contact.
// The token is the credential; the view never contains phone numbers or medical details.
export function trackRoutes(dispatcher: Dispatcher) {
  const r = Router()

  r.get('/:token', rateLimit('track', 120, 60_000), (req, res) => {
    const id = dispatcher.incidentForTrackToken(param(req, 'token'))
    res.json(dispatcher.trackView(id))
  })

  r.get('/:token/stream', (req, res) => {
    const id = dispatcher.incidentForTrackToken(param(req, 'token'))
    subscribe(req, res, [channels.track(id)], { event: 'incident', data: dispatcher.trackView(id) })
  })

  return r
}
