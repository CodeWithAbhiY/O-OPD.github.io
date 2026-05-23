const asyncHandler = require('../utils/asyncHandler');
const service = require('../services/auth.service');

const register = asyncHandler(async (req, res) => {
    const result = await service.register(req.validated.body);
    res.status(201).json({ data: result });
});

const login = asyncHandler(async (req, res) => {
    const result = await service.login(req.validated.body);
    res.json({ data: result });
});

// Requires requireAuth — returns the current user from the verified token.
function me(req, res) {
    res.json({ data: { user: req.user } });
}

module.exports = { register, login, me };
