/* Email delivery — pluggable.
   - If SMTP credentials are configured (server/.env), real email is sent via
     nodemailer (lazy-required so it's only loaded when actually used).
   - Otherwise (development), no real email is sent: the code is logged to the
     server console so the whole flow can be tested without any setup.

   Swapping dev → real email is purely a config change (add SMTP_* to .env). */

const { config } = require('../config/env');
const logger = require('../utils/logger');
const { OTP_TTL_MINUTES } = require('../utils/otp');

function otpMessage(name, code, purpose) {
    const hi = name ? `Hi ${name},` : 'Hi,';
    const isReset = purpose === 'reset';
    return {
        subject: isReset ? 'Your O-OPD password reset code' : 'Your O-OPD verification code',
        text:
            `${hi}\n\n` +
            `Your O-OPD ${isReset ? 'password reset' : 'verification'} code is ${code}.\n` +
            `It expires in ${OTP_TTL_MINUTES} minutes.\n\n` +
            (isReset
                ? `If you didn't request a password reset, you can ignore this email.`
                : `If you didn't try to sign up, you can ignore this email.`)
    };
}

async function sendOtpEmail(to, code, name, purpose) {
    const { subject, text } = otpMessage(name, code, purpose);

    if (!config.smtp) {
        // DEV MODE: do not send a real email; surface the code for testing.
        logger.info('OTP generated (dev mode — email not actually sent)', { to });
        // eslint-disable-next-line no-console
        console.log(`\n📧  [DEV OTP]  ${to}  →  code ${code}  (valid ${OTP_TTL_MINUTES} min)\n`);
        return { delivered: 'console' };
    }

    // Real delivery. nodemailer is pure JS (no native build needed).
    const nodemailer = require('nodemailer');
    const transport = nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.port === 465, // 465 = implicit TLS; 587 = STARTTLS
        auth: { user: config.smtp.user, pass: config.smtp.pass }
    });
    await transport.sendMail({ from: config.mailFrom, to, subject, text });
    logger.info('OTP email sent', { to });
    return { delivered: 'smtp' };
}

module.exports = { sendOtpEmail };
