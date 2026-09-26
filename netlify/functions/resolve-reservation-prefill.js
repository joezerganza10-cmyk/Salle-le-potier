/**
 * KREOVYA AI — GET /resolve-reservation-prefill?session=<token>
 * ============================================================
 * Appelée par /reservation (index.html) au chargement, lorsqu'un
 * ?session=<token> KREOVYA est présent. Lecture seule, rejouable sans effet
 * de bord. Ne retourne jamais bookingId ni aucun identifiant interne.
 *
 * Revérifie TOUJOURS l'état réel du booking (status='hold', hold_expires_at
 * > now()) — jamais une copie figée qui pourrait devenir mensongère.
 */

const { supabaseRequest } = require('../../kreovya/lib/supabaseRest');
const { getTenant } = require('../../kreovya/config/tenants');
const { parseRangeBounds } = require('../../kreovya/lib/postgresRange');
const { describeInstantInZone } = require('../../kreovya/lib/timezone');

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return json(405, { success: false, message: 'Méthode non autorisée.' });
  }

  const token = event.queryStringParameters && event.queryStringParameters.session;
  if (typeof token !== 'string' || !token.trim()) {
    return json(400, { success: false, message: 'Paramètre "session" requis.' });
  }

  let tokenRows;
  try {
    const query = [`token=eq.${encodeURIComponent(token)}`, 'select=tenant_id,booking_id', 'limit=1'].join('&');
    tokenRows = await supabaseRequest('prefill_tokens', { query, quiet: true });
  } catch (err) {
    console.error('[resolve-reservation-prefill] Erreur lecture token', err && err.message);
    return json(502, { success: false, message: 'Erreur serveur.' });
  }
  const tokenRow = Array.isArray(tokenRows) && tokenRows[0];
  if (!tokenRow) {
    // Générique : ne révèle jamais si le token est malformé, inexistant, ou expiré.
    return json(404, { success: false, message: 'Lien de réservation introuvable.' });
  }

  const { tenant_id: tenantId, booking_id: bookingId } = tokenRow;
  const rawTenant = getTenant(tenantId);
  const timezone = (rawTenant && rawTenant.internal && rawTenant.internal.timezone) || 'UTC';

  let bookingRows;
  try {
    const query = [
      `id=eq.${encodeURIComponent(bookingId)}`,
      `tenant_id=eq.${encodeURIComponent(tenantId)}`,
      'select=status,hold_expires_at,resource_id,period,reservation_request_id',
    ].join('&');
    bookingRows = await supabaseRequest('bookings', { query });
  } catch (err) {
    console.error('[resolve-reservation-prefill] Erreur lecture booking', err && err.message);
    return json(502, { success: false, message: 'Erreur serveur.' });
  }
  const booking = Array.isArray(bookingRows) && bookingRows[0];
  if (!booking) {
    return json(404, { success: false, message: 'Réservation introuvable.' });
  }

  if (booking.status === 'confirmed') {
    return json(200, { success: true, status: 'confirmed' });
  }

  // Relecture FRAÎCHE de l'état réel — jamais une copie figée. Un HOLD
  // toujours marqué 'hold' en base mais dont l'échéance est dépassée est
  // traité ici exactement comme expiré (nettoyage paresseux non encore passé).
  if (booking.status !== 'hold' || new Date(booking.hold_expires_at).getTime() <= Date.now()) {
    return json(409, { success: false, message: 'Le délai de réservation a expiré. Veuillez vérifier de nouveau la disponibilité.' });
  }

  let resourceRows;
  try {
    const query = [
      `id=eq.${encodeURIComponent(booking.resource_id)}`,
      `tenant_id=eq.${encodeURIComponent(tenantId)}`,
      'select=slug,name',
    ].join('&');
    resourceRows = await supabaseRequest('resources', { query });
  } catch (err) {
    console.error('[resolve-reservation-prefill] Erreur lecture resource', err && err.message);
    return json(502, { success: false, message: 'Erreur serveur.' });
  }
  const resource = Array.isArray(resourceRows) && resourceRows[0];

  let lead = null;
  try {
    const query = [
      `id=eq.${encodeURIComponent(booking.reservation_request_id)}`,
      `tenant_id=eq.${encodeURIComponent(tenantId)}`,
      'select=full_name,phone,email,event_type,party_size',
    ].join('&');
    const leadRows = await supabaseRequest('reservation_requests', { query, quiet: true });
    lead = Array.isArray(leadRows) && leadRows[0] ? leadRows[0] : null;
  } catch (err) {
    console.warn('[resolve-reservation-prefill] Coordonnées du prospect indisponibles', err && err.message);
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
    resource: resource ? { slug: resource.slug, name: resource.name } : null,
    period,
    partySize: lead ? lead.party_size : null,
    eventType: lead ? lead.event_type : null,
    lead: lead ? { fullName: lead.full_name || null, phone: lead.phone || null, email: lead.email || null } : null,
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
