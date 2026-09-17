/* ============================================================
   SALLE LE POTIER — Configurateur d'événement
   7 étapes, estimation dynamique, aucun prix codé en dur :
   tout provient de data/pricing.js.
   ============================================================ */

const STORAGE_KEY = 'lepotierConfiguratorState';

const STEP_LABELS = [
  'Votre événement', 'Votre formule', 'Son & technologie',
  'Instruments', 'Décoration & accessoires', 'Services professionnels', 'Coordonnées',
];
const TOTAL_STEPS = STEP_LABELS.length;

function defaultState(){
  return {
    step: 0,
    eventType: null,
    date: '',
    guests: '',
    package: null,
    extraHours: 0,
    technology: { livestream:false, djConsole:false, extraWirelessMic:0, soundEngineer:0 },
    instruments: { pianoAndDrums:false, individual:false, individualDetail:'' },
    decoration: {
      vipChair1Indoor:0, vipChair1Outdoor:0,
      vipChair2Indoor:0, vipChair2Outdoor:0,
      honorTableIndoor:0, honorTableOutdoor:0,
      heatingPlate:0, flowers:0, centerpiece:0, chargerPlate:0, chairCover:0, tablecloth:0,
    },
    professionalServices: { planning:false, mc:false, photographer:false, videographer:false, caterer:false, cake:false, other:false },
    contact: { name:'', email:'', phone:'', message:'' },
    submitted:false,
  };
}

function loadState(){
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) return Object.assign(defaultState(), JSON.parse(saved));
  } catch {}
  return defaultState();
}
function saveState(){
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

let state = loadState();

/* Query params depuis un lien "Choisir 4 heures" / une carte d'événement */
(function applyQueryParams(){
  const params = new URLSearchParams(window.location.search);
  const pkg = params.get('package');
  const eventType = params.get('eventType');
  if (pkg && PRICING.packages[pkg]) state.package = pkg;
  if (eventType && EVENT_TYPES.some(e => e.id === eventType)) state.eventType = eventType;
})();

/* ---------- Calcul de l'estimation (source unique : PRICING) ---------- */
function calcEstimate(){
  const lines = [];
  const tbc = [];
  let total = 0;

  if (state.package){
    const pkg = PRICING.packages[state.package];
    lines.push({ label:pkg.label, amount:pkg.price });
    total += pkg.price;
  }
  if (state.extraHours > 0){
    const amount = state.extraHours * PRICING.extraHour;
    lines.push({ label:`${state.extraHours} heure${state.extraHours>1?'s':''} supplémentaire${state.extraHours>1?'s':''}`, amount });
    total += amount;
  }

  const t = state.technology;
  if (t.livestream){ lines.push({ label:PRICING.technology.livestream.label, amount:PRICING.technology.livestream.price }); total += PRICING.technology.livestream.price; }
  if (t.djConsole){ lines.push({ label:PRICING.technology.djConsole.label, amount:PRICING.technology.djConsole.price }); total += PRICING.technology.djConsole.price; }
  if (t.extraWirelessMic > 0){ const a = t.extraWirelessMic * PRICING.technology.extraWirelessMic.price; lines.push({ label:`${t.extraWirelessMic} micro${t.extraWirelessMic>1?'s':''} supplémentaire${t.extraWirelessMic>1?'s':''}`, amount:a }); total += a; }
  if (t.soundEngineer > 0){ const a = t.soundEngineer * PRICING.technology.soundEngineer.price; lines.push({ label:`Ingénieur de son (${t.soundEngineer}h)`, amount:a }); total += a; }

  const i = state.instruments;
  if (i.pianoAndDrums){ lines.push({ label:PRICING.instruments.pianoAndDrums.label, amount:PRICING.instruments.pianoAndDrums.price }); total += PRICING.instruments.pianoAndDrums.price; }
  if (i.individual){ lines.push({ label:PRICING.instruments.individual.label, amount:PRICING.instruments.individual.price }); total += PRICING.instruments.individual.price; }

  const d = state.decoration;
  const decoMap = [
    ['vipChair1Indoor', PRICING.decoration.vipChair1.label + ' (intérieur)', PRICING.decoration.vipChair1.indoor],
    ['vipChair1Outdoor', PRICING.decoration.vipChair1.label + ' (extérieur)', PRICING.decoration.vipChair1.outdoor],
    ['vipChair2Indoor', PRICING.decoration.vipChair2.label + ' (intérieur)', PRICING.decoration.vipChair2.indoor],
    ['vipChair2Outdoor', PRICING.decoration.vipChair2.label + ' (extérieur)', PRICING.decoration.vipChair2.outdoor],
    ['honorTableIndoor', PRICING.decoration.honorTable.label + ' (intérieur)', PRICING.decoration.honorTable.indoor],
    ['honorTableOutdoor', PRICING.decoration.honorTable.label + ' (extérieur)', PRICING.decoration.honorTable.outdoor],
    ['heatingPlate', PRICING.decoration.heatingPlate.label, PRICING.decoration.heatingPlate.price],
    ['flowers', PRICING.decoration.flowers.label, PRICING.decoration.flowers.price],
    ['centerpiece', PRICING.decoration.centerpiece.label, PRICING.decoration.centerpiece.price],
    ['chargerPlate', PRICING.decoration.chargerPlate.label, PRICING.decoration.chargerPlate.price],
    ['chairCover', PRICING.decoration.chairCover.label, PRICING.decoration.chairCover.price],
    ['tablecloth', PRICING.decoration.tablecloth.label, PRICING.decoration.tablecloth.price],
  ];
  decoMap.forEach(([key,label,unitPrice]) => {
    const qty = d[key];
    if (qty > 0){ const a = qty * unitPrice; lines.push({ label:`${label} × ${qty}`, amount:a }); total += a; }
  });

  const ps = state.professionalServices;
  if (ps.mc){ lines.push({ label:PRICING.professionalServices.mc.label, amount:PRICING.professionalServices.mc.price }); total += PRICING.professionalServices.mc.price; }
  if (ps.planning) tbc.push({ label:PRICING.professionalServices.planning.label, note:PRICING.professionalServices.planning.note });
  if (ps.photographer) tbc.push({ label:PRICING.professionalServices.photographer.label, note:PRICING.professionalServices.photographer.note });
  if (ps.videographer) tbc.push({ label:PRICING.professionalServices.videographer.label, note:PRICING.professionalServices.videographer.note });
  if (ps.caterer) tbc.push({ label:PRICING.professionalServices.caterer.label, note:PRICING.professionalServices.caterer.note });
  if (ps.cake) tbc.push({ label:PRICING.professionalServices.cake.label, note:PRICING.professionalServices.cake.note });
  if (ps.other) tbc.push({ label:PRICING.professionalServices.other.label, note:PRICING.professionalServices.other.note });

  return { lines, tbc, total };
}

/* ---------- Rendu de la progression ---------- */
function renderProgress(){
  const el = document.getElementById('cfg-progress');
  el.innerHTML = STEP_LABELS.map((_,i) => `<div class="cp-step ${i<state.step?'is-done':i===state.step?'is-current':''}"><span></span></div>`).join('');
}

/* ---------- Rendu du récapitulatif (desktop sticky + mobile bar) ---------- */
function renderSummary(){
  const { lines, tbc, total } = calcEstimate();
  const desktop = document.getElementById('cfg-summary');
  const buildBody = () => `
    <h4>Votre événement</h4>
    ${state.eventType ? `<div class="cfg-summary-line"><span class="csl-name">Type</span><span>${EVENT_TYPES.find(e=>e.id===state.eventType)?.label || ''}</span></div>` : ''}
    ${state.date ? `<div class="cfg-summary-line"><span class="csl-name">Date</span><span>${state.date}</span></div>` : ''}
    ${state.guests ? `<div class="cfg-summary-line"><span class="csl-name">Invités</span><span>${state.guests}</span></div>` : ''}
    ${lines.map(l => `<div class="cfg-summary-line"><span class="csl-name">${l.label}</span><span>${money(l.amount)}</span></div>`).join('')}
    <div class="cfg-summary-total">
      <span class="cst-label">Estimation actuelle</span>
      <span class="cst-amount">${money(total)}</span>
    </div>
    ${tbc.length ? `<div class="cfg-summary-tbc"><strong>Services à confirmer :</strong><br>${tbc.map(t => `${t.label} — ${t.note}`).join('<br>')}</div>` : ''}
    <div class="cfg-summary-note">Cette estimation est indicative. La disponibilité, les services et le montant final seront confirmés par l'équipe de Salle Le Potier.</div>
  `;
  if (desktop) desktop.innerHTML = buildBody();

  const mbAmount = document.getElementById('mb-amount');
  if (mbAmount) mbAmount.textContent = money(total);
  const drawerSummary = document.getElementById('drawer-summary');
  if (drawerSummary) drawerSummary.innerHTML = buildBody();

  const mobileBar = document.getElementById('cfg-mobile-bar');
  if (mobileBar) mobileBar.classList.toggle('is-active', state.step > 0 || !!state.package);
}

/* ---------- Aides UI ---------- */
function qtyRow(label, sub, value, onChange){
  return `
    <div class="cfg-option-row" data-qty-row>
      <div><div class="cor-name">${label}</div>${sub ? `<div class="cor-price">${sub}</div>` : ''}</div>
      <div class="cfg-qty">
        <button type="button" data-qty-minus>−</button>
        <span data-qty-value>${value}</span>
        <button type="button" data-qty-plus>+</button>
      </div>
    </div>`;
}
function bindQtyRow(container, selector, getValue, setValue, rerender){
  const row = container.querySelector(selector);
  if (!row) return;
  const valueEl = row.querySelector('[data-qty-value]');
  row.querySelector('[data-qty-minus]').addEventListener('click', () => { setValue(Math.max(0, getValue()-1)); valueEl.textContent = getValue(); rerender(); });
  row.querySelector('[data-qty-plus]').addEventListener('click', () => { setValue(getValue()+1); valueEl.textContent = getValue(); rerender(); });
}
function toggleRow(label, sub, isOn){
  return `
    <div class="cfg-option-row" data-toggle-row>
      <div><div class="cor-name">${label}</div>${sub ? `<div class="cor-price">${sub}</div>` : ''}</div>
      <div class="cfg-toggle ${isOn ? 'is-on' : ''}" data-toggle></div>
    </div>`;
}

/* ---------- Étape 1 : votre événement ---------- */
function renderStep1(container){
  container.innerHTML = `
    <div class="configurator-step-label">Étape 1 / ${TOTAL_STEPS}</div>
    <h2 class="configurator-title">Parlez-nous de votre événement</h2>
    <div class="cfg-sub-heading">Type d'événement</div>
    <div class="cfg-cards" id="cfg-event-cards">
      ${EVENT_TYPES.map(e => `<button type="button" class="cfg-card ${state.eventType===e.id?'is-selected':''}" data-event="${e.id}">${e.label}</button>`).join('')}
    </div>
    <div class="form-grid" style="margin-top:30px">
      <div class="field"><label for="cfg-date">Date souhaitée</label><input id="cfg-date" type="date" value="${state.date}"></div>
      <div class="field"><label for="cfg-guests">Nombre approximatif d'invités</label><input id="cfg-guests" type="number" min="1" value="${state.guests}"></div>
    </div>
    <p class="form-note" style="margin-top:14px">Capacité : plus de 350 personnes.</p>
    <div class="cfg-nav">
      <span></span>
      <button type="button" class="btn btn-noir" id="cfg-next">Continuer</button>
    </div>
  `;
  container.querySelectorAll('[data-event]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.eventType = btn.dataset.event;
      container.querySelectorAll('[data-event]').forEach(b => b.classList.toggle('is-selected', b === btn));
      saveState();
    });
  });
  document.getElementById('cfg-date').addEventListener('input', (e) => { state.date = e.target.value; saveState(); });
  document.getElementById('cfg-guests').addEventListener('input', (e) => { state.guests = e.target.value; saveState(); });
  document.getElementById('cfg-next').addEventListener('click', goNext);
}

/* ---------- Étape 2 : formule + heures supplémentaires ---------- */
function renderStep2(container){
  const pkgCard = (key) => {
    const pkg = PRICING.packages[key];
    const selected = state.package === key;
    return `
      <div class="cfg-package-card ${selected?'is-selected':''}" data-package="${key}">
        <span class="eyebrow">Formule</span>
        <h3>${pkg.label}</h3>
        <div class="price">${money(pkg.price)}</div>
        <ul>${PRICING.packageIncludes.map(i => `<li>${i}</li>`).join('')}</ul>
        <button type="button" class="btn ${selected?'btn-champagne':'btn-ligne'}" data-package-btn>${selected ? 'Sélectionné' : 'Choisir'}</button>
      </div>`;
  };
  container.innerHTML = `
    <div class="configurator-step-label">Étape 2 / ${TOTAL_STEPS}</div>
    <h2 class="configurator-title">Choisissez votre formule</h2>
    <div class="cfg-package-cards">${pkgCard('fourHours')}${pkgCard('eightHours')}</div>

    <div class="cfg-sub-heading">Avez-vous besoin de plus de temps ?</div>
    <div class="cfg-extra-hours" id="cfg-extra-hours">
      ${[0,1,2,3].map(n => `<button type="button" class="cfg-pill ${state.extraHours===n?'is-selected':''}" data-extra="${n}">${n===0?'Non':'+'+n+' heure'+(n>1?'s':'')}</button>`).join('')}
    </div>
    <p class="form-note" style="margin-top:10px">${money(PRICING.extraHour)} / heure supplémentaire.</p>

    <div class="cfg-nav">
      <button type="button" class="btn-lien" id="cfg-back">← Précédent</button>
      <button type="button" class="btn btn-noir" id="cfg-next" ${state.package?'':'disabled'}>Continuer</button>
    </div>
  `;
  function refreshPackageUI(){
    container.querySelectorAll('[data-package]').forEach(card => {
      const selected = card.dataset.package === state.package;
      card.classList.toggle('is-selected', selected);
      const btn = card.querySelector('[data-package-btn]');
      btn.textContent = selected ? 'Sélectionné' : 'Choisir';
      btn.className = `btn ${selected?'btn-champagne':'btn-ligne'}`;
    });
    document.getElementById('cfg-next').disabled = !state.package;
  }
  container.querySelectorAll('[data-package]').forEach(card => {
    card.addEventListener('click', () => { state.package = card.dataset.package; saveState(); refreshPackageUI(); renderSummary(); });
  });
  container.querySelectorAll('[data-extra]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.extraHours = Number(btn.dataset.extra);
      container.querySelectorAll('[data-extra]').forEach(b => b.classList.toggle('is-selected', b===btn));
      saveState(); renderSummary();
    });
  });
  document.getElementById('cfg-back').addEventListener('click', goBack);
  document.getElementById('cfg-next').addEventListener('click', goNext);
}

/* ---------- Étape 3 : son & technologie ---------- */
function renderStep3(container){
  const t = state.technology;
  container.innerHTML = `
    <div class="configurator-step-label">Étape 3 / ${TOTAL_STEPS}</div>
    <h2 class="configurator-title">Son & technologie</h2>
    <p class="form-note" style="margin-bottom:20px">3 micros sans fil sont déjà inclus dans votre formule — seuls les micros supplémentaires sont facturés ici.</p>
    <div id="row-livestream">${toggleRow(PRICING.technology.livestream.label, money(PRICING.technology.livestream.price), t.livestream)}</div>
    <div id="row-dj">${toggleRow(PRICING.technology.djConsole.label, money(PRICING.technology.djConsole.price), t.djConsole)}</div>
    <div id="row-mic">${qtyRow(PRICING.technology.extraWirelessMic.label, money(PRICING.technology.extraWirelessMic.price)+' / unité', t.extraWirelessMic)}</div>
    <div id="row-engineer">${qtyRow(PRICING.technology.soundEngineer.label, money(PRICING.technology.soundEngineer.price)+' / heure', t.soundEngineer)}</div>
    <div class="cfg-nav">
      <button type="button" class="btn-lien" id="cfg-back">← Précédent</button>
      <button type="button" class="btn btn-noir" id="cfg-next">Continuer</button>
    </div>
  `;
  container.querySelector('#row-livestream [data-toggle]').addEventListener('click', (e) => { t.livestream = !t.livestream; e.target.classList.toggle('is-on', t.livestream); saveState(); renderSummary(); });
  container.querySelector('#row-dj [data-toggle]').addEventListener('click', (e) => { t.djConsole = !t.djConsole; e.target.classList.toggle('is-on', t.djConsole); saveState(); renderSummary(); });
  bindQtyRow(container, '#row-mic', () => t.extraWirelessMic, (v) => t.extraWirelessMic = v, () => { saveState(); renderSummary(); });
  bindQtyRow(container, '#row-engineer', () => t.soundEngineer, (v) => t.soundEngineer = v, () => { saveState(); renderSummary(); });
  document.getElementById('cfg-back').addEventListener('click', goBack);
  document.getElementById('cfg-next').addEventListener('click', goNext);
}

/* ---------- Étape 4 : instruments ---------- */
function renderStep4(container){
  const i = state.instruments;
  container.innerHTML = `
    <div class="configurator-step-label">Étape 4 / ${TOTAL_STEPS}</div>
    <h2 class="configurator-title">Instruments</h2>
    <div id="row-piano">${toggleRow(PRICING.instruments.pianoAndDrums.label, money(PRICING.instruments.pianoAndDrums.price), i.pianoAndDrums)}</div>
    <div id="row-individual">${toggleRow(PRICING.instruments.individual.label, money(PRICING.instruments.individual.price), i.individual)}</div>
    <div id="individual-detail" style="display:${i.individual?'block':'none'};margin-top:14px">
      <div class="field"><label for="cfg-instrument-detail">Quel instrument recherchez-vous ?</label><input id="cfg-instrument-detail" value="${i.individualDetail}"></div>
    </div>
    <div class="cfg-nav">
      <button type="button" class="btn-lien" id="cfg-back">← Précédent</button>
      <button type="button" class="btn btn-noir" id="cfg-next">Continuer</button>
    </div>
  `;
  container.querySelector('#row-piano [data-toggle]').addEventListener('click', (e) => { i.pianoAndDrums = !i.pianoAndDrums; e.target.classList.toggle('is-on', i.pianoAndDrums); saveState(); renderSummary(); });
  container.querySelector('#row-individual [data-toggle]').addEventListener('click', (e) => {
    i.individual = !i.individual;
    e.target.classList.toggle('is-on', i.individual);
    document.getElementById('individual-detail').style.display = i.individual ? 'block' : 'none';
    saveState(); renderSummary();
  });
  document.getElementById('cfg-instrument-detail').addEventListener('input', (e) => { i.individualDetail = e.target.value; saveState(); });
  document.getElementById('cfg-back').addEventListener('click', goBack);
  document.getElementById('cfg-next').addEventListener('click', goNext);
}

/* ---------- Étape 5 : décoration & accessoires ---------- */
function renderStep5(container){
  const d = state.decoration;
  const rows = [
    ['vipChair1Indoor', PRICING.decoration.vipChair1.label + ' — intérieur', PRICING.decoration.vipChair1.indoor],
    ['vipChair1Outdoor', PRICING.decoration.vipChair1.label + ' — extérieur', PRICING.decoration.vipChair1.outdoor],
    ['vipChair2Indoor', PRICING.decoration.vipChair2.label + ' — intérieur', PRICING.decoration.vipChair2.indoor],
    ['vipChair2Outdoor', PRICING.decoration.vipChair2.label + ' — extérieur', PRICING.decoration.vipChair2.outdoor],
    ['honorTableIndoor', PRICING.decoration.honorTable.label + ' — intérieur', PRICING.decoration.honorTable.indoor],
    ['honorTableOutdoor', PRICING.decoration.honorTable.label + ' — extérieur', PRICING.decoration.honorTable.outdoor],
    ['heatingPlate', PRICING.decoration.heatingPlate.label, PRICING.decoration.heatingPlate.price],
    ['flowers', PRICING.decoration.flowers.label, PRICING.decoration.flowers.price],
    ['centerpiece', PRICING.decoration.centerpiece.label, PRICING.decoration.centerpiece.price],
    ['chargerPlate', PRICING.decoration.chargerPlate.label, PRICING.decoration.chargerPlate.price],
    ['chairCover', PRICING.decoration.chairCover.label, PRICING.decoration.chairCover.price],
    ['tablecloth', PRICING.decoration.tablecloth.label, PRICING.decoration.tablecloth.price],
  ];
  container.innerHTML = `
    <div class="configurator-step-label">Étape 5 / ${TOTAL_STEPS}</div>
    <h2 class="configurator-title">Personnalisez votre espace</h2>
    ${rows.map(([key,label,price]) => `<div id="row-${key}">${qtyRow(label, money(price)+' / unité', d[key])}</div>`).join('')}
    <div class="cfg-nav">
      <button type="button" class="btn-lien" id="cfg-back">← Précédent</button>
      <button type="button" class="btn btn-noir" id="cfg-next">Continuer</button>
    </div>
  `;
  rows.forEach(([key]) => {
    bindQtyRow(container, `#row-${key}`, () => d[key], (v) => d[key] = v, () => { saveState(); renderSummary(); });
  });
  document.getElementById('cfg-back').addEventListener('click', goBack);
  document.getElementById('cfg-next').addEventListener('click', goNext);
}

/* ---------- Étape 6 : services professionnels ---------- */
function renderStep6(container){
  const ps = state.professionalServices;
  const rows = [
    ['planning', PRICING.professionalServices.planning.label, PRICING.professionalServices.planning.note],
    ['mc', PRICING.professionalServices.mc.label, money(PRICING.professionalServices.mc.price)],
    ['photographer', PRICING.professionalServices.photographer.label, PRICING.professionalServices.photographer.note],
    ['videographer', PRICING.professionalServices.videographer.label, PRICING.professionalServices.videographer.note],
    ['caterer', PRICING.professionalServices.caterer.label, PRICING.professionalServices.caterer.note],
    ['cake', PRICING.professionalServices.cake.label, PRICING.professionalServices.cake.note],
  ];
  container.innerHTML = `
    <div class="configurator-step-label">Étape 6 / ${TOTAL_STEPS}</div>
    <h2 class="configurator-title">Besoin d'un coup de main ?</h2>
    ${rows.map(([key,label,sub]) => `<div id="row-${key}">${toggleRow(label, sub, ps[key])}</div>`).join('')}
    <div class="cfg-nav">
      <button type="button" class="btn-lien" id="cfg-back">← Précédent</button>
      <button type="button" class="btn btn-noir" id="cfg-next">Continuer</button>
    </div>
  `;
  rows.forEach(([key]) => {
    container.querySelector(`#row-${key} [data-toggle]`).addEventListener('click', (e) => {
      ps[key] = !ps[key];
      e.target.classList.toggle('is-on', ps[key]);
      saveState(); renderSummary();
    });
  });
  document.getElementById('cfg-back').addEventListener('click', goBack);
  document.getElementById('cfg-next').addEventListener('click', goNext);
}

/* ---------- Étape 7 : coordonnées + envoi ---------- */
function renderStep7(container){
  const c = state.contact;
  const { lines, tbc, total } = calcEstimate();
  container.innerHTML = `
    <div class="configurator-step-label">Étape 7 / ${TOTAL_STEPS}</div>
    <h2 class="configurator-title">Presque terminé.</h2>
    <div class="form-grid">
      <div class="field"><label for="cfg-name">Nom complet *</label><input id="cfg-name" value="${c.name}" required></div>
      <div class="field"><label for="cfg-email">Courriel *</label><input id="cfg-email" type="email" value="${c.email}" required></div>
      <div class="field"><label for="cfg-phone">Téléphone *</label><input id="cfg-phone" type="tel" value="${c.phone}" required></div>
      <div class="field full"><label for="cfg-message">Message / informations supplémentaires</label><textarea id="cfg-message">${c.message}</textarea></div>
    </div>

    <div class="cfg-sub-heading">Récapitulatif</div>
    <div style="border:1px solid var(--ligne);padding:24px">
      ${state.eventType ? `<div class="cfg-summary-line"><span class="csl-name">Type d'événement</span><span>${EVENT_TYPES.find(e=>e.id===state.eventType)?.label||''}</span></div>` : ''}
      ${state.date ? `<div class="cfg-summary-line"><span class="csl-name">Date</span><span>${state.date}</span></div>` : ''}
      ${state.guests ? `<div class="cfg-summary-line"><span class="csl-name">Invités</span><span>${state.guests}</span></div>` : ''}
      ${lines.map(l => `<div class="cfg-summary-line"><span class="csl-name">${l.label}</span><span>${money(l.amount)}</span></div>`).join('')}
      <div class="cfg-summary-total"><span class="cst-label">Estimation indicative</span><span class="cst-amount">${money(total)}</span></div>
      ${tbc.length ? `<div class="cfg-summary-tbc"><strong>Services à confirmer :</strong><br>${tbc.map(t=>`${t.label} — ${t.note}`).join('<br>')}</div>` : ''}
    </div>

    <div class="cfg-nav">
      <button type="button" class="btn-lien" id="cfg-back">← Précédent</button>
      <button type="button" class="btn btn-champagne" id="cfg-submit">Envoyer ma demande</button>
    </div>
  `;
  document.getElementById('cfg-name').addEventListener('input', (e) => { c.name = e.target.value; saveState(); });
  document.getElementById('cfg-email').addEventListener('input', (e) => { c.email = e.target.value; saveState(); });
  document.getElementById('cfg-phone').addEventListener('input', (e) => { c.phone = e.target.value; saveState(); });
  document.getElementById('cfg-message').addEventListener('input', (e) => { c.message = e.target.value; saveState(); });
  document.getElementById('cfg-back').addEventListener('click', goBack);
  document.getElementById('cfg-submit').addEventListener('click', () => {
    if (!c.name || !c.email || !c.phone){
      alert('Merci de remplir votre nom, courriel et téléphone.');
      return;
    }
    state.submitted = true;
    saveState();
    renderConfirmation();
  });
}

/* ---------- Confirmation finale ---------- */
function renderConfirmation(){
  document.getElementById('cfg-progress').style.display = 'none';
  document.getElementById('cfg-summary').style.display = 'none';
  document.getElementById('cfg-mobile-bar').classList.remove('is-active');
  document.getElementById('cfg-step-content').innerHTML = `
    <div class="cfg-confirmation">
      <span class="eyebrow">Salle Le Potier</span>
      <h2>Merci.</h2>
      <p>Votre demande a bien été envoyée. L'équipe de Salle Le Potier communiquera avec vous afin de confirmer la disponibilité et finaliser votre événement.</p>
      <div class="conf-ctas">
        <a href="tel:+14389359473" class="btn btn-noir">Appeler</a>
        <a href="/" class="btn btn-ligne">Retourner à l'accueil</a>
      </div>
    </div>
  `;
  try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
}

/* ---------- Navigation ---------- */
function goNext(){ state.step = Math.min(TOTAL_STEPS-1, state.step+1); saveState(); renderStep(); window.scrollTo({top:0,behavior: REDUCED_MOTION ? 'auto' : 'smooth'}); }
function goBack(){ state.step = Math.max(0, state.step-1); saveState(); renderStep(); window.scrollTo({top:0,behavior: REDUCED_MOTION ? 'auto' : 'smooth'}); }

const STEP_RENDERERS = [renderStep1, renderStep2, renderStep3, renderStep4, renderStep5, renderStep6, renderStep7];

function renderStep(){
  renderProgress();
  const container = document.getElementById('cfg-step-content');
  STEP_RENDERERS[state.step](container);
  renderSummary();
}

/* ---------- Barre / tiroir mobile ---------- */
function initMobileDrawer(){
  const drawer = document.getElementById('cfg-drawer');
  document.getElementById('mb-view')?.addEventListener('click', () => drawer.classList.add('is-open'));
  document.getElementById('drawer-close')?.addEventListener('click', () => drawer.classList.remove('is-open'));
  drawer.addEventListener('click', (e) => { if (e.target === drawer) drawer.classList.remove('is-open'); });
}

document.addEventListener('DOMContentLoaded', () => {
  if (state.submitted){ state = defaultState(); }
  initMobileDrawer();
  renderStep();
});
