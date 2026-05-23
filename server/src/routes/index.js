const express = require('express');

const router = express.Router();

router.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'o-opd-api', time: new Date().toISOString() });
});

router.use('/auth', require('./auth.routes'));
router.use('/doctors', require('./doctor.routes'));

module.exports = router;
