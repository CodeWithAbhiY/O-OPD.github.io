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

    function describe(data, lat, lon) {
        const city = data.city || data.locality;
        const state = data.principalSubdivision;
        if (city && state && city !== state) return city + ', ' + state;
        return city || state || data.countryName || (lat.toFixed(4) + ', ' + lon.toFixed(4));
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
