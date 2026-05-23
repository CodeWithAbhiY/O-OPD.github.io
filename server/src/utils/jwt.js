/* JWT sign/verify helpers. One place owns the algorithm, secret and expiry so
   token handling stays consistent across the app. */

const jwt = require('jsonwebtoken');
const { config } = require('../config/env');

const OPTIONS = { algorithm: 'HS256', expiresIn: config.jwtExpiresIn };

function signToken(payload) {
    return jwt.sign(payload, config.jwtSecret, OPTIONS);
}

function verifyToken(token) {
    // Throws if invalid/expired/tampered — callers handle the error.
    return jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
}

module.exports = { signToken, verifyToken };
