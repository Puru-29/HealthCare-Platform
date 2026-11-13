import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { config } from './config/env.js';
import { AppError } from './errors/app-error.js';
import { errorHandler } from './middleware/error-handler.js';
import { requestId } from './middleware/request-id.js';
import { apiRouter } from './routes/api.routes.js';
export const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({
    origin: config.frontendOrigins,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Carepath-CSRF'],
}));
app.use(express.json({ limit: '64kb' }));
app.use(requestId);
app.use('/api', apiRouter);
app.use((_request, _response, next) => {
    next(new AppError(404, 'NOT_FOUND', 'The requested endpoint was not found.'));
});
app.use(errorHandler);
