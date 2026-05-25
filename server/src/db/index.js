/* Single shared PostgreSQL connection pool.
   Everything imports `db` from here — one pool, one source of truth.

   The helpers keep the same get/all/run names the codebase already used (with
   SQLite), but they are now ASYNC (return promises) because the pg driver is
   async. They also accept `?` placeholders and convert them to Postgres's
   $1, $2, … form, so existing parameterised SQL works with minimal changes.

   For multi-statement transactions use db.tx(async (t) => { ... }) — it runs
   them on ONE dedicated client and COMMITs, or ROLLBACKs on any error. */

const { Pool } = require('pg');
const { config } = require('../config/env');
const logger = require('../utils/logger');

// Local Postgres usually has no TLS; hosted ones (Neon/Render) require it.
const isLocal = /(@|\/\/)(localhost|127\.0\.0\.1)\b/.test(config.databaseUrl || '');
const pool = new Pool({
    connectionString: config.databaseUrl,
    ssl: isLocal ? false : { rejectUnauthorized: false },
    max: 8,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
});

pool.on('error', (err) => {
    logger.error('Unexpected idle DB client error', { message: err.message });
});

// Convert `?` placeholders → `$1, $2, …`. Our SQL never contains a literal `?`
// inside a string, so a straight positional replace is safe.
function toPg(sql) {
    let i = 0;
    return sql.replace(/\?/g, () => '$' + (++i));
}

async function query(text, params) {
    return pool.query(toPg(text), params || []);
}

async function all(text, params) {
    return (await query(text, params)).rows;
}

async function get(text, params) {
    return (await query(text, params)).rows[0];
}

async function run(text, params) {
    return query(text, params);
}

// Transaction: the callback receives a transactional handle {get, all, run}
// bound to ONE client. Commit on success, rollback on any throw.
async function tx(fn) {
    const client = await pool.connect();
    const handle = {
        all: async (t, p) => (await client.query(toPg(t), p || [])).rows,
        get: async (t, p) => (await client.query(toPg(t), p || [])).rows[0],
        run: async (t, p) => client.query(toPg(t), p || [])
    };
    try {
        await client.query('BEGIN');
        const result = await fn(handle);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
        throw err;
    } finally {
        client.release();
    }
}

logger.info('Database pool configured', { ssl: !isLocal });

// Close the pool cleanly on shutdown.
async function shutdown() {
    try { await pool.end(); } catch (_) { /* ignore */ }
    process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

module.exports = { db: { query, all, get, run, tx, pool } };
