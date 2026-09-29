// KREOVYA AI — Salle Le Potier — Vérifie et capture une commande PayPal
// ============================================================
// Pont KREOVYA générique (voir kreovya/lib/resolvePrefillToken.js et
// kreovya/lib/pricingEngine.js — partagés avec resolve-reservation-prefill.js
// et kreovya-agent.js) + verrouillage transactionnel propre au paiement
// (begin_prefill_payment, confirm_booking_from_prefill_token).
//
// PAIEMENT RÉEL VOLONTAIREMENT DÉSACTIVÉ tant que PAYPAL_CLIENT_ID /
// PAYPAL_CLIENT_SECRET / PAYPAL_ENV propres à Salle Le Potier ne sont pas
// configurés dans les variables d'environnement de CE site Netlify. Cette
// fonction ne lit JAMAIS les identifiants d'un autre tenant — il n'existe
// techniquement aucun moyen pour elle de le faire (site Netlify distinct,
// variables d'environnement distinctes). Si non configuré, elle refuse
// explicitement (fail closed) avant tout appel PayPal.

const { supabaseRpc } = require('../../kreovya/lib/supabaseRest');
const { parseRangeBounds } = require('../../kreovya/lib/postgresRange');
const { resolvePrefillToken } = require('../../kreovya/lib/resolvePrefillToken');
const { calculatePrice } = require('../../kreovya/lib/pricingEngine');

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
 * Résout un sessionToken KREOVYA → verrouille la fenêtre de paiement côté
 * Supabase (begin_prefill_payment, AVANT tout appel PayPal) → dérive
 * resourceSlug/hours RÉELS depuis le booking Supabase (jamais du navigateur).
 *
 * La frontière multi-tenant (prefill_tokens partagée entre tenants) vit
 * désormais dans kreovya/lib/resolvePrefillToken.js — même implémentation
 * que resolve-reservation-prefill.js, pour qu'un token d'un autre tenant ne
 * puisse jamais, ici non plus, déclencher un paiement.
 */
async function resolvePrefillBooking(sessionToken) {
  const resolved = await resolvePrefillToken(sessionToken);
  if (!resolved.ok) {
    return { ok: false, message: resolved.message };
  }
  const { tenantId, bookingId, booking, resource } = resolved;

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

  const bounds = parseRangeBounds(booking.period);
  if (!bounds) {
    return { ok: false, message: 'Erreur serveur.' };
  }

  if (!resource) {
    return { ok: false, message: 'Ressource introuvable.' };
  }

  return {
    ok: true,
    tenantId,
    bookingId,
    resourceSlug: resource.slug,
    startIso: new Date(bounds.lowerMs).toISOString(),
    endIso: new Date(bounds.upperMs).toISOString(),
  };
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

  const { orderID, sessionToken, paymentOption, cleaningSelected } = payload;
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

  // Source AUTORITAIRE unique du montant — la même que celle utilisée par
  // kreovya-agent.js pour décrire le tarif au visiteur (kreovya/lib/pricingEngine.js).
  const expected = calculatePrice({
    tenantId: resolved.tenantId,
    resourceSlug: resolved.resourceSlug,
    startIso: resolved.startIso,
    endIso: resolved.endIso,
    paymentOption,
    cleaningSelected,
  });
  if (!expected.ok) {
    return jsonResponse(400, { verified: false, message: expected.message });
  }
  const expectedAmount = expected.amountDue;

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
    const currencyMatches = capturedCurrency === expected.currency;

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
