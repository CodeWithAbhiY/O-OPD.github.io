/* Single shared database connection.
   Opens (or creates) the SQLite file and enforces foreign keys. Everything
   else in the app imports `db` from here — one connection, one source of truth.

   node-sqlite3-wasm is real SQLite compiled to WebAssembly: full SQL support
   (transactions, foreign keys, partial unique indexes) with no native build. */

const fs = require('fs');
const path = require('path');
const { Database } = require('node-sqlite3-wasm');
const { config } = require('../config/env');
const logger = require('../utils/logger');

// Make sure the folder for the DB file exists.
fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

const db = new Database(config.dbPath);

// Integrity: enforce foreign key constraints (off by default in SQLite).
db.run('PRAGMA foreign_keys = ON');

logger.info('Database connected', { path: config.dbPath });

// Close cleanly on shutdown so the file is flushed.
function shutdown() {
    try { db.close(); } catch (_) { /* ignore */ }
    process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

module.exports = { db };
