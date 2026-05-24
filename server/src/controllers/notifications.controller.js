const asyncHandler = require('../utils/asyncHandler');
const service = require('../services/notifications.service');

const list = asyncHandler(async (req, res) => {
    res.json({ data: service.list(req.user.id), meta: { unread: service.unreadCount(req.user.id) } });
});

const dismiss = asyncHandler(async (req, res) => {
    res.json({ data: service.dismiss(req.user.id, req.validated.params.id) });
});

const markAllRead = asyncHandler(async (req, res) => {
    res.json({ data: service.markAllRead(req.user.id) });
});

module.exports = { list, dismiss, markAllRead };
