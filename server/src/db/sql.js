/* Reusable SQL fragments for Postgres time handling.
   Timestamps are stored as UTC text "YYYY-MM-DD HH24:MI:SS" (so the front-end
   can keep parsing them as UTC). These fragments produce values in that shape. */

// Current moment as UTC text.
const NOW_UTC = "to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')";

// Current moment as IST (Asia/Kolkata) text — used to compare against the
// stored IST appointment wall-clock (booking_date + booking_time).
const NOW_IST = "to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS')";

// A UTC-text timestamp N minutes from now. Use with a `?` bound to the minutes.
const EXPIRES_IN_MIN = "to_char((now() AT TIME ZONE 'UTC') + make_interval(mins => ?), 'YYYY-MM-DD HH24:MI:SS')";

module.exports = { NOW_UTC, NOW_IST, EXPIRES_IN_MIN };
