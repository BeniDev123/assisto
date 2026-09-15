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

    var ICONS = {
        home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>',
        user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>',
        chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10"/><path d="M12 20V4"/><path d="M20 20v-7"/></svg>',
        users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5"/><circle cx="17.3" cy="9" r="2.6"/><path d="M14.6 14.7c2.7.3 5.7 2 5.7 5.3"/></svg>',
        clipboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 3.5h6v2H9z"/><path d="M9 11h6M9 15h6M9 19h3"/></svg>'
    };

    function buildNavItems(auth) {
        var items = [{ href: '/', icon: ICONS.home, label: 'Start' }];
        if (auth) {
            items.push({ href: '/account.html', icon: ICONS.user, label: 'Mein Konto' });
        }
        if (auth && auth.role === 'admin') {
            items.push({ href: '/admin/?section=overview', icon: ICONS.chart, label: 'Übersicht' });
            items.push({ href: '/admin/?section=users', icon: ICONS.users, label: 'Benutzer' });
            items.push({ href: '/admin/?section=cases', icon: ICONS.clipboard, label: 'Fälle' });
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
