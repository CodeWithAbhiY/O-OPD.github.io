/* Wraps an async route handler so any rejected promise is forwarded to the
   central error handler instead of crashing the process / hanging the request. */

module.exports = function asyncHandler(fn) {
    return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
};
