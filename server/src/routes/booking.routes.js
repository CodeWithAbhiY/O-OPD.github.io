const express = require('express');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/requireAuth');
const schema = require('../schemas/booking.schema');
const controller = require('../controllers/booking.controller');

const router = express.Router();

// Every bookings route is authenticated; the user id is taken from the token.
router.post('/', requireAuth, validate({ body: schema.createBookingSchema }), controller.create);
router.get('/', requireAuth, validate({ query: schema.listQuery }), controller.list);
router.post('/:id/cancel', requireAuth, validate({ params: schema.idParam, body: schema.cancelSchema }), controller.cancel);
router.post('/:id/attend', requireAuth, validate({ params: schema.idParam }), controller.attend);

module.exports = router;
