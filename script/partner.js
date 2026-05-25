/* =====================================================================
   O-OPD — "List your centre" provider onboarding form.
   Front-end only for now: validates, shows a success state, and stores the
   lead locally (a backend endpoint can be wired in later without UI changes).
   ===================================================================== */

(function () {
    const form = document.getElementById('partnerForm');
    const success = document.getElementById('partnerSuccess');
    const msg = document.getElementById('partnerMsg');
    const submitBtn = document.getElementById('partnerSubmit');
    if (!form) return;

    function reference() {
        const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
        let s = '';
        for (let i = 0; i < 6; i++) s += A[Math.floor(Math.random() * A.length)];
        return 'OOPD-CTR-' + s;
    }

    function saveLead(lead) {
        try {
            const key = 'oopd_partner_leads';
            const list = JSON.parse(localStorage.getItem(key) || '[]');
            list.push(lead);
            localStorage.setItem(key, JSON.stringify(list));
        } catch (e) { /* ignore */ }
    }

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        msg.textContent = '';
        msg.classList.remove('error');

        // Native HTML5 validation handles required / email / pattern / url.
        if (!form.checkValidity()) {
            msg.textContent = 'Please fill in all required fields correctly.';
            msg.classList.add('error');
            form.reportValidity();
            return;
        }

        const data = Object.fromEntries(new FormData(form).entries());
        const ref = reference();
        saveLead(Object.assign({ reference: ref, submittedAt: new Date().toISOString() }, data));

        if (submitBtn) submitBtn.disabled = true;

        // Swap the form for the success state.
        form.hidden = true;
        if (success) {
            const refEl = document.getElementById('partnerRef');
            if (refEl) refEl.textContent = ref;
            success.hidden = false;
            success.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    });

    // Clear the error styling as the user corrects fields.
    form.addEventListener('input', function () {
        if (msg.textContent) { msg.textContent = ''; msg.classList.remove('error'); }
    });
})();
