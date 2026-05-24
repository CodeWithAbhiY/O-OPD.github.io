/* Zod schemas for auth. strictObject rejects unknown keys, which blocks
   mass-assignment (e.g. a client trying to send "role": "admin"). */

const { z } = require('zod');

// Simple, version-proof email check (avoids relying on zod format internals).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const email = z.string().trim().max(120).regex(EMAIL_RE, 'Invalid email address');
const password = z.string().min(8, 'Password must be at least 8 characters').max(100);

const registerSchema = z.strictObject({
    name: z.string().trim().min(2, 'Name is too short').max(80),
    email,
    mobile: z.string().trim().min(7).max(20).regex(/^[0-9+\-\s()]+$/, 'Invalid mobile number').optional(),
    password
});

const loginSchema = z.strictObject({
    email,
    password: z.string().min(1, 'Password is required').max(100)
});

// Email OTP verification (6-digit code).
const verifyOtpSchema = z.strictObject({
    email,
    code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code')
});

const resendOtpSchema = z.strictObject({ email });

// Finalize sign-up: requires the one-time token returned by verify-otp.
const completeSignupSchema = z.strictObject({
    email,
    signupToken: z.string().regex(/^[a-f0-9]{48}$/, 'Invalid signup token')
});

// ---- Password reset ----
const forgotPasswordSchema = z.strictObject({ email });
const resetVerifyOtpSchema = z.strictObject({
    email,
    code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code')
});
const resetPasswordSchema = z.strictObject({
    email,
    resetToken: z.string().regex(/^[a-f0-9]{48}$/, 'Invalid reset token'),
    newPassword: password
});

module.exports = {
    registerSchema, loginSchema, verifyOtpSchema, resendOtpSchema, completeSignupSchema,
    forgotPasswordSchema, resetVerifyOtpSchema, resetPasswordSchema
};
