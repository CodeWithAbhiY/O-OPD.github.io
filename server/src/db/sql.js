/* Reusable SQL fragments for time handling.
   All timestamps are stored as IST (Asia/Kolkata) text "YYYY-MM-DD HH24:MI:SS",
   so the database reads naturally for an India-based team. Display code parses
   these strings as +05:30 (see fmtStampIST / fmtCell / istDateTime). */

// Current moment as IST text — used both for stored timestamps and for
// comparing against the IST appointment wall-clock (booking_date + booking_time).
const NOW_IST = "to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS')";

// Alias used wherever we write a "created/paid/cancelled at" timestamp.
const NOW = NOW_IST;

// A timestamp N minutes from now (IST text). Use with a `?` bound to minutes.
const EXPIRES_IN_MIN = "to_char((now() AT TIME ZONE 'Asia/Kolkata') + make_interval(mins => ?), 'YYYY-MM-DD HH24:MI:SS')";

module.exports = { NOW, NOW_IST, EXPIRES_IN_MIN };
