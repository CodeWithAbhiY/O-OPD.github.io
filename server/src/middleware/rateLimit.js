/* Rate limiters. authLimiter throttles auth endpoints to blunt brute-force /
   credential-stuffing attacks. (In-memory store is fine for a single instance;
   a multi-instance deployment would use a shared store like Redis.) */

const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 30,                  // per IP per window
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        res.status(429).json({
            error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please try again later.' }
        });
    }
});

module.exports = { authLimiter };
