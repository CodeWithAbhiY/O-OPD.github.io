/* =====================================================================
   O-OPD — My Account (profile / notifications / settings)
   Talks to the backend (api.js / window.OOPD). Tabs are hash-routed
   (#profile / #notifications / #settings). Degrades gracefully when the
   server is unreachable (shows what localStorage knows).
   ===================================================================== */

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function hasServer() {
    return !!(window.OOPD && window.OOPD.getToken && window.OOPD.getToken());
}

function localSession() {
    try { return JSON.parse(localStorage.getItem('oopd_auth') || 'null'); } catch (e) { return null; }
}

function initials(name) {
    return (String(name || '').replace(/^Dr\.?\s*/, '').split(/\s+/).map(w => w[0]).slice(0, 2).join('') || 'U').toUpperCase();
}

// "YYYY-MM-DD HH:MM:SS" (UTC) -> "x minutes ago" / "x hours ago" / date.
function relativeTime(utc) {
    if (!utc) return '';
    const d = new Date(String(utc).replace(' ', 'T') + 'Z');
    if (isNaN(d.getTime())) return '';
    const secs = Math.floor((Date.now() - d.getTime()) / 1000);
    if (secs < 45) return 'just now';
    const mins = Math.round(secs / 60);
    if (mins < 60) return mins + (mins === 1 ? ' minute ago' : ' minutes ago');
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return hrs + (hrs === 1 ? ' hour ago' : ' hours ago');
    const days = Math.round(hrs / 24);
    if (days < 7) return days + (days === 1 ? ' day ago' : ' days ago');
    return d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' });
}

// Full date+time in IST for the "member since" row.
function fmtDateIST(utc) {
    if (!utc) return '—';
    const d = new Date(String(utc).replace(' ', 'T') + 'Z');
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'long', year: 'numeric' });
}

function showToast(msg) {
    const t = document.getElementById('acctToast');
    const m = document.getElementById('acctToastMsg');
    if (!t || !m) return;
    m.textContent = msg;
    t.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { t.hidden = true; }, 4000);
}

/* ---------------- Tabs ---------------- */
const TABS = ['profile', 'notifications', 'settings'];

function showTab(tab) {
    if (!TABS.includes(tab)) tab = 'profile';
    TABS.forEach(t => {
        const panel = document.getElementById('panel-' + t);
        if (panel) panel.hidden = (t !== tab);
    });
    document.querySelectorAll('.account-tab').forEach(a => {
        a.classList.toggle('active', a.getAttribute('data-tab') === tab);
    });
    if (tab === 'notifications') loadNotifications();
}

function currentTab() {
    return (location.hash || '').replace('#', '') || 'profile';
}

/* ---------------- Profile ---------------- */
let profileData = null;

async function loadProfile() {
    if (hasServer()) {
        try {
            const resp = await window.OOPD.apiRequest('/api/auth/profile');
            profileData = resp.data;
        } catch (err) {
            if (err.status === 401) { location.replace('login.html?next=account.html'); return; }
        }
    }
    if (!profileData) {
        const s = localSession() || {};
        profileData = { name: s.name || 'Account', email: s.email || '', mobile: '', role: 'patient', createdAt: null };
    }
    renderProfile();
    fillSettingsForm();
}

function renderProfile() {
    const p = profileData;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('profileAvatar', initials(p.name));
    set('profileName', p.name || '—');
    set('profileRole', p.role || 'patient');

    const row = (icon, label, value) =>
        '<div class="profile-row"><span class="material-symbols-outlined">' + icon + '</span>' +
        '<div><div class="lbl">' + esc(label) + '</div><div class="val">' + esc(value || '—') + '</div></div></div>';

    const rows = document.getElementById('profileRows');
    if (rows) {
        rows.innerHTML =
            row('badge', 'Full name', p.name) +
            row('mail', 'Email', p.email) +
            row('call', 'Mobile', p.mobile) +
            row('shield_person', 'Account type', p.role) +
            row('calendar_month', 'Member since', fmtDateIST(p.createdAt));
    }
}

/* ---------------- Notifications ---------------- */
const NOTIF_ICON = {
    booking_confirmed: 'check_circle',
    booking_cancelled: 'cancel',
    refund: 'currency_rupee',
    booking_completed: 'task_alt',
    booking_missed: 'event_busy',
    account: 'manage_accounts'
};

async function loadNotifications() {
    const wrap = document.getElementById('notifList');
    if (!wrap) return;
    if (!hasServer()) {
        wrap.innerHTML = emptyNotif('Sign in with the server running to see your notifications.');
        return;
    }
    try {
        const resp = await window.OOPD.apiRequest('/api/notifications');
        const items = resp.data || [];
        const unread = (resp.meta && resp.meta.unread) || 0;
        updateNotifCount(unread);
        if (!items.length) {
            wrap.innerHTML = emptyNotif('You have no notifications yet.');
            return;
        }
        wrap.innerHTML = items.map(notifCard).join('');
        wrap.querySelectorAll('[data-dismiss]').forEach(btn => {
            btn.addEventListener('click', () => dismissNotif(btn.getAttribute('data-dismiss')));
        });
    } catch (err) {
        if (err.status === 401) { location.replace('login.html?next=account.html'); return; }
        wrap.innerHTML = emptyNotif('Could not load notifications.');
    }
}

function notifCard(n) {
    const icon = NOTIF_ICON[n.type] || 'notifications';
    return '<div class="notif ' + (n.isRead ? '' : 'unread') + '" data-id="' + esc(n.id) + '">' +
        '<span class="notif-ic ' + esc(n.type) + '"><span class="material-symbols-outlined">' + icon + '</span></span>' +
        '<div class="notif-body">' +
            '<div class="notif-title">' + esc(n.title) + '</div>' +
            '<div class="notif-text">' + esc(n.body) + '</div>' +
            '<div class="notif-time">' + esc(relativeTime(n.createdAt)) + '</div>' +
        '</div>' +
        '<button class="notif-x" type="button" data-dismiss="' + esc(n.id) + '" aria-label="Dismiss">&times;</button>' +
    '</div>';
}

function emptyNotif(msg) {
    return '<div class="notif-empty"><span class="material-symbols-outlined">notifications_off</span><p>' + esc(msg) + '</p></div>';
}

async function dismissNotif(id) {
    try {
        await window.OOPD.apiRequest('/api/notifications/' + encodeURIComponent(id) + '/dismiss', { method: 'POST' });
        const el = document.querySelector('.notif[data-id="' + id + '"]');
        if (el) el.remove();
        const left = document.querySelectorAll('#notifList .notif').length;
        if (!left) document.getElementById('notifList').innerHTML = emptyNotif('You have no notifications yet.');
    } catch (err) {
        showToast('Could not dismiss the notification.');
    }
}

function updateNotifCount(n) {
    const tc = document.getElementById('tabCount');
    if (tc) { if (n > 0) { tc.hidden = false; tc.textContent = n > 99 ? '99+' : String(n); } else tc.hidden = true; }
}

async function markAllRead() {
    if (!hasServer()) return;
    try {
        await window.OOPD.apiRequest('/api/notifications/read-all', { method: 'POST' });
        document.querySelectorAll('#notifList .notif.unread').forEach(el => el.classList.remove('unread'));
        updateNotifCount(0);
        showToast('All notifications marked as read.');
    } catch (err) { showToast('Could not update notifications.'); }
}

/* ---------------- Settings: edit profile ---------------- */
function fillSettingsForm() {
    const n = document.getElementById('setName');
    const m = document.getElementById('setMobile');
    if (n) n.value = profileData.name || '';
    if (m) m.value = profileData.mobile || '';
}

function wireProfileForm() {
    const form = document.getElementById('profileForm');
    if (!form) return;
    form.addEventListener('submit', async e => {
        e.preventDefault();
        const msg = document.getElementById('profileMsg');
        const btn = document.getElementById('saveProfileBtn');
        const name = document.getElementById('setName').value.trim();
        const mobile = document.getElementById('setMobile').value.trim();
        msg.textContent = ''; msg.className = 'form-msg';

        if (name.length < 2) { msg.textContent = 'Please enter your name.'; msg.classList.add('error'); return; }
        if (!hasServer()) { msg.textContent = 'Start the server to save changes.'; msg.classList.add('error'); return; }

        btn.disabled = true;
        try {
            const resp = await window.OOPD.apiRequest('/api/auth/profile', { method: 'PATCH', body: { name, mobile } });
            profileData = resp.data;
            renderProfile();
            // Keep the navbar greeting/avatar in sync.
            const s = localSession() || {};
            s.name = profileData.name;
            try { localStorage.setItem('oopd_auth', JSON.stringify(s)); } catch (_) {}
            msg.textContent = 'Profile updated.'; msg.classList.add('ok');
            showToast('Profile updated.');
        } catch (err) {
            msg.textContent = (err && err.message) || 'Could not update profile.'; msg.classList.add('error');
        } finally {
            btn.disabled = false;
        }
    });
}

/* ---------------- Delete account flow ---------------- */
function wireDelete() {
    const modal = document.getElementById('delModal');
    const step1 = document.getElementById('delStep1');
    const step2 = document.getElementById('delStep2');
    if (!modal) return;

    const open = () => { resetSteps(); modal.hidden = false; document.body.style.overflow = 'hidden'; };
    const close = () => { modal.hidden = true; document.body.style.overflow = ''; resetSteps(); };
    function resetSteps() {
        step1.hidden = false; step2.hidden = true;
        const pw = document.getElementById('delPassword'); if (pw) pw.value = '';
        const dm = document.getElementById('delMsg'); if (dm) dm.textContent = '';
    }

    const openBtn = document.getElementById('openDeleteBtn');
    if (openBtn) openBtn.addEventListener('click', open);
    modal.querySelectorAll('[data-del-close]').forEach(el => el.addEventListener('click', close));
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) close(); });

    document.getElementById('delContinueBtn').addEventListener('click', () => {
        step1.hidden = true; step2.hidden = false;
        const pw = document.getElementById('delPassword'); if (pw) pw.focus();
    });
    document.getElementById('delBackBtn').addEventListener('click', resetSteps);

    document.getElementById('delConfirmBtn').addEventListener('click', async () => {
        const pw = document.getElementById('delPassword').value;
        const dm = document.getElementById('delMsg');
        const btn = document.getElementById('delConfirmBtn');
        dm.textContent = ''; dm.className = 'form-msg';
        if (!pw) { dm.textContent = 'Please enter your password.'; dm.classList.add('error'); return; }
        if (!hasServer()) { dm.textContent = 'Start the server to delete your account.'; dm.classList.add('error'); return; }

        btn.disabled = true;
        try {
            await window.OOPD.apiRequest('/api/auth/delete-account', { method: 'POST', body: { password: pw } });
            // Immediately log out + go to the goodbye/login page.
            try { localStorage.removeItem('oopd_auth'); localStorage.removeItem('oopd_token'); } catch (_) {}
            location.replace('login.html?deactivated=1');
        } catch (err) {
            btn.disabled = false;
            dm.textContent = (err && err.message) || 'Could not delete the account.';
            dm.classList.add('error');
        }
    });
}

/* ---------------- Boot ---------------- */
document.addEventListener('DOMContentLoaded', () => {
    showTab(currentTab());
    window.addEventListener('hashchange', () => showTab(currentTab()));
    const mar = document.getElementById('markAllRead');
    if (mar) mar.addEventListener('click', markAllRead);
    wireProfileForm();
    wireDelete();
    loadProfile();
    // Pre-load the unread count for the tab badge even on the profile tab.
    if (hasServer()) {
        window.OOPD.apiRequest('/api/notifications').then(r => updateNotifCount((r.meta && r.meta.unread) || 0)).catch(() => {});
    }
});
