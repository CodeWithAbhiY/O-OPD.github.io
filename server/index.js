/* =====================================================================
   O-OPD backend — Express API
   ---------------------------------------------------------------------
   A small web SERVER. It listens for requests from the browser and
   replies with JSON. Right now it serves the sample doctors.

   Run it:  npm run dev   (inside the server/ folder)

   Security notes (why each piece is here):
   - CORS allowlist: only our own front-end origins may call this API.
   - Body size limit: rejects oversized request bodies.
   - Input cleaning: query params are trimmed and length-capped.
   - 404 / error handlers: never leak stack traces; always return JSON.
   ===================================================================== */

const express = require('express');
const cors = require('cors');
const doctors = require('./data/doctors');

const app = express();

// ----- Which front-end origins may call this API -----
// Override in production with an ALLOWED_ORIGINS env var (comma-separated).
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ||
    'http://localhost:8000,http://127.0.0.1:8000,http://localhost:3000,http://localhost:5500,http://127.0.0.1:5500'
).split(',').map(s => s.trim());

app.use(cors({
    origin(origin, cb) {
        // No origin = same-origin, curl/Postman, or file:// (origin "null").
        if (!origin || origin === 'null') return cb(null, true);
        if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
        return cb(new Error('Origin not allowed by CORS: ' + origin));
    }
}));

app.use(express.json({ limit: '10kb' })); // parse JSON bodies, but cap the size

// ----- Helpers -----
// Trim a query value to a string and cap its length (defends against abuse).
function cleanParam(value, max) {
    if (typeof value !== 'string') return '';
    return value.trim().slice(0, max);
}

// ----- Routes -----

// Health check — visit http://localhost:4000/api/health to confirm it's alive.
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'o-opd-api', time: new Date().toISOString() });
});

// List doctors, optionally filtered by ?specialty= and ?location=
app.get('/api/doctors', (req, res) => {
    const specialty = cleanParam(req.query.specialty, 80).toLowerCase();
    const location = cleanParam(req.query.location, 80).toLowerCase();

    let result = doctors;
    if (specialty) result = result.filter(d => specialty.includes(d.key));
    if (location) result = result.filter(d => d.area.toLowerCase().includes(location));

    res.json({ count: result.length, doctors: result });
});

// Get a single doctor by id — e.g. /api/doctors/4
app.get('/api/doctors/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
        return res.status(400).json({ error: 'Invalid doctor id' });
    }
    const doc = doctors.find(d => d.id === id);
    if (!doc) return res.status(404).json({ error: 'Doctor not found' });
    res.json(doc);
});

// ----- Fallbacks -----

// Any unknown route → JSON 404 (not an HTML error page).
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// Central error handler (e.g. blocked CORS origin). Never leak internals.
app.use((err, req, res, next) => {
    const status = /CORS/.test(err.message) ? 403 : 500;
    res.status(status).json({ error: status === 403 ? err.message : 'Server error' });
});

// ----- Start listening -----
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`O-OPD API running at http://localhost:${PORT}`);
    console.log(`Try: http://localhost:${PORT}/api/health`);
});
