/* =====================================================================
   O-OPD — My Appointments
   Source of truth is the backend: GET /api/bookings (auth). When the server
   is unreachable (e.g. the GitHub Pages demo with no backend), it falls back
   to the bookings mirrored in localStorage ("oopd_bookings"). Splits bookings
   into upcoming vs past by date; cancelling calls the API in server mode.
   ===================================================================== */

const STORE_KEY = 'oopd_bookings';

// When true, bookings were loaded from the server and cancel hits the API.
let serverMode = false;

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function loadLocalBookings() {
    try {
        return JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
    } catch (e) {
        return [];
    }
}

function saveLocalBookings(list) {
    localStorage.setItem(STORE_KEY, JSON.stringify(list));
}

// Fetch the user's bookings from the API; fall back to localStorage. Returns a
// normalized list: { id, doctor, specialty, hospital, area, date, time, fee }.
async function fetchBookings() {
    if (window.OOPD && window.OOPD.getToken && window.OOPD.getToken()) {
        try {
            const resp = await window.OOPD.apiRequest('/api/bookings?limit=50');
            serverMode = true;
            return (resp.data || [])
                .filter(b => b.status === 'booked' || b.status === 'completed' || b.status === 'missed')
                .map(b => ({
                    id: b.id,                 // numeric server id (used by cancel)
                    reference: b.reference,
                    doctor: b.doctor,
                    specialty: b.specialty,
                    hospital: b.hospital,
                    area: b.area,
                    date: b.date,
                    time: b.time,
                    fee: b.fee,
                    status: b.status,
                    paymentStatus: b.paymentStatus,
                    paidAt: b.paidAt
                }));
        } catch (err) {
            // Network error → fall back to the local mirror. A real auth error
            // means the session is gone; send them to log in.
            if (!err.isNetwork && err.status === 401) {
                location.replace('login.html?next=Appointment_section.html');
                return [];
            }
        }
    }
    serverMode = false;
    return loadLocalBookings();
}

function prettyDate(iso) {
    const [y, m, d] = (iso || '').split('-').map(Number);
    if (!y || !m || !d) return iso || '';
    return new Date(y, m - 1, d).toLocaleDateString('en-GB',
        { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

// This is an India clinic app, so appointment times are India Standard Time
// (UTC+5:30). We pin the offset explicitly so past/upcoming is decided correctly
// even when the page is opened from a different timezone (e.g. a friend abroad).
const IST_OFFSET = '+05:30';

// Absolute moment (epoch ms) of an appointment at IST wall-clock date+time.
function apptInstant(date, time) {
    return new Date(date + 'T' + (time || '00:00') + ':00' + IST_OFFSET).getTime();
}

// Effective status for display. The server settles past 'booked' rows to
// 'missed' on read; for the offline/demo mirror we derive the same client-side
// so a passed-but-still-'booked' row shows as Missed (not Completed).
function effectiveStatus(b, isPast) {
    if (b.status === 'cancelled') return 'cancelled';
    if (b.status === 'completed') return 'completed';
    if (isPast) return 'missed';   // booked/missed in the past = no-show
    return 'booked';
}
const STATUS_LABEL = { booked: 'Upcoming', completed: 'Completed', missed: 'Missed', cancelled: 'Cancelled' };

// Format a UTC timestamp from the DB ("YYYY-MM-DD HH:MM:SS") as IST.
function fmtStampIST(utc) {
    if (!utc) return null;
    const d = new Date(String(utc).replace(' ', 'T') + 'Z'); // stored as UTC
    if (isNaN(d.getTime())) return null;
    return d.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true
    });
}

// ---- Refund calculator (mirrors server/src/utils/refund.js for the preview) ----
const PLATFORM_FEE = 20;
const GST_RATE = 0.18;
function refundPercentJS(h) {
    if (h >= 24) return 1;
    if (h >= 6) return 0.8;
    if (h >= 0) return 0.5;
    return 0;
}
function hoursUntilJS(date, time) {
    return (apptInstant(date, time) - Date.now()) / 3600000;
}
function computeRefundJS(fee, h) {
    const consultationFee = Math.max(0, Math.round(fee || 0));
    const platformFee = PLATFORM_FEE;
    const gst = Math.round(platformFee * GST_RATE);
    const refundPercent = refundPercentJS(h);
    const cancellationCharge = Math.round(consultationFee * (1 - refundPercent));
    const totalRefund = Math.max(0, consultationFee - cancellationCharge - platformFee - gst);
    return { consultationFee, platformFee, gst, cancellationCharge, refundPercent, totalRefund };
}

// Performs the actual cancellation (with reason). Returns { refundAmount }.
async function performCancel(id, reason) {
    if (serverMode) {
        const resp = await window.OOPD.apiRequest('/api/bookings/' + encodeURIComponent(id) + '/cancel',
            { method: 'POST', body: { reason } });
        saveLocalBookings(loadLocalBookings().filter(b => b.id !== 'srv_' + id)); // drop mirror
        return resp.data || {};
    }
    // Offline/demo: compute refund client-side and remove from local store.
    const b = bookingsById[id] || {};
    const r = computeRefundJS(b.fee, hoursUntilJS(b.date, b.time));
    saveLocalBookings(loadLocalBookings().filter(x => x.id !== id));
    return { refundAmount: r.totalRefund };
}

// Mark a past appointment as attended → 'completed'. Server mode hits the API;
// offline/demo updates the local mirror.
async function markAttended(id) {
    try {
        if (serverMode) {
            await window.OOPD.apiRequest('/api/bookings/' + encodeURIComponent(id) + '/attend', { method: 'POST' });
        } else {
            const list = loadLocalBookings().map(x =>
                String(x.id) === String(id) ? Object.assign({}, x, { status: 'completed' }) : x);
            saveLocalBookings(list);
        }
        await renderAppointments();
        showToast('Marked as attended.');
    } catch (err) {
        showToast((err && err.message) || 'Could not update the appointment.');
    }
}
window.markAttended = markAttended;

function emptyState(icon, message, withCta) {
    return '<div class="empty-state">' +
        '<span class="empty-ic"><span class="material-symbols-outlined">' + icon + '</span></span>' +
        '<p>' + esc(message) + '</p>' +
        (withCta ? '<a href="index.html#search" class="btn btn-primary">Book an appointment</a>' : '') +
        '</div>';
}

// Right-hand controls on a card: upcoming → Cancel; completed → tag; missed →
// Missed tag + a "Mark as attended" button (= you actually went).
function pastOrCancelControls(b, isPast) {
    if (!isPast) {
        return '<button class="appt-cancel" type="button" onclick="openCancelModal(\'' + esc(b.id) + '\')">Cancel</button>';
    }
    if (effectiveStatus(b, true) === 'completed') {
        return '<span class="appt-tag done">Completed</span>';
    }
    return '<span class="appt-tag missed">Missed</span>' +
        '<button class="appt-attend" type="button" onclick="markAttended(\'' + esc(b.id) + '\')">Mark as attended</button>';
}

function bookingCard(b, isPast) {
    const initials = String(b.doctor || '').replace(/^Dr\.?\s*/, '').split(' ')
        .map(w => w[0]).slice(0, 2).join('').toUpperCase();
    return '' +
        '<div class="appt-card" data-id="' + esc(b.id) + '" role="button" tabindex="0" title="View appointment details">' +
            '<div class="appt-avatar">' + esc(initials) + '</div>' +
            '<div class="appt-main">' +
                '<h3>' + esc(b.doctor) + '</h3>' +
                '<div class="appt-spec">' + esc(b.specialty) + '</div>' +
                '<div class="appt-meta">' +
                    '<span><span class="material-symbols-outlined">local_hospital</span>' + esc(b.hospital) + ', ' + esc(b.area) + '</span>' +
                    '<span><span class="material-symbols-outlined">calendar_month</span>' + esc(prettyDate(b.date)) + '</span>' +
                    '<span><span class="material-symbols-outlined">schedule</span>' + esc(b.time) + '</span>' +
                '</div>' +
            '</div>' +
            '<div class="appt-side">' +
                '<span class="appt-fee">₹' + esc(b.fee) + '</span>' +
                pastOrCancelControls(b, isPast) +
            '</div>' +
        '</div>';
}

// Lookup so a card click can find its full booking (keyed by id, with isPast).
let bookingsById = {};

async function renderAppointments() {
    const bookings = await fetchBookings();
    const now = Date.now();

    // Upcoming vs past is decided by the appointment's full date+TIME (in IST),
    // so a slot earlier today (e.g. 12:00, 17:30) moves to Past once it passes.
    const upcoming = bookings.filter(b => apptInstant(b.date, b.time) > now)
        .sort((a, b) => apptInstant(a.date, a.time) - apptInstant(b.date, b.time));
    const past = bookings.filter(b => apptInstant(b.date, b.time) <= now)
        .sort((a, b) => apptInstant(b.date, b.time) - apptInstant(a.date, a.time));

    bookingsById = {};
    upcoming.forEach(b => { bookingsById[b.id] = Object.assign({}, b, { isPast: false }); });
    past.forEach(b => { bookingsById[b.id] = Object.assign({}, b, { isPast: true }); });

    const upEl = document.getElementById('upcoming-content');
    const pastEl = document.getElementById('past-content');
    const upCount = document.getElementById('upcoming-count');
    const pastCount = document.getElementById('past-count');

    if (upEl) {
        upEl.innerHTML = upcoming.length
            ? upcoming.map(b => bookingCard(b, false)).join('')
            : emptyState('calendar_add_on', 'You have no upcoming appointments.', true);
    }
    if (pastEl) {
        pastEl.innerHTML = past.length
            ? past.map(b => bookingCard(b, true)).join('')
            : emptyState('event_busy', 'You have no past appointments yet.', false);
    }
    if (upCount) upCount.textContent = upcoming.length + ' appointment' + (upcoming.length === 1 ? '' : 's');
    if (pastCount) pastCount.textContent = past.length + ' appointment' + (past.length === 1 ? '' : 's');

    wireCardClicks();
}

// ---------------- Appointment detail modal ----------------
// Clicking a card (but not its Cancel button) opens a blurred-backdrop popup
// with the full details. Clicking the backdrop, the ✕, or pressing Escape closes it.
function openApptModal(id) {
    const b = bookingsById[id];
    const modal = document.getElementById('apptModal');
    if (!b || !modal) return;

    const initials = String(b.doctor || '').replace(/^Dr\.?\s*/, '').split(' ')
        .map(w => w[0]).slice(0, 2).join('').toUpperCase();
    const set = (elId, value) => { const el = document.getElementById(elId); if (el) el.textContent = value; };

    set('apptModalAvatar', initials);
    set('apptModalDoctor', b.doctor);
    set('apptModalSpec', b.specialty);

    const row = (icon, label, value) =>
        '<div class="appt-modal-row"><span class="material-symbols-outlined">' + icon + '</span>' +
        '<div><div class="lbl">' + esc(label) + '</div><div class="val">' + esc(value) + '</div></div></div>';

    const statusLabel = STATUS_LABEL[effectiveStatus(b, b.isPast)] || 'Upcoming';
    const payLabel = b.paymentStatus
        ? b.paymentStatus.charAt(0).toUpperCase() + b.paymentStatus.slice(1)
        : '—';
    const paidOn = fmtStampIST(b.paidAt); // null if not paid / unknown
    const rowsEl = document.getElementById('apptModalRows');
    if (rowsEl) {
        rowsEl.innerHTML =
            row('tag', 'Appointment ID', b.reference || '—') +
            row('local_hospital', 'Clinic', b.hospital + ', ' + b.area) +
            row('stethoscope', 'Specialty', b.specialty) +
            row('calendar_month', 'Date', prettyDate(b.date)) +
            row('schedule', 'Time', b.time) +
            row('payments', 'Consultation fee', '₹' + b.fee) +
            row('credit_card', 'Payment', payLabel) +
            (paidOn ? row('event_available', 'Paid on (IST)', paidOn) : '') +
            row('check_circle', 'Status', statusLabel);
    }

    modal.hidden = false;
    document.body.style.overflow = 'hidden';
}

function closeApptModal() {
    const modal = document.getElementById('apptModal');
    if (modal) modal.hidden = true;
    document.body.style.overflow = '';
}

function wireCardClicks() {
    document.querySelectorAll('.appt-card').forEach(card => {
        card.addEventListener('click', e => {
            // Let the action buttons do their thing without opening the modal.
            if (e.target.closest('.appt-cancel') || e.target.closest('.appt-attend')) return;
            openApptModal(card.getAttribute('data-id'));
        });
        card.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openApptModal(card.getAttribute('data-id')); }
        });
    });
}

function wireModal() {
    const modal = document.getElementById('apptModal');
    if (!modal) return;
    modal.querySelectorAll('[data-appt-close]').forEach(el => el.addEventListener('click', closeApptModal));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeApptModal(); });
}

// ---------------- Cancellation modal (with refund preview) ----------------
let currentCancelId = null;

function sumRow(label, val) {
    return '<div class="cancel-sum-row"><span>' + esc(label) + '</span><strong>' + esc(val) + '</strong></div>';
}
function refundRow(label, amt) {
    return '<div class="refund-row"><span>' + esc(label) + '</span><span>₹' + esc(amt) + '</span></div>';
}

function openCancelModal(id) {
    const b = bookingsById[id];
    const modal = document.getElementById('cancelModal');
    if (!b || b.isPast || !modal) return; // never cancel a past appointment
    currentCancelId = id;

    const summary = document.getElementById('cancelSummary');
    if (summary) {
        summary.innerHTML =
            sumRow('Doctor', b.doctor) +
            sumRow('Date', prettyDate(b.date)) +
            sumRow('Time', b.time) +
            sumRow('Appointment ID', b.reference || '—');
    }

    const h = hoursUntilJS(b.date, b.time);
    const r = computeRefundJS(b.fee, h);
    const note = h >= 24 ? '100% refund — cancelling more than 24 hrs before.'
        : h >= 6 ? '80% refund — cancelling 6–24 hrs before.'
        : h >= 0 ? '50% refund — cancelling less than 6 hrs before.'
        : 'No refund — the appointment time has passed.';

    const refundEl = document.getElementById('refundSummary');
    if (refundEl) {
        refundEl.innerHTML =
            '<h4>Refund Summary</h4>' +
            refundRow('Consultation Fee', r.consultationFee) +
            refundRow('Platform Fee', r.platformFee) +
            refundRow('Cancellation Charge', r.cancellationCharge) +
            refundRow('GST/Tax on platform fee', r.gst) +
            '<div class="refund-total"><span>Total Refund</span><span>₹' + r.totalRefund + '</span></div>' +
            '<p class="refund-note">' + esc(note) + '</p>';
    }

    const btn = document.getElementById('confirmCancelBtn');
    if (btn) btn.disabled = false;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
}
// Exposed for the card's inline onclick.
window.openCancelModal = openCancelModal;

function closeCancelModal() {
    const modal = document.getElementById('cancelModal');
    if (modal) modal.hidden = true;
    document.body.style.overflow = '';
    currentCancelId = null;
}

function showToast(msg) {
    const t = document.getElementById('apptToast');
    const m = document.getElementById('apptToastMsg');
    if (!t || !m) return;
    m.textContent = msg;
    t.hidden = false;
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => { t.hidden = true; }, 4500);
}

function wireCancelModal() {
    const modal = document.getElementById('cancelModal');
    if (!modal) return;
    modal.querySelectorAll('[data-cancel-close]').forEach(el => el.addEventListener('click', closeCancelModal));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeCancelModal(); });

    const btn = document.getElementById('confirmCancelBtn');
    if (btn) {
        btn.addEventListener('click', async () => {
            if (!currentCancelId) return;
            const reason = document.getElementById('cancelReason').value;
            btn.disabled = true;
            try {
                const result = await performCancel(currentCancelId, reason);
                closeCancelModal();
                await renderAppointments();
                const amt = result && typeof result.refundAmount === 'number' ? result.refundAmount : null;
                showToast(amt && amt > 0
                    ? ('Appointment cancelled — ₹' + amt + ' will be refunded.')
                    : 'Appointment cancelled. No refund applicable.');
            } catch (err) {
                btn.disabled = false;
                showToast((err && err.message) || 'Could not cancel the appointment.');
            }
        });
    }
}

function toggleSection(sectionId) {
    const section = document.getElementById(sectionId);
    const button = section.querySelector('.section-header button');
    const isMaximized = section.classList.toggle('maximized');

    // Update the button label without destroying its icon.
    const icon = button.querySelector('.material-symbols-outlined');
    button.textContent = '';
    if (icon) {
        icon.textContent = isMaximized ? 'close_fullscreen' : 'open_in_full';
        button.appendChild(icon);
    }
    button.appendChild(document.createTextNode(isMaximized ? ' Minimize' : ' Maximize'));

    // Hide the other section(s) when one is maximized.
    document.querySelectorAll('.section').forEach(s => {
        if (s.id !== sectionId) {
            s.style.display = isMaximized ? 'none' : '';
        }
    });
}

// Log out: clear the session (JWT + user) and return to the login page.
function wireLogout() {
    const btn = document.getElementById('logoutBtn');
    if (!btn) return;
    btn.addEventListener('click', e => {
        e.preventDefault();
        const doLogout = () => {
            try { localStorage.removeItem('oopd_auth'); localStorage.removeItem('oopd_token'); } catch (_) {}
            location.href = 'login.html';
        };
        // Confirm first; fall back to immediate logout if the modal isn't loaded.
        if (window.OOPDLogout && window.OOPDLogout.confirm) window.OOPDLogout.confirm(doLogout);
        else doLogout();
    });
}

document.addEventListener('DOMContentLoaded', () => {
    renderAppointments();
    wireLogout();
    wireModal();
    wireCancelModal();
});
