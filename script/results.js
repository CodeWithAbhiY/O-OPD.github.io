/* =====================================================================
   O-OPD — Search results + booking (mock data)
   ---------------------------------------------------------------------
   Reads the search query from the URL, renders matching doctors/hospitals
   with available slots, and lets the user book. Bookings are saved to
   localStorage so the "My Appointments" page can show them.

   This is a front-end demo: the PROVIDERS array stands in for a real API.
   ===================================================================== */

(function () {
    // Where the backend API lives. When it's unreachable (e.g. the deployed
    // GitHub Pages site with no running server), we fall back to the bundled
    // sample data below so the page still works.
    const API_BASE = (window.OOPD && window.OOPD.API_BASE) || 'http://localhost:4000';
    let dataSource = 'sample data';

    // Escape any string before putting it into innerHTML, so values coming from
    // the URL, the API, or (later) a database can never inject HTML/scripts (XSS).
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    // ---------------- Mock data (fallback) ----------------
    // `key` is a lowercase stem used to match the searched specialty.
    const PROVIDERS = [
        { doctor: 'Dr. Asha Mehta', key: 'cardiolog', specialty: 'Cardiology', hospital: 'City Care Hospital', area: 'Andheri', rating: 4.8, exp: 14, fee: 700, distance: 2.1, slots: ['09:30', '10:15', '11:00', '12:30', '17:00'] },
        { doctor: 'Dr. Rajiv Khanna', key: 'cardiolog', specialty: 'Cardiology', hospital: 'Sunrise Heart Institute', area: 'Bandra', rating: 4.6, exp: 20, fee: 900, distance: 4.7, slots: ['10:00', '13:00', '16:30'] },
        { doctor: 'Dr. Neha Verma', key: 'orthoped', specialty: 'Orthopedics', hospital: 'Apollo Bone & Joint', area: 'Powai', rating: 4.7, exp: 11, fee: 600, distance: 3.4, slots: ['09:00', '09:45', '11:30', '15:00', '18:00'] },
        { doctor: 'Dr. Sameer Iyer', key: 'orthoped', specialty: 'Orthopedics', hospital: 'City Care Hospital', area: 'Andheri', rating: 4.4, exp: 9, fee: 550, distance: 2.1, slots: ['10:30', '14:00', '16:00'] },
        { doctor: 'Dr. Priya Nair', key: 'ophthalmolog', specialty: 'Ophthalmology', hospital: 'Vision Plus Eye Care', area: 'Vile Parle', rating: 4.9, exp: 16, fee: 500, distance: 1.6, slots: ['09:15', '10:45', '12:00', '17:30'] },
        { doctor: 'Dr. Karan Shah', key: 'ent', specialty: 'ENT', hospital: 'Sunrise Multispeciality', area: 'Bandra', rating: 4.5, exp: 12, fee: 550, distance: 4.7, slots: ['11:00', '13:30', '15:30'] },
        { doctor: 'Dr. Meera Joshi', key: 'pediatric', specialty: 'Pediatrics', hospital: 'Little Stars Children’s Hospital', area: 'Santacruz', rating: 4.9, exp: 18, fee: 600, distance: 2.9, slots: ['09:00', '10:00', '11:00', '16:00', '17:00'] },
        { doctor: 'Dr. Anil Kapoor', key: 'pediatric', specialty: 'Pediatrics', hospital: 'City Care Hospital', area: 'Andheri', rating: 4.3, exp: 8, fee: 500, distance: 2.1, slots: ['12:00', '14:30'] },
        { doctor: 'Dr. Sneha Rao', key: 'dermatolog', specialty: 'Dermatology', hospital: 'GlowDerm Skin Clinic', area: 'Juhu', rating: 4.7, exp: 10, fee: 650, distance: 3.0, slots: ['10:00', '11:30', '13:00', '18:30'] },
        { doctor: 'Dr. Vikram Sinha', key: 'neurolog', specialty: 'Neurology', hospital: 'NeuroLife Hospital', area: 'Powai', rating: 4.8, exp: 22, fee: 1000, distance: 3.4, slots: ['09:30', '12:30', '16:00'] },
        { doctor: 'Dr. Fatima Sheikh', key: 'pulmonolog', specialty: 'Pulmonology', hospital: 'Breathe Well Hospital', area: 'Kurla', rating: 4.5, exp: 13, fee: 600, distance: 5.2, slots: ['10:15', '11:45', '15:00'] },
        { doctor: 'Dr. Rohan Desai', key: 'gastro', specialty: 'Gastroenterology', hospital: 'Apollo Digestive Care', area: 'Powai', rating: 4.6, exp: 15, fee: 800, distance: 3.4, slots: ['09:45', '13:15', '17:15'] },
        { doctor: 'Dr. Kavita Menon', key: 'gynec', specialty: 'Gynecology', hospital: 'Motherhood Hospital', area: 'Santacruz', rating: 4.8, exp: 17, fee: 700, distance: 2.9, slots: ['10:00', '11:00', '14:00', '16:30'] },
        { doctor: 'Dr. Imran Qureshi', key: 'psychiatr', specialty: 'Psychiatry', hospital: 'MindCare Clinic', area: 'Bandra', rating: 4.7, exp: 12, fee: 900, distance: 4.7, slots: ['11:00', '15:00', '18:00'] },
        { doctor: 'Dr. Pooja Bhatt', key: 'dent', specialty: 'Dentistry', hospital: 'SmileBright Dental', area: 'Vile Parle', rating: 4.6, exp: 9, fee: 400, distance: 1.6, slots: ['09:30', '10:30', '12:00', '17:00', '18:30'] },
        { doctor: 'Dr. Suresh Pillai', key: 'general', specialty: 'General Physician', hospital: 'City Care Hospital', area: 'Andheri', rating: 4.5, exp: 19, fee: 400, distance: 2.1, slots: ['09:00', '10:00', '11:00', '12:00', '16:00', '17:00'] },
        { doctor: 'Dr. Ananya Gupta', key: 'general', specialty: 'General Physician', hospital: 'Sunrise Multispeciality', area: 'Bandra', rating: 4.4, exp: 7, fee: 350, distance: 4.7, slots: ['10:30', '13:30', '15:30', '18:00'] }
    ];

    // ---------------- Read query ----------------
    const params = new URLSearchParams(window.location.search);
    const qLocation = (params.get('location') || '').trim();
    const qSpecialty = (params.get('speciality') || '').trim();
    const qDate = (params.get('date_of_appointment') || '').trim();

    const dateStr = qDate || new Date().toISOString().slice(0, 10);
    function prettyDate(iso) {
        const [y, m, d] = iso.split('-').map(Number);
        if (!y || !m || !d) return iso;
        return new Date(y, m - 1, d).toLocaleDateString('en-GB',
            { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    }

    // Mirror of the server's date rule (createBookingSchema) so we can reject a
    // past / invalid date up-front at booking time — instead of only at payment.
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

    // ---------------- Existing bookings (block double-booking) ----------------
    // A slot counts as taken if there's already a saved booking for the same
    // doctor + hospital + time on the searched date. Recomputed on each render
    // so cancellations elsewhere free the slot again.
    function loadBookings() {
        try { return JSON.parse(localStorage.getItem('oopd_bookings') || '[]'); }
        catch (e) { return []; }
    }
    function slotKey(doctor, hospital, time) {
        return doctor + '||' + hospital + '||' + time;
    }
    function computeTaken() {
        const set = new Set();
        loadBookings().forEach(b => {
            if (b.date === dateStr) set.add(slotKey(b.doctor, b.hospital, b.time));
        });
        return set;
    }
    let takenSet = computeTaken();

    // ---------------- Search chips ----------------
    const chips = document.getElementById('searchChips');
    function chip(icon, text) {
        if (!text) return '';
        return '<span class="chip"><span class="material-symbols-outlined">' + icon + '</span>' + esc(text) + '</span>';
    }
    chips.innerHTML =
        chip('location_on', qLocation || 'Anywhere') +
        chip('stethoscope', qSpecialty || 'All specialties') +
        chip('calendar_month', prettyDate(dateStr));

    // ---------------- Filter ----------------
    function matchesSpecialty(p) {
        if (!qSpecialty) return true;
        return qSpecialty.toLowerCase().includes(p.key);
    }
    let results = [];

    // Load doctors from the API; fall back to the bundled sample data if the
    // server can't be reached. The shape returned is identical either way.
    async function loadProviders() {
        const qs = new URLSearchParams();
        if (qSpecialty) qs.set('specialty', qSpecialty);
        qs.set('limit', '50');

        // Abort the request if the server doesn't answer quickly, so we fall
        // back to sample data instead of hanging.
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000);
        try {
            const res = await fetch(API_BASE + '/api/doctors?' + qs.toString(), { signal: controller.signal });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const json = await res.json();
            const list = Array.isArray(json.data) ? json.data : [];
            dataSource = 'live from server';
            // Map the API shape to the internal shape the rest of this page uses.
            return list.map(d => ({
                id: d.id,
                doctor: d.name,
                key: d.specialtyKey,
                specialty: d.specialty,
                hospital: d.hospital,
                area: d.area,
                rating: d.rating,
                exp: d.experienceYears,
                fee: d.fee,
                slots: Array.isArray(d.slots) ? d.slots : []
            }));
        } catch (e) {
            dataSource = 'sample data';
            return PROVIDERS.filter(matchesSpecialty);
        } finally {
            clearTimeout(timer);
        }
    }

    // ---------------- Render ----------------
    const listEl = document.getElementById('resultsList');
    const countEl = document.getElementById('resultsCount');
    const emptyEl = document.getElementById('emptyResults');
    const titleEl = document.getElementById('resultsTitle');
    const sortEl = document.getElementById('sortBy');

    if (qSpecialty) {
        titleEl.textContent = qSpecialty.replace(/\s*\(.*\)\s*/, '') + ' near ' + (qLocation || 'you');
    } else if (qLocation) {
        titleEl.textContent = 'Doctors near ' + qLocation;
    }

    function initials(name) {
        const parts = String(name || '').replace(/^Dr\.?\s*/, '').trim().split(/\s+/);
        const a = parts[0] ? parts[0][0] : '';
        const b = parts[1] ? parts[1][0] : '';
        return (a + b).toUpperCase() || '?';
    }
    const num = (v, dp) => (Number(v) || 0).toFixed(dp);

    function sortResults(mode) {
        const arr = results.slice();
        if (mode === 'rating') arr.sort((a, b) => b.rating - a.rating);
        else if (mode === 'fee') arr.sort((a, b) => a.fee - b.fee);
        return arr;
    }

    function buildCard(p) {
        const card = document.createElement('div');
        card.className = 'result-card';
        const slots = Array.isArray(p.slots) ? p.slots : [];
        card.innerHTML =
            '<div class="doc-avatar">' + esc(initials(p.doctor)) + '</div>' +
            '<div class="doc-main">' +
                '<h3>' + esc(p.doctor) + '</h3>' +
                '<div class="doc-spec">' + esc(p.specialty) + '</div>' +
                '<div class="doc-meta">' +
                    '<span class="rating"><span class="material-symbols-outlined">star</span>' + num(p.rating, 1) + '</span>' +
                    '<span><span class="material-symbols-outlined">work_history</span>' + num(p.exp, 0) + ' yrs exp</span>' +
                '</div>' +
                '<div class="doc-hospital"><span class="material-symbols-outlined">local_hospital</span>' + esc(p.hospital) + ', ' + esc(p.area) + '</div>' +
            '</div>' +
            '<div class="doc-side"><div class="doc-fee">₹' + num(p.fee, 0) + '<small>consultation</small></div></div>' +
            '<div class="slots">' +
                '<div class="slots-label"><span class="material-symbols-outlined">schedule</span>Available slots — ' + esc(prettyDate(dateStr)) + '</div>' +
                '<div class="slot-chips">' +
                    slots.map(s => {
                        const taken = takenSet.has(slotKey(p.doctor, p.hospital, s));
                        return '<button type="button" class="slot' + (taken ? ' booked' : '') + '"' +
                            (taken ? ' disabled title="Already booked"' : '') + '>' + esc(s) + '</button>';
                    }).join('') +
                    '<button type="button" class="btn btn-primary book-btn"><span class="material-symbols-outlined">event_available</span> Book</button>' +
                '</div>' +
            '</div>';

        const slotChips = card.querySelectorAll('.slot');
        slotChips.forEach(chipBtn => {
            chipBtn.addEventListener('click', () => {
                if (chipBtn.classList.contains('booked')) return;
                slotChips.forEach(c => c.classList.remove('selected'));
                chipBtn.classList.add('selected');
            });
        });

        card.querySelector('.book-btn').addEventListener('click', () => {
            const selected = card.querySelector('.slot.selected');
            if (!selected) {
                // Auto-pick the first open slot if the user hasn't chosen one.
                const firstOpen = card.querySelector('.slot:not(.booked)');
                if (firstOpen) firstOpen.classList.add('selected');
            }
            const chosen = card.querySelector('.slot.selected');
            if (!chosen) return;
            openBooking(p, chosen.textContent, chosen);
        });

        return card;
    }

    function render() {
        listEl.innerHTML = '';
        takenSet = computeTaken();
        const arr = sortResults(sortEl.value);
        if (arr.length === 0) {
            countEl.textContent = '0 results';
            emptyEl.hidden = false;
            if (qSpecialty) {
                document.getElementById('emptyMsg').textContent =
                    'No doctors found for "' + qSpecialty.replace(/\s*\(.*\)\s*/, '') + '"' +
                    (qLocation ? ' near ' + qLocation : '') + '. Try another specialty or date.';
            }
            return;
        }
        emptyEl.hidden = true;
        countEl.textContent = arr.length + ' doctor' + (arr.length > 1 ? 's' : '') + ' available · ' + dataSource;
        arr.forEach(p => listEl.appendChild(buildCard(p)));
    }

    sortEl.addEventListener('change', render);

    // Load doctors (API → fallback), then render.
    (async function init() {
        countEl.textContent = 'Searching…';
        listEl.innerHTML = '<div style="padding:30px;text-align:center;color:var(--muted)">Loading doctors…</div>';
        results = await loadProviders();
        render();
    })();

    // ---------------- Booking modal ----------------
    const modal = document.getElementById('bookModal');
    const body = document.getElementById('bookBody');
    const confirmBtn = document.getElementById('confirmBooking');
    const bookTitleEl = document.getElementById('bookTitle');
    let pending = null;            // { provider, time, slotEl }
    let bookStep = 'details';      // 'details' → 'payment'
    let selectedMethod = 'upi';    // dummy payment method

    function setTitle(step) {
        if (!bookTitleEl) return;
        bookTitleEl.innerHTML = step === 'payment'
            ? '<span class="material-symbols-outlined">credit_card</span> Payment'
            : '<span class="material-symbols-outlined">event_available</span> Confirm appointment';
    }

    function row(icon, lbl, val) {
        return '<div class="book-row"><span class="material-symbols-outlined">' + icon + '</span>' +
            '<div><div class="lbl">' + esc(lbl) + '</div><div class="val">' + esc(val) + '</div></div></div>';
    }

    function openBooking(provider, time, slotEl) {
        // Defensive guard (e.g. results opened via a direct URL with a stale date):
        // reject a past/invalid date here, not at the payment step.
        if (!isValidFutureOrTodayDate(dateStr)) {
            showToast('Date must be a valid calendar date and not in the past. Please search again with a valid date.');
            return;
        }
        // Safety net: never open booking for an already-taken slot.
        if (takenSet.has(slotKey(provider.doctor, provider.hospital, time))) {
            showToast('That slot is already booked. Please pick another time.');
            return;
        }
        pending = { provider, time, slotEl };
        bookStep = 'details';
        selectedMethod = 'upi';
        setTitle('details');
        body.innerHTML =
            row('person', 'Doctor', provider.doctor + ' · ' + provider.specialty) +
            row('local_hospital', 'Hospital', provider.hospital + ', ' + provider.area) +
            row('calendar_month', 'Date', prettyDate(dateStr)) +
            row('schedule', 'Time', time) +
            row('payments', 'Consultation fee', '₹' + provider.fee);
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Confirm booking';
        modal.hidden = false;
        document.body.style.overflow = 'hidden';
    }

    function closeBooking() {
        modal.hidden = true;
        document.body.style.overflow = '';
        pending = null;
        bookStep = 'details';
    }

    modal.querySelectorAll('[data-book-close]').forEach(el => el.addEventListener('click', closeBooking));
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) closeBooking(); });

    function saveBooking(b) {
        const key = 'oopd_bookings';
        let list = [];
        try { list = JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { list = []; }
        list.push(b);
        localStorage.setItem(key, JSON.stringify(list));
    }

    // Mark a slot as taken in the UI (so it can't be picked again this session).
    function markBookedInUI(p, time, slotEl) {
        takenSet.add(slotKey(p.doctor, p.hospital, time));
        if (slotEl) {
            slotEl.classList.remove('selected');
            slotEl.classList.add('booked');
            slotEl.disabled = true;
            slotEl.title = 'Already booked';
        }
    }

    // Mirror a confirmed booking into localStorage so "My Appointments" and the
    // double-booking guard keep working even when the page is offline/sample data.
    function mirrorLocally(b) {
        saveBooking({
            id: b.id,
            reference: b.reference || null,
            doctor: b.doctor,
            specialty: b.specialty,
            hospital: b.hospital,
            area: b.area,
            date: b.date,
            time: b.time,
            fee: b.fee,
            paymentStatus: b.paymentStatus || 'paid',
            createdAt: b.createdAt || new Date().toISOString()
        });
    }

    // Client-side reference for the offline/demo fallback (server generates the
    // real one). Same unambiguous alphabet, length 8.
    function localReference() {
        const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
        let s = '';
        for (let i = 0; i < 8; i++) s += A[Math.floor(Math.random() * A.length)];
        return s;
    }

    // Build the dummy payment-method chooser.
    function renderPayment() {
        const fee = pending.provider.fee;
        const methods = [
            ['upi', 'UPI', 'qr_code_2'],
            ['card', 'Credit / Debit Card', 'credit_card'],
            ['netbanking', 'Net Banking', 'account_balance'],
            ['wallet', 'Wallet', 'account_balance_wallet']
        ];
        body.innerHTML =
            '<div class="pay-amount">Amount to pay <strong>₹' + esc(fee) + '</strong></div>' +
            '<div class="pay-methods">' +
                methods.map(([val, label, icon]) =>
                    '<label class="pay-method' + (val === selectedMethod ? ' selected' : '') + '">' +
                        '<input type="radio" name="payMethod" value="' + val + '"' + (val === selectedMethod ? ' checked' : '') + '>' +
                        '<span class="material-symbols-outlined">' + icon + '</span>' +
                        '<span class="pay-label">' + esc(label) + '</span>' +
                        '<span class="material-symbols-outlined pay-tick">check_circle</span>' +
                    '</label>'
                ).join('') +
            '</div>' +
            '<p class="pay-note"><span class="material-symbols-outlined">info</span> Demo payment — no real charge is made.</p>';

        body.querySelectorAll('input[name="payMethod"]').forEach(r => {
            r.addEventListener('change', () => {
                selectedMethod = r.value;
                body.querySelectorAll('.pay-method').forEach(m =>
                    m.classList.toggle('selected', m.querySelector('input').value === selectedMethod));
            });
        });
    }

    function showPaymentStep() {
        bookStep = 'payment';
        setTitle('payment');
        renderPayment();
        confirmBtn.textContent = 'Pay ₹' + pending.provider.fee;
    }

    // "Confirm booking" → show payment; "Pay" → simulate gateway then book.
    confirmBtn.addEventListener('click', async () => {
        if (!pending) return;
        if (bookStep === 'details') { showPaymentStep(); return; }

        confirmBtn.disabled = true;
        body.innerHTML = '<div class="pay-processing">' +
            '<span class="material-symbols-outlined spin">progress_activity</span>' +
            '<p>Processing payment…</p></div>';
        await new Promise(r => setTimeout(r, 900)); // simulate the payment gateway
        await submitBooking();
    });

    // Creates the booking (after payment) on the backend, with offline fallback.
    async function submitBooking() {
        const p = pending.provider, time = pending.time, slotEl = pending.slotEl;
        const greet = 'Payment successful — appointment booked with ' + p.doctor.replace(/^Dr\.?\s*/, 'Dr. ') + '!';

        if (window.OOPD && p.id != null) {
            try {
                const resp = await window.OOPD.apiRequest('/api/bookings', {
                    method: 'POST',
                    body: { doctorId: p.id, date: dateStr, time: time, paymentMethod: selectedMethod }
                });
                const bk = resp.data;
                mirrorLocally({
                    id: 'srv_' + bk.id, reference: bk.reference, doctor: bk.doctor, specialty: bk.specialty,
                    hospital: bk.hospital, area: bk.area, date: bk.date, time: bk.time,
                    fee: bk.fee, paymentStatus: bk.paymentStatus, createdAt: bk.createdAt
                });
                markBookedInUI(p, time, slotEl);
                closeBooking();
                showToast(greet);
                return;
            } catch (err) {
                if (!err.isNetwork) {
                    if (err.status === 401) {
                        const next = encodeURIComponent('results.html' + location.search);
                        location.href = 'login.html?next=' + next;
                        return;
                    }
                    const msg = (err.details && err.details[0] && err.details[0].message) || err.message;
                    if (err.status === 409) markBookedInUI(p, time, slotEl);
                    closeBooking();
                    showToast(msg);
                    return;
                }
                // Network error → fall through to the offline demo save below.
            }
        }

        // Offline / sample-data fallback (keeps the GitHub Pages demo working).
        mirrorLocally({
            id: 'bk_' + Date.now(), reference: localReference(), doctor: p.doctor, specialty: p.specialty,
            hospital: p.hospital, area: p.area, date: dateStr, time: time, fee: p.fee, paymentStatus: 'paid'
        });
        markBookedInUI(p, time, slotEl);
        closeBooking();
        showToast(greet);
    }

    // ---------------- Toast ----------------
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toastMsg');
    let toastTimer = null;
    function showToast(msg) {
        toastMsg.textContent = msg;
        toast.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { toast.hidden = true; }, 4500);
    }
})();
