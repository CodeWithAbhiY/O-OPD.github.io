/* Human-friendly booking reference, e.g. "K7Q2M9PX".
   Uses a crypto-random pick from an unambiguous alphabet (no 0/O/1/I/L) so the
   code is easy to read aloud / type. This is a display label, NOT a secret —
   bookings are always authorized by the owner's user id, never by this code. */

const crypto = require('crypto');

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 30 chars, no look-alikes
const REF_LENGTH = 8;

function generateReference() {
    let out = '';
    for (let i = 0; i < REF_LENGTH; i++) {
        out += ALPHABET[crypto.randomInt(0, ALPHABET.length)];
    }
    return out;
}

module.exports = { generateReference, REF_LENGTH };
