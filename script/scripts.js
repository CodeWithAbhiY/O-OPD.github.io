// Mobile navigation toggle
const navToggle = document.getElementById('navToggle');
const navCollapse = document.getElementById('navCollapse');

if (navToggle && navCollapse) {
    navToggle.addEventListener('click', () => {
        const open = navCollapse.classList.toggle('open');
        navToggle.classList.toggle('open', open);
        navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    // Close the menu after tapping a link (mobile)
    navCollapse.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            navCollapse.classList.remove('open');
            navToggle.classList.remove('open');
            navToggle.setAttribute('aria-expanded', 'false');
        });
    });
}

// Add shadow/border to the header once the page is scrolled
const siteHeader = document.getElementById('siteHeader');
if (siteHeader) {
    const onScroll = () => siteHeader.classList.toggle('scrolled', window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
}

// ---- Front-page search: validate the date before searching ----
// Rejects a past / invalid appointment date right here (with a clear message),
// instead of letting it fail later on the results or payment step. Mirrors the
// server's rule (createBookingSchema).
(function () {
    const form = document.querySelector('#search form');
    const dateInput = document.getElementById('date_of_appointment');
    if (!form || !dateInput) return;

    function todayStr() {
        const t = new Date();
        return t.getFullYear() + '-' +
            String(t.getMonth() + 1).padStart(2, '0') + '-' +
            String(t.getDate()).padStart(2, '0');
    }
    // Stop past dates from being picked in the native calendar at all.
    dateInput.min = todayStr();

    const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
    function isValidFutureOrTodayDate(value) {
        if (!DATE_RE.test(value)) return false;
        const [y, m, d] = value.split('-').map(Number);
        const dt = new Date(y, m - 1, d);
        if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return false;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return dt.getTime() >= today.getTime();
    }

    // Inline error shown under the date field (styled inline so no CSS edits).
    const err = document.createElement('p');
    err.id = 'searchDateError';
    err.style.cssText = 'color:#dc2626;font-size:.85rem;margin-top:6px;display:none;';
    dateInput.parentNode.appendChild(err);
    const showErr = msg => { err.textContent = msg; err.style.display = 'block'; };
    const clearErr = () => { err.style.display = 'none'; };
    dateInput.addEventListener('input', clearErr);

    form.addEventListener('submit', e => {
        if (!isValidFutureOrTodayDate(dateInput.value)) {
            e.preventDefault();
            showErr('Date must be a valid calendar date and not in the past.');
            dateInput.focus();
        }
    });
})();
