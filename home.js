/* ============================================================
   SALLE LE POTIER — Logique de la page d'accueil
   ============================================================ */

const AMENITY_ICONS = {
  parking: '<path d="M6 3h7a5 5 0 010 10H9v8"/><path d="M9 13V7h4a3 3 0 010 6"/>',
  terrace: '<path d="M3 10l9-6 9 6"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/>',
  restroom: '<circle cx="8" cy="6" r="2.2"/><path d="M8 10v10M4 22v-7a4 4 0 018 0v7"/><circle cx="17" cy="6" r="2.2"/><path d="M14 22v-6a3 3 0 016 0v6"/>',
  fridge: '<rect x="6" y="2" width="12" height="20" rx="1.5"/><line x1="6" y1="10" x2="18" y2="10"/><line x1="9" y1="5" x2="9" y2="7"/><line x1="9" y1="13" x2="9" y2="15"/>',
  microwave: '<rect x="2" y="6" width="20" height="12" rx="1.5"/><rect x="4.5" y="8.5" width="11" height="7" rx="1"/><circle cx="19" cy="10" r="1"/><line x1="17.5" y1="14" x2="20.5" y2="14"/>',
  bar: '<path d="M4 4h16l-6.5 8v7M11.5 12v7"/><line x1="8" y1="19" x2="15" y2="19"/>',
  park: '<path d="M12 2l5 8h-3l4 6h-4v6h-4v-6H6l4-6H7l5-8z"/>',
  tree: '<circle cx="12" cy="9" r="6"/><line x1="12" y1="15" x2="12" y2="22"/>',
  metro: '<rect x="5" y="3" width="14" height="14" rx="4"/><circle cx="9" cy="19" r="1.4"/><circle cx="15" cy="19" r="1.4"/><line x1="5" y1="10" x2="19" y2="10"/>',
};

function amenityIcon(id){
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">${AMENITY_ICONS[id] || AMENITY_ICONS.park}</svg>`;
}

const CHECK_ICON = '<svg style="width:20px;height:20px;flex-shrink:0;color:var(--champagne)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

/* ---------- Événements (bloc "mille possibilités") ---------- */
function renderEventsGrid(){
  const el = document.getElementById('events-grid');
  if (!el) return;
  const featured = EVENT_TYPES.filter(e => e.featured);
  el.innerHTML = featured.map(e => `
    <a href="/evenements#${e.id}" class="event-card">
      ${placeholderHTML(e.label)}
      <h3>${e.label}</h3>
    </a>`).join('');
}

/* ---------- Ce qui est inclus ---------- */
function renderIncludedList(){
  const el = document.getElementById('included-list');
  if (!el) return;
  el.innerHTML = PRICING.packageIncludes.map(item => `
    <div class="included-item">${CHECK_ICON}<span>${item}</span></div>`).join('');
}

/* ---------- Cartes de tarifs (accueil + réutilisées page Tarifs) ---------- */
function pricingCardHTML(key, featured){
  const pkg = PRICING.packages[key];
  return `
    <div class="pricing-card${featured ? ' is-featured' : ''}">
      <div class="pricing-card-head">
        <span class="eyebrow">Formule</span>
        <h3>${pkg.label}</h3>
        <div class="price">${money(pkg.price)}</div>
      </div>
      <ul class="pricing-includes">
        ${PRICING.packageIncludes.map(i => `<li>${i}</li>`).join('')}
      </ul>
      <a href="/configurateur?package=${key}" class="btn btn-champagne">Choisir ${pkg.label}</a>
    </div>`;
}
function renderHomePricing(){
  const el = document.getElementById('home-pricing-grid');
  if (!el) return;
  el.innerHTML = pricingCardHTML('fourHours') + pricingCardHTML('eightHours');
}

/* ---------- Aperçu services (accueil) ---------- */
function renderServicesPreview(){
  const el = document.getElementById('services-preview');
  if (!el) return;
  const highlights = [
    { label:PRICING.technology.livestream.label, price:PRICING.technology.livestream.price },
    { label:PRICING.technology.djConsole.label, price:PRICING.technology.djConsole.price },
    { label:PRICING.instruments.pianoAndDrums.label, price:PRICING.instruments.pianoAndDrums.price },
    { label:PRICING.decoration.centerpiece.label, price:PRICING.decoration.centerpiece.price, unit:'/ unité' },
  ];
  el.innerHTML = `<div class="service-item-grid">${highlights.map(h => `
    <div class="service-item">
      <span class="si-name">${h.label}</span>
      <span class="si-price">${money(h.price)}${h.unit ? ' <small style=\"font-size:10px;color:var(--gris-texte)\">'+h.unit+'</small>' : ''}</span>
    </div>`).join('')}</div>`;
}

/* ---------- Aperçu galerie ---------- */
function renderGalleryPreview(){
  const el = document.getElementById('gallery-preview');
  if (!el) return;
  const items = GALLERY.slice(0,4);
  el.innerHTML = items.map((item, i) => `
    <div class="g-item" data-lightbox-open="${i}">
      ${item.src ? `<img src="${item.src}" alt="${item.label}" loading="lazy">` : placeholderHTML(item.label)}
    </div>`).join('');
  initLightbox(items);
}

/* ---------- Commodités ---------- */
function renderAmenities(){
  const el = document.getElementById('amenities-grid');
  if (!el) return;
  el.innerHTML = AMENITIES.map(a => `
    <div class="amenity-item">
      ${amenityIcon(a.icon)}
      <div><div class="am-title">${a.title}</div>${a.sub ? `<div class="am-sub">${a.sub}</div>` : ''}</div>
    </div>`).join('');
}

/* ---------- Services spécialisés ---------- */
function renderSpecialized(){
  const el = document.getElementById('specialized-grid');
  if (!el) return;
  const ps = PRICING.professionalServices;
  const items = [
    { label:ps.planning.label, price:ps.planning.note },
    { label:ps.mc.label, price:money(ps.mc.price) },
    { label:ps.photographer.label, price:ps.photographer.note },
    { label:ps.videographer.label, price:ps.videographer.note },
    { label:ps.caterer.label, price:ps.caterer.note },
    { label:ps.cake.label, price:ps.cake.note },
  ];
  el.innerHTML = items.map(i => `
    <div class="specialized-card">
      <h4>${i.label}</h4>
      <span class="sp-price">${i.price}</span>
    </div>`).join('');
}

/* ---------- FAQ (aperçu : 5 premières) ---------- */
function renderFAQPreview(){
  const el = document.getElementById('faq-list');
  if (!el) return;
  const items = FAQ.slice(0,5);
  el.innerHTML = items.map(f => `
    <div class="faq-item">
      <button class="faq-question"><span>${f.q}</span><span class="faq-icon">+</span></button>
      <div class="faq-answer"><p>${f.a}</p></div>
    </div>`).join('');
  initFAQAccordion(el);
}

/* ---------- Formulaire rapide (parcours simple) ---------- */
function renderQuickFormEventTypes(){
  const select = document.getElementById('qf-type');
  if (!select) return;
  select.innerHTML = '<option value="" disabled selected>Sélectionnez…</option>' +
    EVENT_TYPES.map(e => `<option value="${e.id}">${e.label}</option>`).join('');
}
function initQuickForm(){
  const form = document.getElementById('quick-form');
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    // Aucun backend connecté pour l'instant — voir data/site-data.js et le brief
    // (section "Évolution future") pour le branchement futur (CRM / email / SMS).
    form.style.display = 'none';
    document.getElementById('quick-form-success').style.display = 'block';
  });
}

document.addEventListener('DOMContentLoaded', () => {
  renderEventsGrid();
  renderIncludedList();
  renderHomePricing();
  renderServicesPreview();
  renderGalleryPreview();
  renderAmenities();
  renderSpecialized();
  renderFAQPreview();
  renderQuickFormEventTypes();
  initQuickForm();
  initReveal();
});
