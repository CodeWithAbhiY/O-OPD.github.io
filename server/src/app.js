/* Express app wiring. Order matters:
   security headers → CORS → body parsing → logging → routes → 404 → errors. */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const { config } = require('./config/env');
const { forbidden } = require('./utils/httpError');
const requestLogger = require('./middleware/requestLogger');
const { notFound, errorHandler } = require('./middleware/error');
const routes = require('./routes');

const app = express();

// In production we run behind Fly.io's proxy. Trust the first hop so the real
// client IP (X-Forwarded-For) is used for rate limiting + logging — otherwise
// every request looks like it comes from the proxy and limits apply globally.
if (config.isProd) app.set('trust proxy', 1);

app.disable('x-powered-by');
app.use(helmet());

app.use(cors({
    origin(origin, cb) {
        // Allow same-origin / tools (no Origin) and file:// (origin "null").
        if (!origin || origin === 'null' || config.allowedOrigins.includes(origin)) {
            return cb(null, true);
        }
        return cb(forbidden('Origin not allowed by CORS: ' + origin));
    }
}));

app.use(express.json({ limit: '10kb' }));
app.use(requestLogger);

// Dev-only live database viewer (returns 404 in production). Mounted outside
// /api so you can open http://localhost:4000/__dev in a browser tab.
app.use('/__dev', require('./routes/dev.routes'));

app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
