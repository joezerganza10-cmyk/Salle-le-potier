/**
 * KREOVYA CORE — Résolution sécurisée d'un token de préremplissage
 * ============================================================
 * Utilisé par netlify/functions/resolve-reservation-prefill.js (affichage
 * /reservation) ET netlify/functions/verify-payment.js (paiement) — UNE
 * SEULE implémentation de la frontière de sécurité multi-tenant, plutôt
 * que deux copies pouvant diverger (voir l'audit du 28 septembre 2026 :
 * une copie avait laissé passer un token d'un autre tenant).
 *
 * FRONTIÈRE MULTI-TENANT :
 * `prefill_tokens` est une table PARTAGÉE entre tous les tenants (même
 * projet Supabase). La recherche du token est bornée dès la requête
 * Supabase à `listTenantIds()` — les tenants que CE déploiement sert
 * réellement (source d'autorité serveur, jamais une valeur du navigateur)
 * — si bien qu'une ligne d'un autre tenant n'est même jamais rapatriée.
 *
 * DÉFENSE EN PROFONDEUR — chaque relation est revérifiée EXPLICITEMENT
 * contre ce même tenantId (booking, resource, lead), via
 * assertTenantOwnership. Toute incohérence, à n'importe quel maillon,
 * déclenche un refus FAIL CLOSED de la résolution ENTIÈRE — jamais un
 * résultat partiel (ex. jamais `lead:null` pour masquer une incohérence :
 * un lead manquant/incohérent invalide tout le token, puisqu'un booking
 * réel a TOUJOURS un reservation_request_id valide en fonctionnement
 * normal — voir kreovya/tools/createHold.js et la RPC create_hold).
 */

const { supabaseRequest } = require('./supabaseRest');
const { getServerTenantContext, assertTenantOwnership } = require('./tenantContext');

const GENERIC_NOT_FOUND = { ok: false, status: 404, message: 'Lien de réservation introuvable.' };

/**
 * resolvePrefillToken(token) → { ok:false, status, message } ou
 * { ok:true, tenantId, bookingId, booking, resource, lead }.
 *
 * `booking` : { status, hold_expires_at, resource_id, period, reservation_request_id }
 * `resource` : { slug, name } (peut être null si la ressource a été désactivée
 *               depuis — ne bloque pas la résolution, l'appelant décide).
 * `lead` : { full_name, phone, email, event_type, party_size } — TOUJOURS
 *          présent si la résolution réussit (fail-closed sinon, voir plus haut).
 */
async function resolvePrefillToken(token) {
  if (typeof token !== 'string' || !token.trim()) {
    return { ok: false, status: 400, message: 'Paramètre "session" requis.' };
  }

  const { allowedTenantIds } = getServerTenantContext();
  if (allowedTenantIds.length === 0) {
    console.error('[resolvePrefillToken] Aucun tenant actif configuré sur ce site.');
    return GENERIC_NOT_FOUND;
  }

  let tokenRows;
  try {
    const query = [
      `token=eq.${encodeURIComponent(token)}`,
      `tenant_id=in.(${allowedTenantIds.map(encodeURIComponent).join(',')})`,
      'select=tenant_id,booking_id',
      'limit=1',
    ].join('&');
    tokenRows = await supabaseRequest('prefill_tokens', { query, quiet: true });
  } catch (err) {
    console.error('[resolvePrefillToken] Erreur lecture token', err && err.message);
    return { ok: false, status: 502, message: 'Erreur serveur.' };
  }
  const tokenRow = Array.isArray(tokenRows) && tokenRows[0];
  if (!tokenRow) {
    // Générique : token inexistant, expiré, OU d'un autre tenant —
    // indiscernable pour l'appelant.
    return GENERIC_NOT_FOUND;
  }

  const tenantId = tokenRow.tenant_id;
  const bookingId = tokenRow.booking_id;

  let bookingRows;
  try {
    const query = [
      `id=eq.${encodeURIComponent(bookingId)}`,
      `tenant_id=eq.${encodeURIComponent(tenantId)}`,
      'select=tenant_id,status,hold_expires_at,resource_id,period,reservation_request_id',
    ].join('&');
    bookingRows = await supabaseRequest('bookings', { query });
  } catch (err) {
    console.error('[resolvePrefillToken] Erreur lecture booking', err && err.message);
    return { ok: false, status: 502, message: 'Erreur serveur.' };
  }
  const booking = Array.isArray(bookingRows) && bookingRows[0];
  if (!booking || !assertTenantOwnership(booking, tenantId, 'booking')) {
    return { ok: false, status: 404, message: 'Réservation introuvable.' };
  }

  // Le lead est une relation OBLIGATOIRE d'un booking réel (voir
  // kreovya/tools/createHold.js : reservation_request_id est toujours
  // fourni à la RPC create_hold). Son absence ou son appartenance à un
  // autre tenant est donc toujours une incohérence réelle — jamais un état
  // normal à masquer silencieusement.
  let lead = null;
  if (booking.reservation_request_id) {
    let leadRows;
    try {
      const query = [
        `id=eq.${encodeURIComponent(booking.reservation_request_id)}`,
        `tenant_id=eq.${encodeURIComponent(tenantId)}`,
        'select=tenant_id,full_name,phone,email,event_type,party_size',
        'limit=1',
      ].join('&');
      leadRows = await supabaseRequest('reservation_requests', { query, quiet: true });
    } catch (err) {
      console.error('[resolvePrefillToken] Erreur lecture lead', err && err.message);
      return { ok: false, status: 502, message: 'Erreur serveur.' };
    }
    const leadRow = Array.isArray(leadRows) && leadRows[0];
    if (!leadRow || !assertTenantOwnership(leadRow, tenantId, 'lead')) {
      // FAIL CLOSED : un booking réel sans lead cohérent pour ce tenant est
      // une incohérence, pas une réservation "sans prospect" légitime.
      return { ok: false, status: 404, message: 'Réservation introuvable.' };
    }
    lead = leadRow;
  } else {
    // Ne devrait jamais arriver (voir commentaire ci-dessus) — traité comme
    // une incohérence plutôt que supposé "pas de prospect associé".
    console.error('[resolvePrefillToken] Booking sans reservation_request_id — incohérence inattendue.', bookingId);
    return { ok: false, status: 404, message: 'Réservation introuvable.' };
  }

  let resource = null;
  if (booking.resource_id) {
    let resourceRows;
    try {
      const query = [
        `id=eq.${encodeURIComponent(booking.resource_id)}`,
        `tenant_id=eq.${encodeURIComponent(tenantId)}`,
        'select=tenant_id,slug,name',
        'limit=1',
      ].join('&');
      resourceRows = await supabaseRequest('resources', { query });
    } catch (err) {
      console.error('[resolvePrefillToken] Erreur lecture resource', err && err.message);
      return { ok: false, status: 502, message: 'Erreur serveur.' };
    }
    const resourceRow = Array.isArray(resourceRows) && resourceRows[0];
    if (!resourceRow || !assertTenantOwnership(resourceRow, tenantId, 'resource')) {
      // La ressource elle-même est structurellement impossible à mélanger
      // entre tenants (FK composite resources(id, tenant_id) — voir schéma),
      // mais une ressource désactivée/supprimée après coup reste possible :
      // fail-closed ici aussi plutôt que de renvoyer un nom de salle vide.
      return { ok: false, status: 404, message: 'Réservation introuvable.' };
    }
    resource = resourceRow;
  }

  return {
    ok: true,
    tenantId,
    bookingId,
    booking,
    resource: resource ? { slug: resource.slug, name: resource.name } : null,
    lead: {
      fullName: lead.full_name || null,
      phone: lead.phone || null,
      email: lead.email || null,
      eventType: lead.event_type || null,
      partySize: lead.party_size || null,
    },
  };
}

module.exports = { resolvePrefillToken };
