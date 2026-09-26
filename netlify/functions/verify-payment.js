// KREOVYA AI — Salle Le Potier — Vérifie et capture une commande PayPal
// ============================================================
// Copie adaptée du pont KREOVYA validé sur salle906-site-deploy (même
// architecture : resolvePrefillBooking → begin_prefill_payment (verrouille la
// fenêtre AVANT tout appel PayPal) → capture PayPal → confirm_booking_from_
// prefill_token). Deux différences assumées pour Salle Le Potier :
//
//   1. Une seule salle, un seul tarif à deux forfaits fixes (4h/8h + heure
//      supplémentaire) — pas de notion de "dépôt" (aucune politique de dépôt
//      n'existe pour ce tenant, voir kreovya/config/tenants.js). Le montant
//      dû est TOUJOURS le prix plein du forfait applicable.
//
//   2. PAIEMENT RÉEL VOLONTAIREMENT DÉSACTIVÉ tant que PAYPAL_CLIENT_ID /
//      PAYPAL_CLIENT_SECRET / PAYPAL_ENV propres à Salle Le Potier ne sont
//      pas configurés dans les variables d'environnement de CE site Netlify.
//      Cette fonction ne lit JAMAIS les identifiants d'un autre tenant — il
//      n'existe techniquement aucun moyen pour elle de le faire (site Netlify
//      distinct, variables d'environnement distinctes). Si non configuré,
//      elle refuse explicitement (fail closed) avant tout appel PayPal.

const { supabaseRequest, supabaseRpc } = require('../../kreovya/lib/supabaseRest');
const { parseRangeBounds } = require('../../kreovya/lib/postgresRange');

// Doit rester synchronisé avec kreovya/config/tenants.js (rooms[0].packages).
const ROOM_PRICING = {
  principale: { packages: [{ hours: 4, price: 800 }, { hours: 8, price: 1200 }], extraHourPrice: 200 },
};

function computeExpectedAmount({ roomId, hours }) {
  const room = ROOM_PRICING[roomId];
  if (!room) return { error: 'unknown_room' };
  const safeHours = Number(hours) > 0 ? Number(hours) : room.packages[0].hours;
  const sorted = room.packages.slice().sort((a, b) => a.hours - b.hours);
  const fitting = sorted.find((pkg) => safeHours <= pkg.hours);
  if (fitting) return { amount: fitting.price };
  const longest = sorted[sorted.length - 1];
  const extraHours = Math.ceil(safeHours - longest.hours);
  return { amount: longest.price + extraHours * room.extraHourPrice };
}

function paymentConfigured() {
  const env = (process.env.PAYPAL_ENV || '').toLowerCase();
  return !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET && (env === 'sandbox' || env === 'live'));
}

const PAYPAL_ENV = (process.env.PAYPAL_ENV || '').toLowerCase();
const PAYPAL_API_BASE = PAYPAL_ENV === 'sandbox'
  ? 'https://api-m.sandbox.paypal.com'
  : 'https://api-m.paypal.com';

function jsonResponse(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

async function getAccessToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  const res = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error('Impossible d\'obtenir un jeton PayPal (identifiants invalides ?).');
  const data = await res.json();
  return data.access_token;
}

async function captureOrder(orderID, accessToken) {
  const res = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders/${orderID}/capture`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'PayPal-Request-Id': orderID,
    },
    body: '{}',
  });
  const data = await res.json().catch(() => null);

  if (!res.ok && data && Array.isArray(data.details) && data.details.some((d) => d.issue === 'ORDER_ALREADY_CAPTURED')) {
    const lookup = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders/${orderID}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const lookupData = await lookup.json().catch(() => null);
    return { ok: lookup.ok, data: lookupData };
  }

  return { ok: res.ok, data };
}

/**
 * Résout un sessionToken KREOVYA (prefill_tokens) → verrouille la fenêtre de
 * paiement côté Supabase (begin_prefill_payment) → dérive roomId/hours RÉELS
 * depuis le booking Supabase (jamais depuis le navigateur). Identique au
 * mécanisme validé sur salle906-site-deploy.
 */
async function resolvePrefillBooking(sessionToken) {
  let tokenRows;
  try {
    const query = [`token=eq.${encodeURIComponent(sessionToken)}`, 'select=tenant_id,booking_id', 'limit=1'].join('&');
    tokenRows = await supabaseRequest('prefill_tokens', { query, quiet: true });
  } catch {
    return { ok: false, message: 'Erreur serveur.' };
  }
  const tokenRow = Array.isArray(tokenRows) && tokenRows[0];
  if (!tokenRow) {
    return { ok: false, message: 'Lien de réservation introuvable.' };
  }
  const tenantId = tokenRow.tenant_id;
  const bookingId = tokenRow.booking_id;

  let rpcResult;
  try {
    rpcResult = await supabaseRpc('begin_prefill_payment', {
      p_tenant_id: tenantId,
      p_token: sessionToken,
      p_booking_id: bookingId,
    }, { quiet: true });
  } catch {
    return { ok: false, message: 'Erreur serveur.' };
  }

  const outcome = rpcResult && rpcResult.outcome;
  if (outcome !== 'authorized') {
    return { ok: false, message: 'Le délai de réservation a expiré. Veuillez vérifier de nouveau la disponibilité.' };
  }

  let bookingRows;
  try {
    const query = [
      `id=eq.${encodeURIComponent(bookingId)}`,
      `tenant_id=eq.${encodeURIComponent(tenantId)}`,
      'select=resource_id,period',
    ].join('&');
    bookingRows = await supabaseRequest('bookings', { query });
  } catch {
    return { ok: false, message: 'Erreur serveur.' };
  }
  const booking = Array.isArray(bookingRows) && bookingRows[0];
  if (!booking) {
    return { ok: false, message: 'Réservation introuvable.' };
  }

  const bounds = parseRangeBounds(booking.period);
  if (!bounds) {
    return { ok: false, message: 'Erreur serveur.' };
  }
  const hours = (bounds.upperMs - bounds.lowerMs) / (1000 * 60 * 60);

  let resourceRows;
  try {
    const query = [
      `id=eq.${encodeURIComponent(booking.resource_id)}`,
      `tenant_id=eq.${encodeURIComponent(tenantId)}`,
      'select=slug',
    ].join('&');
    resourceRows = await supabaseRequest('resources', { query });
  } catch {
    return { ok: false, message: 'Erreur serveur.' };
  }
  const resource = Array.isArray(resourceRows) && resourceRows[0];
  if (!resource) {
    return { ok: false, message: 'Ressource introuvable.' };
  }

  return { ok: true, tenantId, bookingId, roomId: resource.slug, hours };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { verified: false, message: 'Méthode non autorisée.' });
  }

  // FAIL CLOSED : aucun identifiant PayPal propre à Salle Le Potier n'existe
  // encore. Refus explicite AVANT même de lire le corps de la requête ou de
  // toucher à Supabase — jamais de repli silencieux vers un autre tenant.
  if (!paymentConfigured()) {
    return jsonResponse(503, {
      verified: false,
      message: 'Le paiement en ligne pour Salle Le Potier est en cours de configuration. Veuillez nous contacter directement pour finaliser votre réservation.',
    });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { verified: false, message: 'Requête invalide.' });
  }

  const { orderID, sessionToken } = payload;
  if (!orderID || typeof orderID !== 'string') {
    return jsonResponse(400, { verified: false, message: 'Identifiant de commande PayPal manquant.' });
  }
  if (typeof sessionToken !== 'string' || !sessionToken.trim()) {
    return jsonResponse(400, { verified: false, message: 'Session de réservation manquante.' });
  }

  const resolved = await resolvePrefillBooking(sessionToken.trim());
  if (!resolved.ok) {
    // STOP : aucun appel PayPal n'a lieu.
    return jsonResponse(409, { verified: false, message: resolved.message });
  }

  const expected = computeExpectedAmount({ roomId: resolved.roomId, hours: resolved.hours });
  if (expected.error === 'unknown_room') {
    return jsonResponse(400, { verified: false, message: 'Salle sélectionnée invalide.' });
  }
  const expectedAmount = expected.amount;

  try {
    const accessToken = await getAccessToken();
    const { ok, data } = await captureOrder(orderID, accessToken);

    if (!ok || !data) {
      return jsonResponse(200, { verified: false, message: 'PayPal a refusé le paiement. Aucun montant n\'a été débité.' });
    }

    const capture = data.purchase_units
      && data.purchase_units[0]
      && data.purchase_units[0].payments
      && data.purchase_units[0].payments.captures
      && data.purchase_units[0].payments.captures[0];

    if (!capture || data.status !== 'COMPLETED' || capture.status !== 'COMPLETED') {
      return jsonResponse(200, { verified: false, message: 'Le paiement n\'a pas été confirmé par PayPal. Veuillez réessayer.' });
    }

    const capturedAmount = parseFloat(capture.amount.value);
    const capturedCurrency = capture.amount.currency_code;
    const amountMatches = Math.abs(capturedAmount - expectedAmount) < 0.01;
    const currencyMatches = capturedCurrency === 'CAD';

    if (!amountMatches || !currencyMatches) {
      return jsonResponse(200, { verified: false, message: 'Le montant confirmé par PayPal ne correspond pas à la réservation. Veuillez réessayer ou nous contacter.' });
    }

    let bookingConfirmed = false;
    try {
      const confirmResult = await supabaseRpc('confirm_booking_from_prefill_token', {
        p_tenant_id: resolved.tenantId,
        p_token: sessionToken.trim(),
        p_booking_id: resolved.bookingId,
      }, { quiet: true });
      const confirmOutcome = confirmResult && confirmResult.outcome;
      bookingConfirmed = confirmOutcome === 'confirmed' || confirmOutcome === 'already_confirmed';
      if (!bookingConfirmed) {
        console.error('[verify-payment] Paiement vérifié mais confirmation Supabase échouée', confirmOutcome);
      }
    } catch (err) {
      console.error('[verify-payment] Erreur RPC confirm_booking_from_prefill_token', err && err.message);
    }

    return jsonResponse(200, {
      verified: true,
      orderId: data.id,
      captureId: capture.id,
      amount: capturedAmount,
      currency: capturedCurrency,
      bookingConfirmed,
    });
  } catch (err) {
    console.error('[verify-payment]', err);
    return jsonResponse(502, { verified: false, message: 'Une erreur est survenue lors de la vérification du paiement. Veuillez réessayer.' });
  }
};
