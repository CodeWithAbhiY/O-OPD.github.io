/* =====================================================================
   Auth-aware navbar: avatar + dropdown menu (all pages)
   When a session exists (localStorage "oopd_auth"), replace the
   "Log in / Sign up" (or static "Log out") buttons with a "New appointment"
   button + a circular avatar that opens a dropdown:
     My Profile · Notifications · Account Settings · Log out
   Self-contained: injects its own styles so it looks right on every page.
   Demo only — real auth state is enforced by the backend.
   ===================================================================== */

(function () {
    let session = null;
    try { session = JSON.parse(localStorage.getItem('oopd_auth') || 'null'); } catch (e) {}

    const actions = document.querySelector('.nav-actions');
    if (!actions || !session) return;

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    const raw = (session.name && session.name.trim()) ||
        (session.email ? session.email.split('@')[0] : 'Account');
    const initials = (raw.replace(/^Dr\.?\s*/, '').split(/\s+/).map(w => w[0]).slice(0, 2).join('') || 'U').toUpperCase();
    const name = esc(raw);
    const email = esc(session.email || '');

    injectStyles();

    actions.innerHTML =
        '<div class="acct-menu" id="acctMenu">' +
            '<button type="button" class="acct-avatar" id="acctAvatarBtn" aria-haspopup="true" aria-expanded="false" aria-label="Account menu" title="' + name + '">' +
                '<span class="acct-initials">' + esc(initials) + '</span>' +
                '<span class="acct-dot" id="acctDot" hidden></span>' +
            '</button>' +
            '<div class="acct-dropdown" id="acctDropdown" role="menu" hidden>' +
                '<div class="acct-head">' +
                    '<span class="acct-initials lg">' + esc(initials) + '</span>' +
                    '<div class="acct-head-text"><div class="acct-name">' + name + '</div><div class="acct-email">' + email + '</div></div>' +
                '</div>' +
                '<a href="account.html#profile" class="acct-item" role="menuitem"><span class="material-symbols-outlined">person</span> My Profile</a>' +
                '<a href="account.html#notifications" class="acct-item" role="menuitem"><span class="material-symbols-outlined">notifications</span> Notifications <span class="acct-count" id="acctCount" hidden></span></a>' +
                '<a href="account.html#settings" class="acct-item" role="menuitem"><span class="material-symbols-outlined">settings</span> Account Settings</a>' +
                '<div class="acct-sep"></div>' +
                '<button type="button" class="acct-item acct-logout" id="acctLogout" role="menuitem"><span class="material-symbols-outlined">logout</span> Log out</button>' +
            '</div>' +
        '</div>';

    const btn = document.getElementById('acctAvatarBtn');
    const dd = document.getElementById('acctDropdown');

    function setOpen(open) {
        dd.hidden = !open;
        btn.setAttribute('aria-expanded', String(open));
    }
    btn.addEventListener('click', e => { e.stopPropagation(); setOpen(dd.hidden); });
    document.addEventListener('click', e => { if (!e.target.closest('#acctMenu')) setOpen(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') setOpen(false); });

    document.getElementById('acctLogout').addEventListener('click', () => {
        const doLogout = () => {
            try { localStorage.removeItem('oopd_auth'); localStorage.removeItem('oopd_token'); } catch (_) {}
            location.href = 'index.html';
        };
        if (window.OOPDLogout && window.OOPDLogout.confirm) window.OOPDLogout.confirm(doLogout);
        else doLogout();
    });

    // Unread notifications badge (only when the backend is reachable).
    if (window.OOPD && window.OOPD.getToken && window.OOPD.getToken()) {
        window.OOPD.apiRequest('/api/notifications').then(resp => {
            const n = (resp && resp.meta && resp.meta.unread) || 0;
            if (n > 0) {
                const dot = document.getElementById('acctDot');
                if (dot) dot.hidden = false;
                const c = document.getElementById('acctCount');
                if (c) { c.hidden = false; c.textContent = n > 99 ? '99+' : String(n); }
            }
        }).catch(() => { /* offline/demo — no badge */ });
    }

    function injectStyles() {
        if (document.getElementById('acct-menu-styles')) return;
        const style = document.createElement('style');
        style.id = 'acct-menu-styles';
        style.textContent = [
            '.acct-menu{position:relative;}',
            '.acct-avatar{position:relative;width:42px;height:42px;border-radius:50%;border:none;cursor:pointer;display:grid;place-items:center;background:var(--brand-gradient,linear-gradient(135deg,#0ea5a4,#0f766e));color:#fff;font-family:var(--font-head,inherit);font-weight:700;font-size:.95rem;box-shadow:0 2px 8px rgba(2,6,23,.15);transition:transform .15s ease,box-shadow .15s ease;}',
            '.acct-avatar:hover{transform:translateY(-1px);box-shadow:0 4px 14px rgba(2,6,23,.22);}',
            '.acct-dot{position:absolute;top:-2px;right:-2px;width:12px;height:12px;border-radius:50%;background:#ef4444;border:2px solid #fff;}',
            '.acct-dropdown{position:absolute;top:calc(100% + 10px);right:0;width:264px;background:#fff;border:1px solid var(--line,#e2e8f0);border-radius:14px;box-shadow:0 18px 48px rgba(2,6,23,.22);padding:8px;z-index:1500;animation:acctPop .15s ease;}',
            '.acct-dropdown[hidden]{display:none!important;}',
            '@keyframes acctPop{from{opacity:0;transform:translateY(-6px);}to{opacity:1;transform:none;}}',
            '.acct-head{display:flex;align-items:center;gap:12px;padding:10px 10px 12px;border-bottom:1px solid var(--line,#e2e8f0);margin-bottom:6px;}',
            '.acct-initials.lg{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;background:var(--brand-gradient,linear-gradient(135deg,#0ea5a4,#0f766e));color:#fff;font-weight:700;flex-shrink:0;}',
            '.acct-head-text{min-width:0;}',
            '.acct-name{font-weight:700;color:var(--ink,#0f172a);font-size:.95rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
            '.acct-email{color:var(--muted,#64748b);font-size:.8rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
            '.acct-item{display:flex;align-items:center;gap:10px;width:100%;padding:10px 10px;border:none;background:none;border-radius:9px;font-family:inherit;font-size:.92rem;color:var(--ink,#0f172a);text-decoration:none;cursor:pointer;text-align:left;transition:background .15s ease,color .15s ease;}',
            '.acct-item:hover{background:var(--brand-gradient-soft,#e6f7f6);color:var(--primary-700,#0f766e);}',
            '.acct-item .material-symbols-outlined{font-size:20px;color:var(--primary-700,#0f766e);}',
            '.acct-logout{color:#dc2626;}',
            '.acct-logout .material-symbols-outlined{color:#dc2626;}',
            '.acct-logout:hover{background:#fee2e2;color:#b91c1c;}',
            '.acct-sep{height:1px;background:var(--line,#e2e8f0);margin:6px 4px;}',
            '.acct-count{margin-left:auto;background:#ef4444;color:#fff;font-size:.72rem;font-weight:700;min-width:20px;height:20px;border-radius:999px;display:inline-grid;place-items:center;padding:0 6px;}'
        ].join('');
        document.head.appendChild(style);
    }
})();
