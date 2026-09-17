/* ============================================================
   SALLE LE POTIER — Noyau partagé (toutes les pages)
   Header, menu mobile, reveal au scroll, FAQ, lightbox galerie,
   placeholders photo, compteurs animés.
   ============================================================ */

const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Placeholder photo élégant (aucune vraie photo fournie) ---------- */
function placeholderHTML(label, opts){
  opts = opts || {};
  const light = opts.light ? ' is-light' : '';
  return `
    <div class="placeholder-fill${light}" role="img" aria-label="${label} — photographie à venir">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5.5-5.5a2 2 0 00-2.8 0L3 19"/></svg>
      <span>${label}</span>
      <small>Photographie à venir</small>
    </div>`;
}

/* ---------- Header : fond opaque au scroll, menu mobile ---------- */
function initHeader(){
  const header = document.getElementById('site-header');
  if (!header) return;
  function onScroll(){ header.classList.toggle('is-scrolled', window.scrollY > 40); }
  window.addEventListener('scroll', onScroll, { passive:true });
  onScroll();

  const burger = document.getElementById('menu-toggle');
  const nav = document.getElementById('header-nav');
  if (burger && nav){
    burger.addEventListener('click', () => {
      const open = nav.classList.toggle('is-open');
      burger.classList.toggle('is-open', open);
      document.body.style.overflow = open ? 'hidden' : '';
    });
    nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
      nav.classList.remove('is-open');
      burger.classList.remove('is-open');
      document.body.style.overflow = '';
    }));
  }
}

/* ---------- Reveal au scroll ---------- */
function initReveal(){
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting){ entry.target.classList.add('is-visible'); io.unobserve(entry.target); }
    });
  }, { threshold:0.15, rootMargin:'0px 0px -60px 0px' });
  document.querySelectorAll('.reveal, .reveal-stagger').forEach(el => io.observe(el));
}

/* ---------- Compteur numérique animé (ex. 350+) ---------- */
function initCounters(){
  const els = document.querySelectorAll('[data-count]');
  if (!els.length) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      io.unobserve(el);
      const target = Number(el.dataset.count);
      const suffix = el.dataset.suffix || '';
      if (REDUCED_MOTION){ el.textContent = target + suffix; return; }
      const duration = 1100;
      const start = performance.now();
      function tick(now){
        const progress = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.round(target * eased) + suffix;
        if (progress < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  }, { threshold:0.5 });
  els.forEach(el => io.observe(el));
}

/* ---------- FAQ accordéon ---------- */
function initFAQAccordion(container){
  if (!container) return;
  container.querySelectorAll('.faq-item').forEach(item => {
    const question = item.querySelector('.faq-question');
    const answer = item.querySelector('.faq-answer');
    question.addEventListener('click', () => {
      const isOpen = item.classList.toggle('is-open');
      answer.style.maxHeight = isOpen ? answer.scrollHeight + 'px' : '0px';
    });
  });
}

/* ---------- Lightbox galerie ---------- */
function initLightbox(items){
  const lightbox = document.getElementById('lightbox');
  if (!lightbox || !items || !items.length) return;
  const content = document.getElementById('lightbox-content');
  let current = 0;

  function render(){
    const item = items[current];
    content.innerHTML = item.src
      ? `<img src="${item.src}" alt="${item.label}">`
      : placeholderHTML(item.label);
  }
  function open(index){ current = index; render(); lightbox.classList.add('is-open'); document.body.style.overflow = 'hidden'; }
  function close(){ lightbox.classList.remove('is-open'); document.body.style.overflow = ''; }
  function next(){ current = (current + 1) % items.length; render(); }
  function prev(){ current = (current - 1 + items.length) % items.length; render(); }

  document.querySelectorAll('[data-lightbox-open]').forEach(el => {
    el.addEventListener('click', () => open(Number(el.dataset.lightboxOpen)));
  });
  document.getElementById('lightbox-close')?.addEventListener('click', close);
  document.getElementById('lightbox-next')?.addEventListener('click', next);
  document.getElementById('lightbox-prev')?.addEventListener('click', prev);
  lightbox.addEventListener('click', (e) => { if (e.target === lightbox) close(); });
  document.addEventListener('keydown', (e) => {
    if (!lightbox.classList.contains('is-open')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowRight') next();
    if (e.key === 'ArrowLeft') prev();
  });
}

/* ---------- Init commun à toutes les pages ---------- */
document.addEventListener('DOMContentLoaded', () => {
  initHeader();
  initReveal();
  initCounters();
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
});
