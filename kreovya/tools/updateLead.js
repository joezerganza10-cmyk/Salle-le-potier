/**
 * KREOVYA AI — Outil updateLead (logique pure, réutilisable)
 * ============================================================
 * updateLead({ tenantId, leadId, fullName?, phone?, email?, eventType?,
 *              partySize?, resourceSlug?, desiredDate?, desiredStart?,
 *              desiredEnd?, message? })
 *
 * Met à jour une demande déjà enregistrée (reservation_requests). Seuls les
 * champs métier explicitement présents dans l'appel sont modifiés — un champ
 * absent laisse la valeur existante intacte (fusion partielle, jamais un
 * remplacement complet).
 *
 * Ne touche JAMAIS : id, tenant_id, status, source, created_at — ces champs
 * ne sont même pas lus depuis l'entrée.
 *
 * leadId et tenantId ne sont JAMAIS une preuve suffisante à eux seuls : le
 * PATCH est filtré simultanément par id ET tenant_id. Si 0 ligne correspond
 * (leadId inexistant OU appartenant à un autre tenant), c'est traité comme
 * un échec générique — jamais de détail sur lequel des deux a échoué.
 *
 * Confidentialité : mêmes règles que createLead — jamais de PII journalisée.
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
  isValidUuid,
} = require('./leadValidation');

/**
 * Valide et normalise uniquement les champs PRÉSENTS dans `input`. Retourne
 * { error } ou { data } où `data` ne contient que les colonnes Supabase
 * correspondant aux champs réellement fournis (fusion partielle).
 */
function validatePartialUpdate(input) {
  const out = {};

  if ('fullName' in input && input.fullName !== undefined) {
    const fullName = normalizeString(input.fullName);
    if (fullName === undefined) return { error: 'Paramètre "fullName" invalide.' };
    if (fullName && fullName.length > MAX_TEXT_LENGTH) return { error: 'Paramètre "fullName" trop long.' };
    out.full_name = fullName;
  }

  if ('phone' in input && input.phone !== undefined) {
    const phone = normalizeString(input.phone);
    if (phone === undefined) return { error: 'Paramètre "phone" invalide.' };
    if (phone && phone.length > MAX_TEXT_LENGTH) return { error: 'Paramètre "phone" trop long.' };
    out.phone = phone;
  }

  if ('email' in input && input.email !== undefined) {
    const email = normalizeString(input.email);
    if (email === undefined) return { error: 'Paramètre "email" invalide.' };
    if (email && (email.length > MAX_TEXT_LENGTH || !EMAIL_RE.test(email))) {
      return { error: 'Paramètre "email" invalide.' };
    }
    out.email = email;
  }

  if ('eventType' in input && input.eventType !== undefined) {
    const eventType = normalizeString(input.eventType);
    if (eventType === undefined) return { error: 'Paramètre "eventType" invalide.' };
    if (eventType && eventType.length > MAX_TEXT_LENGTH) return { error: 'Paramètre "eventType" trop long.' };
    out.event_type = eventType;
  }

  if ('partySize' in input && input.partySize !== undefined) {
    const partySize = normalizePartySize(input.partySize);
    if (!partySize.ok) return { error: 'Paramètre "partySize" doit être un entier positif.' };
    out.party_size = partySize.value;
  }

  if ('resourceSlug' in input && input.resourceSlug !== undefined) {
    const resourceSlug = normalizeString(input.resourceSlug);
    if (resourceSlug === undefined) return { error: 'Paramètre "resourceSlug" invalide.' };
    if (resourceSlug && resourceSlug.length > MAX_TEXT_LENGTH) return { error: 'Paramètre "resourceSlug" trop long.' };
    out.resource_slug = resourceSlug;
  }

  if ('desiredDate' in input && input.desiredDate !== undefined) {
    const desiredDate = normalizeString(input.desiredDate);
    if (desiredDate === undefined) return { error: 'Paramètre "desiredDate" invalide.' };
    if (desiredDate && (!DATE_RE.test(desiredDate) || !isValidCalendarDate(desiredDate))) {
      return { error: 'Paramètre "desiredDate" invalide : format AAAA-MM-JJ attendu.' };
    }
    out.desired_date = desiredDate;
  }

  if ('desiredStart' in input && input.desiredStart !== undefined) {
    const desiredStart = normalizeString(input.desiredStart);
    if (desiredStart === undefined) return { error: 'Paramètre "desiredStart" invalide.' };
    if (desiredStart && !TIME_RE.test(desiredStart)) {
      return { error: 'Paramètre "desiredStart" invalide : format HH:MM attendu.' };
    }
    out.desired_start = desiredStart;
  }

  if ('desiredEnd' in input && input.desiredEnd !== undefined) {
    const desiredEnd = normalizeString(input.desiredEnd);
    if (desiredEnd === undefined) return { error: 'Paramètre "desiredEnd" invalide.' };
    if (desiredEnd && !TIME_RE.test(desiredEnd)) {
      return { error: 'Paramètre "desiredEnd" invalide : format HH:MM attendu.' };
    }
    out.desired_end = desiredEnd;
  }

  if ('message' in input && input.message !== undefined) {
    const message = normalizeString(input.message);
    if (message === undefined) return { error: 'Paramètre "message" invalide.' };
    if (message && message.length > MAX_MESSAGE_LENGTH) return { error: 'Paramètre "message" trop long.' };
    out.message = message;
  }

  if (Object.keys(out).length === 0) {
    return { error: 'Aucun champ à mettre à jour.' };
  }

  return { data: out };
}

async function updateLead(input) {
  if (typeof input.tenantId !== 'string' || !input.tenantId.trim()) {
    return { ok: false, status: 400, message: 'Paramètre "tenantId" requis.' };
  }
  if (!isKnownTenant(input.tenantId)) {
    return { ok: false, status: 404, message: `Entreprise inconnue ou inactive : "${input.tenantId}".` };
  }
  if (!isValidUuid(input.leadId)) {
    return { ok: false, status: 400, message: 'Paramètre "leadId" invalide.' };
  }

  const validation = validatePartialUpdate(input);
  if (validation.error) {
    return { ok: false, status: 400, message: validation.error };
  }

  const body = { ...validation.data, updated_at: new Date().toISOString() };

  let rows;
  try {
    const query = [
      `id=eq.${encodeURIComponent(input.leadId)}`,
      `tenant_id=eq.${encodeURIComponent(input.tenantId)}`,
    ].join('&');
    rows = await supabaseRequest('reservation_requests', {
      method: 'PATCH',
      query,
      body,
      quiet: true, // ce payload contient des données personnelles
    });
  } catch {
    return { ok: false, status: 502, message: 'Erreur lors de la mise à jour de la demande.' };
  }

  const updated = Array.isArray(rows) ? rows[0] : null;
  if (!updated) {
    // 0 ligne affectée : leadId inexistant OU appartenant à un autre tenant.
    // Message volontairement identique dans les deux cas.
    return { ok: false, status: 404, message: 'Demande introuvable.' };
  }

  return { ok: true, leadId: input.leadId };
}

module.exports = { updateLead };
