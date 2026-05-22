// Mobile navigation toggle
const navToggle = document.getElementById('navToggle');
const navCollapse = document.getElementById('navCollapse');

if (navToggle && navCollapse) {
    navToggle.addEventListener('click', () => {
        const open = navCollapse.classList.toggle('open');
        navToggle.classList.toggle('open', open);
        navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    // Close the menu after tapping a link (mobile)
    navCollapse.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            navCollapse.classList.remove('open');
            navToggle.classList.remove('open');
            navToggle.setAttribute('aria-expanded', 'false');
        });
    });
}

// Add shadow/border to the header once the page is scrolled
const siteHeader = document.getElementById('siteHeader');
if (siteHeader) {
    const onScroll = () => siteHeader.classList.toggle('scrolled', window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
}
