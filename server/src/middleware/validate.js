/* Reusable validation middleware.
   Pass Zod schemas for any of body/query/params. On success the parsed,
   sanitized values are placed on req.validated (use THOSE, not the raw req).
   On failure it forwards a 400 VALIDATION_ERROR with field-level details. */

const { validation } = require('../utils/httpError');

function validate(schemas) {
    return (req, res, next) => {
        try {
            req.validated = req.validated || {};
            if (schemas.params) req.validated.params = schemas.params.parse(req.params);
            if (schemas.query) req.validated.query = schemas.query.parse(req.query);
            if (schemas.body) req.validated.body = schemas.body.parse(req.body);
            next();
        } catch (err) {
            if (err && Array.isArray(err.issues)) {
                const details = err.issues.map(i => ({
                    field: i.path.join('.') || '(root)',
                    message: i.message
                }));
                return next(validation(details));
            }
            next(err);
        }
    };
}

module.exports = { validate };
