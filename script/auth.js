/* Login / sign up / reset behaviour.
   - Login: posts to /api/auth/login, stores the JWT + user.
   - Sign up is inline + email-verified: fill the form → Generate OTP
     (/api/auth/register emails a 6-digit code, no account yet) → enter code →
     Verify OTP (/api/auth/verify-otp returns a one-time signup token) → Create
     account (/api/auth/complete-signup, requires that token, creates the user).
     "Create account" is blocked with a clear message until the email is verified.
   - Offline (e.g. GitHub Pages with no server): login falls back to a demo
     session so the static demo still works.
   Backend remains the source of truth — this is just UX. */

const OOPD = window.OOPD;

// ---------------- Show / hide password fields ----------------
document.querySelectorAll('.toggle-pass').forEach(btn => {
    btn.addEventListener('click', () => {
        const input = btn.parentElement.querySelector('input');
        const icon = btn.querySelector('.material-symbols-outlined');
        const reveal = input.type === 'password';
        input.type = reveal ? 'text' : 'password';
        if (icon) icon.textContent = reveal ? 'visibility_off' : 'visibility';
        btn.setAttribute('aria-label', reveal ? 'Hide password' : 'Show password');
    });
});

// Where to go after a successful login / sign-up (honours ?next=).
function redirectTo(fallback) {
    const next = new URLSearchParams(location.search).get('next');
    location.href = next || fallback || 'index.html';
}

function firstMsg(err) {
    return (err.details && err.details[0] && err.details[0].message) || err.message;
}

// ---------------- Sign-up (inline OTP flow) ----------------
(function signupController() {
    const form = document.getElementById('signup-form');
    const genBtn = document.getElementById('gen-otp-btn');
    if (!form || !genBtn || !OOPD) return; // only on the sign-up page

    const verifyBtn = document.getElementById('verify-otp-btn');
    const createBtn = document.getElementById('create-btn');
    const createHint = document.getElementById('create-hint');
    const genLabel = document.getElementById('gen-otp-label');
    const codeGroup = document.getElementById('otp-code-group');
    const codeEl = document.getElementById('otp-code');
    const statusEl = document.getElementById('otp-status');
    const devEl = document.getElementById('otp-dev');
    const badge = document.getElementById('verify-badge');
    const errEl = form.querySelector('.form-error');
    const pwd = form.querySelector('#password');
    const confirm = form.querySelector('#confirm-password');
    const redirect = form.getAttribute('data-redirect') || 'index.html';
    const accountFields = ['#name', '#mobile', '#email', '#password', '#confirm-password'];

    let signupToken = '';   // proof the email was verified (from verify-otp)
    let otpEmail = '';      // the email the OTP was sent to

    const val = sel => { const el = form.querySelector(sel); return el ? el.value.trim() : ''; };

    const setStatus = (msg, kind) => { // kind: 'ok' | 'err' | undefined
        if (!statusEl) return;
        statusEl.hidden = !msg;
        statusEl.textContent = msg || '';
        statusEl.className = 'otp-status' + (kind === 'ok' ? ' ok' : kind === 'err' ? ' err' : '');
    };
    const setErr = (msg, ok) => {
        if (!errEl) return;
        errEl.textContent = msg || '';
        errEl.classList.toggle('success', !!ok);
    };
    const showDev = code => {
        if (!devEl) return;
        devEl.hidden = !code;
        devEl.textContent = code ? 'Dev mode: your code is ' + code : '';
    };

    // Reset the whole verification UI (used on first load, resend, and whenever
    // an account field changes after a code was sent — so you can't verify one
    // email then create the account with different details).
    function resetVerification() {
        signupToken = '';
        otpEmail = '';
        if (codeGroup) codeGroup.hidden = true;
        if (codeEl) { codeEl.value = ''; codeEl.disabled = false; }
        if (verifyBtn) { verifyBtn.hidden = true; verifyBtn.disabled = false; verifyBtn.textContent = 'Verify OTP'; }
        if (badge) badge.hidden = true;
        // "Send OTP" before the first send; Resend appears only after sending.
        if (genLabel) genLabel.textContent = 'Send OTP';
        genBtn.disabled = false;
        // Create account stays disabled until the email is verified.
        if (createBtn) createBtn.disabled = true;
        if (createHint) createHint.hidden = false;
        showDev('');
        setStatus('');
    }

    accountFields.forEach(sel => {
        const el = form.querySelector(sel);
        if (el) el.addEventListener('input', () => { if (otpEmail || signupToken) resetVerification(); });
    });

    if (confirm) {
        confirm.addEventListener('input', () => {
            setErr(confirm.value && pwd.value !== confirm.value ? 'Passwords do not match' : '');
        });
    }

    // Validate the account fields before we send a code or create the account.
    function detailsValid() {
        if (!form.checkValidity()) { form.reportValidity(); return false; }
        if (pwd && confirm && pwd.value !== confirm.value) {
            setErr('Passwords do not match');
            confirm.focus();
            return false;
        }
        return true;
    }

    // 1) Generate (or resend) the OTP.
    genBtn.addEventListener('click', async () => {
        setErr('');
        if (!detailsValid()) return;

        const payload = { name: val('#name'), email: val('#email'), mobile: val('#mobile') || undefined, password: val('#password') };
        genBtn.disabled = true;
        setStatus('Sending code…');
        try {
            const res = await OOPD.apiRequest('/api/auth/register', { method: 'POST', body: payload, auth: false });
            resetVerification();           // clear any prior verified state
            otpEmail = payload.email;
            if (codeGroup) codeGroup.hidden = false;
            if (verifyBtn) verifyBtn.hidden = false;
            if (genLabel) genLabel.textContent = 'Resend OTP'; // now it's a resend
            setStatus('OTP sent to your email (' + otpEmail + ').', 'ok');
            showDev(res.data && res.data.devCode);
            if (codeEl) codeEl.focus();
        } catch (err) {
            if (err.isNetwork) setStatus('Server offline — cannot send the code right now.', 'err');
            else setStatus(firstMsg(err) || 'Could not send the code', 'err');
        } finally {
            genBtn.disabled = false;
        }
    });

    // 2) Verify the OTP → green signal, enable account creation.
    if (verifyBtn) {
        verifyBtn.addEventListener('click', async () => {
            const code = (codeEl.value || '').trim();
            if (!/^\d{6}$/.test(code)) { setStatus('Enter the 6-digit code.', 'err'); return; }
            verifyBtn.disabled = true;
            setStatus('Verifying…');
            try {
                const res = await OOPD.apiRequest('/api/auth/verify-otp', {
                    method: 'POST', body: { email: otpEmail, code }, auth: false
                });
                signupToken = res.data.signupToken;
                setStatus('Email verified ✓ — you can now create your account.', 'ok');
                if (badge) badge.hidden = false;
                // Lock the verification controls and enable account creation.
                if (codeEl) codeEl.disabled = true;          // disable OTP input
                verifyBtn.disabled = true;                    // disable Verify button
                verifyBtn.textContent = 'Verified ✓';
                genBtn.disabled = true;                       // disable Resend OTP
                if (createBtn) createBtn.disabled = false;    // enable Create account
                if (createHint) createHint.hidden = true;
            } catch (err) {
                verifyBtn.disabled = false;
                setStatus(firstMsg(err) || 'Could not verify the code', 'err');
            }
        });
    }

    // Enter in the code box verifies, instead of submitting the whole form.
    if (codeEl && verifyBtn) {
        codeEl.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); verifyBtn.click(); }
        });
    }

    // 3) Create account (guarded by verification).
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!detailsValid()) return;
        if (!otpEmail) { setErr('Please verify your email — click "Generate OTP" first.'); return; }
        if (!signupToken) { setErr('OTP not verified — enter the code and click "Verify OTP".'); return; }

        createBtn.disabled = true;
        setErr('Creating your account…', true);
        try {
            const res = await OOPD.apiRequest('/api/auth/complete-signup', {
                method: 'POST', body: { email: otpEmail, signupToken }, auth: false
            });
            OOPD.setToken(res.data.token);
            OOPD.setUser(res.data.user);
            setErr('Account created! Taking you in…', true);
            setTimeout(() => redirectTo(redirect), 500);
        } catch (err) {
            createBtn.disabled = false;
            // If the verification expired/!found, guide them to redo it.
            if (err.status === 400 || err.status === 401) resetVerification();
            setErr(firstMsg(err) || 'Could not create the account');
        }
    });

    resetVerification();
})();

// ---------------- Forgot password (inline OTP flow) ----------------
(function resetController() {
    const form = document.getElementById('reset-form');
    const genBtn = document.getElementById('gen-otp-btn');
    if (!form || !genBtn || !OOPD) return; // only on the reset page

    const verifyBtn = document.getElementById('verify-otp-btn');
    const changeBtn = document.getElementById('change-btn');
    const changeHint = document.getElementById('change-hint');
    const genLabel = document.getElementById('gen-otp-label');
    const codeGroup = document.getElementById('otp-code-group');
    const codeEl = document.getElementById('otp-code');
    const statusEl = document.getElementById('otp-status');
    const devEl = document.getElementById('otp-dev');
    const badge = document.getElementById('verify-badge');
    const newpassGroup = document.getElementById('newpass-group');
    const pwd = document.getElementById('new-password');
    const confirm = document.getElementById('confirm-password');
    const emailEl = document.getElementById('email');
    const errEl = form.querySelector('.form-error');
    const redirect = form.getAttribute('data-redirect') || 'login.html';

    let resetToken = '';
    let otpEmail = '';

    const setStatus = (msg, kind) => {
        if (!statusEl) return;
        statusEl.hidden = !msg;
        statusEl.textContent = msg || '';
        statusEl.className = 'otp-status' + (kind === 'ok' ? ' ok' : kind === 'err' ? ' err' : '');
    };
    const setErr = (msg, ok) => {
        if (!errEl) return;
        errEl.textContent = msg || '';
        errEl.classList.toggle('success', !!ok);
    };
    const showDev = code => {
        if (!devEl) return;
        devEl.hidden = !code;
        devEl.textContent = code ? 'Dev mode: your code is ' + code : '';
    };

    function resetVerification() {
        resetToken = '';
        otpEmail = '';
        if (codeGroup) codeGroup.hidden = true;
        if (codeEl) { codeEl.value = ''; codeEl.disabled = false; }
        if (verifyBtn) { verifyBtn.hidden = true; verifyBtn.disabled = false; verifyBtn.textContent = 'Verify OTP'; }
        if (badge) badge.hidden = true;
        if (genLabel) genLabel.textContent = 'Send OTP';
        genBtn.disabled = false;
        if (newpassGroup) newpassGroup.hidden = true;
        if (changeBtn) changeBtn.disabled = true;
        if (changeHint) changeHint.hidden = false;
        showDev('');
        setStatus('');
    }

    if (emailEl) emailEl.addEventListener('input', () => { if (otpEmail || resetToken) resetVerification(); });
    if (confirm) confirm.addEventListener('input', () => {
        setErr(confirm.value && pwd.value !== confirm.value ? 'Passwords do not match' : '');
    });

    // 1) Send (or resend) the reset OTP. The response is generic — it never says
    // whether the email is registered.
    genBtn.addEventListener('click', async () => {
        setErr('');
        if (!emailEl.value.trim() || !emailEl.checkValidity()) { emailEl.reportValidity(); return; }
        genBtn.disabled = true;
        setStatus('Sending code…');
        try {
            const res = await OOPD.apiRequest('/api/auth/forgot-password', {
                method: 'POST', body: { email: emailEl.value.trim() }, auth: false
            });
            resetVerification();
            otpEmail = emailEl.value.trim();
            if (codeGroup) codeGroup.hidden = false;
            if (verifyBtn) verifyBtn.hidden = false;
            if (genLabel) genLabel.textContent = 'Resend OTP';
            setStatus('If an account exists for that email, a 6-digit code has been sent.', 'ok');
            showDev(res.data && res.data.devCode);
            if (codeEl) codeEl.focus();
        } catch (err) {
            if (err.isNetwork) setStatus('Server offline — cannot send the code right now.', 'err');
            else setStatus(firstMsg(err) || 'Could not send the code', 'err');
        } finally {
            genBtn.disabled = false;
        }
    });

    if (codeEl && verifyBtn) {
        codeEl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); verifyBtn.click(); } });
    }

    // 2) Verify the OTP → reveal the new-password fields.
    if (verifyBtn) {
        verifyBtn.addEventListener('click', async () => {
            const code = (codeEl.value || '').trim();
            if (!/^\d{6}$/.test(code)) { setStatus('Enter the 6-digit code.', 'err'); return; }
            verifyBtn.disabled = true;
            setStatus('Verifying…');
            try {
                const res = await OOPD.apiRequest('/api/auth/reset-verify-otp', {
                    method: 'POST', body: { email: otpEmail, code }, auth: false
                });
                resetToken = res.data.resetToken;
                setStatus('Verified ✓ — set your new password below.', 'ok');
                if (badge) badge.hidden = false;
                if (codeEl) codeEl.disabled = true;
                verifyBtn.disabled = true;
                verifyBtn.textContent = 'Verified ✓';
                genBtn.disabled = true;
                if (newpassGroup) newpassGroup.hidden = false;
                if (changeBtn) changeBtn.disabled = false;
                if (changeHint) changeHint.hidden = true;
                if (pwd) pwd.focus();
            } catch (err) {
                verifyBtn.disabled = false;
                setStatus(firstMsg(err) || 'Could not verify the code', 'err');
            }
        });
    }

    // 3) Change the password (requires the verified reset token).
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!resetToken) { setErr('Please verify the code sent to your email first.'); return; }
        const p = pwd.value, c = confirm.value;
        if (p.length < 8) { setErr('Password must be at least 8 characters'); pwd.focus(); return; }
        if (p !== c) { setErr('Passwords do not match'); confirm.focus(); return; }

        changeBtn.disabled = true;
        setErr('Updating your password…', true);
        try {
            await OOPD.apiRequest('/api/auth/reset-password', {
                method: 'POST', body: { email: otpEmail, resetToken, newPassword: p }, auth: false
            });
            setErr('Password changed! Redirecting to login…', true);
            setTimeout(() => { location.href = redirect; }, 800);
        } catch (err) {
            changeBtn.disabled = false;
            if (err.status === 400 || err.status === 401) resetVerification();
            setErr(firstMsg(err) || 'Could not change the password');
        }
    });

    resetVerification();
})();

// ---------------- Login / reset forms ----------------
document.querySelectorAll('form[data-auth]').forEach(form => {
    const error = form.querySelector('.form-error');
    const pwd = form.querySelector('#password') || form.querySelector('#new-password');
    const confirm = form.querySelector('#confirm-password');
    const submitBtn = form.querySelector('button[type="submit"]');
    const needsMatch = form.hasAttribute('data-match');
    const action = form.getAttribute('data-auth-action'); // 'login' | null
    const redirect = form.getAttribute('data-redirect') || 'index.html';
    const successMsg = form.getAttribute('data-success') || 'Success!';

    const val = sel => { const el = form.querySelector(sel); return el ? el.value.trim() : ''; };
    const show = (msg, ok) => {
        if (!error) return;
        error.textContent = msg;
        error.classList.toggle('success', !!ok);
    };

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
        if (!action || !OOPD) { show(successMsg, true); return; }

        const payload = { email: val('#email') || val('#username'), password: val('#password') };
        if (submitBtn) submitBtn.disabled = true;
        show('Logging you in…');

        try {
            const res = await OOPD.apiRequest('/api/auth/' + action, { method: 'POST', body: payload, auth: false });
            OOPD.setToken(res.data.token);
            OOPD.setUser(res.data.user);
            show(successMsg, true);
            setTimeout(() => redirectTo(redirect), 400);
        } catch (err) {
            if (err.isNetwork) {
                // Server offline (e.g. GitHub Pages) — client-only demo session.
                OOPD.clearToken();
                OOPD.setUser({ name: payload.email.split('@')[0], email: payload.email, role: 'patient' });
                show('Server offline — continuing in demo mode…', true);
                setTimeout(() => redirectTo(redirect), 700);
            } else {
                show(firstMsg(err) || 'Something went wrong');
                if (submitBtn) submitBtn.disabled = false;
            }
        }
    });
});

// Goodbye notice shown on the login page right after an account is deleted
// (account.js redirects here with ?deactivated=1).
(function () {
    if (new URLSearchParams(location.search).get('deactivated') !== '1') return;
    const err = document.querySelector('form[data-auth] .form-error');
    if (err) {
        err.textContent = 'Your account has been deleted. We’re sorry to see you go.';
        err.classList.add('success');
    }
})();
