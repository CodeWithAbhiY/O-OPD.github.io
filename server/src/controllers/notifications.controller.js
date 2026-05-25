const asyncHandler = require('../utils/asyncHandler');
const service = require('../services/notifications.service');

const list = asyncHandler(async (req, res) => {
    const [items, unread] = await Promise.all([
        service.list(req.user.id),
        service.unreadCount(req.user.id)
    ]);
    res.json({ data: items, meta: { unread } });
});

const dismiss = asyncHandler(async (req, res) => {
    res.json({ data: await service.dismiss(req.user.id, req.validated.params.id) });
});

const markAllRead = asyncHandler(async (req, res) => {
    res.json({ data: await service.markAllRead(req.user.id) });
});

module.exports = { list, dismiss, markAllRead };
