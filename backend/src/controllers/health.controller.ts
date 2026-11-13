import type { RequestHandler } from 'express'
import { checkDatabaseConnection } from '../db/pool.js'
import { AppError } from '../errors/app-error.js'

export const getHealth: RequestHandler = async (_request, response) => {
  try {
    await checkDatabaseConnection()
  }
  catch {
    throw new AppError(503, 'DATABASE_UNAVAILABLE', 'Database is unavailable.')
  }
  response.status(200).json({ status: 'ok', database: 'connected' })
}
