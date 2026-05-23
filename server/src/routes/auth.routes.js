const express = require('express');
const { validate } = require('../middleware/validate');
const { authLimiter } = require('../middleware/rateLimit');
const { requireAuth } = require('../middleware/requireAuth');
const schema = require('../schemas/auth.schema');
const controller = require('../controllers/auth.controller');

const router = express.Router();

router.post('/register', authLimiter, validate({ body: schema.registerSchema }), controller.register);
router.post('/login', authLimiter, validate({ body: schema.loginSchema }), controller.login);
router.get('/me', requireAuth, controller.me);

module.exports = router;
