/* Data access for doctors. All SQL uses parameterized statements (no string
   concatenation of user input) so SQL injection is structurally impossible.
   Returns clean, API-shaped objects — the DB column names never leak out. */

const { db } = require('../db');

// Map a joined DB row to the public API shape.
function toDoctor(row) {
    return {
        id: row.id,
        name: row.name,
        specialty: row.specialty,
        specialtyKey: row.specialty_key,
        hospital: row.hospital,
        area: row.area,
        fee: row.fee,
        rating: row.rating,
        experienceYears: row.experience_years,
        slots: row.slots_csv ? String(row.slots_csv).split(',').sort() : []
    };
}

const BASE_SELECT = `
    SELECT d.id, d.name, d.specialty, d.specialty_key, d.fee, d.rating, d.experience_years,
           h.name AS hospital, h.area AS area,
           (SELECT string_agg(slot_time, ',') FROM doctor_slots s WHERE s.doctor_id = d.id) AS slots_csv
    FROM doctors d
    JOIN hospitals h ON h.id = d.hospital_id`;

function buildFilters({ specialty, location }) {
    const clauses = [];
    const params = [];
    // Match the way the front-end searches: the chosen specialty label (e.g.
    // "Cardiology (heart)") contains the doctor's specialty_key stem.
    if (specialty) {
        clauses.push('strpos(lower(?), d.specialty_key) > 0');
        params.push(specialty);
    }
    if (location) {
        clauses.push('lower(h.area) LIKE ?');
        params.push('%' + location.toLowerCase() + '%');
    }
    const where = clauses.length ? ' WHERE ' + clauses.join(' AND ') : '';
    return { where, params };
}

function orderClause(sort) {
    if (sort === 'fee') return ' ORDER BY d.fee ASC, d.id ASC';
    if (sort === 'rating') return ' ORDER BY d.rating DESC, d.id ASC';
    return ' ORDER BY d.rating DESC, d.id ASC'; // relevance
}

async function listDoctors({ specialty, location, page, limit, sort }) {
    const { where, params } = buildFilters({ specialty, location });

    const totalRow = await db.get(
        'SELECT COUNT(*)::int AS n FROM doctors d JOIN hospitals h ON h.id = d.hospital_id' + where, params
    );
    const total = totalRow ? totalRow.n : 0;

    const offset = (page - 1) * limit;
    const rows = await db.all(
        BASE_SELECT + where + orderClause(sort) + ' LIMIT ? OFFSET ?',
        [...params, limit, offset]
    );

    return { items: rows.map(toDoctor), total };
}

async function getDoctorById(id) {
    const row = await db.get(BASE_SELECT + ' WHERE d.id = ?', [id]);
    return row ? toDoctor(row) : null;
}

module.exports = { listDoctors, getDoctorById };
