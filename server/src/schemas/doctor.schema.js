/* Zod schemas for the doctors endpoints.
   Query objects strip unknown keys (lenient — query strings often carry extras).
   Params are coerced and strictly typed. */

const { z } = require('zod');

const listQuery = z.object({
    specialty: z.string().trim().max(80).optional(),
    location: z.string().trim().max(80).optional(),
    page: z.coerce.number().int().min(1).max(10000).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    sort: z.enum(['relevance', 'rating', 'fee']).default('relevance')
});

const idParam = z.object({
    id: z.coerce.number().int().positive()
});

module.exports = { listQuery, idParam };
