/* Entry point — starts the HTTP server. App wiring lives in src/app.js.
   Run the database setup first:  npm run setup   (migrate + seed)
   Then start it:                 npm run dev */

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
