/**
 * KREOVYA AI — GET /resolve-reservation-prefill?session=<token>
 * ============================================================
 * Appelée par /reservation (index.html) au chargement, lorsqu'un
 * ?session=<token> KREOVYA est présent. Lecture seule, rejouable sans effet
 * de bord. Ne retourne jamais bookingId ni aucun identifiant interne.
 *
 * Revérifie TOUJOURS l'état réel du booking (status='hold', hold_expires_at
 * > now()) — jamais une copie figée qui pourrait devenir mensongère.
 *
 * La résolution du token (frontière multi-tenant : prefill_tokens est une
 * table PARTAGÉE entre tenants) vit désormais dans le module partagé
 * kreovya/lib/resolvePrefillToken.js — utilisé identiquement par
 * verify-payment.js, pour qu'une seule implémentation porte cette garantie
 * de sécurité (voir l'audit du 28 septembre 2026).
 */

const { resolvePrefillToken } = require('../../kreovya/lib/resolvePrefillToken');
const { parseRangeBounds } = require('../../kreovya/lib/postgresRange');
const { describeInstantInZone } = require('../../kreovya/lib/timezone');
const { getTenant } = require('../../kreovya/config/tenants');

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return json(405, { success: false, message: 'Méthode non autorisée.' });
  }

  const token = event.queryStringParameters && event.queryStringParameters.session;

  const resolved = await resolvePrefillToken(token);
  if (!resolved.ok) {
    return json(resolved.status, { success: false, message: resolved.message });
  }

  const { tenantId, booking, resource, lead } = resolved;
  const rawTenant = getTenant(tenantId);
  const timezone = (rawTenant && rawTenant.internal && rawTenant.internal.timezone) || 'UTC';

  if (booking.status === 'confirmed') {
    return json(200, { success: true, status: 'confirmed' });
  }

  // Relecture FRAÎCHE de l'état réel — jamais une copie figée. Un HOLD
  // toujours marqué 'hold' en base mais dont l'échéance est dépassée est
  // traité ici exactement comme expiré (nettoyage paresseux non encore passé).
  if (booking.status !== 'hold' || new Date(booking.hold_expires_at).getTime() <= Date.now()) {
    return json(409, { success: false, message: 'Le délai de réservation a expiré. Veuillez vérifier de nouveau la disponibilité.' });
  }

  const bounds = parseRangeBounds(booking.period);
  let period = null;
  if (bounds) {
    const startLocal = describeInstantInZone(bounds.lowerMs, timezone);
    const endLocal = describeInstantInZone(bounds.upperMs, timezone);
    period = { date: startLocal.date, startTime: startLocal.time, endTime: endLocal.time };
  }

  return json(200, {
    success: true,
    status: 'hold',
    holdExpiresAt: booking.hold_expires_at,
    resource,
    period,
    partySize: lead.partySize,
    eventType: lead.eventType,
    lead: { fullName: lead.fullName, phone: lead.phone, email: lead.email },
    // Aucun identifiant PayPal propre à Salle Le Potier n'existe encore (voir
    // verify-payment.js) — permet à la page /reservation d'afficher un état
    // "paiement en cours de configuration" plutôt qu'un bouton PayPal cassé,
    // sans jamais faire confiance à cette valeur pour la sécurité côté
    // serveur (verify-payment.js revérifie indépendamment).
    paymentEnabled: !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET
      && (process.env.PAYPAL_ENV === 'sandbox' || process.env.PAYPAL_ENV === 'live')),
    // PAYPAL_CLIENT_ID est une valeur PUBLIQUE (documentée comme telle par
    // PayPal, nécessaire au SDK JS côté navigateur) — jamais
    // PAYPAL_CLIENT_SECRET, jamais service_role.
    paypalClientId: process.env.PAYPAL_CLIENT_ID || null,
  });
};
