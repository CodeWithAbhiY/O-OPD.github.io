/* Zod schemas for auth. strictObject rejects unknown keys, which blocks
   mass-assignment (e.g. a client trying to send "role": "admin"). */

const { z } = require('zod');

// Simple, version-proof email check (avoids relying on zod format internals).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const email = z.string().trim().max(120).regex(EMAIL_RE, 'Invalid email address');
const password = z.string().min(8, 'Password must be at least 8 characters').max(100);

const name = z.string().trim().min(2, 'Name is too short').max(80);
const mobile = z.string().trim().min(7).max(20).regex(/^[0-9+\-\s()]+$/, 'Invalid mobile number');

const registerSchema = z.strictObject({
    name,
    email,
    mobile: mobile.optional(),
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

// ---- Profile + account ----
// At least one editable field must be present. Email/role are not editable.
const updateProfileSchema = z.strictObject({
    name: name.optional(),
    mobile: z.union([mobile, z.literal('')]).optional() // '' clears the mobile
}).refine(o => o.name !== undefined || o.mobile !== undefined, {
    message: 'Provide a name or mobile to update'
});

const deleteAccountSchema = z.strictObject({
    password: z.string().min(1, 'Password is required').max(100),
    reason: z.string().trim().max(300).optional()
});

module.exports = {
    registerSchema, loginSchema, verifyOtpSchema, resendOtpSchema, completeSignupSchema,
    forgotPasswordSchema, resetVerifyOtpSchema, resetPasswordSchema,
    updateProfileSchema, deleteAccountSchema
};
