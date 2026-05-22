/* =====================================================================
   O-OPD — My Appointments
   Reads bookings saved by the results page (localStorage "oopd_bookings"),
   splits them into upcoming vs past by date, and renders them. Also keeps
   the maximize/minimize behaviour for each section.
   ===================================================================== */

const STORE_KEY = 'oopd_bookings';

function loadBookings() {
    try {
        return JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
    } catch (e) {
        return [];
    }
}

function saveBookings(list) {
    localStorage.setItem(STORE_KEY, JSON.stringify(list));
}

function prettyDate(iso) {
    const [y, m, d] = (iso || '').split('-').map(Number);
    if (!y || !m || !d) return iso || '';
    return new Date(y, m - 1, d).toLocaleDateString('en-GB',
        { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function cancelBooking(id) {
    const list = loadBookings().filter(b => b.id !== id);
    saveBookings(list);
    renderAppointments();
}
// Expose for inline onclick handlers.
window.cancelBooking = cancelBooking;

function emptyState(icon, message, withCta) {
    return '<div class="empty-state">' +
        '<span class="empty-ic"><span class="material-symbols-outlined">' + icon + '</span></span>' +
        '<p>' + message + '</p>' +
        (withCta ? '<a href="index.html#search" class="btn btn-primary">Book an appointment</a>' : '') +
        '</div>';
}

function bookingCard(b, isPast) {
    const initials = b.doctor.replace(/^Dr\.?\s*/, '').split(' ')
        .map(w => w[0]).slice(0, 2).join('').toUpperCase();
    return '' +
        '<div class="appt-card">' +
            '<div class="appt-avatar">' + initials + '</div>' +
            '<div class="appt-main">' +
                '<h3>' + b.doctor + '</h3>' +
                '<div class="appt-spec">' + b.specialty + '</div>' +
                '<div class="appt-meta">' +
                    '<span><span class="material-symbols-outlined">local_hospital</span>' + b.hospital + ', ' + b.area + '</span>' +
                    '<span><span class="material-symbols-outlined">calendar_month</span>' + prettyDate(b.date) + '</span>' +
                    '<span><span class="material-symbols-outlined">schedule</span>' + b.time + '</span>' +
                '</div>' +
            '</div>' +
            '<div class="appt-side">' +
                '<span class="appt-fee">₹' + b.fee + '</span>' +
                (isPast
                    ? '<span class="appt-tag done">Completed</span>'
                    : '<button class="appt-cancel" type="button" onclick="cancelBooking(\'' + b.id + '\')">Cancel</button>') +
            '</div>' +
        '</div>';
}

function renderAppointments() {
    const bookings = loadBookings();
    const today = new Date().toISOString().slice(0, 10);

    const upcoming = bookings.filter(b => b.date >= today)
        .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    const past = bookings.filter(b => b.date < today)
        .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));

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

document.addEventListener('DOMContentLoaded', renderAppointments);
