import { isIP } from 'node:net'
import type { Pool, PoolClient } from 'pg'

interface DatabaseEndpoint {
  database_name: string
  server_address: string | null
  server_port: number | null
}

export function isSafeLoopbackAddress(value: string | null): boolean {
  if (!value) return false

  const [address, prefix, extra] = value.split('/')
  if (!address || extra !== undefined) return false
  const version = isIP(address)
  if (version === 0) return false

  if (prefix !== undefined) {
    const parsedPrefix = Number(prefix)
    if (
      !Number.isInteger(parsedPrefix) ||
      parsedPrefix < 0 ||
      parsedPrefix > (version === 4 ? 32 : 128)
    ) {
      return false
    }
  }

  if (version === 4) {
    return Number(address.split('.')[0]) === 127
  }

  if (address.includes('.')) return false
  const [left, right = ''] = address.toLowerCase().split('::')
  const leftGroups = left ? left.split(':') : []
  const rightGroups = right ? right.split(':') : []
  if (address.includes('::')) {
    const zeroCount = 8 - leftGroups.length - rightGroups.length
    if (zeroCount < 1) return false
    leftGroups.push(...Array<string>(zeroCount).fill('0'))
  } else if (leftGroups.length !== 8) {
    return false
  }
  const groups = [...leftGroups, ...rightGroups]
  return groups.length === 8 &&
    groups.slice(0, 7).every((group) => Number.parseInt(group, 16) === 0) &&
    Number.parseInt(groups[7] ?? '', 16) === 1
}

export async function assertSafeDatabaseEndpoint(
  connection: Pool | PoolClient,
): Promise<void> {
  const result = await connection.query<DatabaseEndpoint>(`
    SELECT current_database() AS database_name,
           inet_server_addr()::text AS server_address,
           inet_server_port() AS server_port
  `)
  const endpoint = result.rows[0]
  if (
    endpoint?.database_name !== 'healthcare_platform_test' ||
    !isSafeLoopbackAddress(endpoint.server_address) ||
    endpoint.server_port !== 5432
  ) {
    throw new Error('The active database connection is not the approved local test database.')
  }
}
