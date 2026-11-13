import { ZodError } from 'zod';
import { AppError } from '../errors/app-error.js';
export const errorHandler = (error, _request, response, _next) => {
    const requestId = typeof response.locals.requestId === 'string'
        ? response.locals.requestId
        : 'unknown';
    if (error instanceof ZodError) {
        response.status(400).json({
            error: {
                code: 'INVALID_REQUEST',
                message: 'The request contains invalid values.',
                requestId,
            },
        });
        return;
    }
    if (error instanceof AppError) {
        response.status(error.statusCode).json({
            error: {
                code: error.code,
                message: error.message,
                requestId,
            },
        });
        return;
    }
    if (typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error.code === '42P01' || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT')) {
        const schemaMissing = error.code === '42P01';
        response.status(503).json({
            error: {
                code: schemaMissing ? 'DATABASE_SCHEMA_UNAVAILABLE' : 'DATABASE_UNAVAILABLE',
                message: schemaMissing
                    ? 'A required application database migration has not been applied.'
                    : 'The application database is temporarily unavailable.',
                requestId,
            },
        });
        return;
    }
    if (typeof error === 'object' &&
        error !== null &&
        'type' in error &&
        (error.type === 'entity.parse.failed' || error.type === 'entity.too.large')) {
        const tooLarge = error.type === 'entity.too.large';
        response.status(tooLarge ? 413 : 400).json({
            error: {
                code: tooLarge ? 'REQUEST_TOO_LARGE' : 'INVALID_JSON',
                message: tooLarge ? 'The request body is too large.' : 'The request body is not valid JSON.',
                requestId,
            },
        });
        return;
    }
    console.error(JSON.stringify({
        event: 'request_failed',
        requestId,
    }));
    response.status(500).json({
        error: {
            code: 'INTERNAL_ERROR',
            message: 'An unexpected error occurred.',
            requestId,
        },
    });
};
