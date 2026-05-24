/* Email delivery — pluggable.
   - If SMTP credentials are configured (server/.env), real email is sent via
     nodemailer (lazy-loaded; the transporter is built once and reused).
   - Otherwise (development), no real email is sent: the code is logged to the
     server console so the whole flow can be tested without any setup.

   Swapping dev → real email is purely a config change (add SMTP_* to .env). */

const { config } = require('../config/env');
const logger = require('../utils/logger');
const { OTP_TTL_MINUTES } = require('../utils/otp');

let _transport = null;

// Build (once) and reuse the SMTP transport. Only used when config.smtp exists.
function getTransport() {
    if (_transport) return _transport;
    const nodemailer = require('nodemailer'); // pure JS, no native build
    _transport = nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.port === 465, // 465 = implicit TLS; 587 = STARTTLS
        auth: { user: config.smtp.user, pass: config.smtp.pass }
    });
    return _transport;
}

// Check the SMTP connection + credentials WITHOUT sending mail. Never throws —
// returns a plain result so startup checks / scripts can report it cleanly.
async function verifyTransport() {
    if (!config.smtp) return { ok: false, reason: 'SMTP not configured (running in dev/console mode)' };
    try {
        await getTransport().verify();
        return { ok: true };
    } catch (e) {
        return { ok: false, reason: e.message };
    }
}

function otpMessage(name, code, purpose) {
    const hi = name ? `Hi ${name},` : 'Hi,';
    const isReset = purpose === 'reset';
    const kind = isReset ? 'password reset' : 'verification';
    const subject = isReset ? 'Your O-OPD password reset code' : 'Your O-OPD verification code';
    const tail = isReset
        ? "If you didn't request a password reset, you can ignore this email."
        : "If you didn't try to sign up, you can ignore this email.";

    const text =
        `${hi}\n\n` +
        `Your O-OPD ${kind} code is ${code}.\n` +
        `It expires in ${OTP_TTL_MINUTES} minutes.\n\n` +
        tail;

    const html =
        `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:480px;margin:0 auto;color:#0f172a">` +
            `<h2 style="color:#0f766e;margin:0 0 12px">O-OPD</h2>` +
            `<p style="margin:0 0 12px">${hi}</p>` +
            `<p style="margin:0 0 12px">Your O-OPD ${kind} code is:</p>` +
            `<div style="font-size:30px;font-weight:700;letter-spacing:6px;background:#f1f5f9;` +
                `border-radius:10px;padding:16px;text-align:center">${code}</div>` +
            `<p style="color:#64748b;font-size:14px;margin:14px 0 0">It expires in ${OTP_TTL_MINUTES} minutes.</p>` +
            `<p style="color:#94a3b8;font-size:13px;margin:8px 0 0">${tail}</p>` +
        `</div>`;

    return { subject, text, html };
}

async function sendOtpEmail(to, code, name, purpose) {
    const { subject, text, html } = otpMessage(name, code, purpose);

    if (!config.smtp) {
        // DEV MODE: do not send a real email; surface the code for testing.
        logger.info('OTP generated (dev mode — email not actually sent)', { to });
        // eslint-disable-next-line no-console
        console.log(`\n📧  [DEV OTP]  ${to}  →  code ${code}  (valid ${OTP_TTL_MINUTES} min)\n`);
        return { delivered: 'console' };
    }

    const info = await getTransport().sendMail({ from: config.mailFrom, to, subject, text, html });
    logger.info('OTP email sent', { to, messageId: info.messageId });
    return { delivered: 'smtp', messageId: info.messageId };
}

module.exports = { sendOtpEmail, verifyTransport };
