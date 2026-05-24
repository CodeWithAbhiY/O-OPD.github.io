const express = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/requireAuth');
const controller = require('../controllers/notifications.controller');

const router = express.Router();
const idParam = z.object({ id: z.coerce.number().int().positive() });

// All notification routes are authenticated; rows are scoped to req.user.id.
router.get('/', requireAuth, controller.list);
router.post('/read-all', requireAuth, controller.markAllRead);
router.post('/:id/dismiss', requireAuth, validate({ params: idParam }), controller.dismiss);

module.exports = router;
