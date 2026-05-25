/* Entry point — starts the HTTP server. App wiring lives in src/app.js.
   Run the database setup first:  npm run setup   (migrate + seed)
   Then start it:                 npm run dev */

// Prefer IPv4 for all outbound DNS. Some hosts (e.g. Render) have no outbound
// IPv6, so an IPv6 address for smtp.gmail.com fails with ENETUNREACH. This makes
// SMTP (and any other outbound) resolve to IPv4 first.
require('dns').setDefaultResultOrder('ipv4first');

const app = require('./src/app');
const { config } = require('./src/config/env');
const logger = require('./src/utils/logger');

const server = app.listen(config.port, () => {
    logger.info('O-OPD API listening', { port: config.port, env: config.nodeEnv });
    logger.info('Health check', { url: `http://localhost:${config.port}/api/health` });
});

// Surface fatal startup errors clearly (e.g. port already in use).
server.on('error', (err) => {
    logger.error('Server failed to start', { message: err.message });
    process.exit(1);
});
