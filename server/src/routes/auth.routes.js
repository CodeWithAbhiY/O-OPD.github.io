const express = require('express');
const { validate } = require('../middleware/validate');
const { authLimiter } = require('../middleware/rateLimit');
const { requireAuth } = require('../middleware/requireAuth');
const schema = require('../schemas/auth.schema');
const controller = require('../controllers/auth.controller');

const router = express.Router();

router.post('/register', authLimiter, validate({ body: schema.registerSchema }), controller.register);
router.post('/verify-otp', authLimiter, validate({ body: schema.verifyOtpSchema }), controller.verifyOtp);
router.post('/complete-signup', authLimiter, validate({ body: schema.completeSignupSchema }), controller.completeSignup);
router.post('/resend-otp', authLimiter, validate({ body: schema.resendOtpSchema }), controller.resendOtp);
router.post('/forgot-password', authLimiter, validate({ body: schema.forgotPasswordSchema }), controller.forgotPassword);
router.post('/reset-verify-otp', authLimiter, validate({ body: schema.resetVerifyOtpSchema }), controller.resetVerifyOtp);
router.post('/reset-password', authLimiter, validate({ body: schema.resetPasswordSchema }), controller.resetPassword);
router.post('/login', authLimiter, validate({ body: schema.loginSchema }), controller.login);
router.get('/me', requireAuth, controller.me);

// Profile + account management (authenticated).
router.get('/profile', requireAuth, controller.getProfile);
router.patch('/profile', requireAuth, validate({ body: schema.updateProfileSchema }), controller.updateProfile);
router.post('/delete-account', requireAuth, validate({ body: schema.deleteAccountSchema }), controller.deleteAccount);

module.exports = router;
