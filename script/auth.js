// Shared behaviour for the login / sign up / reset-password pages.

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

// Lightweight client-side validation. Real submission/OTP is wired up separately.
document.querySelectorAll('form[data-auth]').forEach(form => {
    const error = form.querySelector('.form-error');
    const pwd = form.querySelector('#password') || form.querySelector('#new-password');
    const confirm = form.querySelector('#confirm-password');
    const needsMatch = form.hasAttribute('data-match');
    const successMsg = form.getAttribute('data-success') || 'Success!';

    const show = (msg, ok) => {
        if (!error) return;
        error.textContent = msg;
        error.classList.toggle('success', !!ok);
    };

    // Live confirm-password feedback
    if (needsMatch && confirm) {
        confirm.addEventListener('input', () => {
            if (confirm.value && pwd.value !== confirm.value) {
                show('Passwords do not match');
            } else {
                show('');
            }
        });
    }

    form.addEventListener('submit', event => {
        event.preventDefault();
        if (needsMatch && pwd && confirm && pwd.value !== confirm.value) {
            show('Passwords do not match');
            confirm.focus();
            return;
        }
        // No backend yet — confirm the action on the page.
        show(successMsg, true);

        // Demo-only "session" so pages like My Appointments can be gated.
        // NOTE: this is NOT real security — the backend must enforce auth.
        if (form.hasAttribute('data-login')) {
            const valOf = sel => { const el = form.querySelector(sel); return el ? el.value.trim() : ''; };
            const session = {
                name: valOf('#name'),
                email: valOf('#email') || valOf('#username'),
                ts: Date.now()
            };
            try { localStorage.setItem('oopd_auth', JSON.stringify(session)); } catch (e) {}

            const next = new URLSearchParams(location.search).get('next');
            const dest = next || form.getAttribute('data-redirect') || 'index.html';
            setTimeout(() => { location.href = dest; }, 700);
        }
    });
});
