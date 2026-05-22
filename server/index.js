/* =====================================================================
   O-OPD backend — Express API (step 1)
   ---------------------------------------------------------------------
   This is a small web SERVER. It listens for requests from the browser
   and replies with JSON data. Right now it serves the sample doctors.
   Run it with:  npm run dev   (inside the server/ folder)
   ===================================================================== */

const express = require('express');   // the web framework
const cors = require('cors');         // lets the browser front-end call this API
const doctors = require('./data/doctors');

const app = express();

// ----- Middleware (runs on every request) -----
app.use(cors());            // allow requests from the front-end (different origin)
app.use(express.json());    // parse JSON request bodies into req.body

// ----- Routes (each "endpoint" the front-end can call) -----

// Health check — visit http://localhost:4000/api/health to confirm it's alive.
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'o-opd-api', time: new Date().toISOString() });
});

// List doctors, optionally filtered by ?specialty= and ?location=
// e.g. /api/doctors?specialty=Orthopedics
app.get('/api/doctors', (req, res) => {
    const specialty = (req.query.specialty || '').toLowerCase();
    const location = (req.query.location || '').toLowerCase();

    let result = doctors;
    if (specialty) {
        result = result.filter(d => specialty.includes(d.key));
    }
    if (location) {
        result = result.filter(d => d.area.toLowerCase().includes(location));
    }

    res.json({ count: result.length, doctors: result });
});

// Get a single doctor by id — e.g. /api/doctors/4
app.get('/api/doctors/:id', (req, res) => {
    const doc = doctors.find(d => d.id === Number(req.params.id));
    if (!doc) return res.status(404).json({ error: 'Doctor not found' });
    res.json(doc);
});

// ----- Start listening -----
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`O-OPD API running at http://localhost:${PORT}`);
    console.log(`Try: http://localhost:${PORT}/api/health`);
});
