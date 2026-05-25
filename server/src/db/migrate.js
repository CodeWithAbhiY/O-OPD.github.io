/* Applies the schema to PostgreSQL. Safe to run repeatedly — every statement
   uses CREATE ... IF NOT EXISTS. Run with: npm run migrate */

const fs = require('fs');
const path = require('path');
const { db } = require('./index');
const logger = require('../utils/logger');

(async () => {
    try {
        const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
        // schema.sql has no bound params, so run it as one multi-statement query.
        await db.pool.query(sql);
        logger.info('Migration complete (schema applied)');
        await db.pool.end();
        process.exit(0);
    } catch (err) {
        logger.error('Migration failed', { message: err.message });
        try { await db.pool.end(); } catch (_) { /* ignore */ }
        process.exit(1);
    }
})();
