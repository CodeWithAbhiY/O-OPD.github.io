/* Protects routes. Expects "Authorization: Bearer <token>".
   Verifies the JWT and confirms the user still exists, then attaches
   req.user = { id, role, email, name }. Routes/services use req.user.id —
   never a client-supplied id — which is what prevents IDOR. */

const { unauthorized } = require('../utils/httpError');
const { verifyToken } = require('../utils/jwt');
const authService = require('../services/auth.service');

async function requireAuth(req, res, next) {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
        return next(unauthorized('Missing or invalid Authorization header'));
    }

    let payload;
    try {
        payload = verifyToken(token);
    } catch (err) {
        return next(unauthorized('Invalid or expired token'));
    }

    try {
        const user = await authService.getUserById(payload.sub);
        if (!user) {
            return next(unauthorized('Account no longer exists'));
        }
        req.user = { id: user.id, role: user.role, email: user.email, name: user.name };
        next();
    } catch (err) {
        next(err); // unexpected DB error → centralized handler
    }
}

module.exports = { requireAuth };
