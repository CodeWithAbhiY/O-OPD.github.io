/* Seeds sample hospitals, doctors and availability from data/doctors.js.
   Idempotent: does nothing if doctors already exist. Wrapped in a transaction
   so a failure leaves the database untouched. Run with: npm run seed */

const { db } = require('./index');
const sampleDoctors = require('../../data/doctors');
const logger = require('../utils/logger');

(async () => {
    try {
        const existing = await db.get('SELECT COUNT(*)::int AS n FROM doctors');
        if (existing && existing.n > 0) {
            logger.info('Seed skipped — doctors already present', { count: existing.n });
            await db.pool.end();
            process.exit(0);
        }

        await db.tx(async (t) => {
            for (const d of sampleDoctors) {
                let hospital = await t.get(
                    'SELECT id FROM hospitals WHERE name = ? AND area = ?', [d.hospital, d.area]
                );
                if (!hospital) {
                    hospital = await t.get(
                        'INSERT INTO hospitals (name, area) VALUES (?, ?) RETURNING id', [d.hospital, d.area]
                    );
                }
                const doctor = await t.get(
                    `INSERT INTO doctors (name, specialty, specialty_key, hospital_id, fee, rating, experience_years)
                     VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
                    [d.doctor, d.specialty, d.key, hospital.id, d.fee, d.rating, d.exp]
                );
                for (const time of d.slots) {
                    await t.run('INSERT INTO doctor_slots (doctor_id, slot_time) VALUES (?, ?)', [doctor.id, time]);
                }
            }
        });

        const counts = {
            hospitals: (await db.get('SELECT COUNT(*)::int AS n FROM hospitals')).n,
            doctors: (await db.get('SELECT COUNT(*)::int AS n FROM doctors')).n,
            slots: (await db.get('SELECT COUNT(*)::int AS n FROM doctor_slots')).n
        };
        logger.info('Seed complete', counts);
        await db.pool.end();
        process.exit(0);
    } catch (err) {
        logger.error('Seed failed', { message: err.message });
        try { await db.pool.end(); } catch (_) { /* ignore */ }
        process.exit(1);
    }
})();
