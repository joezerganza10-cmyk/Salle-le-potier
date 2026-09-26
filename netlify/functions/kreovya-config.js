/**
 * KREOVYA AI — Configuration publique multi-tenant
 * ============================================================
 *   GET /.netlify/functions/kreovya-config?tenantId=salle-le-potier
 *
 * Retourne la configuration PUBLIQUE d'une entreprise (tenant) pour le futur
 * widget conversationnel KREOVYA AI. Toute la donnée métier vit dans
 * kreovya/config/tenants.js — cette fonction ne fait que la valider et la
 * servir ; elle ne connaît rien du tenant en dur.
 *
 * Sécurité :
 *   - Ne lit AUCUNE variable d'environnement et ne retourne jamais de secret :
 *     seule la section `public` de chaque tenant (voir tenants.js) est
 *     accessible ici. La section `internal` n'est jamais importée ni
 *     référencée dans ce fichier.
 *   - CORS contrôlé : l'en-tête Access-Control-Allow-Origin n'est renvoyé
 *     que si l'origine de la requête correspond au site web d'un tenant
 *     actif (dérivé de tenants.js) ou à une origine de développement local.
 *     Jamais de '*'.
 *   - Zéro dépendance npm : fetch()/require() natifs uniquement, comme les
 *     autres fonctions du projet (reservation-request.js, ghl-booking.js,
 *     verify-payment.js).
 *
 * Architecture multi-tenant : kreovya-agent.js (à venir) lira le MÊME
 * kreovya/config/tenants.js pour construire le contexte de l'agent IA côté
 * serveur — ajouter une entreprise ne demandera qu'une entrée de plus dans
 * tenants.js, jamais une modification de ce fichier ni du futur moteur.
 */

const { getPublicConfig, TENANTS } = require('../../kreovya/config/tenants');

// Origines de développement local (serveur statique PowerShell / futur
// `netlify dev`) toujours autorisées, en plus des sites web des tenants actifs.
const DEV_ORIGINS = new Set([
  'http://localhost:8888',
  'http://localhost:8899',
  'http://127.0.0.1:8888',
  'http://127.0.0.1:8899',
]);

function allowedOrigins() {
  const sites = Object.values(TENANTS)
    .filter((t) => t.active === true && t.public && t.public.business && t.public.business.website)
    .map((t) => String(t.public.business.website).replace(/\/+$/, ''));
  return new Set([...sites, ...DEV_ORIGINS]);
}

const ALLOWED_ORIGINS = allowedOrigins();

function corsHeaders(origin) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Vary': 'Origin',
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
  }
  return headers;
}

function json(statusCode, body, origin) {
  return { statusCode, headers: corsHeaders(origin), body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  const headers = event.headers || {};
  const origin = headers.origin || headers.Origin || '';

  if (event.httpMethod === 'OPTIONS') {
    return json(200, { ok: true }, origin);
  }

  if (event.httpMethod !== 'GET') {
    return json(405, { success: false, message: 'Méthode non autorisée.' }, origin);
  }

  const tenantId = ((event.queryStringParameters && event.queryStringParameters.tenantId) || '').trim();

  if (!tenantId) {
    return json(400, { success: false, message: 'Paramètre "tenantId" requis.' }, origin);
  }

  const config = getPublicConfig(tenantId);

  if (!config) {
    return json(404, { success: false, message: `Entreprise inconnue ou inactive : "${tenantId}".` }, origin);
  }

  return json(200, { success: true, tenant: config }, origin);
};
