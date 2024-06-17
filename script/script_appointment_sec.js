function toggleSection(sectionId) {
    const section = document.getElementById(sectionId);
    const button = section.querySelector('button');
    const isMaximized = section.classList.toggle('maximized');

    button.textContent = isMaximized ? 'Minimize' : 'Maximize';

    if (isMaximized) {
        document.querySelectorAll('.section').forEach(s => {
            if (s.id !== sectionId) {
                s.style.display = 'none';
            }
        });
    } else {
        document.querySelectorAll('.section').forEach(s => {
            s.style.display = 'flex';
        });
    }
}
