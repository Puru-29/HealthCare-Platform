import request from 'supertest'
import { afterAll, describe, expect, it } from 'vitest'
import { app } from '../src/app.js'
import { closeDatabasePool } from '../src/db/pool.js'

const enabled = process.env.RUN_DB_INTEGRATION_TESTS === 'true'

describe.skipIf(!enabled)('GET /api/health (PostgreSQL integration)', () => {
  afterAll(async () => {
    await closeDatabasePool()
  })

  it('checks the actual database and does not reveal connection settings', async () => {
    const response = await request(app).get('/api/health')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: 'ok', database: 'connected' })
    expect(JSON.stringify(response.body)).not.toContain('PGPASSWORD')
  })
})
