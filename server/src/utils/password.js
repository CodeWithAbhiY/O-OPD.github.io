/* Password hashing via bcryptjs (pure JS — no native compiler needed).
   Async so the (deliberately slow) hashing doesn't block the event loop.

   A precomputed dummy hash lets login run a compare even when the email
   doesn't exist, so response timing doesn't reveal whether an account exists. */

const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 12;
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', SALT_ROUNDS);

function hashPassword(plain) {
    return bcrypt.hash(plain, SALT_ROUNDS);
}

function verifyPassword(plain, hash) {
    return bcrypt.compare(plain, hash || DUMMY_HASH);
}

module.exports = { hashPassword, verifyPassword, DUMMY_HASH };
