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
        if (needsMatch && pwd && confirm && pwd.value !== confirm.value) {
            event.preventDefault();
            show('Passwords do not match');
            confirm.focus();
            return;
        }
        // No backend yet — keep the user on the page and confirm the action.
        event.preventDefault();
        show(successMsg, true);
    });
});
