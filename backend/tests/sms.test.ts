import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('SMS_MODE', 'console')
  vi.stubEnv('SMS_WEBHOOK_URL', '')
  vi.stubEnv('NODE_ENV', 'development')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('sendSms', () => {
  it('logs a masked number in console mode', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const { sendSms } = await import('../src/lib/sms.js')

    await sendSms('9876543210', 'SOS tracking link')

    expect(log).toHaveBeenCalledWith('[sms] to 98xxxxxx10: SOS tracking link')
  })

  it('posts the SMS to the configured webhook in webhook mode', async () => {
    vi.stubEnv('SMS_MODE', 'webhook')
    vi.stubEnv('SMS_WEBHOOK_URL', 'https://sms.test/send')
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetch)
    const { sendSms } = await import('../src/lib/sms.js')

    await sendSms('9876543210', 'SOS tracking link')

    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch.mock.calls[0]![0]).toBe('https://sms.test/send')
    expect(JSON.parse(fetch.mock.calls[0]![1]!.body as string)).toEqual({
      to: '+919876543210',
      text: 'SOS tracking link',
    })
  })

  it('surfaces webhook configuration and gateway errors', async () => {
    vi.stubEnv('SMS_MODE', 'webhook')
    const { sendSms } = await import('../src/lib/sms.js')

    await expect(sendSms('9876543210', 'message')).rejects.toThrow('SMS_MODE=webhook needs SMS_WEBHOOK_URL')

    vi.stubEnv('SMS_WEBHOOK_URL', 'https://sms.test/send')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })))
    vi.resetModules()
    const configuredSms = await import('../src/lib/sms.js')

    await expect(configuredSms.sendSms('9876543210', 'message')).rejects.toThrow('SMS gateway returned 503')
  })
})
