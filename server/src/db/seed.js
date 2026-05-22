/* Seeds sample hospitals, doctors and availability from data/doctors.js.
   Idempotent: does nothing if doctors already exist. Wrapped in a transaction
   so a failure leaves the database untouched (no half-seeded state).
   Run with: npm run seed */

const { db } = require('./index');
const sampleDoctors = require('../../data/doctors');
const logger = require('../utils/logger');

function lastId() {
    return db.get('SELECT last_insert_rowid() AS id').id;
}

function getOrCreateHospital(name, area) {
    const existing = db.get('SELECT id FROM hospitals WHERE name = ? AND area = ?', [name, area]);
    if (existing) return existing.id;
    db.run('INSERT INTO hospitals (name, area) VALUES (?, ?)', [name, area]);
    return lastId();
}

try {
    const { n } = db.get('SELECT COUNT(*) AS n FROM doctors');
    if (n > 0) {
        logger.info('Seed skipped — doctors already present', { count: n });
        process.exit(0);
    }

    db.run('BEGIN');
    try {
        const insertDoctor = `INSERT INTO doctors
            (name, specialty, specialty_key, hospital_id, fee, rating, experience_years)
            VALUES (?, ?, ?, ?, ?, ?, ?)`;

        for (const d of sampleDoctors) {
            const hospitalId = getOrCreateHospital(d.hospital, d.area);
            db.run(insertDoctor, [d.doctor, d.specialty, d.key, hospitalId, d.fee, d.rating, d.exp]);
            const doctorId = lastId();
            for (const time of d.slots) {
                db.run('INSERT INTO doctor_slots (doctor_id, slot_time) VALUES (?, ?)', [doctorId, time]);
            }
        }

        db.run('COMMIT');
    } catch (err) {
        db.run('ROLLBACK');
        throw err;
    }

    const counts = {
        hospitals: db.get('SELECT COUNT(*) AS n FROM hospitals').n,
        doctors: db.get('SELECT COUNT(*) AS n FROM doctors').n,
        slots: db.get('SELECT COUNT(*) AS n FROM doctor_slots').n
    };
    logger.info('Seed complete', counts);
    process.exit(0);
} catch (err) {
    logger.error('Seed failed', { message: err.message });
    process.exit(1);
}
