/* Tiny structured logger. Emits one JSON line per event so logs are easy to
   grep/parse and won't break when messages contain commas, quotes, etc. */

function emit(level, msg, meta) {
    const entry = { ts: new Date().toISOString(), level, msg };
    if (meta && Object.keys(meta).length) entry.meta = meta;
    const line = JSON.stringify(entry);
    if (level === 'error') console.error(line);
    else console.log(line);
}

module.exports = {
    info: (msg, meta) => emit('info', msg, meta),
    warn: (msg, meta) => emit('warn', msg, meta),
    error: (msg, meta) => emit('error', msg, meta),
    debug: (msg, meta) => { if (process.env.NODE_ENV !== 'production') emit('debug', msg, meta); }
};
