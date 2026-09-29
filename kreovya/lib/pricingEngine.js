/**
 * KREOVYA CORE — Moteur de tarification générique (multi-tenant)
 * ============================================================
 * Remplace les calculs dupliqués (ROOM_PRICING dans verify-payment.js,
 * describeRoomPricing() dans kreovya-agent.js) par une SEULE source de
 * vérité, entièrement pilotée par la configuration du tenant
 * (kreovya/config/tenants.js) — aucune donnée commerciale d'un tenant
 * précis codée en dur ici.
 *
 * Module pur : aucun appel réseau, ne touche jamais Supabase ni un
 * fournisseur de paiement. Utilisable aussi bien par le moteur
 * conversationnel (description textuelle) que par le pont de paiement
 * (montant autoritaire) — garantit que le prix AFFICHÉ et le prix
 * VÉRIFIÉ proviennent toujours du même calcul.
 *
 * Types de grille tarifaire reconnus aujourd'hui (rooms[].pricingType) :
 *   - 'flatDay'      : un tarif fixe pour la journée complète.
 *   - 'tiered'        : forfait de base (baseHours/basePrice) + tarif
 *                       horaire au-delà (perExtraHour), plafonné
 *                       (maxHours/maxPrice) — refuse au-delà de maxHours.
 *   - 'packageTiers'  : plusieurs forfaits fixes à durées croissantes
 *                       (packages:[{hours,price}]) + tarif horaire au-delà
 *                       du plus long forfait (extraHourPrice), sans maximum.
 * Un futur tenant avec une grille inédite ajoute un nouveau type ici —
 * jamais en forçant une forme existante à correspondre approximativement.
 */

const { getPublicConfig } = require('../config/tenants');

function findRoom(publicConfig, resourceSlug) {
  return (publicConfig.rooms || []).find((r) => r.id === resourceSlug) || null;
}

/**
 * describePricing(room) → texte prêt à insérer dans le prompt système de
 * l'agent conversationnel. Pure mise en forme — ne calcule aucun montant
 * pour une période précise (voir calculatePrice pour ça).
 */
function describePricing(room) {
  if (!room) return "tarif à confirmer avec l'équipe";
  if (room.pricingType === 'flatDay') {
    return `${room.dayRate} $ CAD pour la journée complète`;
  }
  if (room.pricingType === 'tiered' && room.tieredPricing) {
    const t = room.tieredPricing;
    return `à partir de ${t.basePrice} $ CAD pour ${t.baseHours} h incluses, +${t.perExtraHour} $/h supplémentaire, jusqu'à un maximum de ${t.maxHours} h (plafond ${t.maxPrice} $)`;
  }
  if (room.pricingType === 'packageTiers' && Array.isArray(room.packages)) {
    const list = room.packages.map((pkg) => `${pkg.hours} h : ${pkg.price} $ CAD`).join(', ');
    const extra = room.extraHourPrice ? ` (+${room.extraHourPrice} $ CAD/h au-delà du forfait le plus long, sans maximum communiqué)` : '';
    return `${list}${extra}`;
  }
  return "tarif à confirmer avec l'équipe";
}

/**
 * Calcul interne du sous-total "location de salle" pour `hours` données,
 * selon le type de grille du room. Retourne { ok:false, message } si la
 * durée dépasse une limite tarifaire connue, sinon { ok:true, subtotal,
 * billedHours }. N'inclut jamais le ménage ni le dépôt — voir calculatePrice.
 */
function computeRoomSubtotal(room, hours) {
  if (room.pricingType === 'flatDay') {
    return { ok: true, subtotal: room.dayRate, billedHours: null };
  }

  if (room.pricingType === 'tiered' && room.tieredPricing) {
    const t = room.tieredPricing;
    const billedHours = Math.ceil(hours);
    if (billedHours > t.maxHours) {
      return { ok: false, message: `Cette durée dépasse le maximum autorisé pour ${room.name || 'cette salle'} (${t.maxHours} h).` };
    }
    const subtotal = billedHours <= t.baseHours
      ? t.basePrice
      : Math.min(t.basePrice + (billedHours - t.baseHours) * t.perExtraHour, t.maxPrice);
    return { ok: true, subtotal, billedHours };
  }

  if (room.pricingType === 'packageTiers' && Array.isArray(room.packages)) {
    const billedHours = Math.ceil(hours);
    const sorted = room.packages.slice().sort((a, b) => a.hours - b.hours);
    const fitting = sorted.find((pkg) => billedHours <= pkg.hours);
    if (fitting) {
      return { ok: true, subtotal: fitting.price, billedHours };
    }
    const longest = sorted[sorted.length - 1];
    const extraHours = billedHours - longest.hours;
    const perExtra = room.extraHourPrice || 0;
    return { ok: true, subtotal: longest.price + extraHours * perExtra, billedHours };
  }

  return { ok: false, message: 'Configuration tarifaire manquante pour cette ressource.' };
}

/**
 * calculatePrice({ tenantId, resourceSlug, startIso, endIso, paymentOption,
 *                   cleaningSelected })
 *
 * SOURCE AUTORITAIRE unique du montant dû — jamais recalculée séparément
 * ailleurs. `paymentOption` ('deposit'|'full') n'est exigé QUE si le tenant
 * a une politique de dépôt réelle (reservation.depositPercentage non nul) ;
 * sinon le montant plein est toujours celui dû (aucun dépôt inventé pour un
 * tenant qui n'en a pas — voir Salle Le Potier).
 *
 * Retourne { ok:false, message } ou { ok:true, snapshot, amountDue, currency }.
 */
function calculatePrice({ tenantId, resourceSlug, startIso, endIso, paymentOption, cleaningSelected }) {
  const publicConfig = getPublicConfig(tenantId);
  if (!publicConfig) {
    return { ok: false, message: 'Entreprise inconnue.' };
  }

  const room = findRoom(publicConfig, resourceSlug);
  if (!room) {
    return { ok: false, message: 'Ressource inconnue.' };
  }

  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return { ok: false, message: 'Période de réservation invalide.' };
  }
  const hours = (endMs - startMs) / (1000 * 60 * 60);

  const roomResult = computeRoomSubtotal(room, hours);
  if (!roomResult.ok) {
    return { ok: false, message: roomResult.message };
  }

  const cleaningPrice = cleaningSelected && room.cleaningPrice ? room.cleaningPrice : 0;
  const subtotal = roomResult.subtotal + cleaningPrice;

  // Politique de dépôt : uniquement si explicitement configurée pour ce
  // tenant. `depositPercentage` null/absent = pas de notion de dépôt —
  // jamais un repli implicite à 50 % pour un tenant qui n'a pas cette
  // politique (voir kreovya/config/tenants.js de chaque tenant).
  const depositPercentage = publicConfig.reservation && publicConfig.reservation.depositPercentage;
  const hasDepositPolicy = typeof depositPercentage === 'number' && depositPercentage > 0;

  let effectivePaymentOption = paymentOption;
  if (!hasDepositPolicy) {
    // Un tenant sans politique de dépôt ne connaît qu'un seul montant dû :
    // le plein tarif. `paymentOption` reste accepté pour compatibilité
    // d'appel mais n'a aucun effet sur le montant.
    effectivePaymentOption = 'full';
  } else if (effectivePaymentOption !== 'deposit' && effectivePaymentOption !== 'full') {
    return { ok: false, message: 'Option de paiement invalide.' };
  }

  const depositAmount = hasDepositPolicy ? Math.round(subtotal * (depositPercentage / 100)) : null;
  const amountDue = effectivePaymentOption === 'full' ? subtotal : depositAmount;
  const currency = 'CAD';

  const snapshot = {
    resourceSlug: room.id,
    resourceName: room.name,
    pricingType: room.pricingType,
    billedHours: roomResult.billedHours,
    cleaningIncluded: cleaningPrice > 0,
    cleaningPrice: cleaningPrice > 0 ? cleaningPrice : null,
    subtotal,
    hasDepositPolicy,
    depositPercentage: hasDepositPolicy ? depositPercentage : null,
    depositAmount,
    currency,
    paymentOption: effectivePaymentOption,
    computedAt: new Date().toISOString(),
  };

  return { ok: true, snapshot, amountDue, currency };
}

module.exports = { calculatePrice, describePricing };
