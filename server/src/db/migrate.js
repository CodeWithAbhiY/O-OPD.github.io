/* Applies the schema. Safe to run repeatedly (CREATE TABLE IF NOT EXISTS).
   Run with: npm run migrate */

const fs = require('fs');
const path = require('path');
const { db } = require('./index');
const logger = require('../utils/logger');

try {
    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    db.exec(sql);
    logger.info('Migration complete');
    process.exit(0);
} catch (err) {
    logger.error('Migration failed', { message: err.message });
    process.exit(1);
}
