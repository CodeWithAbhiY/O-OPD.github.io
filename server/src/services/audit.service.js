/* Audit trail for sensitive actions (register, login, book, cancel, ...).
   Reusable across features. Best-effort: a logging failure must never break
   the user's actual request. */

const { db } = require('../db');
const logger = require('../utils/logger');

function record({ userId = null, action, entity = null, entityId = null, detail = null }) {
    try {
        db.run(
            'INSERT INTO audit_log (user_id, action, entity, entity_id, detail) VALUES (?, ?, ?, ?, ?)',
            [userId, action, entity, entityId, detail]
        );
    } catch (err) {
        logger.error('Audit write failed', { action, message: err.message });
    }
}

module.exports = { record };
