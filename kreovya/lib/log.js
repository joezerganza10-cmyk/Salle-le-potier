/**
 * KREOVYA CORE — Logging structuré minimal
 * ============================================================
 * Un seul format de ligne pour toute opération importante, exploitable
 * plus tard par un agrégateur (Netlify function logs → recherche/alerte)
 * sans dépendance externe ni service tiers.
 *
 * NE JAMAIS PASSER dans `fields` : un token complet, une clé secrète, un
 * identifiant de paiement, ou une donnée personnelle non indispensable au
 * diagnostic (nom complet, courriel, téléphone). request_id/tenant_id/
 * resource_id/booking_id (UUID) sont volontairement les seuls identifiants
 * encouragés — jamais de PII en clair.
 */

function logEvent({ requestId, tenantId, operation, resourceId, bookingId, result, errorCode, durationMs, extra }) {
  const entry = {
    ts: new Date().toISOString(),
    request_id: requestId || null,
    tenant_id: tenantId || null,
    operation,
    resource_id: resourceId || null,
    booking_id: bookingId || null,
    result, // 'ok' | 'error' | 'refused'
    error_code: errorCode || null,
    duration_ms: typeof durationMs === 'number' ? Math.round(durationMs) : null,
  };
  if (extra && typeof extra === 'object') {
    // Fusion superficielle uniquement — jamais de PII : à l'appelant de
    // respecter la règle ci-dessus pour tout champ ajouté ici.
    Object.assign(entry, extra);
  }
  const line = JSON.stringify(entry);
  if (result === 'error') {
    console.error('[kreovya]', line);
  } else {
    console.log('[kreovya]', line);
  }
}

/** Génère un identifiant de requête court, lisible dans les logs, sans dépendance crypto forte (pas un secret). */
function newRequestId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

module.exports = { logEvent, newRequestId };
