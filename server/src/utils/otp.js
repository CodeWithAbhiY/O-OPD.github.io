/* One-time-password helpers. The code is generated with crypto.randomInt
   (cryptographically secure — not Math.random). Length and limits live here
   so they are configured in exactly one place. */

const crypto = require('crypto');

const OTP_LENGTH = 6;          // 6-digit code (industry-standard length)
const OTP_TTL_MINUTES = 10;    // code is valid for 10 minutes
const MAX_ATTEMPTS = 5;        // wrong tries before the code is locked
const MAX_RESENDS = 5;         // resends before the pending signup is abandoned

// Returns a zero-padded numeric string, e.g. "0427".
function generateCode() {
    const max = 10 ** OTP_LENGTH; // 1000000 for length 6
    return String(crypto.randomInt(0, max)).padStart(OTP_LENGTH, '0');
}

module.exports = { generateCode, OTP_LENGTH, OTP_TTL_MINUTES, MAX_ATTEMPTS, MAX_RESENDS };
