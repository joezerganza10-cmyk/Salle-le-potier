/**
 * KREOVYA AI — Outil createLead (logique pure, réutilisable)
 * ============================================================
 * createLead({ tenantId, fullName, phone, email, eventType, partySize,
 *              resourceSlug, desiredDate, desiredStart, desiredEnd, message })
 *
 * Enregistre un prospect issu d'une conversation KREOVYA dans la table
 * `reservation_requests`. Générique multi-tenant : aucune donnée métier
 * propre à un tenant codée en dur ici — tout vient de l'entrée + de
 * tenants.js pour valider le tenantId.
 *
 * Un lead n'occupe JAMAIS de créneau — aucun lien avec `bookings`/hold ici,
 * volontairement (voir la conception : prospect ≠ hold ≠ confirmé).
 *
 * `status` et `source` ne sont JAMAIS acceptés de l'appelant, même si le
 * corps de la requête les fournit : imposés par le serveur.
 *
 * Confidentialité : téléphone/courriel/message ne sont jamais journalisés
 * (voir l'option `quiet` de supabaseRequest) ni renvoyés dans la réponse —
 * seul un `leadId` est retourné après création.
 */

const { supabaseRequest } = require('../lib/supabaseRest');
const { isKnownTenant } = require('../config/tenants');
const {
  MAX_TEXT_LENGTH,
  MAX_MESSAGE_LENGTH,
  EMAIL_RE,
  DATE_RE,
  TIME_RE,
  normalizeString,
  normalizePartySize,
  isValidCalendarDate,
} = require('./leadValidation');

function validateAndNormalize(input) {
  const out = {};

  if (typeof input.tenantId !== 'string' || !input.tenantId.trim()) {
    return { error: 'Paramètre "tenantId" requis.' };
  }
  out.tenant_id = input.tenantId.trim();

  const fullName = normalizeString(input.fullName);
  if (fullName === undefined) return { error: 'Paramètre "fullName" invalide.' };
  if (fullName && fullName.length > MAX_TEXT_LENGTH) return { error: 'Paramètre "fullName" trop long.' };
  out.full_name = fullName;

  const phone = normalizeString(input.phone);
  if (phone === undefined) return { error: 'Paramètre "phone" invalide.' };
  if (phone && phone.length > MAX_TEXT_LENGTH) return { error: 'Paramètre "phone" trop long.' };
  out.phone = phone;

  const email = normalizeString(input.email);
  if (email === undefined) return { error: 'Paramètre "email" invalide.' };
  if (email && (email.length > MAX_TEXT_LENGTH || !EMAIL_RE.test(email))) {
    return { error: 'Paramètre "email" invalide.' };
  }
  out.email = email;

  const eventType = normalizeString(input.eventType);
  if (eventType === undefined) return { error: 'Paramètre "eventType" invalide.' };
  if (eventType && eventType.length > MAX_TEXT_LENGTH) return { error: 'Paramètre "eventType" trop long.' };
  out.event_type = eventType;

  const partySize = normalizePartySize(input.partySize);
  if (!partySize.ok) return { error: 'Paramètre "partySize" doit être un entier positif.' };
  out.party_size = partySize.value;

  // Pas de vérification contre la table `resources` : un lead peut mentionner
  // une salle avant même de s'être décidé, sans contrainte stricte de clé
  // étrangère (choix de conception assumé — voir reservation_requests.resource_slug).
  const resourceSlug = normalizeString(input.resourceSlug);
  if (resourceSlug === undefined) return { error: 'Paramètre "resourceSlug" invalide.' };
  if (resourceSlug && resourceSlug.length > MAX_TEXT_LENGTH) return { error: 'Paramètre "resourceSlug" trop long.' };
  out.resource_slug = resourceSlug;

  const desiredDate = normalizeString(input.desiredDate);
  if (desiredDate === undefined) return { error: 'Paramètre "desiredDate" invalide.' };
  if (desiredDate && (!DATE_RE.test(desiredDate) || !isValidCalendarDate(desiredDate))) {
    return { error: 'Paramètre "desiredDate" invalide : format AAAA-MM-JJ attendu.' };
  }
  out.desired_date = desiredDate;

  const desiredStart = normalizeString(input.desiredStart);
  if (desiredStart === undefined) return { error: 'Paramètre "desiredStart" invalide.' };
  if (desiredStart && !TIME_RE.test(desiredStart)) {
    return { error: 'Paramètre "desiredStart" invalide : format HH:MM attendu.' };
  }
  out.desired_start = desiredStart;

  const desiredEnd = normalizeString(input.desiredEnd);
  if (desiredEnd === undefined) return { error: 'Paramètre "desiredEnd" invalide.' };
  if (desiredEnd && !TIME_RE.test(desiredEnd)) {
    return { error: 'Paramètre "desiredEnd" invalide : format HH:MM attendu.' };
  }
  out.desired_end = desiredEnd;

  const message = normalizeString(input.message);
  if (message === undefined) return { error: 'Paramètre "message" invalide.' };
  if (message && message.length > MAX_MESSAGE_LENGTH) return { error: 'Paramètre "message" trop long.' };
  out.message = message;

  // Jamais fournis par l'appelant, quoi qu'envoie le client : imposés ici.
  out.source = 'kreovya-chat';
  out.status = 'new';

  return { data: out };
}

async function createLead(input) {
  if (typeof input.tenantId !== 'string' || !input.tenantId.trim()) {
    return { ok: false, status: 400, message: 'Paramètre "tenantId" requis.' };
  }
  if (!isKnownTenant(input.tenantId)) {
    return { ok: false, status: 404, message: `Entreprise inconnue ou inactive : "${input.tenantId}".` };
  }

  const validation = validateAndNormalize(input);
  if (validation.error) {
    return { ok: false, status: 400, message: validation.error };
  }

  let rows;
  try {
    rows = await supabaseRequest('reservation_requests', {
      method: 'POST',
      body: validation.data,
      quiet: true, // ce payload contient des données personnelles
    });
  } catch {
    return { ok: false, status: 502, message: "Erreur lors de l'enregistrement de la demande." };
  }

  const lead = Array.isArray(rows) ? rows[0] : rows;
  if (!lead || !lead.id) {
    return { ok: false, status: 502, message: "Erreur lors de l'enregistrement de la demande." };
  }

  return { ok: true, leadId: lead.id };
}

module.exports = { createLead };
