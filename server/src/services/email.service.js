/* Email delivery — pluggable, with three backends chosen in this order:
   1. Brevo HTTP API (config.brevoApiKey)  — preferred; works on hosts that
      block SMTP ports (e.g. Render), since it's just HTTPS.
   2. SMTP via nodemailer (config.smtp)     — fine for local dev.
   3. Console (neither configured)          — logs instead of sending.

   All four message builders (OTP, welcome, booking, cancellation) go through
   deliver(); transactional ones use safeSend() so a failure can never break
   the booking/signup action. */

const { config } = require('../config/env');
const logger = require('../utils/logger');
const { OTP_TTL_MINUTES } = require('../utils/otp');

/* ---------------- backends ---------------- */

let _transport = null;
function getTransport() {
    if (_transport) return _transport;
    const nodemailer = require('nodemailer');
    _transport = nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.port === 465,
        auth: { user: config.smtp.user, pass: config.smtp.pass },
        family: 4,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 20000
    });
    return _transport;
}

// Send via Brevo's transactional email API over HTTPS.
async function sendViaBrevo(to, subject, text, html) {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
            'api-key': config.brevoApiKey,
            'content-type': 'application/json',
            accept: 'application/json'
        },
        body: JSON.stringify({
            sender: { name: config.mailFromName, email: config.mailFromEmail },
            to: [{ email: to }],
            subject,
            htmlContent: html,
            textContent: text
        })
    });
    if (!res.ok) {
        let detail = '';
        try { detail = await res.text(); } catch (_) { /* ignore */ }
        throw new Error('Brevo API ' + res.status + ': ' + String(detail).slice(0, 200));
    }
    let data = {};
    try { data = await res.json(); } catch (_) { /* ignore */ }
    return { delivered: 'brevo', messageId: data.messageId };
}

// Choose a backend and send. Throws on a hard failure (callers decide whether
// to swallow). Returns { delivered } describing what happened.
async function deliver(to, subject, text, html) {
    if (config.brevoApiKey) {
        const r = await sendViaBrevo(to, subject, text, html);
        logger.info('Email sent (brevo)', { to, subject, messageId: r.messageId });
        return r;
    }
    if (config.smtp) {
        const info = await getTransport().sendMail({ from: config.mailFrom, to, subject, text, html });
        logger.info('Email sent (smtp)', { to, subject, messageId: info.messageId });
        return { delivered: 'smtp', messageId: info.messageId };
    }
    logger.info('Email skipped (no provider configured — dev/console mode)', { to, subject });
    return { delivered: 'console' };
}

// Never throws — for fire-and-forget transactional mail.
async function safeSend(to, subject, text, html) {
    try {
        return await deliver(to, subject, text, html);
    } catch (e) {
        logger.error('Email send failed', { to, subject, error: e.message });
        return { delivered: 'error', error: e.message };
    }
}

// Connection check used by the email:test script. Never throws.
async function verifyTransport() {
    if (config.brevoApiKey) return { ok: true, via: 'brevo' };
    if (!config.smtp) return { ok: false, reason: 'No email provider configured (dev/console mode)' };
    try {
        await getTransport().verify();
        return { ok: true, via: 'smtp' };
    } catch (e) {
        return { ok: false, reason: e.message };
    }
}

/* ---------------- formatting helpers ---------------- */

function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}
function inr(n) { return '₹' + Number(n || 0).toLocaleString('en-IN'); }
function longDate(dateStr) {
    const [y, m, d] = String(dateStr || '').split('-').map(Number);
    if (!y || !m || !d) return dateStr || '';
    return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
}
function istDateTime(utc) {
    if (!utc) return '';
    const d = new Date(String(utc).replace(' ', 'T') + '+05:30');
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true
    });
}
const REASON_TEXT = {
    user_cancelled: 'No longer needed', schedule_conflict: 'Schedule conflict',
    found_alternative: 'Found another doctor / clinic', health_improved: 'Feeling better',
    doctor_unavailable: 'Doctor unavailable', payment_failure: 'Payment issue',
    booked_by_mistake: 'Booked by mistake', timeout: 'Booking timed out',
    account_deleted: 'Account deleted', other: 'Other'
};
function reasonText(r) { return REASON_TEXT[r] || String(r || '').replace(/_/g, ' '); }

function layout(heading, bodyHtml) {
    return `<!doctype html><html><body style="margin:0;background:#f1f5f9;padding:24px 0;font-family:Segoe UI,Arial,sans-serif;color:#0f172a">` +
        `<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0">` +
            `<div style="background:#0f766e;padding:18px 24px;color:#ffffff">` +
                `<div style="font-size:20px;font-weight:700">O-OPD</div>` +
                `<div style="font-size:12px;opacity:.85">Online OPD Appointments</div>` +
            `</div>` +
            `<div style="padding:24px">` +
                `<h2 style="margin:0 0 14px;font-size:18px;color:#0f172a">${heading}</h2>` +
                bodyHtml +
            `</div>` +
            `<div style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:12px;line-height:1.5">` +
                `You received this email because you have an O-OPD account.<br>` +
                `This is an automated message — please do not reply.` +
            `</div>` +
        `</div></body></html>`;
}
function kv(label, value, opts) {
    const o = opts || {};
    const td = 'padding:7px 0;font-size:14px';
    const top = o.top ? 'border-top:1px solid #e2e8f0;padding-top:10px;' : '';
    const strong = o.strong ? 'font-weight:700;color:#0f172a' : 'color:#0f172a;font-weight:600';
    return `<tr><td style="${td};${top}color:#64748b">${escapeHtml(label)}</td>` +
        `<td style="${td};${top};text-align:right;${strong}">${value}</td></tr>`;
}
function card(inner) {
    return `<div style="border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin:14px 0">` +
        `<table width="100%" style="border-collapse:collapse">${inner}</table></div>`;
}

/* ---------------- messages ---------------- */

function otpMessage(name, code, purpose) {
    const hi = name ? `Hi ${name},` : 'Hi,';
    const isReset = purpose === 'reset';
    const kind = isReset ? 'password reset' : 'verification';
    const subject = isReset ? 'Your O-OPD password reset code' : 'Your O-OPD verification code';
    const tail = isReset
        ? "If you didn't request a password reset, you can ignore this email."
        : "If you didn't try to sign up, you can ignore this email.";
    const text = `${hi}\n\nYour O-OPD ${kind} code is ${code}.\nIt expires in ${OTP_TTL_MINUTES} minutes.\n\n${tail}`;
    const html = layout(isReset ? 'Reset your password' : 'Confirm your email',
        `<p style="margin:0 0 12px">${escapeHtml(hi)}</p>` +
        `<p style="margin:0 0 12px">Your O-OPD ${kind} code is:</p>` +
        `<div style="font-size:30px;font-weight:700;letter-spacing:6px;background:#f1f5f9;border-radius:10px;padding:16px;text-align:center">${escapeHtml(code)}</div>` +
        `<p style="color:#64748b;font-size:14px;margin:14px 0 0">It expires in ${OTP_TTL_MINUTES} minutes.</p>` +
        `<p style="color:#94a3b8;font-size:13px;margin:8px 0 0">${tail}</p>`);
    return { subject, text, html };
}

async function sendOtpEmail(to, code, name, purpose) {
    const { subject, text, html } = otpMessage(name, code, purpose);
    if (!config.brevoApiKey && !config.smtp) {
        logger.info('OTP generated (dev mode — email not actually sent)', { to });
        // eslint-disable-next-line no-console
        console.log(`\n📧  [DEV OTP]  ${to}  →  code ${code}  (valid ${OTP_TTL_MINUTES} min)\n`);
        return { delivered: 'console' };
    }
    return deliver(to, subject, text, html);
}

function sendWelcomeEmail(to, name) {
    const hi = name ? `Hi ${name},` : 'Hi,';
    const text =
        `${hi}\n\nWelcome to O-OPD — your account is ready.\n\n` +
        `With O-OPD you can:\n  - Search doctors by specialty, location and date\n` +
        `  - Book OPD appointments in seconds\n  - Manage, cancel or track your appointments\n` +
        `  - Get instant booking & payment confirmations\n\nStay healthy,\nThe O-OPD Team`;
    const html = layout('Welcome to O-OPD',
        `<p style="margin:0 0 12px">${escapeHtml(hi)}</p>` +
        `<p style="margin:0 0 12px">Welcome to O-OPD — your account has been created successfully.</p>` +
        `<p style="margin:0 0 6px">With O-OPD you can:</p>` +
        `<ul style="margin:0 0 12px;padding-left:20px;color:#475569;font-size:14px;line-height:1.7">` +
            `<li>Search doctors by specialty, location and date</li>` +
            `<li>Book OPD appointments in seconds</li>` +
            `<li>Manage, cancel or track your appointments</li>` +
            `<li>Get instant booking &amp; payment confirmations</li>` +
        `</ul>` +
        `<p style="margin:0;color:#475569">Stay healthy,<br>The O-OPD Team</p>`);
    return safeSend(to, 'Welcome to O-OPD', text, html);
}

function sendBookingEmail(to, name, b) {
    const hi = name ? `Hi ${name},` : 'Hi,';
    const clinic = `${b.hospital}, ${b.area}`;
    const paidOn = istDateTime(b.paidAt);
    const method = (b.paymentMethod || 'online').toUpperCase();
    const text =
        `${hi}\n\nYour O-OPD appointment is confirmed.\n\n` +
        `Booking reference: ${b.reference}\nDoctor: ${b.doctor} (${b.specialty})\n` +
        `Clinic: ${clinic}\nDate: ${longDate(b.date)}\nTime: ${b.time}\n\n` +
        `PAYMENT RECEIPT\nConsultation fee: ${inr(b.fee)}\nPayment method: ${method}\n` +
        (paidOn ? `Paid on: ${paidOn}\n` : '') + `Total paid: ${inr(b.fee)}\n\n` +
        `Tip: print this email to keep a copy of your bill.\n\nThank you for booking with O-OPD.`;
    const html = layout('Your appointment is confirmed',
        `<p style="margin:0 0 12px">${escapeHtml(hi)}</p>` +
        `<p style="margin:0 0 4px">Your appointment is confirmed. Here are the details and your payment receipt.</p>` +
        card(
            kv('Booking reference', `<span style="font-family:monospace;letter-spacing:1px">${escapeHtml(b.reference)}</span>`) +
            kv('Doctor', escapeHtml(b.doctor)) + kv('Specialty', escapeHtml(b.specialty)) +
            kv('Clinic', escapeHtml(clinic)) + kv('Date', escapeHtml(longDate(b.date))) + kv('Time', escapeHtml(b.time))
        ) +
        `<div style="font-weight:700;margin:6px 0 0">Payment receipt</div>` +
        card(
            kv('Consultation fee', inr(b.fee)) + kv('Payment method', escapeHtml(method)) +
            (paidOn ? kv('Paid on', escapeHtml(paidOn)) : '') +
            kv('Total paid', inr(b.fee), { top: true, strong: true })
        ) +
        `<p style="font-size:13px;color:#64748b;margin:6px 0 0">Tip: print this email (Ctrl/Cmd + P) to keep a copy of your bill.</p>`);
    return safeSend(to, `Appointment confirmed — ${b.reference}`, text, html);
}

function sendCancellationEmail(to, name, b, refund) {
    const hi = name ? `Hi ${name},` : 'Hi,';
    const clinic = `${b.hospital}, ${b.area}`;
    let refundText, refundHtml;
    if (refund && refund.totalRefund > 0) {
        const pct = Math.round((refund.refundPercent || 0) * 100);
        refundText =
            `\nREFUND DETAILS\nConsultation fee: ${inr(refund.consultationFee)}\n` +
            `Cancellation charge (${100 - pct}%): -${inr(refund.cancellationCharge)}\n` +
            `Platform fee (non-refundable): -${inr(refund.platformFee)}\nGST (non-refundable): -${inr(refund.gst)}\n` +
            `Total refund: ${inr(refund.totalRefund)}\nCredited to your original payment method within 2-3 working days.\n`;
        refundHtml =
            `<div style="font-weight:700;margin:6px 0 0">Refund details</div>` +
            card(
                kv('Consultation fee', inr(refund.consultationFee)) +
                kv(`Cancellation charge (${100 - pct}%)`, '-' + inr(refund.cancellationCharge)) +
                kv('Platform fee (non-refundable)', '-' + inr(refund.platformFee)) +
                kv('GST (non-refundable)', '-' + inr(refund.gst)) +
                kv('Total refund', `<span style="color:#16a34a">${inr(refund.totalRefund)}</span>`, { top: true, strong: true })
            ) +
            `<p style="font-size:13px;color:#64748b;margin:0">Your refund will be credited to your original payment method within <strong>2-3 working days</strong>.</p>`;
    } else {
        refundText = `\nNo refund is applicable for this cancellation.\n`;
        refundHtml = `<p style="font-size:14px;color:#64748b">No refund is applicable for this cancellation.</p>`;
    }
    const text =
        `${hi}\n\nYour O-OPD appointment below has been cancelled.\n\n` +
        `Booking reference: ${b.reference}\nDoctor: ${b.doctor}\nClinic: ${clinic}\n` +
        `Date: ${longDate(b.date)}\nTime: ${b.time}\nReason: ${reasonText(b.reason)}\n` +
        refundText + `\nIf this wasn't you, please contact support.`;
    const html = layout('Your appointment was cancelled',
        `<p style="margin:0 0 12px">${escapeHtml(hi)}</p>` +
        `<p style="margin:0 0 4px">The appointment below has been cancelled.</p>` +
        card(
            kv('Booking reference', `<span style="font-family:monospace;letter-spacing:1px">${escapeHtml(b.reference)}</span>`) +
            kv('Doctor', escapeHtml(b.doctor)) + kv('Clinic', escapeHtml(clinic)) +
            kv('Date', escapeHtml(longDate(b.date))) + kv('Time', escapeHtml(b.time)) +
            kv('Reason', escapeHtml(reasonText(b.reason)))
        ) +
        refundHtml);
    return safeSend(to, `Appointment cancelled — ${b.reference}`, text, html);
}

module.exports = {
    sendOtpEmail, verifyTransport,
    sendWelcomeEmail, sendBookingEmail, sendCancellationEmail
};
