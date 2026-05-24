/* Refund calculation for cancellations. Kept in one place so the rules are
   defined once. The front-end mirrors this logic only to PREVIEW the breakdown;
   this server-side computation is authoritative for what is actually refunded.

   Rules (by time remaining before the appointment):
     > 24 hrs   → 100% of consultation fee
     6–24 hrs   → 80%
     0–6 hrs    → 50%
     missed     → 0%
   Platform fee (₹20) and GST (18% of platform fee) are non-refundable. */

const PLATFORM_FEE = 20;
const GST_RATE = 0.18;

function refundPercentForHours(hoursUntil) {
    if (hoursUntil >= 24) return 1;
    if (hoursUntil >= 6) return 0.8;
    if (hoursUntil >= 0) return 0.5;
    return 0; // appointment time already passed — missed, no refund
}

// Hours from `now` until an appointment on date 'YYYY-MM-DD' at time 'HH:MM'.
// Appointment times are India Standard Time (UTC+5:30); pinning the offset keeps
// the refund tier correct even if the server runs in a non-IST timezone.
function hoursUntil(date, time, now) {
    const ref = now || new Date();
    const appt = new Date(date + 'T' + (time || '00:00') + ':00+05:30');
    return (appt.getTime() - ref.getTime()) / 3600000;
}

// fee = consultation fee paid. Returns the full breakdown (all integers, ₹).
function computeRefund(fee, hours) {
    const consultationFee = Math.max(0, Math.round(fee || 0));
    const platformFee = PLATFORM_FEE;
    const gst = Math.round(platformFee * GST_RATE); // 18% of 20 = 3.6 → 4
    const refundPercent = refundPercentForHours(hours);
    const cancellationCharge = Math.round(consultationFee * (1 - refundPercent));
    const totalRefund = Math.max(0, consultationFee - cancellationCharge - platformFee - gst);
    return { consultationFee, platformFee, gst, cancellationCharge, refundPercent, totalRefund };
}

module.exports = { computeRefund, hoursUntil, refundPercentForHours, PLATFORM_FEE, GST_RATE };
