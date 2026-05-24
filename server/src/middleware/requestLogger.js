/* Logs one structured line per request once the response is sent. */

const logger = require('../utils/logger');

module.exports = function requestLogger(req, res, next) {
    const start = Date.now();
    res.on('finish', () => {
        // The dev DB viewer polls every 2s; skip those so the console stays
        // readable (and OTP codes aren't buried).
        if (req.path.startsWith('/__dev')) return;
        logger.info('request', {
            method: req.method,
            path: req.originalUrl,
            status: res.statusCode,
            ms: Date.now() - start
        });
    });
    next();
};
