/**
 * KREOVYA AI — Résolution fuseau horaire (heure locale → UTC), sans dépendance
 * ============================================================
 * Convertit une date/heure LOCALE (dans le fuseau horaire d'un tenant) vers
 * un instant UTC précis, en tenant compte correctement des passages heure
 * normale/heure avancée — jamais un décalage fixe codé en dur.
 *
 * S'appuie uniquement sur Intl.DateTimeFormat (natif à Node, base de
 * données de fuseaux horaires d'ICU) — aucune dépendance npm.
 *
 * Détecte explicitement deux cas qui ne doivent jamais être résolus
 * silencieusement :
 *   - heure INEXISTANTE (le "trou" du passage à l'heure avancée, ex.
 *     2h00-3h00 un dimanche de mars) ;
 *   - heure AMBIGUË (le chevauchement du retour à l'heure normale, ex.
 *     1h00-2h00 un dimanche de novembre, qui existe deux fois).
 * Dans ces deux cas, la fonction échoue explicitement plutôt que de
 * deviner une interprétation.
 *
 * Générique multi-tenant : ne connaît aucune donnée métier, seulement un
 * identifiant de fuseau horaire IANA (ex. "America/Toronto") passé en
 * paramètre par l'appelant.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function isValidCalendarDate(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Décalage (en ms) du fuseau `timeZone` à l'instant UTC `instantMs`. */
function getOffsetMs(instantMs, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(instantMs));
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - instantMs;
}

/** Heure locale (y/m/d/hh/mm) que produirait l'instant `instantMs` dans `timeZone`. */
function formatLocalParts(instantMs, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(instantMs));
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return { y: get('year'), m: get('month'), d: get('day'), hh: get('hour'), mm: get('minute') };
}

/**
 * Résout une date/heure LOCALE (dans `timeZone`) vers un instant UTC précis.
 *
 * Retourne :
 *   { ok:true, instantMs }
 *   { ok:false, reason:'invalid_format' }  — format de date/heure incorrect
 *   { ok:false, reason:'invalid_date' }    — date calendaire inexistante (ex. 30 février)
 *   { ok:false, reason:'nonexistent' }     — heure locale inexistante (trou DST)
 *   { ok:false, reason:'ambiguous' }       — heure locale ambiguë (chevauchement DST)
 */
function resolveZonedDateTime(dateStr, timeStr, timeZone) {
  if (typeof dateStr !== 'string' || !DATE_RE.test(dateStr)) return { ok: false, reason: 'invalid_format' };
  if (typeof timeStr !== 'string' || !TIME_RE.test(timeStr)) return { ok: false, reason: 'invalid_format' };

  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);

  if (!isValidCalendarDate(y, m, d)) return { ok: false, reason: 'invalid_date' };

  const naiveUtc = Date.UTC(y, m - 1, d, hh, mm, 0);

  // Première approximation, puis échantillonnage 2h avant/après (plus large
  // que tout changement d'heure réel, toujours de 1h en Amérique du Nord)
  // pour détecter une transition proche de cet instant.
  const offset1 = getOffsetMs(naiveUtc, timeZone);
  const firstCandidate = naiveUtc - offset1;

  const WINDOW_MS = 2 * 60 * 60 * 1000;
  const offsetBefore = getOffsetMs(firstCandidate - WINDOW_MS, timeZone);
  const offsetAfter = getOffsetMs(firstCandidate + WINDOW_MS, timeZone);

  const candidateOffsets = Array.from(new Set([offset1, offsetBefore, offsetAfter]));
  const validInstants = new Set();

  for (const offset of candidateOffsets) {
    const candidate = naiveUtc - offset;
    const local = formatLocalParts(candidate, timeZone);
    if (local.y === y && local.m === m && local.d === d && local.hh === hh && local.mm === mm) {
      validInstants.add(candidate);
    }
  }

  if (validInstants.size === 0) return { ok: false, reason: 'nonexistent' };
  if (validInstants.size > 1) return { ok: false, reason: 'ambiguous' };

  return { ok: true, instantMs: [...validInstants][0] };
}

function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

function describeReason(reason, label) {
  switch (reason) {
    case 'invalid_format': return `Heure ${label} invalide (format HH:MM attendu).`;
    case 'invalid_date': return 'Date invalide.';
    case 'nonexistent': return `L'heure ${label} n'existe pas ce jour-là (changement d'heure) — merci de proposer une heure différente.`;
    case 'ambiguous': return `L'heure ${label} est ambiguë ce jour-là (changement d'heure) — merci de proposer une heure différente.`;
    default: return `Heure ${label} invalide.`;
  }
}

/**
 * Résout une période de réservation (date + heures de début/fin LOCALES) en
 * deux timestamps ISO 8601 UTC (suffixés "Z"), compatibles tels quels avec
 * checkAvailability.js.
 *
 * Si `endTimeStr` est numériquement STRICTEMENT inférieure à `startTimeStr`,
 * la fin est automatiquement interprétée comme le LENDEMAIN de `dateStr`
 * (ex. 18:00 → 06:00 pour un événement se terminant après minuit). Une
 * heure de fin égale à l'heure de début est rejetée (durée nulle), jamais
 * interprétée comme "24h plus tard".
 */
function resolveBookingPeriod(dateStr, startTimeStr, endTimeStr, timeZone) {
  if (typeof dateStr !== 'string' || !DATE_RE.test(dateStr)) {
    return { ok: false, reason: 'invalid_format', message: 'Date invalide (format AAAA-MM-JJ attendu).' };
  }

  const startResult = resolveZonedDateTime(dateStr, startTimeStr, timeZone);
  if (!startResult.ok) {
    return { ok: false, reason: startResult.reason, message: describeReason(startResult.reason, 'de début') };
  }

  // Garde-fou SERVEUR, jamais dépendant du seul modèle : un créneau dont le
  // début est déjà passé est toujours rejeté ici, avant même d'atteindre
  // checkAvailability ou createHold — quelle que soit la date proposée par
  // le visiteur ou hallucinée par l'agent conversationnel.
  if (startResult.instantMs <= Date.now()) {
    return { ok: false, reason: 'past', message: "Cette date et heure sont déjà passées — merci de proposer un créneau à venir." };
  }

  const endDateStr = (typeof startTimeStr === 'string' && typeof endTimeStr === 'string' && endTimeStr < startTimeStr)
    ? addDays(dateStr, 1)
    : dateStr;

  const endResult = resolveZonedDateTime(endDateStr, endTimeStr, timeZone);
  if (!endResult.ok) {
    return { ok: false, reason: endResult.reason, message: describeReason(endResult.reason, 'de fin') };
  }

  if (endResult.instantMs <= startResult.instantMs) {
    return { ok: false, reason: 'invalid_range', message: "L'heure de fin doit être postérieure à l'heure de début." };
  }

  return {
    ok: true,
    startIso: new Date(startResult.instantMs).toISOString(),
    endIso: new Date(endResult.instantMs).toISOString(),
  };
}

/**
 * Date/heure locale (AAAA-MM-JJ / HH:MM) que produirait l'instant `instantMs`
 * dans `timeZone` — conversion UTC → locale, inverse de resolveZonedDateTime.
 * Réutilisée pour décrire au modèle un HOLD existant dans le fuseau horaire
 * du tenant, jamais en UTC brut.
 */
function describeInstantInZone(instantMs, timeZone) {
  const { y, m, d, hh, mm } = formatLocalParts(instantMs, timeZone);
  const pad = (n) => String(n).padStart(2, '0');
  return { date: `${y}-${pad(m)}-${pad(d)}`, time: `${pad(hh)}:${pad(mm)}` };
}

module.exports = { resolveZonedDateTime, resolveBookingPeriod, describeInstantInZone };
