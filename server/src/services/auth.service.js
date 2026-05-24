/* Authentication business logic. Controllers stay thin; all the rules live here.
   - Emails are normalized to lowercase (prevents Abc@x vs abc@x duplicates).
   - role is ALWAYS set server-side to 'patient' (no privilege escalation).
   - password_hash is never returned to the client.
   - Sign-up is two steps: register() stashes a PENDING signup + emails a 6-digit
     OTP (no account, no token yet); verifyOtp() checks the code and only THEN
     creates the real user. So `users` only ever holds verified accounts. */

const crypto = require('crypto');
const { db } = require('../db');
const { hashPassword, verifyPassword } = require('../utils/password');
const { signToken } = require('../utils/jwt');
const { conflict, unauthorized, badRequest, notFound } = require('../utils/httpError');
const { generateCode, OTP_TTL_MINUTES, MAX_ATTEMPTS, MAX_RESENDS } = require('../utils/otp');
const emailService = require('./email.service');
const audit = require('./audit.service');

const TTL_MODIFIER = '+' + OTP_TTL_MINUTES + ' minutes'; // SQLite datetime modifier

function sanitize(user) {
    return { id: user.id, name: user.name, email: user.email, role: user.role };
}

function tokenFor(user) {
    return signToken({ sub: user.id, role: user.role, email: user.email });
}

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

// Constant-time compare of two hex strings (avoids leaking via timing).
function hexEqual(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

// Step 1 of sign-up: validate, stash a pending signup, email an OTP.
// Returns the email + code; the controller decides whether to expose the code
// (dev only). No account is created and no token is issued here.
async function register({ name, email, mobile, password }) {
    const normalizedEmail = email.toLowerCase();

    // A real (already verified) account blocks re-use of the email.
    if (db.get('SELECT id FROM users WHERE email = ?', [normalizedEmail])) {
        throw conflict('An account with this email already exists');
    }

    const passwordHash = await hashPassword(password);
    const code = generateCode();
    const codeHash = await hashPassword(code);

    // Replace any earlier pending attempt for this email (email is UNIQUE here).
    db.run('DELETE FROM pending_signups WHERE email = ?', [normalizedEmail]);
    db.run(
        `INSERT INTO pending_signups (email, name, mobile, password_hash, code_hash, expires_at)
         VALUES (?, ?, ?, ?, ?, datetime('now', ?))`,
        [normalizedEmail, name, mobile || null, passwordHash, codeHash, TTL_MODIFIER]
    );

    await emailService.sendOtpEmail(normalizedEmail, code, name);
    audit.record({ action: 'auth.otp_sent', entity: 'pending_signup', detail: normalizedEmail });

    return { email: normalizedEmail, code };
}

// Step 2 of sign-up: check the OTP. On success it does NOT create the account
// yet — it marks the pending signup verified and returns a one-time signup
// token. Completing the signup (step 3) requires that token.
async function verifyOtp({ email, code }) {
    const normalizedEmail = email.toLowerCase();
    const pending = db.get('SELECT * FROM pending_signups WHERE email = ?', [normalizedEmail]);
    if (!pending) {
        throw badRequest('No pending verification for this email. Please sign up again.');
    }

    // Expired? Drop it and ask them to restart.
    const live = db.get(
        "SELECT 1 AS ok FROM pending_signups WHERE id = ? AND expires_at > datetime('now')",
        [pending.id]
    );
    if (!live) {
        db.run('DELETE FROM pending_signups WHERE id = ?', [pending.id]);
        throw badRequest('Your code has expired. Please request a new one.');
    }

    if (pending.attempts >= MAX_ATTEMPTS) {
        throw badRequest('Too many incorrect attempts. Please request a new code.');
    }

    const ok = await verifyPassword(code, pending.code_hash);
    if (!ok) {
        db.run('UPDATE pending_signups SET attempts = attempts + 1 WHERE id = ?', [pending.id]);
        throw badRequest('Incorrect code. Please try again.');
    }

    // Code is correct: mark verified and hand the client a one-time token that
    // completeSignup() will require. High-entropy, so a fast hash is fine.
    const signupToken = crypto.randomBytes(24).toString('hex');
    db.run(
        'UPDATE pending_signups SET verified = 1, signup_token_hash = ? WHERE id = ?',
        [sha256(signupToken), pending.id]
    );
    audit.record({ action: 'auth.otp_verified', entity: 'pending_signup', detail: normalizedEmail });

    return { email: normalizedEmail, verified: true, signupToken };
}

// Step 3 of sign-up: create the real account. Requires the signup token issued
// by verifyOtp(), so only the client that verified the code can finalize.
async function completeSignup({ email, signupToken }) {
    const normalizedEmail = email.toLowerCase();
    const pending = db.get('SELECT * FROM pending_signups WHERE email = ?', [normalizedEmail]);
    if (!pending || !pending.verified) {
        throw badRequest('Please verify your email first.');
    }

    const live = db.get(
        "SELECT 1 AS ok FROM pending_signups WHERE id = ? AND expires_at > datetime('now')",
        [pending.id]
    );
    if (!live) {
        db.run('DELETE FROM pending_signups WHERE id = ?', [pending.id]);
        throw badRequest('Your verification has expired. Please sign up again.');
    }

    if (!hexEqual(sha256(signupToken), pending.signup_token_hash)) {
        throw unauthorized('Invalid signup session. Please verify your email again.');
    }

    // Promote the pending signup into a real user, atomically.
    db.run('BEGIN IMMEDIATE');
    try {
        db.run(
            'INSERT INTO users (name, email, mobile, password_hash, role) VALUES (?, ?, ?, ?, ?)',
            [pending.name, normalizedEmail, pending.mobile, pending.password_hash, 'patient']
        );
        db.run('DELETE FROM pending_signups WHERE id = ?', [pending.id]);
        db.run('COMMIT');
    } catch (err) {
        try { db.run('ROLLBACK'); } catch (_) { /* ignore */ }
        if (/UNIQUE/i.test(err.message || '')) {
            throw conflict('An account with this email already exists');
        }
        throw err;
    }

    const id = db.get('SELECT last_insert_rowid() AS id').id;
    const user = db.get('SELECT id, name, email, role FROM users WHERE id = ?', [id]);
    audit.record({ userId: id, action: 'user.register_completed', entity: 'user', entityId: id });

    // Formal welcome email (fire-and-forget — must never block/break signup).
    emailService.sendWelcomeEmail(user.email, user.name).catch(() => { /* non-fatal */ });

    return { token: tokenFor(user), user: sanitize(user) };
}

// Issue a fresh OTP for an in-progress signup.
async function resendOtp({ email }) {
    const normalizedEmail = email.toLowerCase();
    const pending = db.get('SELECT * FROM pending_signups WHERE email = ?', [normalizedEmail]);
    if (!pending) {
        throw badRequest('No pending verification for this email. Please sign up again.');
    }
    if (pending.resend_count >= MAX_RESENDS) {
        db.run('DELETE FROM pending_signups WHERE id = ?', [pending.id]);
        throw badRequest('Resend limit reached. Please sign up again.');
    }

    const code = generateCode();
    const codeHash = await hashPassword(code);
    db.run(
        `UPDATE pending_signups
         SET code_hash = ?, expires_at = datetime('now', ?), attempts = 0, resend_count = resend_count + 1
         WHERE id = ?`,
        [codeHash, TTL_MODIFIER, pending.id]
    );

    await emailService.sendOtpEmail(normalizedEmail, code, pending.name);
    audit.record({ action: 'auth.otp_resent', entity: 'pending_signup', detail: normalizedEmail });

    return { email: normalizedEmail, code };
}

// ---- Password reset (email OTP) ----

// Generic message used for ALL reset-verify failures so the endpoint never
// reveals whether an email is registered (anti-enumeration).
const RESET_GENERIC = 'Invalid or expired code. Please request a new one.';

// Step 1: send a reset OTP — WITHOUT revealing whether the email exists.
// Always returns the same shape; only actually stores/sends when the user is
// real. A dummy hash runs on the not-found path to keep response timing even.
async function forgotPassword({ email }) {
    const normalizedEmail = email.toLowerCase();
    const user = db.get('SELECT id, name FROM users WHERE email = ?', [normalizedEmail]);

    const code = generateCode();
    const codeHash = await hashPassword(code); // always hash (constant timing)

    if (!user) {
        return { email: normalizedEmail, code: null }; // no account → silently no-op
    }

    db.run('DELETE FROM password_resets WHERE user_id = ?', [user.id]);
    db.run(
        `INSERT INTO password_resets (user_id, code_hash, expires_at)
         VALUES (?, ?, datetime('now', ?))`,
        [user.id, codeHash, TTL_MODIFIER]
    );
    await emailService.sendOtpEmail(normalizedEmail, code, user.name, 'reset');
    audit.record({ userId: user.id, action: 'auth.reset_otp_sent', entity: 'user', entityId: user.id });
    return { email: normalizedEmail, code };
}

// Step 2: verify the reset OTP → returns a one-time reset token.
// Every failure path returns the SAME generic message (no enumeration), and a
// dummy compare runs when there's no record to keep timing constant.
async function resetVerifyOtp({ email, code }) {
    const normalizedEmail = email.toLowerCase();
    const user = db.get('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
    const reset = user && db.get('SELECT * FROM password_resets WHERE user_id = ?', [user.id]);

    const liveReset = reset && db.get(
        "SELECT 1 AS ok FROM password_resets WHERE id = ? AND expires_at > datetime('now')",
        [reset.id]
    );
    const usable = !!(reset && liveReset && reset.attempts < MAX_ATTEMPTS);

    // Always run a compare (dummy hash if unusable) for constant timing.
    const ok = await verifyPassword(code, usable ? reset.code_hash : null);

    if (!usable || !ok) {
        if (reset && liveReset && reset.attempts < MAX_ATTEMPTS) {
            db.run('UPDATE password_resets SET attempts = attempts + 1 WHERE id = ?', [reset.id]);
        }
        throw badRequest(RESET_GENERIC);
    }

    const resetToken = crypto.randomBytes(24).toString('hex');
    db.run(
        'UPDATE password_resets SET verified = 1, reset_token_hash = ? WHERE id = ?',
        [sha256(resetToken), reset.id]
    );
    audit.record({ userId: user.id, action: 'auth.reset_otp_verified', entity: 'user', entityId: user.id });
    return { email: normalizedEmail, resetToken };
}

// Step 3: set the new password (requires the verified reset token).
async function resetPassword({ email, resetToken, newPassword }) {
    const normalizedEmail = email.toLowerCase();
    const user = db.get('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
    const reset = user && db.get('SELECT * FROM password_resets WHERE user_id = ?', [user.id]);
    if (!user || !reset || !reset.verified) {
        throw badRequest('Please verify the code sent to your email first.');
    }

    const live = db.get(
        "SELECT 1 AS ok FROM password_resets WHERE id = ? AND expires_at > datetime('now')",
        [reset.id]
    );
    if (!live) {
        db.run('DELETE FROM password_resets WHERE id = ?', [reset.id]);
        throw badRequest('Your reset session has expired. Please start again.');
    }
    if (!hexEqual(sha256(resetToken), reset.reset_token_hash)) {
        throw unauthorized('Invalid reset session. Please verify your email again.');
    }

    const passwordHash = await hashPassword(newPassword);
    db.run('BEGIN IMMEDIATE');
    try {
        db.run('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, user.id]);
        db.run('DELETE FROM password_resets WHERE id = ?', [reset.id]);
        db.run('COMMIT');
    } catch (err) {
        try { db.run('ROLLBACK'); } catch (_) { /* ignore */ }
        throw err;
    }

    audit.record({ userId: user.id, action: 'auth.password_reset', entity: 'user', entityId: user.id });
    return { ok: true };
}

async function login({ email, password }) {
    const normalizedEmail = email.toLowerCase();
    const row = db.get('SELECT * FROM users WHERE email = ?', [normalizedEmail]);

    // Always run a compare (dummy hash if no user) to keep timing constant and
    // avoid revealing whether the email exists.
    const ok = await verifyPassword(password, row ? row.password_hash : null);
    if (!row || !ok) {
        throw unauthorized('Invalid email or password');
    }

    // Only revealed once the password is correct, so it doesn't leak which
    // emails exist (enumeration-safe).
    if (row.is_active === 0) {
        throw unauthorized('This account has been deactivated.');
    }

    audit.record({ userId: row.id, action: 'user.login', entity: 'user', entityId: row.id });
    return { token: tokenFor(row), user: sanitize(row) };
}

// Only ACTIVE accounts resolve — so a deactivated user's existing JWTs stop
// working immediately (effective session revocation via requireAuth).
function getUserById(id) {
    return db.get('SELECT id, name, email, role FROM users WHERE id = ? AND is_active = 1', [id]) || null;
}

// ---- Profile (view + edit) ----

function getProfile(userId) {
    const row = db.get(
        'SELECT id, name, email, mobile, role, created_at FROM users WHERE id = ? AND is_active = 1',
        [userId]
    );
    if (!row) throw notFound('Account not found');
    return {
        id: row.id, name: row.name, email: row.email, mobile: row.mobile,
        role: row.role, createdAt: row.created_at
    };
}

// Update name and/or mobile (the only self-editable profile fields). Email and
// role are NOT editable here. userId always comes from the verified token.
function updateProfile(userId, { name, mobile }) {
    const sets = [];
    const params = [];
    if (name !== undefined) { sets.push('name = ?'); params.push(name); }
    if (mobile !== undefined) { sets.push('mobile = ?'); params.push(mobile === '' ? null : mobile); }
    if (!sets.length) return getProfile(userId);

    params.push(userId);
    db.run('UPDATE users SET ' + sets.join(', ') + ' WHERE id = ? AND is_active = 1', params);
    audit.record({ userId, action: 'user.profile_update', entity: 'user', entityId: userId });
    return getProfile(userId);
}

// ---- Account deletion (soft delete + deactivation) ----

// Re-confirms the password, then soft-deletes: keeps the row (records retained)
// but sets is_active = 0 (denies login + revokes sessions), stamps deleted_at,
// and cancels the user's upcoming appointments.
async function deleteAccount({ userId, password, reason }) {
    const row = db.get('SELECT id, password_hash FROM users WHERE id = ? AND is_active = 1', [userId]);
    if (!row) throw notFound('Account not found');

    const ok = await verifyPassword(password, row.password_hash);
    if (!ok) throw unauthorized('Incorrect password. Please try again.');

    db.run('BEGIN IMMEDIATE');
    try {
        // Cancel still-upcoming (future, IST) appointments; past ones are left as-is.
        db.run(
            `UPDATE bookings
             SET status = 'cancelled', cancelled_at = datetime('now'),
                 cancellation_reason = 'account_deleted'
             WHERE user_id = ? AND status = 'booked'
               AND (booking_date || ' ' || booking_time || ':00') >= datetime('now', '+5 hours', '30 minutes')`,
            [userId]
        );
        db.run(
            `UPDATE users
             SET is_active = 0, deleted_at = datetime('now'), deletion_reason = ?
             WHERE id = ?`,
            [reason || null, userId]
        );
        db.run('COMMIT');
    } catch (err) {
        try { db.run('ROLLBACK'); } catch (_) { /* ignore */ }
        throw err;
    }

    audit.record({ userId, action: 'user.account_deleted', entity: 'user', entityId: userId });
    return { ok: true };
}

module.exports = {
    register, verifyOtp, completeSignup, resendOtp,
    forgotPassword, resetVerifyOtp, resetPassword,
    login, getUserById,
    getProfile, updateProfile, deleteAccount
};
