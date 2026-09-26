/**
 * KREOVYA AI — Client REST Supabase minimal (sans dépendance npm)
 * ============================================================
 * Toutes les tables Supabase ont RLS activé, sans aucune politique
 * publique : seule la clé SUPABASE_SECRET_KEY peut lire/écrire. Cette
 * clé est lue UNIQUEMENT ici, via process.env, jamais ailleurs, jamais
 * journalisée, jamais renvoyée dans une réponse.
 *
 * Générique multi-tenant : ce module ne connaît aucune donnée métier,
 * seulement comment parler à l'API REST auto-générée par Supabase
 * (PostgREST) via fetch() natif.
 */

function supabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    // Jamais de détail technique au-delà de ça : ne révèle pas quelle
    // variable précise manque, ni a fortiori sa valeur.
    throw new Error('Configuration Supabase manquante.');
  }
  return { url: url.replace(/\/+$/, ''), key };
}

/**
 * Appelle l'API REST Supabase pour une table donnée.
 * `query` est une chaîne de paramètres déjà construite
 * (ex. "tenant_id=eq.<tenantId>&select=id,slug").
 * `quiet` : si true, n'inclut jamais le corps de la réponse Supabase dans
 * les logs d'erreur — à utiliser pour toute table contenant des données
 * personnelles (ex. reservation_requests), pour ne jamais faire fuiter de
 * PII dans les logs serveur. Comportement par défaut inchangé (false).
 */
async function supabaseRequest(table, { method = 'GET', query = '', body, quiet = false } = {}) {
  const { url, key } = supabaseConfig();
  const endpoint = `${url}/rest/v1/${table}${query ? `?${query}` : ''}`;

  const res = await fetch(endpoint, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    // Le corps d'erreur PostgREST ne contient jamais la clé — sûr à journaliser,
    // sauf pour les tables "quiet" où le corps peut refléter des données
    // personnelles saisies par le visiteur (téléphone, courriel, message...).
    if (quiet) {
      console.error('[supabaseRequest]', table, res.status, '(détails masqués — table contenant des données personnelles)');
    } else {
      console.error('[supabaseRequest]', table, res.status, data);
    }
    const err = new Error(`Erreur Supabase (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

/**
 * Appelle une fonction PostgreSQL exposée par PostgREST via /rest/v1/rpc/<fn>.
 * `args` est un objet simple { p_xxx: valeur } — PostgREST l'associe aux
 * paramètres nommés de la fonction SQL. Utilisé pour les fonctions
 * transactionnelles (ex. create_hold) où la logique atomique doit vivre côté
 * Postgres, jamais recomposée à partir de plusieurs appels REST successifs.
 * `quiet` : même sémantique que pour supabaseRequest — à activer si la
 * fonction peut manipuler ou refléter des données personnelles.
 */
async function supabaseRpc(fnName, args = {}, { quiet = false } = {}) {
  const { url, key } = supabaseConfig();
  const endpoint = `${url}/rest/v1/rpc/${fnName}`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    if (quiet) {
      console.error('[supabaseRpc]', fnName, res.status, '(détails masqués — fonction pouvant manipuler des données personnelles)');
    } else {
      console.error('[supabaseRpc]', fnName, res.status, data);
    }
    const err = new Error(`Erreur Supabase RPC (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

module.exports = { supabaseRequest, supabaseRpc };
