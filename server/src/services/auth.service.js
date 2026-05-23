/* Authentication business logic. Controllers stay thin; all the rules live here.
   - Emails are normalized to lowercase (prevents Abc@x vs abc@x duplicates).
   - role is ALWAYS set server-side to 'patient' (no privilege escalation).
   - password_hash is never returned to the client. */

const { db } = require('../db');
const { hashPassword, verifyPassword } = require('../utils/password');
const { signToken } = require('../utils/jwt');
const { conflict, unauthorized } = require('../utils/httpError');
const audit = require('./audit.service');

function sanitize(user) {
    return { id: user.id, name: user.name, email: user.email, role: user.role };
}

function tokenFor(user) {
    return signToken({ sub: user.id, role: user.role, email: user.email });
}

async function register({ name, email, mobile, password }) {
    const normalizedEmail = email.toLowerCase();

    // Friendly pre-check…
    if (db.get('SELECT id FROM users WHERE email = ?', [normalizedEmail])) {
        throw conflict('An account with this email already exists');
    }

    const passwordHash = await hashPassword(password);

    // …and the DB UNIQUE constraint is the real guard against a race.
    try {
        db.run(
            'INSERT INTO users (name, email, mobile, password_hash, role) VALUES (?, ?, ?, ?, ?)',
            [name, normalizedEmail, mobile || null, passwordHash, 'patient']
        );
    } catch (err) {
        if (/UNIQUE/i.test(err.message)) {
            throw conflict('An account with this email already exists');
        }
        throw err;
    }

    const id = db.get('SELECT last_insert_rowid() AS id').id;
    const user = db.get('SELECT id, name, email, role FROM users WHERE id = ?', [id]);
    audit.record({ userId: id, action: 'user.register', entity: 'user', entityId: id });

    return { token: tokenFor(user), user: sanitize(user) };
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

    audit.record({ userId: row.id, action: 'user.login', entity: 'user', entityId: row.id });
    return { token: tokenFor(row), user: sanitize(row) };
}

function getUserById(id) {
    return db.get('SELECT id, name, email, role FROM users WHERE id = ?', [id]) || null;
}

module.exports = { register, login, getUserById };
