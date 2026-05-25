const express = require('express');

const router = express.Router();

router.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'o-opd-api', build: 'ipv4-smtp-1', time: new Date().toISOString() });
});

router.use('/auth', require('./auth.routes'));
router.use('/doctors', require('./doctor.routes'));
router.use('/bookings', require('./booking.routes'));
router.use('/notifications', require('./notifications.routes'));

module.exports = router;
