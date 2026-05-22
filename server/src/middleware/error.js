/* Centralized error handling.
   - notFound: any unmatched route becomes a clean JSON 404.
   - errorHandler: turns AppErrors into consistent JSON; logs unexpected errors
     in full server-side but NEVER leaks internals (stack/DB messages) to the client. */

const logger = require('../utils/logger');
const { AppError, notFound: notFoundError } = require('../utils/httpError');

function notFound(req, res, next) {
    next(notFoundError('Route not found: ' + req.method + ' ' + req.originalUrl));
}

// Express identifies error handlers by their 4 arguments — keep `next`.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
    const isApp = err instanceof AppError;
    const status = isApp ? err.statusCode : 500;

    if (!isApp || status >= 500) {
        logger.error('Unhandled error', { message: err.message, stack: err.stack });
    } else {
        logger.warn('Request error', { code: err.code, message: err.message });
    }

    const body = {
        error: {
            code: isApp ? err.code : 'INTERNAL_ERROR',
            message: isApp ? err.message : 'Something went wrong'
        }
    };
    if (isApp && err.details) body.error.details = err.details;

    res.status(status).json(body);
}

module.exports = { notFound, errorHandler };
