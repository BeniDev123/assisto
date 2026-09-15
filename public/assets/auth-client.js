// Shared client-side auth helpers used by login.html, case/index.html and
// admin/index.html - avoids re-implementing the same localStorage/session
// handling on every page.
var AssistoAuth = (function() {
    var STORAGE_KEY = 'assistoAuth';
    var MASTER_KEY = 'assistoAdminSecret';

    function get() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    function set(auth) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
    }

    function clear() {
        localStorage.removeItem(STORAGE_KEY);
    }

    function isAdmin() {
        var auth = get();
        return !!(auth && auth.role === 'admin');
    }

    // Bearer header for a regular logged-in user (technician or admin).
    function headers(extra) {
        var h = Object.assign({}, extra);
        var auth = get();
        if (auth && auth.token) h['Authorization'] = 'Bearer ' + auth.token;
        return h;
    }

    function getMasterSecret() {
        return sessionStorage.getItem(MASTER_KEY);
    }

    function setMasterSecret(value) {
        sessionStorage.setItem(MASTER_KEY, value);
    }

    function clearMasterSecret() {
        sessionStorage.removeItem(MASTER_KEY);
    }

    // Prefers the master X-Admin-Secret (bootstrap access) over a normal
    // admin-role session token.
    function adminHeaders(extra) {
        var h = Object.assign({}, extra);
        var master = getMasterSecret();
        var auth = get();
        if (master) {
            h['X-Admin-Secret'] = master;
        } else if (auth && auth.token) {
            h['Authorization'] = 'Bearer ' + auth.token;
        }
        return h;
    }

    function hasAdminAccess() {
        return !!getMasterSecret() || isAdmin();
    }

    // Identity for UI purposes (sidebar, "who am I"): a real logged-in user,
    // or a synthetic admin identity when accessing via the master secret -
    // there's no user record behind that, but the UI should still treat it
    // as "signed in with full admin rights".
    function getEffective() {
        if (getMasterSecret()) return { username: 'Master-Zugang', role: 'admin', isMaster: true };
        return get();
    }

    function logoutEffective() {
        if (getMasterSecret()) clearMasterSecret();
        else clear();
    }

    return {
        get: get,
        set: set,
        clear: clear,
        isAdmin: isAdmin,
        headers: headers,
        getMasterSecret: getMasterSecret,
        setMasterSecret: setMasterSecret,
        clearMasterSecret: clearMasterSecret,
        adminHeaders: adminHeaders,
        hasAdminAccess: hasAdminAccess,
        getEffective: getEffective,
        logoutEffective: logoutEffective
    };
})();
