/* Typed, operational HTTP errors. Controllers/services throw these; the central
   error handler turns them into consistent JSON responses with safe messages.
   Anything that is NOT an AppError is treated as an unexpected 500 and its
   details are logged server-side only (never leaked to the client). */

class AppError extends Error {
    constructor(statusCode, code, message, details) {
        super(message);
        this.name = 'AppError';
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
        this.isOperational = true;
    }
}

const badRequest = (message, details) => new AppError(400, 'BAD_REQUEST', message || 'Bad request', details);
const validation = (details) => new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', details);
const unauthorized = (message) => new AppError(401, 'UNAUTHORIZED', message || 'Authentication required');
const forbidden = (message) => new AppError(403, 'FORBIDDEN', message || 'Forbidden');
const notFound = (message) => new AppError(404, 'NOT_FOUND', message || 'Resource not found');
const conflict = (message, details) => new AppError(409, 'CONFLICT', message || 'Conflict', details);

module.exports = { AppError, badRequest, validation, unauthorized, forbidden, notFound, conflict };
