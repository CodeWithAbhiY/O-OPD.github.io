/* Authentication business logic (PostgreSQL). Controllers stay thin; all the
   rules live here.
   - Emails are normalized to lowercase (prevents Abc@x vs abc@x duplicates).
   - role is ALWAYS set server-side to 'patient' (no privilege escalation).
   - password_hash is never returned to the client.
   - Sign-up is two steps: register() stashes a PENDING signup + emails a 6-digit
     OTP (no account, no token yet); verifyOtp() checks the code, completeSignup()
     creates the real user. So `users` only ever holds verified accounts. */

const crypto = require('crypto');
const { db } = require('../db');
const { NOW, NOW_IST, EXPIRES_IN_MIN } = require('../db/sql');
const { hashPassword, verifyPassword } = require('../utils/password');
const { signToken } = require('../utils/jwt');
const { conflict, unauthorized, badRequest, notFound } = require('../utils/httpError');
const { generateCode, OTP_TTL_MINUTES, MAX_ATTEMPTS, MAX_RESENDS } = require('../utils/otp');
const emailService = require('./email.service');
const audit = require('./audit.service');

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

// Postgres unique-violation? (used to turn races into clean 409s)
function isUniqueViolation(err) {
    return err && (err.code === '23505' || /unique/i.test(err.message || ''));
}

// Step 1 of sign-up: validate, stash a pending signup, email an OTP.
async function register({ name, email, mobile, password }) {
    const normalizedEmail = email.toLowerCase();

    if (await db.get('SELECT id FROM users WHERE email = ?', [normalizedEmail])) {
        throw conflict('An account with this email already exists');
    }

    const passwordHash = await hashPassword(password);
    const code = generateCode();
    const codeHash = await hashPassword(code);

    await db.run('DELETE FROM pending_signups WHERE email = ?', [normalizedEmail]);
    await db.run(
        `INSERT INTO pending_signups (email, name, mobile, password_hash, code_hash, expires_at)
         VALUES (?, ?, ?, ?, ?, ${EXPIRES_IN_MIN})`,
        [normalizedEmail, name, mobile || null, passwordHash, codeHash, OTP_TTL_MINUTES]
    );

    await emailService.sendOtpEmail(normalizedEmail, code, name);
    audit.record({ action: 'auth.otp_sent', entity: 'pending_signup', detail: normalizedEmail });

    return { email: normalizedEmail, code };
}

// Step 2 of sign-up: check the OTP → mark verified + return a one-time token.
async function verifyOtp({ email, code }) {
    const normalizedEmail = email.toLowerCase();
    const pending = await db.get('SELECT * FROM pending_signups WHERE email = ?', [normalizedEmail]);
    if (!pending) {
        throw badRequest('No pending verification for this email. Please sign up again.');
    }

    const live = await db.get(
        `SELECT 1 AS ok FROM pending_signups WHERE id = ? AND expires_at > ${NOW}`,
        [pending.id]
    );
    if (!live) {
        await db.run('DELETE FROM pending_signups WHERE id = ?', [pending.id]);
        throw badRequest('Your code has expired. Please request a new one.');
    }

    if (pending.attempts >= MAX_ATTEMPTS) {
        throw badRequest('Too many incorrect attempts. Please request a new code.');
    }

    const ok = await verifyPassword(code, pending.code_hash);
    if (!ok) {
        await db.run('UPDATE pending_signups SET attempts = attempts + 1 WHERE id = ?', [pending.id]);
        throw badRequest('Incorrect code. Please try again.');
    }

    const signupToken = crypto.randomBytes(24).toString('hex');
    await db.run(
        'UPDATE pending_signups SET verified = 1, signup_token_hash = ? WHERE id = ?',
        [sha256(signupToken), pending.id]
    );
    audit.record({ action: 'auth.otp_verified', entity: 'pending_signup', detail: normalizedEmail });

    return { email: normalizedEmail, verified: true, signupToken };
}

// Step 3 of sign-up: create the real account (requires the signup token).
async function completeSignup({ email, signupToken }) {
    const normalizedEmail = email.toLowerCase();
    const pending = await db.get('SELECT * FROM pending_signups WHERE email = ?', [normalizedEmail]);
    if (!pending || !pending.verified) {
        throw badRequest('Please verify your email first.');
    }

    const live = await db.get(
        `SELECT 1 AS ok FROM pending_signups WHERE id = ? AND expires_at > ${NOW}`,
        [pending.id]
    );
    if (!live) {
        await db.run('DELETE FROM pending_signups WHERE id = ?', [pending.id]);
        throw badRequest('Your verification has expired. Please sign up again.');
    }

    if (!hexEqual(sha256(signupToken), pending.signup_token_hash)) {
        throw unauthorized('Invalid signup session. Please verify your email again.');
    }

    let userId;
    try {
        userId = await db.tx(async (t) => {
            const created = await t.get(
                'INSERT INTO users (name, email, mobile, password_hash, role) VALUES (?, ?, ?, ?, ?) RETURNING id',
                [pending.name, normalizedEmail, pending.mobile, pending.password_hash, 'patient']
            );
            await t.run('DELETE FROM pending_signups WHERE id = ?', [pending.id]);
            return created.id;
        });
    } catch (err) {
        if (isUniqueViolation(err)) throw conflict('An account with this email already exists');
        throw err;
    }

    const user = await db.get('SELECT id, name, email, role FROM users WHERE id = ?', [userId]);
    audit.record({ userId, action: 'user.register_completed', entity: 'user', entityId: userId });

    // Formal welcome email (fire-and-forget — must never block/break signup).
    emailService.sendWelcomeEmail(user.email, user.name).catch(() => { /* non-fatal */ });

    return { token: tokenFor(user), user: sanitize(user) };
}

// Issue a fresh OTP for an in-progress signup.
async function resendOtp({ email }) {
    const normalizedEmail = email.toLowerCase();
    const pending = await db.get('SELECT * FROM pending_signups WHERE email = ?', [normalizedEmail]);
    if (!pending) {
        throw badRequest('No pending verification for this email. Please sign up again.');
    }
    if (pending.resend_count >= MAX_RESENDS) {
        await db.run('DELETE FROM pending_signups WHERE id = ?', [pending.id]);
        throw badRequest('Resend limit reached. Please sign up again.');
    }

    const code = generateCode();
    const codeHash = await hashPassword(code);
    await db.run(
        `UPDATE pending_signups
         SET code_hash = ?, expires_at = ${EXPIRES_IN_MIN}, attempts = 0, resend_count = resend_count + 1
         WHERE id = ?`,
        [codeHash, OTP_TTL_MINUTES, pending.id]
    );

    await emailService.sendOtpEmail(normalizedEmail, code, pending.name);
    audit.record({ action: 'auth.otp_resent', entity: 'pending_signup', detail: normalizedEmail });

    return { email: normalizedEmail, code };
}

// ---- Password reset (email OTP) ----

const RESET_GENERIC = 'Invalid or expired code. Please request a new one.';

async function forgotPassword({ email }) {
    const normalizedEmail = email.toLowerCase();
    const user = await db.get('SELECT id, name FROM users WHERE email = ?', [normalizedEmail]);

    const code = generateCode();
    const codeHash = await hashPassword(code); // always hash (constant timing)

    if (!user) {
        return { email: normalizedEmail, code: null }; // no account → silently no-op
    }

    await db.run('DELETE FROM password_resets WHERE user_id = ?', [user.id]);
    await db.run(
        `INSERT INTO password_resets (user_id, code_hash, expires_at)
         VALUES (?, ?, ${EXPIRES_IN_MIN})`,
        [user.id, codeHash, OTP_TTL_MINUTES]
    );
    await emailService.sendOtpEmail(normalizedEmail, code, user.name, 'reset');
    audit.record({ userId: user.id, action: 'auth.reset_otp_sent', entity: 'user', entityId: user.id });
    return { email: normalizedEmail, code };
}

async function resetVerifyOtp({ email, code }) {
    const normalizedEmail = email.toLowerCase();
    const user = await db.get('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
    const reset = user ? await db.get('SELECT * FROM password_resets WHERE user_id = ?', [user.id]) : null;

    const liveReset = reset
        ? await db.get(`SELECT 1 AS ok FROM password_resets WHERE id = ? AND expires_at > ${NOW}`, [reset.id])
        : null;
    const usable = !!(reset && liveReset && reset.attempts < MAX_ATTEMPTS);

    // Always run a compare (dummy hash if unusable) for constant timing.
    const ok = await verifyPassword(code, usable ? reset.code_hash : null);

    if (!usable || !ok) {
        if (reset && liveReset && reset.attempts < MAX_ATTEMPTS) {
            await db.run('UPDATE password_resets SET attempts = attempts + 1 WHERE id = ?', [reset.id]);
        }
        throw badRequest(RESET_GENERIC);
    }

    const resetToken = crypto.randomBytes(24).toString('hex');
    await db.run(
        'UPDATE password_resets SET verified = 1, reset_token_hash = ? WHERE id = ?',
        [sha256(resetToken), reset.id]
    );
    audit.record({ userId: user.id, action: 'auth.reset_otp_verified', entity: 'user', entityId: user.id });
    return { email: normalizedEmail, resetToken };
}

async function resetPassword({ email, resetToken, newPassword }) {
    const normalizedEmail = email.toLowerCase();
    const user = await db.get('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
    const reset = user ? await db.get('SELECT * FROM password_resets WHERE user_id = ?', [user.id]) : null;
    if (!user || !reset || !reset.verified) {
        throw badRequest('Please verify the code sent to your email first.');
    }

    const live = await db.get(
        `SELECT 1 AS ok FROM password_resets WHERE id = ? AND expires_at > ${NOW}`,
        [reset.id]
    );
    if (!live) {
        await db.run('DELETE FROM password_resets WHERE id = ?', [reset.id]);
        throw badRequest('Your reset session has expired. Please start again.');
    }
    if (!hexEqual(sha256(resetToken), reset.reset_token_hash)) {
        throw unauthorized('Invalid reset session. Please verify your email again.');
    }

    const passwordHash = await hashPassword(newPassword);
    await db.tx(async (t) => {
        await t.run('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, user.id]);
        await t.run('DELETE FROM password_resets WHERE id = ?', [reset.id]);
    });

    audit.record({ userId: user.id, action: 'auth.password_reset', entity: 'user', entityId: user.id });
    return { ok: true };
}

async function login({ email, password }) {
    const normalizedEmail = email.toLowerCase();
    const row = await db.get('SELECT * FROM users WHERE email = ?', [normalizedEmail]);

    // Always run a compare (dummy hash if no user) to keep timing constant.
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
async function getUserById(id) {
    return (await db.get('SELECT id, name, email, role FROM users WHERE id = ? AND is_active = 1', [id])) || null;
}

// ---- Profile (view + edit) ----

async function getProfile(userId) {
    const row = await db.get(
        'SELECT id, name, email, mobile, role, created_at FROM users WHERE id = ? AND is_active = 1',
        [userId]
    );
    if (!row) throw notFound('Account not found');
    return {
        id: row.id, name: row.name, email: row.email, mobile: row.mobile,
        role: row.role, createdAt: row.created_at
    };
}

async function updateProfile(userId, { name, mobile }) {
    const sets = [];
    const params = [];
    if (name !== undefined) { sets.push('name = ?'); params.push(name); }
    if (mobile !== undefined) { sets.push('mobile = ?'); params.push(mobile === '' ? null : mobile); }
    if (!sets.length) return getProfile(userId);

    params.push(userId);
    await db.run('UPDATE users SET ' + sets.join(', ') + ' WHERE id = ? AND is_active = 1', params);
    audit.record({ userId, action: 'user.profile_update', entity: 'user', entityId: userId });
    return getProfile(userId);
}

// ---- Account deletion (soft delete + deactivation) ----

async function deleteAccount({ userId, password, reason }) {
    const row = await db.get('SELECT id, password_hash FROM users WHERE id = ? AND is_active = 1', [userId]);
    if (!row) throw notFound('Account not found');

    const ok = await verifyPassword(password, row.password_hash);
    if (!ok) throw unauthorized('Incorrect password. Please try again.');

    await db.tx(async (t) => {
        // Cancel still-upcoming (future, IST) appointments; past ones are left as-is.
        await t.run(
            `UPDATE bookings
             SET status = 'cancelled', cancelled_at = ${NOW},
                 cancellation_reason = 'account_deleted'
             WHERE user_id = ? AND status = 'booked'
               AND (booking_date || ' ' || booking_time || ':00') >= ${NOW_IST}`,
            [userId]
        );
        await t.run(
            `UPDATE users
             SET is_active = 0, deleted_at = ${NOW}, deletion_reason = ?
             WHERE id = ?`,
            [reason || null, userId]
        );
    });

    audit.record({ userId, action: 'user.account_deleted', entity: 'user', entityId: userId });
    return { ok: true };
}

module.exports = {
    register, verifyOtp, completeSignup, resendOtp,
    forgotPassword, resetVerifyOtp, resetPassword,
    login, getUserById,
    getProfile, updateProfile, deleteAccount
};
