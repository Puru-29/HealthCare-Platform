import type { ErrorRequestHandler, Request } from 'express'
import { z } from 'zod'

export class HttpError extends Error {
  constructor(public status: number, message: string, public code = 'error') {
    super(message)
  }
}

export const notFound = (what = 'Not found') => new HttpError(404, what, 'not_found')

export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data)
  if (!result.success) {
    const issue = result.error.issues[0]
    throw new HttpError(400, issue ? `${issue.path.join('.') || 'input'}: ${issue.message}` : 'Invalid input', 'invalid_input')
  }
  return result.data
}

export const param = (req: Request, name: string): string => {
  const value = req.params[name]
  if (typeof value !== 'string' || value.length === 0 || value.length > 120) throw new HttpError(400, `Invalid ${name}`)
  return value
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } })
    return
  }
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'invalid_json', message: 'Malformed JSON body' } })
    return
  }
  console.error(err)
  res.status(500).json({ error: { code: 'internal', message: 'Something went wrong. Please try again.' } })
}
