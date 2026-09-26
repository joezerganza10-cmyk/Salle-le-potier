/**
 * KREOVYA AI — Outil checkAvailability (logique pure, réutilisable)
 * ============================================================
 * checkAvailability({ tenantId, resourceSlug, start, end })
 *
 * Vérifie réellement dans Supabase si une ressource (salle, table,
 * poste...) est libre sur une période précise, pour un tenant donné.
 * Générique : aucune donnée métier propre à un tenant codée en dur ici — tout
 * vient des tables `resources`/`bookings`, filtrées par tenant_id.
 *
 * Lecture seule : ne crée, ne modifie, ne supprime jamais rien.
 *
 * Réutilisable tel quel par netlify/functions/kreovya-tool-check-availability.js
 * (test isolé) et, plus tard, par kreovya-agent.js (appel direct via
 * require, sans aller-retour HTTP interne).
 */

const { supabaseRequest } = require('../lib/supabaseRest');

// Timestamp ISO 8601 avec fuseau horaire EXPLICITE (Z ou ±hh:mm) obligatoire.
// On ne suppose jamais le fuseau horaire du serveur Netlify : c'est à
// l'appelant (plus tard kreovya-agent.js, à partir du fuseau du tenant)
// de fournir des instants absolus non ambigus.
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;

function validateInput({ tenantId, resourceSlug, start, end }) {
  if (typeof tenantId !== 'string' || !tenantId.trim()) {
    return 'Paramètre "tenantId" requis.';
  }
  if (typeof resourceSlug !== 'string' || !resourceSlug.trim()) {
    return 'Paramètre "resourceSlug" requis.';
  }
  if (typeof start !== 'string' || !ISO_WITH_OFFSET.test(start)) {
    return 'Paramètre "start" invalide : timestamp ISO 8601 avec fuseau horaire explicite requis (ex. 2026-12-05T18:00:00-05:00).';
  }
  if (typeof end !== 'string' || !ISO_WITH_OFFSET.test(end)) {
    return 'Paramètre "end" invalide : timestamp ISO 8601 avec fuseau horaire explicite requis (ex. 2026-12-05T23:00:00-05:00).';
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

/**
 * Un hold expiré ne doit jamais bloquer une disponibilité. Plutôt que de
 * modifier des lignes (cet outil est lecture seule), le filtre exclut
 * directement les holds dont `hold_expires_at` est déjà passé, en
 * comparant à l'heure actuelle calculée ici (jamais via une fonction SQL
 * volatile dans une contrainte — voir la conception du schéma).
 *
 * `currentLeadId` : leadId déjà VÉRIFIÉ par getLeadContext côté appelant
 * (kreovya-agent.js), jamais un leadId brut fourni par Claude. Sert
 * uniquement à distinguer, dans le texte renvoyé au modèle, un conflit
 * appartenant au prospect courant (son propre HOLD actif — pas une
 * indisponibilité pour lui) d'un conflit appartenant à quelqu'un d'autre.
 * Un booking `confirmed` n'est JAMAIS traité comme "own_hold", même s'il
 * appartient au même prospect : c'est un état métier différent.
 */
async function findConflict(resourceId, start, end, currentLeadId) {
  const nowIso = new Date().toISOString();
  const query = [
    `resource_id=eq.${encodeURIComponent(resourceId)}`,
    `period=ov.[${encodeURIComponent(start)},${encodeURIComponent(end)})`,
    `or=(status.eq.confirmed,and(status.eq.hold,hold_expires_at.gt.${encodeURIComponent(nowIso)}))`,
    'select=id,status,reservation_request_id',
    'limit=1',
  ].join('&');
  // quiet:true car reservation_request_id est désormais lu (identifiant lié à un prospect).
  const rows = await supabaseRequest('bookings', { query, quiet: true });
  if (!Array.isArray(rows) || rows.length === 0) {
    return { hasConflict: false };
  }
  const row = rows[0];
  const isOwnHold = row.status === 'hold' && !!currentLeadId && row.reservation_request_id === currentLeadId;
  return { hasConflict: true, reason: isOwnHold ? 'own_hold' : 'conflict' };
}

async function checkAvailability({ tenantId, resourceSlug, start, end, currentLeadId }) {
  const validationError = validateInput({ tenantId, resourceSlug, start, end });
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

  const requestedPeriod = { start, end };
  const resourceInfo = { slug: lookup.resource.slug, name: lookup.resource.name };

  let conflict;
  try {
    conflict = await findConflict(lookup.resource.id, start, end, currentLeadId);
  } catch {
    return { ok: false, status: 502, message: 'Erreur lors de la vérification de la disponibilité.' };
  }

  if (conflict.hasConflict) {
    return {
      ok: true,
      result: { available: false, reason: conflict.reason, resource: resourceInfo, requestedPeriod },
    };
  }

  return {
    ok: true,
    result: { available: true, resource: resourceInfo, requestedPeriod },
  };
}

module.exports = { checkAvailability };
