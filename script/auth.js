/* Login / sign up / reset behaviour.
   - Real auth: posts to /api/auth/{login,register}, stores the JWT + user.
   - Distinguishes a real auth failure (show the server's message) from the
     server being offline (fall back to a client-only demo session so the
     GitHub Pages demo still works).
   Backend remains the source of truth — this is just UX. */

const OOPD = window.OOPD;

// Show / hide password fields
document.querySelectorAll('.toggle-pass').forEach(btn => {
    btn.addEventListener('click', () => {
        const input = btn.parentElement.querySelector('input');
        const icon = btn.querySelector('.material-symbols-outlined');
        const reveal = input.type === 'password';
        input.type = reveal ? 'text' : 'password';
        if (icon) icon.textContent = reveal ? 'visibility_off' : 'visibility';
    });
});

document.querySelectorAll('form[data-auth]').forEach(form => {
    const error = form.querySelector('.form-error');
    const pwd = form.querySelector('#password') || form.querySelector('#new-password');
    const confirm = form.querySelector('#confirm-password');
    const submitBtn = form.querySelector('button[type="submit"]');
    const needsMatch = form.hasAttribute('data-match');
    const action = form.getAttribute('data-auth-action'); // 'login' | 'register' | null
    const redirect = form.getAttribute('data-redirect') || 'index.html';
    const successMsg = form.getAttribute('data-success') || 'Success!';

    const val = sel => { const el = form.querySelector(sel); return el ? el.value.trim() : ''; };
    const show = (msg, ok) => {
        if (!error) return;
        error.textContent = msg;
        error.classList.toggle('success', !!ok);
    };
    const go = () => {
        const next = new URLSearchParams(location.search).get('next');
        location.href = next || redirect;
    };

    // Live confirm-password feedback
    if (needsMatch && confirm) {
        confirm.addEventListener('input', () => {
            show(confirm.value && pwd.value !== confirm.value ? 'Passwords do not match' : '');
        });
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        if (needsMatch && pwd && confirm && pwd.value !== confirm.value) {
            show('Passwords do not match');
            confirm.focus();
            return;
        }

        // Forms without an auth action (e.g. password reset) have no backend yet.
        if (!action || !OOPD) {
            show(successMsg, true);
            return;
        }

        const payload = action === 'register'
            ? { name: val('#name'), email: val('#email'), mobile: val('#mobile') || undefined, password: val('#password') }
            : { email: val('#email') || val('#username'), password: val('#password') };

        if (submitBtn) submitBtn.disabled = true;
        show(action === 'register' ? 'Creating your account…' : 'Logging you in…');

        try {
            const res = await OOPD.apiRequest('/api/auth/' + action, { method: 'POST', body: payload, auth: false });
            OOPD.setToken(res.data.token);
            OOPD.setUser(res.data.user);
            show(successMsg, true);
            setTimeout(go, 400);
        } catch (err) {
            if (err.isNetwork) {
                // Server offline (e.g. GitHub Pages) — client-only demo session.
                OOPD.clearToken();
                OOPD.setUser({ name: payload.name || payload.email.split('@')[0], email: payload.email, role: 'patient' });
                show('Server offline — continuing in demo mode…', true);
                setTimeout(go, 700);
            } else {
                const msg = (err.details && err.details[0] && err.details[0].message) || err.message;
                show(msg || 'Something went wrong');
                if (submitBtn) submitBtn.disabled = false;
            }
        }
    });
});
