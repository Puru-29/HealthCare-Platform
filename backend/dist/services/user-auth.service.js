import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { AppError } from '../errors/app-error.js';
import { pool, writePool } from '../db/pool.js';
import { assertSafeDatabaseEndpoint } from '../db/target.js';
const sessionLifetimeMilliseconds = 12 * 60 * 60 * 1000;
const passwordKeyLength = 64;
const dummySalt = Buffer.alloc(16);
function derivePassword(password, salt) {
    return new Promise((resolve, reject) => {
        scryptCallback(password, salt, passwordKeyLength, {
            N: 16_384,
            r: 8,
            p: 1,
            maxmem: 64 * 1024 * 1024,
        }, (error, derivedKey) => {
            if (error)
                reject(error);
            else
                resolve(derivedKey);
        });
    });
}
function hashToken(token) {
    return createHash('sha256').update(token).digest('hex');
}
export async function createPasswordHash(password) {
    const salt = randomBytes(16);
    const derived = await derivePassword(password, salt);
    return `scrypt$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}
export async function verifyPasswordHash(password, value) {
    const match = value?.match(/^scrypt\$([A-Za-z0-9_-]+)\$([A-Za-z0-9_-]+)$/);
    const salt = match ? Buffer.from(match[1], 'base64url') : dummySalt;
    const expected = match ? Buffer.from(match[2], 'base64url') : Buffer.alloc(passwordKeyLength);
    if (salt.length !== 16 || expected.length !== passwordKeyLength) {
        const derived = await derivePassword(password, dummySalt);
        return timingSafeEqual(Buffer.alloc(passwordKeyLength), derived);
    }
    const derived = await derivePassword(password, salt);
    return expected.length === derived.length && timingSafeEqual(expected, derived);
}
async function inWriteTransaction(work) {
    const client = await writePool.connect();
    let transactionStarted = false;
    try {
        await client.query('BEGIN');
        transactionStarted = true;
        await assertSafeDatabaseEndpoint(client);
        const result = await work(client);
        await client.query('COMMIT');
        transactionStarted = false;
        return result;
    }
    catch (error) {
        if (transactionStarted) {
            try {
                await client.query('ROLLBACK');
            }
            catch (rollbackError) {
                throw new AggregateError([error, rollbackError], 'Authentication transaction and rollback both failed.');
            }
        }
        throw error;
    }
    finally {
        client.release();
    }
}
function toAuthUser(row) {
    return {
        id: row.id,
        displayName: row.display_name,
        email: row.email,
    };
}
export async function registerUser(displayName, email, password) {
    const normalizedEmail = email.trim().toLocaleLowerCase('en');
    const passwordHash = await createPasswordHash(password);
    const sessionToken = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(32).toString('base64url');
    const sessionTokenHash = hashToken(sessionToken);
    const csrfTokenHash = hashToken(csrfToken);
    try {
        const user = await inWriteTransaction(async (client) => {
            await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [normalizedEmail]);
            const existing = await client.query('SELECT id FROM users WHERE lower(email) = $1 LIMIT 1', [normalizedEmail]);
            if (existing.rowCount) {
                throw new AppError(409, 'EMAIL_ALREADY_REGISTERED', 'An account with this email already exists.');
            }
            const userResult = await client.query(`INSERT INTO users (display_name, email)
         VALUES ($1, $2)
         RETURNING id, display_name, email`, [displayName.trim(), normalizedEmail]);
            const row = userResult.rows[0];
            if (!row) {
                throw new Error('User account creation returned no row.');
            }
            await client.query(`INSERT INTO user_auth_credentials (user_id, email_normalized, password_hash)
         VALUES ($1, $2, $3)`, [row.id, normalizedEmail, passwordHash]);
            await client.query(`INSERT INTO user_sessions (token_hash, csrf_token_hash, user_id, expires_at)
         VALUES ($1, $2, $3, now() + interval '12 hours')`, [sessionTokenHash, csrfTokenHash, row.id]);
            await client.query(`INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id)
         VALUES ($1, 'user.registered', 'user', $1)`, [row.id]);
            return toAuthUser(row);
        });
        return { user, sessionToken, csrfToken };
    }
    catch (error) {
        if (typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            error.code === '23505') {
            throw new AppError(409, 'EMAIL_ALREADY_REGISTERED', 'An account with this email already exists.');
        }
        throw error;
    }
}
export async function loginUser(email, password) {
    const normalizedEmail = email.trim().toLocaleLowerCase('en');
    await assertSafeDatabaseEndpoint(pool);
    const result = await pool.query(`SELECT u.id, u.display_name, u.email, u.account_status::text AS account_status,
            c.password_hash
     FROM user_auth_credentials c
     JOIN users u ON u.id = c.user_id
     WHERE c.email_normalized = $1`, [normalizedEmail]);
    const row = result.rows[0];
    const passwordMatches = await verifyPasswordHash(password, row?.password_hash);
    if (!row || row.account_status !== 'active' || !passwordMatches) {
        throw new AppError(401, 'INVALID_LOGIN', 'Email or password was not accepted.');
    }
    const sessionToken = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(32).toString('base64url');
    const sessionTokenHash = hashToken(sessionToken);
    const csrfTokenHash = hashToken(csrfToken);
    await inWriteTransaction(async (client) => {
        const sessionResult = await client.query(`INSERT INTO user_sessions (token_hash, csrf_token_hash, user_id, expires_at)
       SELECT $1, $2, id, now() + interval '12 hours'
       FROM users
       WHERE id = $3 AND account_status = 'active'`, [sessionTokenHash, csrfTokenHash, row.id]);
        if (sessionResult.rowCount !== 1) {
            throw new AppError(401, 'INVALID_LOGIN', 'Email or password was not accepted.');
        }
        await client.query(`INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id)
       VALUES ($1, 'user.logged_in', 'user', $1)`, [row.id]);
    });
    return { user: toAuthUser(row), sessionToken, csrfToken };
}
export async function loginOrRegisterGoogleUser(identity) {
    const normalizedEmail = identity.email.trim().toLocaleLowerCase('en');
    const sessionToken = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(32).toString('base64url');
    const sessionTokenHash = hashToken(sessionToken);
    const csrfTokenHash = hashToken(csrfToken);
    try {
        const user = await inWriteTransaction(async (client) => {
            await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
                `google:${identity.subject}`,
            ]);
            const linked = await client.query(`SELECT u.id, u.display_name, u.email, u.account_status::text AS account_status
         FROM user_auth_identities i
         JOIN users u ON u.id = i.user_id
         WHERE i.provider = 'google' AND i.provider_subject = $1
         LIMIT 1`, [identity.subject]);
            let row = linked.rows[0];
            let auditAction;
            if (row) {
                if (row.account_status !== 'active') {
                    throw new AppError(403, 'ACCOUNT_INACTIVE', 'This account is not available.');
                }
                auditAction = 'user.google_logged_in';
            }
            else {
                await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
                    `email:${normalizedEmail}`,
                ]);
                const existingEmail = await client.query('SELECT id FROM users WHERE lower(email) = $1 LIMIT 1', [normalizedEmail]);
                if (existingEmail.rowCount) {
                    throw new AppError(409, 'EMAIL_ALREADY_REGISTERED', 'An account with this email already exists. Sign in with your password to keep using that account.');
                }
                const created = await client.query(`INSERT INTO users (display_name, email)
           VALUES ($1, $2)
           RETURNING id, display_name, email, account_status::text AS account_status`, [identity.displayName.trim(), normalizedEmail]);
                row = created.rows[0];
                if (!row) {
                    throw new Error('Google account creation returned no user row.');
                }
                await client.query(`INSERT INTO user_auth_identities (user_id, provider, provider_subject)
           VALUES ($1, 'google', $2)`, [row.id, identity.subject]);
                auditAction = 'user.google_registered';
            }
            await client.query(`INSERT INTO user_sessions (token_hash, csrf_token_hash, user_id, expires_at)
         VALUES ($1, $2, $3, now() + interval '12 hours')`, [sessionTokenHash, csrfTokenHash, row.id]);
            await client.query(`INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id)
         VALUES ($1, $2, 'user', $1)`, [row.id, auditAction]);
            return toAuthUser(row);
        });
        return { user, sessionToken, csrfToken };
    }
    catch (error) {
        if (typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            error.code === '23505') {
            throw new AppError(409, 'EMAIL_ALREADY_REGISTERED', 'An account with this email already exists. Sign in with your password to keep using that account.');
        }
        throw error;
    }
}
export async function readUserSession(sessionToken, csrfToken) {
    if (!sessionToken || !csrfToken)
        return null;
    await assertSafeDatabaseEndpoint(pool);
    const sessionTokenHash = hashToken(sessionToken);
    const result = await pool.query(`SELECT u.id, u.display_name, u.email, s.csrf_token_hash
     FROM user_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1
       AND s.expires_at > now()
       AND u.account_status = 'active'`, [sessionTokenHash]);
    const row = result.rows[0];
    if (!row)
        return null;
    const expectedCsrfHash = Buffer.from(row.csrf_token_hash, 'hex');
    const actualCsrfHash = Buffer.from(hashToken(csrfToken), 'hex');
    if (expectedCsrfHash.length !== actualCsrfHash.length ||
        !timingSafeEqual(expectedCsrfHash, actualCsrfHash)) {
        return null;
    }
    return {
        user: {
            id: row.id,
            displayName: row.display_name,
            email: row.email,
        },
        sessionTokenHash,
    };
}
export async function logoutUser(userId, sessionTokenHash) {
    await inWriteTransaction(async (client) => {
        await client.query('DELETE FROM user_sessions WHERE token_hash = $1 AND user_id = $2', [sessionTokenHash, userId]);
        await client.query(`INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id)
       VALUES ($1, 'user.logged_out', 'user', $1)`, [userId]);
    });
}
export async function updateUserProfile(userId, displayName, email) {
    const normalizedEmail = email.trim().toLocaleLowerCase('en');
    try {
        return await inWriteTransaction(async (client) => {
            await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [normalizedEmail]);
            const updated = await client.query(`UPDATE users
         SET display_name = $1, email = $2
         WHERE id = $3 AND account_status = 'active'
         RETURNING id, display_name, email`, [displayName.trim(), normalizedEmail, userId]);
            const row = updated.rows[0];
            if (!row) {
                throw new AppError(404, 'USER_PROFILE_NOT_FOUND', 'Your account profile was not found.');
            }
            await client.query(`UPDATE user_auth_credentials
         SET email_normalized = $1
         WHERE user_id = $2`, [normalizedEmail, userId]);
            await client.query(`INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id)
         VALUES ($1, 'user.profile_updated', 'user', $1)`, [userId]);
            return toAuthUser(row);
        });
    }
    catch (error) {
        if (typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            error.code === '23505') {
            throw new AppError(409, 'EMAIL_ALREADY_REGISTERED', 'An account with this email already exists.');
        }
        throw error;
    }
}
export const userSessionMaxAgeSeconds = sessionLifetimeMilliseconds / 1000;
export const userSessionCookieName = 'carepath_user_session';
export const userCsrfCookieName = 'carepath_user_csrf';
