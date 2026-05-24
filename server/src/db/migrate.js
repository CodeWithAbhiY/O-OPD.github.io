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

    // 1a-ii. Soft-delete columns on users (account deactivation).
    if (tableExists('users') && !columnExists('users', 'is_active')) {
        db.run('ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))');
        db.run('ALTER TABLE users ADD COLUMN deleted_at TEXT');
        db.run('ALTER TABLE users ADD COLUMN deletion_reason TEXT');
        logger.info('Added users soft-delete columns');
    }

    // 1b. Allow status='missed'. SQLite can't ALTER a CHECK constraint, so if the
    //     existing bookings table still has the old 3-value CHECK, rebuild it.
    if (tableExists('bookings')) {
        const ddl = db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='bookings'");
        if (ddl && ddl.sql && !/'missed'/.test(ddl.sql)) {
            logger.info('Rebuilding bookings table to allow status=missed');
            db.run('PRAGMA foreign_keys = OFF');
            db.run('BEGIN');
            try {
                db.run(`CREATE TABLE bookings_new (
                    id             INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id        INTEGER NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
                    doctor_id      INTEGER NOT NULL REFERENCES doctors(id) ON DELETE RESTRICT,
                    booking_date   TEXT NOT NULL CHECK (booking_date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
                    booking_time   TEXT NOT NULL CHECK (booking_time GLOB '[0-2][0-9]:[0-5][0-9]'),
                    status         TEXT NOT NULL DEFAULT 'booked' CHECK (status IN ('booked', 'cancelled', 'completed', 'missed')),
                    fee_at_booking INTEGER NOT NULL CHECK (fee_at_booking >= 0),
                    reference      TEXT,
                    payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('paid', 'unpaid', 'failed', 'refunded')),
                    payment_method TEXT,
                    paid_at        TEXT,
                    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
                    cancelled_at   TEXT,
                    cancellation_reason TEXT,
                    refund_amount  INTEGER,
                    refund_at      TEXT
                )`);
                db.run(`INSERT INTO bookings_new
                        (id, user_id, doctor_id, booking_date, booking_time, status, fee_at_booking,
                         reference, payment_status, payment_method, paid_at, created_at,
                         cancelled_at, cancellation_reason, refund_amount, refund_at)
                        SELECT id, user_id, doctor_id, booking_date, booking_time, status, fee_at_booking,
                               reference, payment_status, payment_method, paid_at, created_at,
                               cancelled_at, cancellation_reason, refund_amount, refund_at
                        FROM bookings`);
                db.run('DROP TABLE bookings');
                db.run('ALTER TABLE bookings_new RENAME TO bookings');
                db.run('COMMIT');
            } catch (e) {
                try { db.run('ROLLBACK'); } catch (_) { /* ignore */ }
                db.run('PRAGMA foreign_keys = ON');
                throw e;
            }
            db.run('PRAGMA foreign_keys = ON');
        }
    }

    // 2. Apply the schema (creates tables + indexes, incl. uq_bookings_reference).
    //    After a rebuild above, this recreates the bookings indexes too.
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
