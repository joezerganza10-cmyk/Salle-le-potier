/**
 * KREOVYA AI — Outil prepareReservationLink (logique pure, réutilisable)
 * ============================================================
 * prepareReservationLink({ tenantId, bookingId, requestOrigin })
 *
 * Crée un token opaque de préremplissage (prefill_tokens) associé à un HOLD
 * déjà validé, et retourne l'URL complète de /reservation à donner au
 * widget. Ne contient AUCUNE PII, ne contient jamais bookingId — jamais
 * exposée plus loin par l'appelant.
 *
 * `requestOrigin` (optionnel) : en-tête Origin de la requête HTTP reçue par
 * kreovya-agent.js. N'est utilisé comme base de reservationUrl QUE s'il
 * correspond exactement au domaine de Production configuré pour ce tenant,
 * ou à un sous-domaine Netlify de CE site (Deploy Preview/branch deploy) —
 * voir resolveAllowedWebsite ci-dessous. Sinon, repli sur le domaine
 * configuré du tenant (comportement historique, inchangé).
 *
 * Pont KREOVYA → /reservation (paiement existant du site, INCHANGÉ). Ne
 * touche ni PayPal, ni checkout_sessions/payments (Payment Server complet,
 * en pause).
 *
 * Réutilisée directement par kreovya-agent.js (require, jamais un
 * aller-retour HTTP interne).
 */

const crypto = require('crypto');
const { getTenant } = require('../config/tenants');
const { supabaseRequest } = require('../lib/supabaseRest');

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Détermine si `requestOrigin` (en-tête Origin de la requête HTTP reçue par
 * kreovya-agent.js — jamais une variable de build Netlify : DEPLOY_PRIME_URL
 * et DEPLOY_URL ne sont PAS disponibles au runtime d'une fonction Netlify,
 * seules URL/SITE_NAME/SITE_ID le sont, et URL y résout vers le domaine de
 * Production même en Deploy Preview) peut être utilisée comme base de
 * reservationUrl. Deux cas acceptés :
 *   - correspondance EXACTE avec le domaine de Production configuré pour ce
 *     tenant (comportement inchangé) ;
 *   - un sous-domaine Netlify de CE site précis (production Netlify, branch
 *     deploy ou Deploy Preview), reconnu via SITE_NAME (disponible au
 *     runtime), jamais une origine arbitraire fournie par le client.
 * Toute autre valeur (absente, falsifiée, autre site) est rejetée — repli
 * systématique sur le domaine configuré du tenant.
 */
function resolveAllowedWebsite(requestOrigin, configuredWebsite) {
  if (!requestOrigin) return configuredWebsite;
  if (requestOrigin === configuredWebsite) return requestOrigin;

  const siteName = process.env.SITE_NAME;
  if (siteName) {
    const previewPattern = new RegExp(`^https://([a-z0-9-]+--)?${escapeRegExp(siteName)}\\.netlify\\.app$`, 'i');
    if (previewPattern.test(requestOrigin)) return requestOrigin;
  }

  return configuredWebsite;
}

async function prepareReservationLink({ tenantId, bookingId, requestOrigin }) {
  const rawTenant = getTenant(tenantId);
  if (!rawTenant || rawTenant.active !== true) {
    return { ok: false, message: 'Entreprise inconnue ou inactive.' };
  }

  let bookingRows;
  try {
    const query = [
      `id=eq.${encodeURIComponent(bookingId)}`,
      `tenant_id=eq.${encodeURIComponent(tenantId)}`,
      'select=status,hold_expires_at',
    ].join('&');
    bookingRows = await supabaseRequest('bookings', { query });
  } catch {
    return { ok: false, message: 'Erreur serveur.' };
  }

  const booking = Array.isArray(bookingRows) && bookingRows[0];
  if (!booking) {
    return { ok: false, message: 'Réservation introuvable.' };
  }
  if (booking.status !== 'hold') {
    return { ok: false, message: "Cette réservation n'est plus active." };
  }

  // Token opaque haute entropie (256 bits) — jamais dérivé de bookingId,
  // aucune PII. C'est la SEULE chose que le navigateur reçoit.
  const token = crypto.randomBytes(32).toString('base64url');

  try {
    await supabaseRequest('prefill_tokens', {
      method: 'POST',
      body: { token, tenant_id: tenantId, booking_id: bookingId, expires_at: booking.hold_expires_at },
      quiet: true,
    });
  } catch {
    return { ok: false, message: 'Erreur serveur.' };
  }

  const configuredWebsite = ((rawTenant.public && rawTenant.public.business && rawTenant.public.business.website) || '').replace(/\/+$/, '');
  const website = resolveAllowedWebsite((requestOrigin || '').replace(/\/+$/, ''), configuredWebsite);
  const reservationUrl = `${website}/reservation?session=${encodeURIComponent(token)}`;

  return { ok: true, reservationUrl };
}

module.exports = { prepareReservationLink };
