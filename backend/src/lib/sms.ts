import { config } from '../config.js'

// Outgoing SMS: sign-in codes and SOS tracking links.
//   console - prints the message in the server log (development). For sign-in
//             codes the API also returns the code so the screen can show it.
//   webhook - POSTs {to, text} as JSON to SMS_WEBHOOK_URL. Point it at a small
//             adapter for your SMS provider (MSG91, Twilio, Exotel…). Indian
//             SMS needs DLT-registered templates; keep the wording below in sync
//             with the templates you register.

export function otpMessage(code: string) {
  return `${code} is your CarePath sign-in code. It expires in 5 minutes. Do not share it with anyone.`
}

export function trackingMessage(patientName: string | null, url: string) {
  const who = patientName?.trim() ? patientName.trim().split(/\s+/)[0] : 'Someone who listed you as their emergency contact'
  return `CarePath SOS: ${who} has asked for an ambulance. Follow it live: ${url} (link stops working 12 hours after the trip ends). In an emergency call 112.`
}

/** True when sign-in codes may be shown in the API response (never in production). */
export const exposeDevCodes = () => config.sms.mode === 'console' && !config.production

const masked = (phone: string) => `${phone.slice(0, 2)}xxxxxx${phone.slice(-2)}`

/** Send one SMS to a 10-digit Indian mobile number. Throws if the gateway refuses. */
export async function sendSms(phone: string, text: string): Promise<void> {
  if (config.sms.mode === 'webhook') {
    if (!config.sms.webhookUrl) throw new Error('SMS_MODE=webhook needs SMS_WEBHOOK_URL')
    const res = await fetch(config.sms.webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ to: `+91${phone}`, text }),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) throw new Error(`SMS gateway returned ${res.status}`)
    return
  }
  if (!config.production) console.log(`[sms] to ${masked(phone)}: ${text}`)
}

export function sendOtp(phone: string, code: string): Promise<void> {
  return sendSms(phone, otpMessage(code))
}
