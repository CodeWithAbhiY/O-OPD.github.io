/* Booking business logic. Controllers stay thin; all the rules live here.

   Security/integrity guarantees enforced in this file:
   - userId is ALWAYS the caller's verified id (passed in from req.user.id) — a
     user can only create/read/cancel their OWN bookings (no IDOR).
   - fee is taken from the doctor row server-side, never from the request, so the
     price cannot be tampered with.
   - The (date, time) must be a real slot the doctor actually offers.
   - Double-booking is prevented at the DB level by the partial unique index
     `uq_active_slot`; the INSERT runs in a transaction and a UNIQUE violation is
     translated into a clean 409 Conflict. */

const { db } = require('../db');
const { notFound, badRequest, conflict } = require('../utils/httpError');
const { generateReference } = require('../utils/reference');
const { computeRefund, hoursUntil } = require('../utils/refund');
const audit = require('./audit.service');

// One join used for both the create-result and the list, so the API shape is
// identical everywhere. DB column names never leak to the client.
const BOOKING_SELECT = `
    SELECT b.id, b.reference, b.booking_date, b.booking_time, b.status, b.fee_at_booking,
           b.payment_status, b.payment_method, b.paid_at,
           b.cancellation_reason, b.refund_amount, b.refund_at,
           b.created_at, b.cancelled_at,
           d.id AS doctor_id, d.name AS doctor, d.specialty AS specialty,
           h.name AS hospital, h.area AS area
    FROM bookings b
    JOIN doctors d   ON d.id = b.doctor_id
    JOIN hospitals h ON h.id = d.hospital_id`;

function toBooking(row) {
    return {
        id: row.id,
        reference: row.reference,
        doctorId: row.doctor_id,
        doctor: row.doctor,
        specialty: row.specialty,
        hospital: row.hospital,
        area: row.area,
        date: row.booking_date,
        time: row.booking_time,
        status: row.status,
        fee: row.fee_at_booking,
        paymentStatus: row.payment_status,
        paymentMethod: row.payment_method,
        paidAt: row.paid_at,
        cancellationReason: row.cancellation_reason,
        refundAmount: row.refund_amount,
        refundAt: row.refund_at,
        createdAt: row.created_at,
        cancelledAt: row.cancelled_at
    };
}

function getOwnedBooking(userId, bookingId) {
    return db.get(BOOKING_SELECT + ' WHERE b.id = ? AND b.user_id = ?', [bookingId, userId]);
}

function createBooking({ userId, doctorId, date, time, paymentMethod }) {
    // 1. The doctor must exist — and we read the fee from here, not the client.
    const doctor = db.get('SELECT id, fee FROM doctors WHERE id = ?', [doctorId]);
    if (!doctor) throw notFound('Doctor not found');

    // 2. The requested time must be a slot this doctor actually offers.
    const slot = db.get(
        'SELECT 1 AS ok FROM doctor_slots WHERE doctor_id = ? AND slot_time = ?',
        [doctorId, time]
    );
    if (!slot) throw badRequest('That time is not an available slot for this doctor');

    // 3. Insert inside a transaction. The partial unique index is the real guard
    //    against a concurrent double-booking; we catch its violation as a 409.
    db.run('BEGIN IMMEDIATE');
    try {
        // Friendly pre-check (the unique index below is the authoritative one).
        const clash = db.get(
            `SELECT 1 AS ok FROM bookings
             WHERE doctor_id = ? AND booking_date = ? AND booking_time = ? AND status = 'booked'`,
            [doctorId, date, time]
        );
        if (clash) throw conflict('That slot has just been booked. Please pick another time.');

        // Unique, human-friendly reference. Pre-checked for uniqueness so the
        // only UNIQUE violation the INSERT can hit is the slot guard above.
        let reference;
        do { reference = generateReference(); }
        while (db.get('SELECT 1 AS ok FROM bookings WHERE reference = ?', [reference]));

        // Dummy payment gateway: a booking only reaches here after the (simulated)
        // payment succeeded, so it is recorded as paid. The method is stored for
        // when a real gateway is wired in later.
        db.run(
            `INSERT INTO bookings
                (user_id, doctor_id, booking_date, booking_time, status, fee_at_booking,
                 reference, payment_status, payment_method, paid_at)
             VALUES (?, ?, ?, ?, 'booked', ?, ?, 'paid', ?, datetime('now'))`,
            [userId, doctorId, date, time, doctor.fee, reference, paymentMethod || null]
        );
        db.run('COMMIT');
    } catch (err) {
        try { db.run('ROLLBACK'); } catch (_) { /* ignore */ }
        if (/UNIQUE/i.test(err.message || '')) {
            throw conflict('That slot has just been booked. Please pick another time.');
        }
        throw err;
    }

    const id = db.get('SELECT last_insert_rowid() AS id').id;
    const created = db.get(BOOKING_SELECT + ' WHERE b.id = ?', [id]);
    audit.record({ userId, action: 'booking.create', entity: 'booking', entityId: id });
    return toBooking(created);
}

function listBookings({ userId, status, page, limit }) {
    const clauses = ['b.user_id = ?'];
    const params = [userId];
    if (status) {
        clauses.push('b.status = ?');
        params.push(status);
    }
    const where = ' WHERE ' + clauses.join(' AND ');

    const totalRow = db.get('SELECT COUNT(*) AS n FROM bookings b' + where, params);
    const total = totalRow ? totalRow.n : 0;

    const offset = (page - 1) * limit;
    const rows = db.all(
        BOOKING_SELECT + where + ' ORDER BY b.booking_date DESC, b.booking_time DESC' + ' LIMIT ? OFFSET ?',
        [...params, limit, offset]
    );

    return { items: rows.map(toBooking), total };
}

function cancelBooking({ userId, bookingId, reason }) {
    // Must be the caller's own booking (no IDOR) and currently active.
    const existing = getOwnedBooking(userId, bookingId);
    if (!existing) throw notFound('Booking not found');
    if (existing.status !== 'booked') {
        throw conflict('Only an active booking can be cancelled');
    }

    // Refund is computed server-side from the time remaining (authoritative).
    const wasPaid = existing.payment_status === 'paid';
    const hours = hoursUntil(existing.booking_date, existing.booking_time);
    const breakdown = computeRefund(existing.fee_at_booking, hours);
    const refundAmount = wasPaid ? breakdown.totalRefund : 0;
    const newPaymentStatus = (wasPaid && refundAmount > 0) ? 'refunded' : existing.payment_status;
    const cancellationReason = reason || 'user_cancelled';

    db.run(
        `UPDATE bookings
         SET status = 'cancelled',
             cancelled_at = datetime('now'),
             cancellation_reason = ?,
             refund_amount = ?,
             refund_at = CASE WHEN ? > 0 THEN datetime('now') ELSE NULL END,
             payment_status = ?
         WHERE id = ? AND user_id = ? AND status = 'booked'`,
        [cancellationReason, refundAmount, refundAmount, newPaymentStatus, bookingId, userId]
    );

    const updated = getOwnedBooking(userId, bookingId);
    audit.record({
        userId,
        action: refundAmount > 0 ? 'booking.cancel_refunded' : 'booking.cancel',
        entity: 'booking',
        entityId: bookingId,
        detail: cancellationReason + ' | refund ₹' + refundAmount
    });
    return toBooking(updated);
}

module.exports = { createBooking, listBookings, cancelBooking };
