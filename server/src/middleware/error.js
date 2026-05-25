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

    // Known client errors from middleware like body-parser carry a 4xx status
    // (e.g. malformed JSON → 400, oversized body → 413). Honour those instead of
    // turning them into a confusing 500.
    const rawStatus = err.status || err.statusCode;
    const isClient = !isApp && Number.isInteger(rawStatus) && rawStatus >= 400 && rawStatus < 500;

    const status = isApp ? err.statusCode : (isClient ? rawStatus : 500);

    if (status >= 500) {
        logger.error('Unhandled error', { message: err.message, stack: err.stack });
    } else {
        logger.warn('Request error', { code: err.code || err.type, message: err.message });
    }

    let code = 'INTERNAL_ERROR';
    let message = 'Something went wrong';
    if (isApp) {
        code = err.code;
        message = err.message;
    } else if (isClient) {
        code = err.type === 'entity.too.large' ? 'PAYLOAD_TOO_LARGE' : 'BAD_REQUEST';
        message = err.type === 'entity.too.large' ? 'Request body is too large' : 'Malformed request body';
    }

    const body = { error: { code, message } };
    if (isApp && err.details) body.error.details = err.details;

    res.status(status).json(body);
}

module.exports = { notFound, errorHandler };
