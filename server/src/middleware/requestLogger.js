/* Logs one structured line per request once the response is sent. */

const logger = require('../utils/logger');

module.exports = function requestLogger(req, res, next) {
    const start = Date.now();
    res.on('finish', () => {
        logger.info('request', {
            method: req.method,
            path: req.originalUrl,
            status: res.statusCode,
            ms: Date.now() - start
        });
    });
    next();
};
