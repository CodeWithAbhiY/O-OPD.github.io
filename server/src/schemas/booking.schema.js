/* Zod schemas for the bookings endpoints.
   - Body uses z.strictObject: any unknown key (id, userId, status, fee, ...) is
     REJECTED, which structurally prevents mass-assignment.
   - The client only ever supplies WHICH doctor/date/time. user id comes from the
     verified token, and fee is taken from the doctor row server-side. */

const { z } = require('zod');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

// True only for a real calendar date that is today or later (local time).
function isValidFutureOrTodayDate(value) {
    if (!DATE_RE.test(value)) return false;
    const [y, m, d] = value.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    // Reject impossible dates like 2026-02-31 (JS would roll them over).
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return dt.getTime() >= today.getTime();
}

const createBookingSchema = z.strictObject({
    doctorId: z.coerce.number().int().positive(),
    date: z
        .string()
        .trim()
        .regex(DATE_RE, 'Date must be in YYYY-MM-DD format')
        .refine(isValidFutureOrTodayDate, 'Date must be a valid calendar date and not in the past'),
    time: z
        .string()
        .trim()
        .regex(TIME_RE, 'Time must be in HH:MM 24-hour format'),
    // Dummy payment for now — the gateway result is simulated client-side and the
    // method is recorded. Optional so older clients still work.
    paymentMethod: z.enum(['card', 'upi', 'netbanking', 'wallet']).optional()
});

// Listing: optional status filter + pagination. Strip unknown query keys.
const listQuery = z.object({
    status: z.enum(['booked', 'cancelled', 'completed']).optional(),
    page: z.coerce.number().int().min(1).max(10000).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20)
});

const idParam = z.object({
    id: z.coerce.number().int().positive()
});

// Allowed cancellation reasons (kept here so the API and UI agree).
const CANCEL_REASONS = [
    'user_cancelled', 'schedule_conflict', 'found_alternative', 'health_improved',
    'doctor_unavailable', 'payment_failure', 'booked_by_mistake',
    'timeout', // reserved for system-initiated cancellations (not a dropdown option)
    'other'
];
const cancelSchema = z.strictObject({
    reason: z.enum(CANCEL_REASONS).optional()
});

module.exports = { createBookingSchema, listQuery, idParam, cancelSchema, CANCEL_REASONS };
