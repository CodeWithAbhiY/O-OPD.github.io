-- =====================================================================
-- O-OPD database schema (PostgreSQL)
-- Constraints enforce data integrity at the lowest level so bad data
-- cannot enter even if application code has a bug.
--
-- Timestamps are stored as TEXT in UTC "YYYY-MM-DD HH24:MI:SS" form (the same
-- shape the front-end already parses by appending 'Z'), so nothing downstream
-- changes when moving from SQLite to Postgres.
-- =====================================================================

-- ---------- Hospitals ----------
CREATE TABLE IF NOT EXISTS hospitals (
    id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name       TEXT NOT NULL CHECK (length(trim(name)) > 0),
    area       TEXT NOT NULL CHECK (length(trim(area)) > 0),
    created_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS')),
    UNIQUE (name, area)
);

-- ---------- Doctors ----------
CREATE TABLE IF NOT EXISTS doctors (
    id               INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name             TEXT NOT NULL CHECK (length(trim(name)) > 0),
    specialty        TEXT NOT NULL CHECK (length(trim(specialty)) > 0),
    specialty_key    TEXT NOT NULL CHECK (length(trim(specialty_key)) > 0),
    hospital_id      INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE RESTRICT,
    fee              INTEGER NOT NULL CHECK (fee >= 0),
    rating           REAL    NOT NULL DEFAULT 0 CHECK (rating >= 0 AND rating <= 5),
    experience_years INTEGER NOT NULL DEFAULT 0 CHECK (experience_years >= 0),
    created_at       TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS'))
);
CREATE INDEX IF NOT EXISTS idx_doctors_specialty_key ON doctors(specialty_key);
CREATE INDEX IF NOT EXISTS idx_doctors_hospital      ON doctors(hospital_id);

-- ---------- Doctor availability (daily slot templates) ----------
CREATE TABLE IF NOT EXISTS doctor_slots (
    id        INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    doctor_id INTEGER NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
    slot_time TEXT NOT NULL CHECK (slot_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
    UNIQUE (doctor_id, slot_time)
);
CREATE INDEX IF NOT EXISTS idx_doctor_slots_doctor ON doctor_slots(doctor_id);

-- ---------- Users (patients/admins) ----------
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name          TEXT NOT NULL CHECK (length(trim(name)) > 0),
    email         TEXT NOT NULL UNIQUE CHECK (length(trim(email)) > 0),
    mobile        TEXT,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'patient' CHECK (role IN ('patient', 'admin')),
    -- Soft delete: a deactivated account is never physically removed (records are
    -- retained for operational/legal reasons); is_active = 0 denies login + access.
    is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    deleted_at      TEXT,
    deletion_reason TEXT,
    created_at    TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS'))
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ---------- Pending sign-ups (email OTP verification) ----------
CREATE TABLE IF NOT EXISTS pending_signups (
    id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE CHECK (length(trim(email)) > 0),
    name          TEXT NOT NULL,
    mobile        TEXT,
    password_hash TEXT NOT NULL,
    code_hash     TEXT NOT NULL,
    expires_at    TEXT NOT NULL,
    attempts      INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    resend_count  INTEGER NOT NULL DEFAULT 0 CHECK (resend_count >= 0),
    verified          INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1)),
    signup_token_hash TEXT,
    created_at    TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS'))
);
CREATE INDEX IF NOT EXISTS idx_pending_email ON pending_signups(email);

-- ---------- Password resets (email OTP) ----------
CREATE TABLE IF NOT EXISTS password_resets (
    id               INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id          INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    code_hash        TEXT NOT NULL,
    expires_at       TEXT NOT NULL,
    attempts         INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    resend_count     INTEGER NOT NULL DEFAULT 0 CHECK (resend_count >= 0),
    verified         INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1)),
    reset_token_hash TEXT,
    created_at       TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS'))
);

-- ---------- Bookings ----------
CREATE TABLE IF NOT EXISTS bookings (
    id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id        INTEGER NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    doctor_id      INTEGER NOT NULL REFERENCES doctors(id) ON DELETE RESTRICT,
    booking_date   TEXT NOT NULL CHECK (booking_date ~ '^[0-9]{4}-[0-1][0-9]-[0-3][0-9]$'),
    booking_time   TEXT NOT NULL CHECK (booking_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
    status         TEXT NOT NULL DEFAULT 'booked' CHECK (status IN ('booked', 'cancelled', 'completed', 'missed')),
    fee_at_booking INTEGER NOT NULL CHECK (fee_at_booking >= 0),
    reference      TEXT,
    payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('paid', 'unpaid', 'failed', 'refunded')),
    payment_method TEXT,
    paid_at        TEXT,
    created_at     TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS')),
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

-- ---------- Notifications (per-user activity feed) ----------
CREATE TABLE IF NOT EXISTS notifications (
    id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    booking_id INTEGER          REFERENCES bookings(id) ON DELETE SET NULL,
    type       TEXT NOT NULL CHECK (type IN (
                   'booking_confirmed', 'booking_cancelled', 'refund',
                   'booking_completed', 'booking_missed', 'account')),
    title      TEXT NOT NULL,
    body       TEXT NOT NULL,
    is_read    INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
    dismissed  INTEGER NOT NULL DEFAULT 0 CHECK (dismissed IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, dismissed, id);

-- ---------- Audit log (sensitive actions) ----------
CREATE TABLE IF NOT EXISTS audit_log (
    id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action     TEXT NOT NULL,
    entity     TEXT,
    entity_id  INTEGER,
    detail     TEXT,
    created_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS'))
);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
