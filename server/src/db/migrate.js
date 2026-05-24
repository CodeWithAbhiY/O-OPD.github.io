/* Applies the schema. Safe to run repeatedly (CREATE TABLE IF NOT EXISTS).
   Also performs small column migrations for tables that already exist.
   Run with: npm run migrate */

const fs = require('fs');
const path = require('path');
const { db } = require('./index');
const logger = require('../utils/logger');
const { generateReference } = require('../utils/reference');

function columnExists(table, column) {
    return db.all('PRAGMA table_info(' + table + ')').some(c => c.name === column);
}
function tableExists(table) {
    return !!db.get("SELECT name FROM sqlite_master WHERE type='table' AND name = ?", [table]);
}

try {
    // 1. Pre-schema column migrations (ALTER can't run inside schema.sql safely,
    //    and the unique index below needs the column to already exist).
    if (tableExists('bookings') && !columnExists('bookings', 'reference')) {
        db.run('ALTER TABLE bookings ADD COLUMN reference TEXT');
        logger.info('Added bookings.reference column');
    }
    if (tableExists('bookings') && !columnExists('bookings', 'payment_status')) {
        // Existing bookings predate payments — treat them as already paid.
        db.run("ALTER TABLE bookings ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'paid'");
        db.run('ALTER TABLE bookings ADD COLUMN payment_method TEXT');
        db.run('ALTER TABLE bookings ADD COLUMN paid_at TEXT');
        logger.info('Added bookings payment columns');
    }
    if (tableExists('bookings') && !columnExists('bookings', 'cancellation_reason')) {
        db.run('ALTER TABLE bookings ADD COLUMN cancellation_reason TEXT');
        db.run('ALTER TABLE bookings ADD COLUMN refund_amount INTEGER');
        db.run('ALTER TABLE bookings ADD COLUMN refund_at TEXT');
        logger.info('Added bookings cancellation/refund columns');
    }

    // 2. Apply the schema (creates tables + indexes, incl. uq_bookings_reference).
    db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

    // 3. Backfill any bookings missing a reference (existing rows).
    const missing = db.all("SELECT id FROM bookings WHERE reference IS NULL OR reference = ''");
    for (const row of missing) {
        let ref;
        do { ref = generateReference(); } while (db.get('SELECT 1 AS ok FROM bookings WHERE reference = ?', [ref]));
        db.run('UPDATE bookings SET reference = ? WHERE id = ?', [ref, row.id]);
    }
    if (missing.length) logger.info('Backfilled booking references', { count: missing.length });

    logger.info('Migration complete');
    process.exit(0);
} catch (err) {
    logger.error('Migration failed', { message: err.message });
    process.exit(1);
}
