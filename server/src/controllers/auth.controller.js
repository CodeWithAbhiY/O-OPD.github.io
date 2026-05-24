const asyncHandler = require('../utils/asyncHandler');
const service = require('../services/auth.service');
const { config } = require('../config/env');

// In development we return the OTP in the response so the flow can be tested
// without real email. NEVER exposed in production.
function withDevCode(body, code) {
    if (!config.isProd && code) body.devCode = code;
    return body;
}

// Step 1: stash pending signup + email an OTP. 202 = accepted, not yet created.
const register = asyncHandler(async (req, res) => {
    const result = await service.register(req.validated.body);
    res.status(202).json({
        data: withDevCode({ email: result.email, message: 'Verification code sent to your email.' }, result.code)
    });
});

// Step 2: verify the OTP → marks the signup verified and returns a one-time
// signup token (the account is NOT created yet).
const verifyOtp = asyncHandler(async (req, res) => {
    const result = await service.verifyOtp(req.validated.body);
    res.json({ data: result });
});

// Step 3: finalize → creates the account and returns a JWT.
const completeSignup = asyncHandler(async (req, res) => {
    const result = await service.completeSignup(req.validated.body);
    res.status(201).json({ data: result });
});

const resendOtp = asyncHandler(async (req, res) => {
    const result = await service.resendOtp(req.validated.body);
    res.json({
        data: withDevCode({ email: result.email, message: 'A new code has been sent.' }, result.code)
    });
});

// ---- Password reset ----
const forgotPassword = asyncHandler(async (req, res) => {
    const result = await service.forgotPassword(req.validated.body);
    // Generic message — never reveals whether the email is registered.
    res.json({ data: withDevCode({ email: result.email, message: 'If an account exists for that email, a 6-digit code has been sent.' }, result.code) });
});

const resetVerifyOtp = asyncHandler(async (req, res) => {
    const result = await service.resetVerifyOtp(req.validated.body);
    res.json({ data: result });
});

const resetPassword = asyncHandler(async (req, res) => {
    const result = await service.resetPassword(req.validated.body);
    res.json({ data: result });
});

const login = asyncHandler(async (req, res) => {
    const result = await service.login(req.validated.body);
    res.json({ data: result });
});

// Requires requireAuth — returns the current user from the verified token.
function me(req, res) {
    res.json({ data: { user: req.user } });
}

// ---- Profile + account (all require requireAuth; userId from the token) ----
const getProfile = asyncHandler(async (req, res) => {
    res.json({ data: service.getProfile(req.user.id) });
});

const updateProfile = asyncHandler(async (req, res) => {
    res.json({ data: service.updateProfile(req.user.id, req.validated.body) });
});

const deleteAccount = asyncHandler(async (req, res) => {
    const result = await service.deleteAccount({ userId: req.user.id, ...req.validated.body });
    res.json({ data: result });
});

module.exports = {
    register, verifyOtp, completeSignup, resendOtp,
    forgotPassword, resetVerifyOtp, resetPassword,
    login, me,
    getProfile, updateProfile, deleteAccount
};
