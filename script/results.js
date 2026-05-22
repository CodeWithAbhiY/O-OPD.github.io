/* =====================================================================
   O-OPD — Search results + booking (mock data)
   ---------------------------------------------------------------------
   Reads the search query from the URL, renders matching doctors/hospitals
   with available slots, and lets the user book. Bookings are saved to
   localStorage so the "My Appointments" page can show them.

   This is a front-end demo: the PROVIDERS array stands in for a real API.
   ===================================================================== */

(function () {
    // ---------------- Mock data ----------------
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

    // ---------------- Search chips ----------------
    const chips = document.getElementById('searchChips');
    function chip(icon, text) {
        if (!text) return '';
        return '<span class="chip"><span class="material-symbols-outlined">' + icon + '</span>' + text + '</span>';
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
    let results = PROVIDERS.filter(matchesSpecialty);

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
        const parts = name.replace(/^Dr\.?\s*/, '').split(' ');
        return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
    }

    function sortResults(mode) {
        const arr = results.slice();
        if (mode === 'rating') arr.sort((a, b) => b.rating - a.rating);
        else if (mode === 'fee') arr.sort((a, b) => a.fee - b.fee);
        else if (mode === 'distance') arr.sort((a, b) => a.distance - b.distance);
        return arr;
    }

    function buildCard(p) {
        const card = document.createElement('div');
        card.className = 'result-card';
        card.innerHTML =
            '<div class="doc-avatar">' + initials(p.doctor) + '</div>' +
            '<div class="doc-main">' +
                '<h3>' + p.doctor + '</h3>' +
                '<div class="doc-spec">' + p.specialty + '</div>' +
                '<div class="doc-meta">' +
                    '<span class="rating"><span class="material-symbols-outlined">star</span>' + p.rating.toFixed(1) + '</span>' +
                    '<span><span class="material-symbols-outlined">work_history</span>' + p.exp + ' yrs exp</span>' +
                    '<span><span class="material-symbols-outlined">near_me</span>' + p.distance.toFixed(1) + ' km</span>' +
                '</div>' +
                '<div class="doc-hospital"><span class="material-symbols-outlined">local_hospital</span>' + p.hospital + ', ' + p.area + '</div>' +
            '</div>' +
            '<div class="doc-side"><div class="doc-fee">₹' + p.fee + '<small>consultation</small></div></div>' +
            '<div class="slots">' +
                '<div class="slots-label"><span class="material-symbols-outlined">schedule</span>Available slots — ' + prettyDate(dateStr) + '</div>' +
                '<div class="slot-chips">' +
                    p.slots.map(s => '<button type="button" class="slot">' + s + '</button>').join('') +
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
        countEl.textContent = arr.length + ' doctor' + (arr.length > 1 ? 's' : '') + ' available';
        arr.forEach(p => listEl.appendChild(buildCard(p)));
    }

    sortEl.addEventListener('change', render);
    render();

    // ---------------- Booking modal ----------------
    const modal = document.getElementById('bookModal');
    const body = document.getElementById('bookBody');
    const confirmBtn = document.getElementById('confirmBooking');
    let pending = null; // { provider, time, slotEl }

    function row(icon, lbl, val) {
        return '<div class="book-row"><span class="material-symbols-outlined">' + icon + '</span>' +
            '<div><div class="lbl">' + lbl + '</div><div class="val">' + val + '</div></div></div>';
    }

    function openBooking(provider, time, slotEl) {
        pending = { provider, time, slotEl };
        body.innerHTML =
            row('person', 'Doctor', provider.doctor + ' · ' + provider.specialty) +
            row('local_hospital', 'Hospital', provider.hospital + ', ' + provider.area) +
            row('calendar_month', 'Date', prettyDate(dateStr)) +
            row('schedule', 'Time', time) +
            row('payments', 'Consultation fee', '₹' + provider.fee);
        modal.hidden = false;
        document.body.style.overflow = 'hidden';
    }

    function closeBooking() {
        modal.hidden = true;
        document.body.style.overflow = '';
        pending = null;
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

    confirmBtn.addEventListener('click', () => {
        if (!pending) return;
        const p = pending.provider;
        saveBooking({
            id: 'bk_' + Date.now(),
            doctor: p.doctor,
            specialty: p.specialty,
            hospital: p.hospital,
            area: p.area,
            date: dateStr,
            time: pending.time,
            fee: p.fee,
            createdAt: new Date().toISOString()
        });
        // Mark that slot as booked in the UI.
        if (pending.slotEl) {
            pending.slotEl.classList.remove('selected');
            pending.slotEl.classList.add('booked');
            pending.slotEl.disabled = true;
        }
        closeBooking();
        showToast('Appointment booked with ' + p.doctor.replace(/^Dr\.?\s*/, 'Dr. ') + '!');
    });

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
