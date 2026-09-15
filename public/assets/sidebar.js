// Shared app-wide sidebar: every page includes the same .app-shell markup
// (mobile-topbar / sidebar-backdrop / sidebar with #app-identity + #app-nav
// placeholders / app-main) and this script fills in the identity block and
// nav items based on auth state, and wires the mobile hamburger drawer.
//
// A page that wants in-place section switching instead of a full navigation
// (the admin area) can set window.AssistoOnNavigate = function(url) {...}
// before this script runs; it's called instead of following the link when
// the link's pathname matches the current page.
(function() {
    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function buildNavItems(auth) {
        var items = [{ href: '/', icon: '&#127968;', label: 'Start' }];
        if (auth) {
            items.push({ href: '/account.html', icon: '&#128100;', label: 'Mein Konto' });
        }
        if (auth && auth.role === 'admin') {
            items.push({ href: '/admin/?section=overview', icon: '&#128202;', label: 'Übersicht' });
            items.push({ href: '/admin/?section=users', icon: '&#128101;', label: 'Benutzer' });
            items.push({ href: '/admin/?section=cases', icon: '&#128203;', label: 'Fälle' });
        }
        return items;
    }

    function isActive(href) {
        var url = new URL(href, window.location.origin);
        if (url.pathname !== window.location.pathname) return false;
        var section = url.searchParams.get('section');
        if (section) return section === new URLSearchParams(window.location.search).get('section');
        return true;
    }

    function renderIdentity(auth) {
        var el = document.getElementById('app-identity');
        if (!el) return;
        if (auth) {
            el.innerHTML =
                '<div class="identity-name">' + escapeHtml(auth.username) + '</div>' +
                '<div class="identity-role">' + (auth.role === 'admin' ? 'Admin' : 'Techniker') + '</div>' +
                '<button type="button" class="link identity-logout" id="app-logout-btn">Abmelden</button>';
            document.getElementById('app-logout-btn').addEventListener('click', function() {
                AssistoAuth.logoutEffective();
                window.location.href = '/';
            });
        } else {
            var redirect = encodeURIComponent(window.location.pathname + window.location.search);
            el.innerHTML =
                '<div class="identity-name identity-name-muted">Nicht angemeldet</div>' +
                '<a class="primary identity-login" href="/login.html?redirect=' + redirect + '">Anmelden</a>';
        }
    }

    function renderNav(auth) {
        var el = document.getElementById('app-nav');
        if (!el) return;
        var items = buildNavItems(auth);
        el.innerHTML = items.map(function(item) {
            return '<a href="' + item.href + '" class="sidebar-link' + (isActive(item.href) ? ' active' : '') + '">' +
                '<span class="nav-icon">' + item.icon + '</span>' + item.label +
            '</a>';
        }).join('');

        el.querySelectorAll('a').forEach(function(a) {
            a.addEventListener('click', function(e) {
                var url = new URL(a.getAttribute('href'), window.location.origin);
                if (typeof window.AssistoOnNavigate === 'function' && url.pathname === window.location.pathname) {
                    e.preventDefault();
                    window.AssistoOnNavigate(a.getAttribute('href'));
                }
                closeSidebar();
            });
        });
    }

    function render() {
        var auth = window.AssistoAuth ? AssistoAuth.getEffective() : null;
        renderIdentity(auth);
        renderNav(auth);
    }

    var sidebar, backdrop;

    function openSidebar() {
        if (sidebar) sidebar.classList.add('open');
        if (backdrop) backdrop.hidden = false;
    }

    function closeSidebar() {
        if (sidebar) sidebar.classList.remove('open');
        if (backdrop) backdrop.hidden = true;
    }

    function wireChrome() {
        sidebar = document.getElementById('sidebar');
        backdrop = document.getElementById('sidebar-backdrop');
        var hamburger = document.getElementById('hamburger-btn');
        if (hamburger) hamburger.addEventListener('click', openSidebar);
        if (backdrop) backdrop.addEventListener('click', closeSidebar);
    }

    document.addEventListener('DOMContentLoaded', function() {
        wireChrome();
        render();
    });

    window.AssistoSidebar = { render: render, close: closeSidebar };
})();
