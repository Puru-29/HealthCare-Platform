import { rateLimit } from 'express-rate-limit';
import { Router } from 'express';
import { getSession, googleLogin, login, logout, register, updateProfile } from '../controllers/user-auth.controller.js';
import { requireAuthCsrf, requireAuthOrigin, requireUserSession, } from '../middleware/user-auth.js';
const signInRateLimit = () => rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
});
export const authRouter = Router();
const registerRateLimit = signInRateLimit();
const loginRateLimit = signInRateLimit();
const googleSignInRateLimit = signInRateLimit();
authRouter.use((_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
});
authRouter.post('/register', registerRateLimit, requireAuthOrigin, register);
authRouter.post('/login', loginRateLimit, requireAuthOrigin, login);
authRouter.post('/google', googleSignInRateLimit, requireAuthOrigin, googleLogin);
authRouter.get('/session', requireUserSession, getSession);
authRouter.patch('/profile', requireUserSession, requireAuthOrigin, requireAuthCsrf, updateProfile);
authRouter.post('/logout', requireUserSession, requireAuthOrigin, requireAuthCsrf, logout);
