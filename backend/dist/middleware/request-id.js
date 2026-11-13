import { randomUUID } from 'node:crypto';
export const requestId = (_request, response, next) => {
    const id = randomUUID();
    response.locals.requestId = id;
    response.setHeader('X-Request-Id', id);
    next();
};
