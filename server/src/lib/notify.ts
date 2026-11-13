import { config } from '../config.js'

// Out-of-band alert to a hospital when an SOS offer is made. The live console
// (SSE) is always used; this adds a second channel.
//
// "webhook" posts JSON that an IVR flow can consume: ring the emergency desk,
// read out the pickup area and distance, "press 1 to accept", and call back
// POST /api/console/offers/:incidentId/accept with the hospital's API session.
// A picked-up call is not an acceptance — only an explicit accept assigns.

export interface OfferAlert {
  incidentId: string
  hospitalId: string
  hospitalName: string
  hospitalPhone: string | null
  distanceKm: number
  wave: number
  pickup: { lat: number; lng: number }
  note: string | null
}

export async function notifyHospital(alert: OfferAlert): Promise<void> {
  if (config.notify.mode === 'webhook' && config.notify.webhookUrl) {
    try {
      await fetch(config.notify.webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'sos.offer', ...alert }),
        signal: AbortSignal.timeout(5000),
      })
    } catch (error) {
      console.error(`[notify] webhook failed for ${alert.hospitalId}:`, (error as Error).message)
    }
    return
  }
  if (!config.production) {
    console.log(`[notify] SOS ${alert.incidentId.slice(0, 8)} -> ${alert.hospitalName} (${alert.distanceKm.toFixed(1)} km, wave ${alert.wave})`)
  }
}
