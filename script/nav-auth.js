/* =====================================================================
   Auth-aware navbar (home + results pages)
   If a demo session exists (localStorage "oopd_auth"), replace the
   "Log in / Sign up" buttons with a greeting + "Log out".
   Demo only — real auth state must come from the backend.
   ===================================================================== */

(function () {
    let session = null;
    try { session = JSON.parse(localStorage.getItem('oopd_auth') || 'null'); } catch (e) {}

    const actions = document.querySelector('.nav-actions');
    if (!actions || !session) return;

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    const raw = (session.name && session.name.trim()) ||
        (session.email ? session.email.split('@')[0] : 'Account');
    const name = escapeHtml(raw);

    actions.innerHTML =
        '<span class="nav-greeting" style="font-weight:600;color:var(--ink-soft);font-size:0.95rem;align-self:center;">Hi, ' + name + '</span>' +
        '<button type="button" class="btn btn-primary" id="navLogout">Log out</button>';

    document.getElementById('navLogout').addEventListener('click', () => {
        try { localStorage.removeItem('oopd_auth'); } catch (_) {}
        location.href = 'index.html';
    });
})();
