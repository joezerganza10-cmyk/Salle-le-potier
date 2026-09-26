/**
 * KREOVYA AI — Outil createHold (logique pure, réutilisable)
 * ============================================================
 * createHold({ tenantId, leadId, resourceSlug, start, end, timezone })
 *
 * Crée un HOLD temporaire (durée fixe de 15 minutes, imposée par la fonction
 * SQL public.create_hold — jamais par ce module, jamais par l'appelant) sur
 * un créneau réel, pour un prospect déjà validé.
 *
 * Toute la logique transactionnelle (nettoyage des HOLD expirés, un seul
 * HOLD actif par prospect, arbitrage final anti-chevauchement via
 * bookings_no_overlap) vit dans la RPC PostgreSQL public.create_hold. Ce
 * module se contente de :
 *   1. résoudre resourceSlug en un resource_id réel (jamais fait confiance
 *      à un id fourni directement) ;
 *   2. appeler la RPC avec des paramètres déjà validés côté serveur ;
 *   3. traduire son résultat en un contrat stable pour kreovya-agent.js.
 *
 * `tenantId` et `leadId` sont des contextes déjà validés par l'appelant
 * (kreovya-agent.js : tenantId via getPublicConfig, leadId via
 * getLeadContext) — jamais fournis par Claude. `resourceSlug`/`start`/`end`
 * proviennent du modèle (après résolution timezone par
 * kreovya-agent.js/resolveBookingPeriod) mais sont revalidés ici : ce module
 * ne fait pas plus confiance à son appelant que la RPC ne fait confiance à
 * ce module — chaque couche revérifie.
 *
 * Un HOLD ne signifie JAMAIS une réservation confirmée ni un paiement reçu.
 * La formulation imposée au visiteur vit dans buildSystemPrompt
 * (kreovya-agent.js), pas ici.
 */

const { supabaseRequest, supabaseRpc } = require('../lib/supabaseRest');
const { isValidUuid } = require('./leadValidation');
const { describeInstantInZone } = require('../lib/timezone');
const { parseRangeBounds } = require('../lib/postgresRange');

// Même règle que checkAvailability.js : un instant absolu non ambigu
// (fuseau horaire explicite), jamais une heure locale nue.
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;

function validateInput({ tenantId, leadId, resourceSlug, start, end }) {
  if (typeof tenantId !== 'string' || !tenantId.trim()) {
    return 'Paramètre "tenantId" requis.';
  }
  if (!isValidUuid(leadId)) {
    return 'Paramètre "leadId" invalide.';
  }
  if (typeof resourceSlug !== 'string' || !resourceSlug.trim()) {
    return 'Paramètre "resourceSlug" requis.';
  }
  if (typeof start !== 'string' || !ISO_WITH_OFFSET.test(start)) {
    return 'Paramètre "start" invalide.';
  }
  if (typeof end !== 'string' || !ISO_WITH_OFFSET.test(end)) {
    return 'Paramètre "end" invalide.';
  }
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (isNaN(startDate.getTime())) return 'Paramètre "start" invalide.';
  if (isNaN(endDate.getTime())) return 'Paramètre "end" invalide.';
  if (endDate.getTime() <= startDate.getTime()) {
    return 'Paramètre "end" doit être postérieur à "start".';
  }
  return null;
}

// Identique à checkAvailability.js : résolution réelle de la ressource,
// jamais un id fait confiance tel quel.
async function findActiveResource(tenantId, resourceSlug) {
  const query = [
    `tenant_id=eq.${encodeURIComponent(tenantId)}`,
    `slug=eq.${encodeURIComponent(resourceSlug)}`,
    'select=id,slug,name,active',
  ].join('&');
  const rows = await supabaseRequest('resources', { query });
  if (!Array.isArray(rows) || rows.length === 0) return { found: false };
  const resource = rows[0];
  return { found: true, resource, inactive: resource.active !== true };
}

// Résolution par id (pas par slug) : utilisée pour retrouver la ressource du
// HOLD EXISTANT d'un prospect lorsque la RPC refuse d'en créer un second.
async function findResourceById(tenantId, resourceId) {
  const query = [
    `id=eq.${encodeURIComponent(resourceId)}`,
    `tenant_id=eq.${encodeURIComponent(tenantId)}`,
    'select=id,slug,name',
  ].join('&');
  const rows = await supabaseRequest('resources', { query });
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

// parseRangeBounds() vit désormais dans kreovya/lib/postgresRange.js (extraction
// pure, sans changement de comportement — réutilisé par create-checkout-session.js).

/**
 * Reconstruit, exclusivement à partir de données réellement retrouvées côté
 * serveur, les informations du HOLD actif déjà détenu par ce prospect —
 * jamais à partir de la demande courante, jamais devinées. Retourne null au
 * moindre échec (ligne introuvable, ressource introuvable, plage
 * illisible...) : c'est le mécanisme "fail closed" — un échec de
 * récupération ne doit jamais se traduire par une information inventée
 * transmise au modèle.
 */
async function buildExistingHoldDetails(tenantId, leadId, bookingId, timezone) {
  try {
    if (!bookingId) return null;
    const query = [
      `id=eq.${encodeURIComponent(bookingId)}`,
      `tenant_id=eq.${encodeURIComponent(tenantId)}`,
      `reservation_request_id=eq.${encodeURIComponent(leadId)}`,
      'select=resource_id,period,hold_expires_at',
      'limit=1',
    ].join('&');
    const rows = await supabaseRequest('bookings', { query, quiet: true });
    const row = Array.isArray(rows) && rows.length ? rows[0] : null;
    if (!row) return null;

    const resource = await findResourceById(tenantId, row.resource_id);
    if (!resource) return null;

    const bounds = parseRangeBounds(row.period);
    if (!bounds) return null;

    const startLocal = describeInstantInZone(bounds.lowerMs, timezone);
    const endLocal = describeInstantInZone(bounds.upperMs, timezone);

    return {
      resourceSlug: resource.slug,
      resourceName: resource.name,
      date: startLocal.date,
      startTime: startLocal.time,
      endTime: endLocal.time,
      holdExpiresAt: row.hold_expires_at,
    };
  } catch {
    return null;
  }
}

async function createHold({ tenantId, leadId, resourceSlug, start, end, timezone }) {
  const validationError = validateInput({ tenantId, leadId, resourceSlug, start, end });
  if (validationError) {
    return { ok: false, status: 400, message: validationError };
  }

  let lookup;
  try {
    lookup = await findActiveResource(tenantId, resourceSlug);
  } catch {
    return { ok: false, status: 502, message: 'Erreur lors de la vérification de la ressource.' };
  }

  if (!lookup.found) {
    return { ok: false, status: 404, message: `Ressource inconnue : "${resourceSlug}".` };
  }
  if (lookup.inactive) {
    return { ok: false, status: 404, message: `Ressource inactive : "${resourceSlug}".` };
  }

  // Littéral de plage Postgres [start,end) — même convention demi-ouverte
  // que bookings_no_overlap et que le filtre de checkAvailability.js.
  const periodLiteral = `[${start},${end})`;

  let rpcResult;
  try {
    rpcResult = await supabaseRpc(
      'create_hold',
      {
        p_tenant_id: tenantId,
        p_resource_id: lookup.resource.id,
        p_period: periodLiteral,
        p_reservation_request_id: leadId,
      },
      { quiet: true } // le résultat peut contenir un bookingId lié à des données personnelles
    );
  } catch {
    return { ok: false, status: 502, message: 'Erreur lors de la création du blocage temporaire.' };
  }

  const outcome = rpcResult && rpcResult.outcome;
  const resourceInfo = { slug: lookup.resource.slug, name: lookup.resource.name };

  if (outcome === 'held' || outcome === 'already_held') {
    return {
      ok: true,
      result: {
        outcome,
        bookingId: rpcResult.bookingId,
        resource: resourceInfo,
        period: { start, end },
        holdExpiresInMinutes: rpcResult.holdExpiresInMinutes || 15,
      },
    };
  }

  if (outcome === 'lead_has_active_hold') {
    // Le tool_result doit permettre à Claude de décrire CORRECTEMENT le HOLD
    // existant (autre salle/créneau que celui demandé) plutôt que de laisser
    // un vide qu'il pourrait combler en confondant la demande actuelle avec
    // le blocage déjà actif. existingHold:null (fail closed) si la
    // récupération échoue pour une raison quelconque — jamais une donnée
    // approximative ou devinée à la place.
    const existingHold = await buildExistingHoldDetails(tenantId, leadId, rpcResult.bookingId, timezone);
    return {
      ok: true,
      result: { outcome, requestedHoldCreated: false, existingHold },
    };
  }

  if (outcome === 'slot_taken') {
    // Volontairement minimal : aucun détail sur le HOLD d'un AUTRE prospect
    // n'est exposé ici — Claude n'a besoin que de savoir que ce créneau est
    // pris par quelqu'un d'autre pour formuler une réponse conversationnelle.
    return { ok: true, result: { outcome } };
  }

  if (outcome === 'invalid_lead' || outcome === 'invalid_resource' || outcome === 'invalid_period') {
    // Ne devrait jamais se produire en fonctionnement normal : tenantId,
    // leadId et resourceSlug sont déjà validés avant d'arriver ici. La RPC
    // reste la frontière ultime, pas une confirmation attendue.
    return { ok: false, status: 409, message: 'Impossible de créer ce blocage temporaire pour le moment.' };
  }

  return { ok: false, status: 502, message: 'Réponse inattendue lors de la création du blocage temporaire.' };
}

module.exports = { createHold };
