// Shared full-size photo viewer - one overlay, created lazily and reused by
// every page that shows photo thumbnails.
(function() {
    function ensureOverlay() {
        var overlay = document.getElementById('assisto-lightbox');
        if (overlay) return overlay;

        overlay = document.createElement('div');
        overlay.id = 'assisto-lightbox';
        overlay.className = 'lightbox-overlay';
        overlay.hidden = true;
        overlay.innerHTML =
            '<button type="button" class="lightbox-close" aria-label="Schließen">&times;</button>' +
            '<img class="lightbox-img" alt="Foto in voller Größe" />';
        document.body.appendChild(overlay);

        overlay.addEventListener('click', function(e) {
            if (e.target === overlay || e.target.classList.contains('lightbox-close')) {
                closeLightbox();
            }
        });
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') closeLightbox();
        });

        return overlay;
    }

    function openLightbox(src) {
        var overlay = ensureOverlay();
        overlay.querySelector('.lightbox-img').src = src;
        overlay.hidden = false;
        document.body.style.overflow = 'hidden';
    }

    function closeLightbox() {
        var overlay = document.getElementById('assisto-lightbox');
        if (!overlay) return;
        overlay.hidden = true;
        overlay.querySelector('.lightbox-img').src = '';
        document.body.style.overflow = '';
    }

    window.openLightbox = openLightbox;
    window.closeLightbox = closeLightbox;
})();
