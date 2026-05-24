/* Manual SMTP check.
   Usage:  npm run email:test -- you@example.com
   (or)    node src/scripts/test-email.js you@example.com

   1. Verifies the SMTP connection + credentials from server/.env.
   2. Sends a sample verification code to the given address.
   With no SMTP_* set it falls back to dev/console mode (no real email). */

const email = require('../services/email.service');

(async () => {
    const to = process.argv[2];
    if (!to) {
        // eslint-disable-next-line no-console
        console.error('Usage: node src/scripts/test-email.js <recipient@email>');
        process.exit(1);
    }

    const v = await email.verifyTransport();
    // eslint-disable-next-line no-console
    console.log('SMTP connection:', v.ok ? '✅ OK' : '❌ ' + v.reason);

    const res = await email.sendOtpEmail(to, '123456', 'Test User', 'verify');
    // eslint-disable-next-line no-console
    console.log('Send result:', res);
    process.exit(0);
})().catch(err => {
    // eslint-disable-next-line no-console
    console.error('❌ Failed:', err.message);
    process.exit(1);
});
