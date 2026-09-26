/**
 * KREOVYA AI — getLeadContext (mécanisme interne, JAMAIS exposé à Anthropic)
 * ============================================================
 * getLeadContext({ tenantId, leadId })
 *
 * Vérifie RÉELLEMENT si un leadId correspond à un prospect existant pour ce
 * tenant précis, et retourne uniquement les champs métier utiles à la
 * conversation — jamais status/source/created_at/id/tenant_id.
 *
 * IMPORTANT : un leadId syntaxiquement valide (format UUID) n'est jamais une
 * preuve d'existence. Cette fonction est le SEUL moyen autorisé de décider
 * si un lead existe réellement avant de choisir entre createLead et
 * updateLead dans kreovya-agent.js.
 *
 * Retourne toujours l'un de ces trois états — jamais un simple booléen —
 * car une incertitude technique n'est PAS équivalente à une absence de lead :
 *   - { status: 'found', lead: {...} }   la ligne existe pour ce tenant.
 *   - { status: 'not_found' }            la requête a réussi mais 0 ligne ne
 *                                        correspond (leadId inexistant,
 *                                        appartenant à un autre tenant, ou
 *                                        syntaxiquement invalide — ces trois
 *                                        cas sont volontairement indiscernables
 *                                        pour l'appelant).
 *   - { status: 'error' }                impossible de déterminer l'état
 *                                        (Supabase, réseau...) : ne doit
 *                                        JAMAIS être traité comme not_found
 *                                        par l'appelant, sous peine de créer
 *                                        un doublon ou de perdre l'accès à un
 *                                        lead réellement existant.
 *
 * Claude n'appelle jamais cette fonction — c'est un mécanisme serveur pur,
 * invoqué avant le premier appel Anthropic.
 *
 * Confidentialité : lecture avec `quiet:true` (les champs retournés peuvent
 * contenir des données personnelles) — jamais journalisée en détail.
 */

const { supabaseRequest } = require('../lib/supabaseRest');
const { isValidUuid } = require('./leadValidation');

async function getLeadContext({ tenantId, leadId }) {
  // Une forme invalide (tenantId absent, UUID malformé) est une conclusion
  // DÉFINITIVE — jamais un aléa technique — donc 'not_found', pas 'error'.
  if (typeof tenantId !== 'string' || !tenantId.trim()) return { status: 'not_found' };
  if (!isValidUuid(leadId)) return { status: 'not_found' };

  let rows;
  try {
    const query = [
      `id=eq.${encodeURIComponent(leadId)}`,
      `tenant_id=eq.${encodeURIComponent(tenantId)}`,
      'select=full_name,phone,email,event_type,party_size,resource_slug,desired_date,desired_start,desired_end',
      'limit=1',
    ].join('&');
    rows = await supabaseRequest('reservation_requests', { query, quiet: true });
  } catch {
    // Panne transitoire (réseau, Supabase, permissions...) : l'existence du
    // lead reste réellement inconnue. Ne JAMAIS assimiler ceci à "non
    // trouvé" — l'appelant doit suspendre createLead ET updateLead tant que
    // l'appartenance du lead n'a pas pu être vérifiée.
    return { status: 'error' };
  }

  const lead = Array.isArray(rows) ? rows[0] : null;
  if (!lead) return { status: 'not_found' };

  return {
    status: 'found',
    lead: {
      fullName: lead.full_name || null,
      phone: lead.phone || null,
      email: lead.email || null,
      eventType: lead.event_type || null,
      partySize: lead.party_size || null,
      resourceSlug: lead.resource_slug || null,
      desiredDate: lead.desired_date || null,
      desiredStart: lead.desired_start || null,
      desiredEnd: lead.desired_end || null,
    },
  };
}

module.exports = { getLeadContext };
