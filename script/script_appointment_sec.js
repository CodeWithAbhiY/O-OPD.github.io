function toggleSection(sectionId) {
    const section = document.getElementById(sectionId);
    const button = section.querySelector('.section-header button');
    const isMaximized = section.classList.toggle('maximized');

    // Update the button label without destroying its icon.
    const icon = button.querySelector('.material-symbols-outlined');
    button.textContent = '';
    if (icon) {
        icon.textContent = isMaximized ? 'close_fullscreen' : 'open_in_full';
        button.appendChild(icon);
    }
    button.appendChild(document.createTextNode(isMaximized ? ' Minimize' : ' Maximize'));

    // Hide the other section(s) when one is maximized.
    document.querySelectorAll('.section').forEach(s => {
        if (s.id !== sectionId) {
            s.style.display = isMaximized ? 'none' : '';
        }
    });
}
