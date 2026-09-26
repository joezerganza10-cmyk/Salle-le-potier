/**
 * KREOVYA AI — Analyse d'une plage Postgres (tstzrange) telle que renvoyée
 * par PostgREST
 * ============================================================
 * Extrait tel quel (aucun changement de logique) de kreovya/tools/createHold.js
 * pour être réutilisé par tout code ayant besoin de relire une colonne
 * `period`/tstzrange depuis Supabase (ex. create-checkout-session.js).
 *
 * Format typique : `[2027-05-20 17:00:00+00,2027-05-20 23:00:00+00)`, avec
 * ou sans guillemets autour des bornes. Retourne null au moindre doute
 * plutôt que de deviner — jamais de donnée approximative transmise plus loin.
 */
function parseRangeBounds(rangeText) {
  if (typeof rangeText !== 'string' || rangeText.length < 3) return null;
  const inner = rangeText.slice(1, -1);
  const parts = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === '"' && inner[i - 1] !== '\\') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current);
  if (parts.length !== 2) return null;

  const toDate = (raw) => {
    const cleaned = raw.replace(/\\"/g, '"').trim();
    if (!cleaned) return null;
    const normalized = cleaned.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00');
    const dt = new Date(normalized);
    return isNaN(dt.getTime()) ? null : dt;
  };

  const lower = toDate(parts[0]);
  const upper = toDate(parts[1]);
  if (!lower || !upper) return null;
  return { lowerMs: lower.getTime(), upperMs: upper.getTime() };
}

module.exports = { parseRangeBounds };
