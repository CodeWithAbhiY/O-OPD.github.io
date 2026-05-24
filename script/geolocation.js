/* =====================================================================
   "Use my location" — fills the Location field from the device's GPS.
   Uses the browser Geolocation API + BigDataCloud's free, key-less
   reverse-geocoding endpoint to turn coordinates into a city/area name.

   Note: browsers only allow geolocation in a secure context
   (https:// or localhost). It will not prompt on a plain file:// page.
   ===================================================================== */

(function () {
    const btn = document.getElementById('useLocation');
    const input = document.getElementById('location');
    if (!btn || !input) return;

    const textEl = btn.querySelector('.loc-text');
    const setText = t => { if (textEl) textEl.textContent = t; };

    function flash(message) {
        setText(message);
        setTimeout(() => setText('Use my location'), 2500);
    }

    // Build a precise but readable place name, e.g. "Saraswati Vihar, Delhi"
    // (local area first, then the city) so it points at a nearby neighbourhood
    // rather than just the whole city.
    function describe(data, lat, lon) {
        // data.locality is usually the neighbourhood/suburb (most precise).
        let local = data.locality;
        if (!local) {
            // Fallback: the most-local administrative area (higher adminLevel = more local).
            const admin = (data.localityInfo && data.localityInfo.administrative) || [];
            const sorted = admin.filter(a => a.name).sort((a, b) => (b.adminLevel || 0) - (a.adminLevel || 0));
            local = sorted.length ? sorted[0].name : '';
        }
        const city = data.city;
        const state = data.principalSubdivision;

        // Collect distinct parts, most-local first, and keep the two most useful.
        const parts = [];
        const add = v => {
            if (v && !parts.some(p => p.toLowerCase() === String(v).toLowerCase())) parts.push(String(v));
        };
        add(local);
        add(city);
        add(state);

        return parts.slice(0, 2).join(', ') ||
            data.countryName || (lat.toFixed(4) + ', ' + lon.toFixed(4));
    }

    btn.addEventListener('click', () => {
        if (!('geolocation' in navigator)) {
            flash('Not supported');
            return;
        }

        btn.disabled = true;
        setText('Locating…');

        navigator.geolocation.getCurrentPosition(
            async pos => {
                const { latitude, longitude } = pos.coords;
                try {
                    const res = await fetch(
                        'https://api.bigdatacloud.net/data/reverse-geocode-client' +
                        '?latitude=' + latitude + '&longitude=' + longitude + '&localityLanguage=en'
                    );
                    const data = await res.json();
                    input.value = describe(data, latitude, longitude);
                } catch (e) {
                    // Network/geocoding failed — fall back to raw coordinates.
                    input.value = latitude.toFixed(4) + ', ' + longitude.toFixed(4);
                }
                input.dispatchEvent(new Event('input', { bubbles: true }));
                btn.disabled = false;
                setText('Use my location');
            },
            err => {
                btn.disabled = false;
                if (err.code === err.PERMISSION_DENIED) flash('Permission denied');
                else if (err.code === err.TIMEOUT) flash('Timed out');
                else flash('Location unavailable');
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
        );
    });
})();
