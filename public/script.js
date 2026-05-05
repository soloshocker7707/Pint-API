document.addEventListener('DOMContentLoaded', () => {
    // Dynamic Glow Tracker
    const cursorGlow = document.getElementById('cursor-glow');
    
    if (cursorGlow && !window.matchMedia('(max-width: 768px)').matches) {
        document.addEventListener('mousemove', (e) => {
            // Smoothly track cursor, keeping it centered on the glow orb
            // Subtracting 25vw (which is half of the 50vw width) to center it
            const x = e.clientX;
            const y = e.clientY;
            
            // We use requestAnimationFrame for smooth performance
            requestAnimationFrame(() => {
                cursorGlow.style.left = `${x}px`;
                cursorGlow.style.top = `${y}px`;
                cursorGlow.style.transform = `translate(-50%, -50%)`;
            });
        });
    }

    // Add subtle reveal animations for elements
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = 1;
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.pricing-card, .code-window, .hero').forEach(el => {
        el.style.opacity = 0;
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'opacity 0.6s ease-out, transform 0.6s ease-out';
        observer.observe(el);
    });
});
