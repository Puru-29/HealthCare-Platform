import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function flag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

export const config = {
  port: Number(process.env.PORT ?? 3001),
  host: process.env.HOST ?? '127.0.0.1',
  production: process.env.NODE_ENV === 'production',
  databasePath: process.env.DATABASE_PATH === ':memory:'
    ? ':memory:'
    : resolve(backendRoot, process.env.DATABASE_PATH ?? './carepath.db'),
  facilitiesFile: resolve(backendRoot, '../data/processed/sonipat_facilities.json'),
  routing: {
    mode: (process.env.ROUTING_MODE ?? 'osrm') as 'osrm' | 'off',
    url: process.env.ROUTING_URL ?? 'https://router.project-osrm.org',
  },
  notify: {
    mode: (process.env.NOTIFY_MODE ?? 'console') as 'console' | 'webhook',
    webhookUrl: process.env.NOTIFY_WEBHOOK_URL ?? '',
  },
  demoMode: flag(process.env.DEMO_MODE, false),
  dispatch: {
    /** Search radius per wave, km. A wave ends when every offer is answered or the timer runs out. */
    waveRadiiKm: [8, 15, 30],
    waveTimeoutMs: Number(process.env.DISPATCH_WAVE_TIMEOUT_MS ?? 40_000),
    maxOffersPerWave: 6,
  },
  assistant: {
    model: 'claude-opus-5-5',
    maxTurns: 6,
  },
  backendRoot,
}
