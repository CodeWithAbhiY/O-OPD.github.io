/* Per-user notification feed. Other services (bookings) call create() when
   something happens; the API exposes list/dismiss/read-all. Notifications are
   always scoped to the caller's own user id (no IDOR). Dismissing hides a row
   (dismissed = 1) rather than deleting it, keeping a simple trail. */

const { db } = require('../db');
const { notFound } = require('../utils/httpError');

function create({ userId, bookingId, type, title, body }) {
    db.run(
        'INSERT INTO notifications (user_id, booking_id, type, title, body) VALUES (?, ?, ?, ?, ?)',
        [userId, bookingId || null, type, title, body]
    );
}

function list(userId) {
    const rows = db.all(
        `SELECT id, booking_id, type, title, body, is_read, created_at
         FROM notifications
         WHERE user_id = ? AND dismissed = 0
         ORDER BY id DESC LIMIT 100`,
        [userId]
    );
    return rows.map(r => ({
        id: r.id,
        bookingId: r.booking_id,
        type: r.type,
        title: r.title,
        body: r.body,
        isRead: !!r.is_read,
        createdAt: r.created_at
    }));
}

function unreadCount(userId) {
    const row = db.get(
        'SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND dismissed = 0 AND is_read = 0',
        [userId]
    );
    return row ? row.n : 0;
}

function dismiss(userId, id) {
    const existing = db.get('SELECT id FROM notifications WHERE id = ? AND user_id = ?', [id, userId]);
    if (!existing) throw notFound('Notification not found');
    db.run('UPDATE notifications SET dismissed = 1 WHERE id = ? AND user_id = ?', [id, userId]);
    return { ok: true };
}

function markAllRead(userId) {
    db.run('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND dismissed = 0', [userId]);
    return { ok: true };
}

module.exports = { create, list, unreadCount, dismiss, markAllRead };
