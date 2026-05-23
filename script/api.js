/* =====================================================================
   O-OPD front-end API + session helper (window.OOPD)
   ---------------------------------------------------------------------
   One place owns: the API base URL, JWT/user storage, and a fetch wrapper
   that attaches the token and normalizes errors. Loaded before any script
   that talks to the backend.
   ===================================================================== */

(function () {
    const API_BASE = 'http://localhost:4000';
    const TOKEN_KEY = 'oopd_token';
    const USER_KEY = 'oopd_auth'; // existing key — nav/gates already read it

    function getToken() {
        return localStorage.getItem(TOKEN_KEY);
    }
    function setToken(token) {
        if (token) localStorage.setItem(TOKEN_KEY, token);
    }
    function clearToken() {
        localStorage.removeItem(TOKEN_KEY);
    }

    function getUser() {
        try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); }
        catch (e) { return null; }
    }
    function setUser(user) {
        localStorage.setItem(USER_KEY, JSON.stringify(user));
    }
    function clearUser() {
        localStorage.removeItem(USER_KEY);
    }

    function logout() {
        clearToken();
        clearUser();
    }

    function isLoggedIn() {
        return !!getUser();
    }

    /* Make an API request. Returns the parsed JSON on success.
       Throws an Error with:
         - err.isNetwork = true  when the server is unreachable (offline/timeout)
         - err.status / err.code / err.details  for HTTP error responses */
    async function apiRequest(path, options) {
        options = options || {};
        const headers = { Accept: 'application/json' };
        if (options.body !== undefined) headers['Content-Type'] = 'application/json';

        const token = getToken();
        if (options.auth !== false && token) headers.Authorization = 'Bearer ' + token;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);

        let res;
        try {
            res = await fetch(API_BASE + path, {
                method: options.method || 'GET',
                headers,
                body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
                signal: controller.signal
            });
        } catch (e) {
            const err = new Error('Cannot reach the server');
            err.isNetwork = true;
            throw err;
        } finally {
            clearTimeout(timer);
        }

        let json = null;
        try { json = await res.json(); } catch (e) { /* empty/non-JSON body */ }

        if (!res.ok) {
            const apiErr = json && json.error ? json.error : {};
            const err = new Error(apiErr.message || ('Request failed (' + res.status + ')'));
            err.status = res.status;
            err.code = apiErr.code;
            err.details = apiErr.details;
            throw err;
        }
        return json;
    }

    window.OOPD = {
        API_BASE,
        getToken, setToken, clearToken,
        getUser, setUser, clearUser,
        logout, isLoggedIn, apiRequest
    };
})();
