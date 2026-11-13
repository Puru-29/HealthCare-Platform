import { resolve } from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';
if (process.env.NODE_ENV !== 'test') {
    dotenv.config({ path: resolve(process.cwd(), '.env') });
}
const environmentSchema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().min(1).default('127.0.0.1'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    FRONTEND_ORIGIN: z.string().url().default('http://127.0.0.1:5174'),
    GOOGLE_CLIENT_ID: z.preprocess((value) => typeof value === 'string' && !value.trim() ? undefined : value, z.string().trim().min(1).optional()),
    PGHOST: z.string().min(1).default('127.0.0.1'),
    PGPORT: z.coerce.number().int().min(1).max(65535).default(5432),
    PGDATABASE: z.string().min(1).default('healthcare_platform_test'),
    PGUSER: z.string().min(1).default('postgres'),
    PGPASSWORD: z.string().optional(),
    ADMIN_USERNAME: z.string().min(1).optional(),
    ADMIN_PASSWORD_HASH: z.string().optional(),
    ADMIN_SESSION_SECRET: z.string().optional(),
}).superRefine((environment, context) => {
    if (environment.PGDATABASE === 'healthcare_platform') {
        context.addIssue({
            code: 'custom',
            path: ['PGDATABASE'],
            message: 'The protected healthcare_platform database cannot be used by this application.',
        });
    }
    if (environment.NODE_ENV !== 'production' && (environment.PGDATABASE !== 'healthcare_platform_test' ||
        environment.PGHOST !== '127.0.0.1' ||
        environment.PGPORT !== 5432)) {
        context.addIssue({
            code: 'custom',
            path: ['PGDATABASE'],
            message: 'Local development and tests require healthcare_platform_test on 127.0.0.1:5432.',
        });
    }
});
const parsedEnvironment = environmentSchema.safeParse(process.env);
if (!parsedEnvironment.success) {
    const invalidVariables = parsedEnvironment.error.issues
        .map((issue) => issue.path.join('.'))
        .join(', ');
    throw new Error(`Invalid backend environment configuration: ${invalidVariables}`);
}
export const config = {
    nodeEnv: parsedEnvironment.data.NODE_ENV,
    host: parsedEnvironment.data.HOST,
    port: parsedEnvironment.data.PORT,
    frontendOrigin: parsedEnvironment.data.FRONTEND_ORIGIN,
    googleClientId: parsedEnvironment.data.GOOGLE_CLIENT_ID,
    frontendOrigins: [...new Set([
            parsedEnvironment.data.FRONTEND_ORIGIN,
            ...(parsedEnvironment.data.NODE_ENV === 'production'
                ? []
                : ['http://127.0.0.1:5174']),
        ])],
    database: {
        host: parsedEnvironment.data.PGHOST,
        port: parsedEnvironment.data.PGPORT,
        database: parsedEnvironment.data.PGDATABASE,
        user: parsedEnvironment.data.PGUSER,
        password: parsedEnvironment.data.PGPASSWORD,
    },
    admin: {
        username: parsedEnvironment.data.ADMIN_USERNAME,
        passwordHash: parsedEnvironment.data.ADMIN_PASSWORD_HASH,
        sessionSecret: parsedEnvironment.data.ADMIN_SESSION_SECRET,
        configured: Boolean(parsedEnvironment.data.ADMIN_USERNAME &&
            /^scrypt\$[A-Za-z0-9_-]{20,}\$[A-Za-z0-9_-]{80,}$/.test(parsedEnvironment.data.ADMIN_PASSWORD_HASH ?? '') &&
            Buffer.from(parsedEnvironment.data.ADMIN_SESSION_SECRET ?? '', 'base64url').length >= 32),
    },
};
