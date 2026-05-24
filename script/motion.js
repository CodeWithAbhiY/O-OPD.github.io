/* =====================================================================
   O-OPD — scroll reveal (shared, dependency-free)
   Elements tagged with class "reveal" fade + rise in when they scroll
   into view (once). Honours prefers-reduced-motion and gracefully shows
   everything if IntersectionObserver isn't available.
   ===================================================================== */

(function () {
    var prefersReduced = window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function showAll(els) {
        for (var i = 0; i < els.length; i++) els[i].classList.add('is-visible');
    }

    // For a container tagged [data-reveal-children], turn each child into a
    // staggered reveal automatically (so the markup only needs one attribute).
    function tagGroups() {
        var groups = document.querySelectorAll('[data-reveal-children]');
        groups.forEach(function (group) {
            var kids = group.children;
            for (var i = 0; i < kids.length; i++) {
                kids[i].classList.add('reveal');
                kids[i].style.transitionDelay = Math.min(i * 60, 360) + 'ms';
            }
        });
    }

    function init() {
        tagGroups();
        var els = document.querySelectorAll('.reveal');
        if (!els.length) return;

        if (prefersReduced || !('IntersectionObserver' in window)) {
            showAll(els);
            return;
        }

        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    io.unobserve(entry.target);
                }
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

        els.forEach(function (el) { io.observe(el); });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
