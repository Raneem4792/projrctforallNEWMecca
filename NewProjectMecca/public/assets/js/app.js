// Navbar scroll effect
window.addEventListener('scroll', function () {
  const navbar = document.getElementById('navbar');
  if (window.scrollY > 50) {
    navbar.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
    navbar.style.backdropFilter = 'blur(10px)';
    navbar.style.boxShadow = '0 2px 20px rgba(0,0,0,0.1)';
    navbar.querySelectorAll('a, .text-white').forEach(el => {
      if (!el.querySelector('svg')) { 
        el.style.color = '#004A9F'; 
      }
    });
  } else {
    navbar.style.backgroundColor = '#002B5B';
    navbar.style.backdropFilter = 'none';
    navbar.style.boxShadow = 'none';
    navbar.querySelectorAll('a').forEach(el => { 
      el.style.color = 'white'; 
    });
  }
});

// Counter animation with reduced motion support
function animateCounters() {
  const counters = document.querySelectorAll('.counter');
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  counters.forEach(counter => {
    const target = parseInt(counter.getAttribute('data-target'), 10);

    if (prefersReducedMotion) {
      counter.textContent = target.toLocaleString('ar-SA');
      return;
    }

    const duration = 1200; // 1.2s
    const increment = target / (duration / 16);
    let current = 0;

    const updateCounter = () => {
      if (current < target) {
        current += increment;
        counter.textContent = Math.floor(current).toLocaleString('ar-SA');
        requestAnimationFrame(updateCounter);
      } else {
        counter.textContent = target.toLocaleString('ar-SA');
      }
    };

    updateCounter();
  });
}

// Trigger counter animation when stats section is visible
const statsSection = document.querySelector('.stats-gradient');
if (statsSection) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        animateCounters();
        io.unobserve(entry.target);
      }
    });
  });
  io.observe(statsSection);
}

// Smooth scrolling for anchor links (if used)
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      target.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'start' 
      });
    }
  });
});
