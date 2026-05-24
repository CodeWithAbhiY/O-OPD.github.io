const asyncHandler = require('../utils/asyncHandler');
const service = require('../services/booking.service');

// req.user.id comes from the verified JWT (requireAuth) — never from the client.
const create = asyncHandler(async (req, res) => {
    const booking = service.createBooking({ userId: req.user.id, ...req.validated.body });
    res.status(201).json({ data: booking });
});

const list = asyncHandler(async (req, res) => {
    const { status, page, limit } = req.validated.query;
    const { items, total } = service.listBookings({ userId: req.user.id, status, page, limit });
    res.json({ data: items, pagination: { page, limit, total } });
});

const cancel = asyncHandler(async (req, res) => {
    const reason = req.validated.body ? req.validated.body.reason : undefined;
    const booking = service.cancelBooking({ userId: req.user.id, bookingId: req.validated.params.id, reason });
    res.json({ data: booking });
});

module.exports = { create, list, cancel };
