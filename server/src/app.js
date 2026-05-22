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

app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
