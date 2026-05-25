/* Booking business logic (PostgreSQL). Controllers stay thin; rules live here.

   Security/integrity guarantees enforced in this file:
   - userId is ALWAYS the caller's verified id (from req.user.id) — a user can
     only create/read/cancel their OWN bookings (no IDOR).
   - fee is taken from the doctor row server-side, never from the request.
   - The (date, time) must be a real slot the doctor actually offers.
   - Double-booking is prevented at the DB level by the partial unique index
     `uq_active_slot`; the INSERT runs in a transaction and a UNIQUE violation is
     translated into a clean 409 Conflict. */

const { db } = require('../db');
const { NOW, NOW_IST } = require('../db/sql');
const { notFound, badRequest, conflict } = require('../utils/httpError');
const { generateReference } = require('../utils/reference');
const { computeRefund, hoursUntil } = require('../utils/refund');
const audit = require('./audit.service');
const notifications = require('./notifications.service');
const emailService = require('./email.service');

function isUniqueViolation(err) {
    return err && (err.code === '23505' || /unique/i.test(err.message || ''));
}

// Notifications must never break a booking action, so failures are swallowed.
async function notify(userId, type, title, body, bookingId) {
    try {
        await notifications.create({ userId, type, title, body, bookingId });
    } catch (_) { /* non-fatal */ }
}

// Email address + name for a booking's owner (used for confirmation/cancel mail).
async function userContact(userId) {
    return (await db.get('SELECT email, name FROM users WHERE id = ?', [userId])) || null;
}

// One join used everywhere, so the API shape is identical. Columns never leak.
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

async function getOwnedBooking(userId, bookingId) {
    return db.get(BOOKING_SELECT + ' WHERE b.id = ? AND b.user_id = ?', [bookingId, userId]);
}

// Any of the user's still-'booked' appointments whose IST date+time has already
// passed become 'missed' (no-show). The owner can later flip one to 'completed'.
async function lapsePastBookings(userId) {
    const cond = `(booking_date || ' ' || booking_time || ':00') < ${NOW_IST}`;
    const lapsing = await db.all(
        BOOKING_SELECT + ` WHERE b.user_id = ? AND b.status = 'booked' AND ${cond}`,
        [userId]
    );
    if (!lapsing.length) return;

    await db.run(
        `UPDATE bookings SET status = 'missed'
         WHERE user_id = ? AND status = 'booked' AND ${cond}`,
        [userId]
    );

    for (const r of lapsing) {
        await notify(userId, 'booking_missed', '⚠️ Appointment Missed',
            'You missed your appointment ' + r.reference + ' with ' + r.doctor +
            ' on ' + r.booking_date + ' at ' + r.booking_time + '.', r.id);
    }
}

async function createBooking({ userId, doctorId, date, time, paymentMethod }) {
    // 1. The doctor must exist — and we read the fee from here, not the client.
    const doctor = await db.get('SELECT id, fee FROM doctors WHERE id = ?', [doctorId]);
    if (!doctor) throw notFound('Doctor not found');

    // 2. The requested time must be a slot this doctor actually offers.
    const slot = await db.get(
        'SELECT 1 AS ok FROM doctor_slots WHERE doctor_id = ? AND slot_time = ?',
        [doctorId, time]
    );
    if (!slot) throw badRequest('That time is not an available slot for this doctor');

    // 3. Insert inside a transaction. The partial unique index is the real guard
    //    against a concurrent double-booking; we catch its violation as a 409.
    let id;
    try {
        id = await db.tx(async (t) => {
            const clash = await t.get(
                `SELECT 1 AS ok FROM bookings
                 WHERE doctor_id = ? AND booking_date = ? AND booking_time = ? AND status = 'booked'`,
                [doctorId, date, time]
            );
            if (clash) throw conflict('That slot has just been booked. Please pick another time.');

            // Unique, human-friendly reference (pre-checked for uniqueness).
            let reference;
            do { reference = generateReference(); }
            while (await t.get('SELECT 1 AS ok FROM bookings WHERE reference = ?', [reference]));

            // A booking only reaches here after the (simulated) payment succeeded.
            const inserted = await t.get(
                `INSERT INTO bookings
                    (user_id, doctor_id, booking_date, booking_time, status, fee_at_booking,
                     reference, payment_status, payment_method, paid_at)
                 VALUES (?, ?, ?, ?, 'booked', ?, ?, 'paid', ?, ${NOW}) RETURNING id`,
                [userId, doctorId, date, time, doctor.fee, reference, paymentMethod || null]
            );
            return inserted.id;
        });
    } catch (err) {
        if (err.statusCode) throw err;             // our own AppError (e.g. clash)
        if (isUniqueViolation(err)) throw conflict('That slot has just been booked. Please pick another time.');
        throw err;
    }

    const created = await db.get(BOOKING_SELECT + ' WHERE b.id = ?', [id]);
    audit.record({ userId, action: 'booking.create', entity: 'booking', entityId: id });

    await notify(userId, 'booking_confirmed', '✅ Appointment Confirmed',
        'Payment of ₹' + created.fee_at_booking + ' for appointment ' + created.reference +
        ' with ' + created.doctor + ' on ' + created.booking_date + ' at ' + created.booking_time +
        ' is successful.', id);

    // Confirmation email + printable bill (fire-and-forget; never breaks booking).
    const owner = await userContact(userId);
    if (owner && owner.email) {
        emailService.sendBookingEmail(owner.email, owner.name, {
            reference: created.reference, doctor: created.doctor, specialty: created.specialty,
            hospital: created.hospital, area: created.area, date: created.booking_date,
            time: created.booking_time, fee: created.fee_at_booking,
            paymentMethod: created.payment_method, paidAt: created.paid_at
        }).catch(() => { /* non-fatal */ });
    }

    return toBooking(created);
}

async function listBookings({ userId, status, page, limit }) {
    await lapsePastBookings(userId); // settle no-shows before reading
    const clauses = ['b.user_id = ?'];
    const params = [userId];
    if (status) {
        clauses.push('b.status = ?');
        params.push(status);
    }
    const where = ' WHERE ' + clauses.join(' AND ');

    const totalRow = await db.get('SELECT COUNT(*)::int AS n FROM bookings b' + where, params);
    const total = totalRow ? totalRow.n : 0;

    const offset = (page - 1) * limit;
    const rows = await db.all(
        BOOKING_SELECT + where + ' ORDER BY b.booking_date DESC, b.booking_time DESC' + ' LIMIT ? OFFSET ?',
        [...params, limit, offset]
    );

    return { items: rows.map(toBooking), total };
}

async function cancelBooking({ userId, bookingId, reason }) {
    await lapsePastBookings(userId); // a passed appointment is 'missed', not cancellable
    const existing = await getOwnedBooking(userId, bookingId);
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

    await db.run(
        `UPDATE bookings
         SET status = 'cancelled',
             cancelled_at = ${NOW},
             cancellation_reason = ?,
             refund_amount = ?,
             refund_at = CASE WHEN ? > 0 THEN ${NOW} ELSE NULL END,
             payment_status = ?
         WHERE id = ? AND user_id = ? AND status = 'booked'`,
        [cancellationReason, refundAmount, refundAmount, newPaymentStatus, bookingId, userId]
    );

    const updated = await getOwnedBooking(userId, bookingId);
    audit.record({
        userId,
        action: refundAmount > 0 ? 'booking.cancel_refunded' : 'booking.cancel',
        entity: 'booking',
        entityId: bookingId,
        detail: cancellationReason + ' | refund ₹' + refundAmount
    });

    await notify(userId, 'booking_cancelled', '🗑️ Appointment Cancelled',
        'Your appointment ' + updated.reference + ' with ' + updated.doctor +
        ' on ' + updated.booking_date + ' at ' + updated.booking_time + ' has been cancelled.', bookingId);
    if (refundAmount > 0) {
        await notify(userId, 'refund', '💳 Refund Status',
            '₹' + refundAmount + ' will be refunded to your original payment method for Appointment ID ' +
            updated.reference + ' in 2-3 working days.', bookingId);
    }

    // Cancellation email (includes the refund structure when a refund applies).
    const owner = await userContact(userId);
    if (owner && owner.email) {
        emailService.sendCancellationEmail(owner.email, owner.name, {
            reference: updated.reference, doctor: updated.doctor,
            hospital: updated.hospital, area: updated.area,
            date: updated.booking_date, time: updated.booking_time,
            reason: cancellationReason
        }, refundAmount > 0 ? Object.assign({}, breakdown, { totalRefund: refundAmount }) : null)
            .catch(() => { /* non-fatal */ });
    }

    return toBooking(updated);
}

// Mark a past appointment as attended → 'completed'. Only the owner, only once
// the appointment time has passed, and only from a 'booked'/'missed' state.
async function markAttended({ userId, bookingId }) {
    const existing = await getOwnedBooking(userId, bookingId);
    if (!existing) throw notFound('Booking not found');
    if (hoursUntil(existing.booking_date, existing.booking_time) > 0) {
        throw conflict('You can mark attendance only after the appointment time.');
    }
    if (existing.status !== 'booked' && existing.status !== 'missed') {
        throw conflict('This appointment can no longer be updated.');
    }

    await db.run(
        `UPDATE bookings SET status = 'completed'
         WHERE id = ? AND user_id = ? AND status IN ('booked', 'missed')`,
        [bookingId, userId]
    );

    const updated = await getOwnedBooking(userId, bookingId);
    audit.record({ userId, action: 'booking.mark_attended', entity: 'booking', entityId: bookingId });

    await notify(userId, 'booking_completed', '✔️ Appointment Completed',
        'Your appointment ' + updated.reference + ' with ' + updated.doctor +
        ' on ' + updated.booking_date + ' has been marked as completed.', bookingId);

    return toBooking(updated);
}

module.exports = { createBooking, listBookings, cancelBooking, markAttended };
