/* Audit trail for sensitive actions (register, login, book, cancel, ...).
   Reusable across features. Best-effort + fire-and-forget: callers do NOT await
   this, and a logging failure must never break the user's actual request — so
   errors are swallowed internally (no unhandled rejection). */

const { db } = require('../db');
const logger = require('../utils/logger');

async function record({ userId = null, action, entity = null, entityId = null, detail = null }) {
    try {
        await db.run(
            'INSERT INTO audit_log (user_id, action, entity, entity_id, detail) VALUES (?, ?, ?, ?, ?)',
            [userId, action, entity, entityId, detail]
        );
    } catch (err) {
        logger.error('Audit write failed', { action, message: err.message });
    }
}

module.exports = { record };
