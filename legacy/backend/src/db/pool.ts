import { Pool } from 'pg'
import { config } from '../config/env.js'
import { assertSafeDatabaseEndpoint } from './target.js'

const connectionSettings = {
  host: config.database.host,
  port: config.database.port,
  database: config.database.database,
  user: config.database.user,
  password: config.database.password,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  statement_timeout: 10_000,
  application_name: 'healthcare-platform-api',
}

export const pool = new Pool({
  ...connectionSettings,
  options: '-c default_transaction_read_only=on',
})

export const writePool = new Pool(connectionSettings)

for (const connectionPool of [pool, writePool]) {
  connectionPool.on('error', (error: NodeJS.ErrnoException) => {
    console.error(JSON.stringify({
      event: 'database_idle_client_error',
      code: error.code ?? 'unknown',
    }))
  })
}

export async function checkDatabaseConnection(): Promise<void> {
  await assertSafeDatabaseEndpoint(pool)
}

export async function closeDatabasePool(): Promise<void> {
  await Promise.all([pool.end(), writePool.end()])
}
