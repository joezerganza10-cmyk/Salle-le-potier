/* ============================================================
   SALLE LE POTIER — Page Services : onglets + accordéon
   Toutes les données proviennent de data/pricing.js.
   ============================================================ */

const SERVICE_CATEGORIES = [
  {
    id:'technologie', label:'Son & technologie',
    items:[
      { name:PRICING.technology.livestream.label, price:money(PRICING.technology.livestream.price), sub:'Forfait' },
      { name:PRICING.technology.djConsole.label, price:money(PRICING.technology.djConsole.price), sub:'Forfait' },
      { name:PRICING.technology.extraWirelessMic.label, price:money(PRICING.technology.extraWirelessMic.price), sub:'Par unité — 3 micros déjà inclus dans la formule' },
      { name:PRICING.technology.soundEngineer.label, price:money(PRICING.technology.soundEngineer.price), sub:'Par heure' },
    ],
  },
  {
    id:'instruments', label:'Instruments',
    items:[
      { name:PRICING.instruments.pianoAndDrums.label, price:money(PRICING.instruments.pianoAndDrums.price), sub:'Forfait' },
      { name:PRICING.instruments.individual.label, price:money(PRICING.instruments.individual.price), sub:'Forfait' },
    ],
  },
  {
    id:'decoration', label:'Décoration & mobilier',
    items:[
      { name:PRICING.decoration.vipChair1.label, price:`${money(PRICING.decoration.vipChair1.indoor)} intérieur · ${money(PRICING.decoration.vipChair1.outdoor)} extérieur`, sub:'Par unité' },
      { name:PRICING.decoration.vipChair2.label, price:`${money(PRICING.decoration.vipChair2.indoor)} intérieur · ${money(PRICING.decoration.vipChair2.outdoor)} extérieur`, sub:'Par unité' },
      { name:PRICING.decoration.honorTable.label, price:`${money(PRICING.decoration.honorTable.indoor)} intérieur · ${money(PRICING.decoration.honorTable.outdoor)} extérieur`, sub:'' },
      { name:PRICING.decoration.heatingPlate.label, price:money(PRICING.decoration.heatingPlate.price), sub:'Par unité' },
      { name:PRICING.decoration.flowers.label, price:money(PRICING.decoration.flowers.price), sub:'Par unité' },
      { name:PRICING.decoration.centerpiece.label, price:money(PRICING.decoration.centerpiece.price), sub:'Par unité' },
      { name:PRICING.decoration.chargerPlate.label, price:money(PRICING.decoration.chargerPlate.price), sub:'Par unité' },
      { name:PRICING.decoration.chairCover.label, price:money(PRICING.decoration.chairCover.price), sub:'Par unité' },
      { name:PRICING.decoration.tablecloth.label, price:money(PRICING.decoration.tablecloth.price), sub:'Par unité' },
    ],
  },
  {
    id:'pro', label:'Services professionnels',
    items:[
      { name:PRICING.professionalServices.planning.label, price:PRICING.professionalServices.planning.note, sub:'' },
      { name:PRICING.professionalServices.mc.label, price:money(PRICING.professionalServices.mc.price), sub:'Forfait' },
      { name:PRICING.professionalServices.photographer.label, price:PRICING.professionalServices.photographer.note, sub:'' },
      { name:PRICING.professionalServices.videographer.label, price:PRICING.professionalServices.videographer.note, sub:'' },
      { name:PRICING.professionalServices.caterer.label, price:PRICING.professionalServices.caterer.note, sub:'' },
      { name:PRICING.professionalServices.cake.label, price:PRICING.professionalServices.cake.note, sub:'' },
    ],
  },
];

function renderServiceTabs(){
  const tabsEl = document.getElementById('services-tabs');
  const panelsEl = document.getElementById('services-panels');
  if (!tabsEl || !panelsEl) return;

  tabsEl.innerHTML = SERVICE_CATEGORIES.map((c,i) => `<button class="services-tab${i===0?' is-active':''}" data-tab="${c.id}">${c.label}</button>`).join('');

  function renderPanel(id){
    const cat = SERVICE_CATEGORIES.find(c => c.id === id);
    panelsEl.innerHTML = `<div class="service-item-grid">${cat.items.map(i => `
      <div class="service-item">
        <div><div class="si-name">${i.name}</div>${i.sub ? `<div class="si-sub">${i.sub}</div>` : ''}</div>
        <div class="si-price">${i.price}</div>
      </div>`).join('')}</div>`;
  }

  tabsEl.querySelectorAll('.services-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      tabsEl.querySelectorAll('.services-tab').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      renderPanel(btn.dataset.tab);
    });
  });

  renderPanel(SERVICE_CATEGORIES[0].id);
}

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
  el.innerHTML = items.map(i => `<div class="specialized-card"><h4>${i.label}</h4><span class="sp-price">${i.price}</span></div>`).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  renderServiceTabs();
  renderSpecialized();
});
