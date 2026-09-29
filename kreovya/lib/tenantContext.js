/**
 * KREOVYA CORE — Contexte tenant serveur (source d'autorité unique)
 * ============================================================
 * Regroupe en un seul endroit la question "quel(s) tenant(s) ce
 * déploiement sert-il, et cette entité lui appartient-elle réellement ?"
 * — pour qu'aucune fonction n'ait à réimplémenter sa propre logique de
 * confiance envers un tenantId.
 *
 * Le navigateur PEUT indiquer un tenantId (ex. pour router une
 * conversation vers le bon widget) mais cette indication n'est JAMAIS une
 * preuve d'autorisation : toute opération sensible doit revalider contre
 * `kreovya/config/tenants.js` de CE déploiement et/ou contre les relations
 * réelles en base (voir assertTenantOwnership).
 */

const { getTenant, getPublicConfig, isKnownTenant, listTenantIds } = require('../config/tenants');

/**
 * getServerTenantContext() → { allowedTenantIds }
 * La liste des tenants que CE site sert réellement — jamais déduite d'une
 * requête, jamais d'une variable fournie par le client. Aujourd'hui,
 * chaque déploiement KREOVYA sert exactement un tenant actif, mais rien
 * dans cette fonction ne suppose ce nombre.
 */
function getServerTenantContext() {
  return { allowedTenantIds: listTenantIds() };
}

/**
 * resolveTenantConfig(tenantId) → { ok:false, message } si tenantId n'est
 * pas un tenant actif de CE site, sinon { ok:true, tenantId, rawTenant,
 * publicConfig }. Point d'entrée unique recommandé pour toute fonction qui
 * a besoin à la fois de la config publique ET de la config interne.
 */
function resolveTenantConfig(tenantId) {
  if (typeof tenantId !== 'string' || !tenantId.trim()) {
    return { ok: false, message: 'Paramètre "tenantId" requis.' };
  }
  const { allowedTenantIds } = getServerTenantContext();
  if (!allowedTenantIds.includes(tenantId)) {
    // Message volontairement générique : ne confirme ni n'infirme
    // l'existence de ce tenantId ailleurs (un autre site KREOVYA).
    return { ok: false, message: `Entreprise inconnue ou inactive : "${tenantId}".` };
  }
  const rawTenant = getTenant(tenantId);
  const publicConfig = getPublicConfig(tenantId);
  if (!rawTenant || !isKnownTenant(tenantId) || !publicConfig) {
    return { ok: false, message: `Entreprise inconnue ou inactive : "${tenantId}".` };
  }
  return { ok: true, tenantId, rawTenant, publicConfig };
}

/**
 * assertTenantOwnership(row, expectedTenantId, entityName) → boolean
 * Vérifie qu'une ligne déjà récupérée depuis Supabase (booking, resource,
 * lead, session...) porte bien le tenant_id attendu. Sert de DERNIÈRE
 * barrière explicite après une requête déjà filtrée par tenant_id — utile
 * quand une ligne provient d'un chemin qui n'a pas pu filtrer à la source
 * (ex. jointure applicative en plusieurs requêtes). Ne lève jamais
 * d'exception : retourne simplement faux, à l'appelant de fail-closed.
 */
function assertTenantOwnership(row, expectedTenantId, entityName) {
  if (!row || typeof row !== 'object') return false;
  if (!expectedTenantId) return false;
  const actual = row.tenant_id;
  if (actual !== expectedTenantId) {
    console.error(
      `[tenantContext] Incohérence tenant détectée sur ${entityName || 'une entité'} : attendu "${expectedTenantId}", trouvé "${actual}". Refus fail-closed.`
    );
    return false;
  }
  return true;
}

module.exports = { getServerTenantContext, resolveTenantConfig, assertTenantOwnership };
