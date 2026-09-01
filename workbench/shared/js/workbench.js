// JARVIS Workbench — main script

// Set footer year
const yearEl = document.getElementById('footer-year');
if (yearEl) yearEl.textContent = new Date().getFullYear().toString();

// Animate project count (counts from workbench/projects/)
// In a static build this is hardcoded; JARVIS updates it on project creation
const statProjects = document.getElementById('stat-projects');
if (statProjects) {
  // Animated counter
  const target = parseInt(statProjects.dataset.count || '0', 10);
  let current = 0;
  const step = () => {
    if (current < target) {
      current++;
      statProjects.textContent = current.toString();
      requestAnimationFrame(step);
    }
  };
  step();
}

// Intersection Observer — fade in sections on scroll
const observerOptions = {
  threshold: 0.1,
  rootMargin: '0px 0px -50px 0px',
};

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = '1';
      entry.target.style.transform = 'translateY(0)';
      observer.unobserve(entry.target);
    }
  });
}, observerOptions);

// Observe agent cards and template cards
document.querySelectorAll('.agent-card, .template-card, .stat-card, .status-item').forEach((el) => {
  const htmlEl = /** @type {HTMLElement} */ (el);
  htmlEl.style.opacity = '0';
  htmlEl.style.transform = 'translateY(16px)';
  htmlEl.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
  observer.observe(htmlEl);
});

// Greeting based on time of day
const heroTitle = document.getElementById('hero-title');
if (heroTitle) {
  const hour = new Date().getHours();
  let greeting = 'Good evening,';
  if (hour >= 5 && hour < 12) greeting = 'Good morning,';
  else if (hour >= 12 && hour < 17) greeting = 'Good afternoon,';
  else if (hour >= 17 && hour < 21) greeting = 'Good evening,';
  else greeting = 'Working late,';

  heroTitle.innerHTML = `${greeting}<br /><span class="gradient-text">Hareeshwar.</span>`;
}
