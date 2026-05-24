-- =====================================================================
-- O-OPD database schema (SQLite, written to stay Postgres-portable)
-- Constraints enforce data integrity at the lowest level so bad data
-- cannot enter even if application code has a bug.
-- =====================================================================

PRAGMA foreign_keys = ON;

-- ---------- Hospitals ----------
CREATE TABLE IF NOT EXISTS hospitals (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL CHECK (length(trim(name)) > 0),
    area       TEXT NOT NULL CHECK (length(trim(area)) > 0),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (name, area)
);

-- ---------- Doctors ----------
CREATE TABLE IF NOT EXISTS doctors (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    name             TEXT NOT NULL CHECK (length(trim(name)) > 0),
    specialty        TEXT NOT NULL CHECK (length(trim(specialty)) > 0),
    specialty_key    TEXT NOT NULL CHECK (length(trim(specialty_key)) > 0),
    hospital_id      INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE RESTRICT,
    fee              INTEGER NOT NULL CHECK (fee >= 0),
    rating           REAL    NOT NULL DEFAULT 0 CHECK (rating >= 0 AND rating <= 5),
    experience_years INTEGER NOT NULL DEFAULT 0 CHECK (experience_years >= 0),
    created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_doctors_specialty_key ON doctors(specialty_key);
CREATE INDEX IF NOT EXISTS idx_doctors_hospital      ON doctors(hospital_id);

-- ---------- Doctor availability (daily slot templates) ----------
CREATE TABLE IF NOT EXISTS doctor_slots (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    doctor_id INTEGER NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
    slot_time TEXT NOT NULL CHECK (slot_time GLOB '[0-2][0-9]:[0-5][0-9]'),
    UNIQUE (doctor_id, slot_time)
);
CREATE INDEX IF NOT EXISTS idx_doctor_slots_doctor ON doctor_slots(doctor_id);

-- ---------- Users (patients/admins) ----------
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL CHECK (length(trim(name)) > 0),
    email         TEXT NOT NULL UNIQUE CHECK (length(trim(email)) > 0),
    mobile        TEXT,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'patient' CHECK (role IN ('patient', 'admin')),
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ---------- Pending sign-ups (email OTP verification) ----------
-- Holds a would-be account ONLY until the email OTP is verified. On success the
-- row is promoted into `users` and deleted here, so `users` never contains an
-- unverified account. code_hash is a bcrypt hash — the OTP is never stored raw.
CREATE TABLE IF NOT EXISTS pending_signups (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT NOT NULL UNIQUE CHECK (length(trim(email)) > 0),
    name          TEXT NOT NULL,
    mobile        TEXT,
    password_hash TEXT NOT NULL,
    code_hash     TEXT NOT NULL,
    expires_at    TEXT NOT NULL,
    attempts      INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    resend_count  INTEGER NOT NULL DEFAULT 0 CHECK (resend_count >= 0),
    -- Set to 1 once the OTP is verified. signup_token_hash is a one-time
    -- capability handed to the verifying client; completing the signup requires
    -- presenting it, so no one else can finalize this pending account.
    verified          INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1)),
    signup_token_hash TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pending_email ON pending_signups(email);

-- ---------- Password resets (email OTP) ----------
-- One active reset request per user (UNIQUE user_id); re-requesting replaces it.
-- Mirrors pending_signups: hashed code, expiry, attempt cap, and a one-time
-- reset_token issued after the OTP is verified (required to set the new password).
CREATE TABLE IF NOT EXISTS password_resets (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id          INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    code_hash        TEXT NOT NULL,
    expires_at       TEXT NOT NULL,
    attempts         INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    resend_count     INTEGER NOT NULL DEFAULT 0 CHECK (resend_count >= 0),
    verified         INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1)),
    reset_token_hash TEXT,
    created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- Bookings ----------
CREATE TABLE IF NOT EXISTS bookings (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id        INTEGER NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    doctor_id      INTEGER NOT NULL REFERENCES doctors(id) ON DELETE RESTRICT,
    booking_date   TEXT NOT NULL CHECK (booking_date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
    booking_time   TEXT NOT NULL CHECK (booking_time GLOB '[0-2][0-9]:[0-5][0-9]'),
    status         TEXT NOT NULL DEFAULT 'booked' CHECK (status IN ('booked', 'cancelled', 'completed')),
    fee_at_booking INTEGER NOT NULL CHECK (fee_at_booking >= 0),
    reference      TEXT,
    payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('paid', 'unpaid', 'failed', 'refunded')),
    payment_method TEXT,
    paid_at        TEXT,
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    cancelled_at   TEXT,
    cancellation_reason TEXT,
    refund_amount  INTEGER,
    refund_at      TEXT
);

-- Human-friendly unique booking reference (e.g. "K7Q2M9PX").
CREATE UNIQUE INDEX IF NOT EXISTS uq_bookings_reference ON bookings(reference);

-- Prevent active double-booking of the same doctor/date/time, while still
-- allowing a previously cancelled slot to be re-booked (partial unique index).
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_slot
    ON bookings(doctor_id, booking_date, booking_time)
    WHERE status = 'booked';

CREATE INDEX IF NOT EXISTS idx_bookings_user        ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_doctor_date ON bookings(doctor_id, booking_date);

-- ---------- Audit log (sensitive actions) ----------
CREATE TABLE IF NOT EXISTS audit_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action     TEXT NOT NULL,
    entity     TEXT,
    entity_id  INTEGER,
    detail     TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
