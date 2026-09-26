/**
 * KREOVYA AI — Validations partagées pour les outils "lead"
 * ============================================================
 * Fonctions de normalisation/validation réutilisées à l'identique par
 * kreovya/tools/createLead.js et kreovya/tools/updateLead.js, pour éviter
 * toute dérive entre les deux si les règles évoluent un jour.
 *
 * Extrait tel quel (aucun changement de logique) de l'implémentation
 * d'origine de createLead.js, pour garantir un refactoring pur.
 *
 * Générique : ne connaît aucune donnée métier, uniquement des règles de
 * forme (longueur, format email/date/heure/UUID).
 */

const MAX_TEXT_LENGTH = 200;
const MAX_MESSAGE_LENGTH = 2000; // aligné sur la limite de kreovya-agent.js
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * null/undefined → null (absent, valide pour une collecte progressive).
 * non-string → undefined (sentinelle d'erreur de type).
 * sinon → la chaîne "trimée", ou null si elle est vide après trim.
 */
function normalizeString(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function normalizePartySize(value) {
  if (value === undefined || value === null || value === '') return { ok: true, value: null };
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return { ok: false };
  return { ok: true, value: n };
}

function isValidCalendarDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Validation de FORME uniquement — ne prouve jamais qu'un lead existe réellement. */
function isValidUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

module.exports = {
  MAX_TEXT_LENGTH,
  MAX_MESSAGE_LENGTH,
  EMAIL_RE,
  DATE_RE,
  TIME_RE,
  UUID_RE,
  normalizeString,
  normalizePartySize,
  isValidCalendarDate,
  isValidUuid,
};
