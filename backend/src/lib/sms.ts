import { config } from '../config.js'

// Sends sign-in codes.
//   console - prints the code in the server log (development). The API also
//             returns it to the browser so the sign-in screen can show it.
//   webhook - POSTs {to, text} as JSON to SMS_WEBHOOK_URL. Point it at a small
//             adapter for your SMS provider (MSG91, Twilio, Exotel…). Indian
//             SMS needs a DLT-registered template; put the approved wording here.

export function otpMessage(code: string) {
  return `${code} is your CarePath sign-in code. It expires in 5 minutes. Do not share it with anyone.`
}

/** True when the code may be shown in the API response (never in production). */
export const exposeDevCodes = () => config.sms.mode === 'console' && !config.production

export async function sendOtp(phone: string, code: string): Promise<void> {
  if (config.sms.mode === 'webhook') {
    if (!config.sms.webhookUrl) throw new Error('SMS_MODE=webhook needs SMS_WEBHOOK_URL')
    const res = await fetch(config.sms.webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ to: `+91${phone}`, text: otpMessage(code) }),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) throw new Error(`SMS gateway returned ${res.status}`)
    return
  }
  if (!config.production) console.log(`[sms] sign-in code for ${phone.slice(0, 2)}xxxxxx${phone.slice(-2)}: ${code}`)
}
