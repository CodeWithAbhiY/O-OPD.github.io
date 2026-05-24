/* =====================================================================
   Reusable log-out confirmation popup.
   Exposes window.OOPDLogout.confirm(onConfirm): shows a blurred-backdrop
   modal and only runs onConfirm() when the user presses "Log Out".
   Self-contained — injects its own styles + markup, so any page can use it
   with a single <script> tag (load it BEFORE the script that logs out).
   ===================================================================== */

(function () {
    let overlay = null;
    let pendingConfirm = null;
    let lastFocus = null;

    function injectStyles() {
        if (document.getElementById('oopd-logout-styles')) return;
        const style = document.createElement('style');
        style.id = 'oopd-logout-styles';
        style.textContent = [
            '.oopd-logout-modal{position:fixed;inset:0;z-index:2000;display:flex;align-items:center;justify-content:center;padding:20px;}',
            '.oopd-logout-modal[hidden]{display:none!important;}',
            '.oopd-logout-backdrop{position:absolute;inset:0;background:rgba(15,23,42,.45);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);animation:oopdLogoutFade .18s ease;}',
            '.oopd-logout-card{position:relative;width:100%;max-width:380px;background:#fff;border-radius:18px;box-shadow:0 24px 60px rgba(2,6,23,.35);padding:28px 24px;text-align:center;animation:oopdLogoutPop .18s ease;}',
            '.oopd-logout-icon{width:56px;height:56px;border-radius:50%;display:grid;place-items:center;margin:0 auto 14px;background:var(--brand-gradient-soft,#e6f7f6);color:var(--primary-700,#0f766e);}',
            '.oopd-logout-card h3{margin:0 0 8px;font-size:1.35rem;color:var(--ink,#0f172a);font-family:var(--font-head,inherit);}',
            '.oopd-logout-card p{margin:0 0 22px;color:var(--muted,#64748b);font-size:.95rem;line-height:1.5;}',
            '.oopd-logout-actions{display:flex;gap:10px;justify-content:center;}',
            '.oopd-logout-actions button{flex:1;padding:11px 16px;border-radius:10px;font-family:var(--font-head,inherit);font-weight:600;font-size:.92rem;cursor:pointer;transition:background .2s ease,border-color .2s ease,color .2s ease;}',
            '.oopd-logout-stay{background:#fff;border:1px solid var(--line,#e2e8f0);color:var(--ink,#0f172a);}',
            '.oopd-logout-stay:hover{border-color:var(--primary,#0ea5a4);color:var(--primary-700,#0f766e);}',
            '.oopd-logout-go{background:var(--primary,#0ea5a4);border:1px solid var(--primary,#0ea5a4);color:#fff;}',
            '.oopd-logout-go:hover{background:var(--primary-700,#0f766e);border-color:var(--primary-700,#0f766e);}',
            '@keyframes oopdLogoutFade{from{opacity:0}to{opacity:1}}',
            '@keyframes oopdLogoutPop{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}'
        ].join('');
        document.head.appendChild(style);
    }

    function build() {
        injectStyles();
        overlay = document.createElement('div');
        overlay.className = 'oopd-logout-modal';
        overlay.hidden = true;
        overlay.innerHTML =
            '<div class="oopd-logout-backdrop" data-logout-close></div>' +
            '<div class="oopd-logout-card" role="dialog" aria-modal="true" aria-labelledby="oopdLogoutTitle">' +
                '<div class="oopd-logout-icon">' +
                    '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
                        '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>' +
                    '</svg>' +
                '</div>' +
                '<h3 id="oopdLogoutTitle">Log Out</h3>' +
                '<p>Are you sure you want to log out of your account?</p>' +
                '<div class="oopd-logout-actions">' +
                    '<button type="button" class="oopd-logout-stay" data-logout-close>Stay Logged In</button>' +
                    '<button type="button" class="oopd-logout-go">Log Out</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(overlay);

        overlay.querySelectorAll('[data-logout-close]').forEach(el => el.addEventListener('click', close));
        overlay.querySelector('.oopd-logout-go').addEventListener('click', () => {
            const fn = pendingConfirm;
            close();
            if (typeof fn === 'function') fn();
        });
        document.addEventListener('keydown', e => {
            if (overlay && !overlay.hidden && e.key === 'Escape') close();
        });
    }

    function open(onConfirm) {
        if (!overlay) build();
        pendingConfirm = onConfirm;
        lastFocus = document.activeElement;
        overlay.hidden = false;
        document.body.style.overflow = 'hidden';
        const stay = overlay.querySelector('.oopd-logout-stay');
        if (stay) stay.focus();
    }

    function close() {
        if (!overlay) return;
        overlay.hidden = true;
        pendingConfirm = null;
        document.body.style.overflow = '';
        if (lastFocus && typeof lastFocus.focus === 'function') {
            try { lastFocus.focus(); } catch (_) { /* ignore */ }
        }
    }

    window.OOPDLogout = { confirm: open };
})();
