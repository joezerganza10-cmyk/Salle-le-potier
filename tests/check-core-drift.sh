#!/usr/bin/env bash
# ============================================================
# KREOVYA CORE — Détecteur de divergence entre deux dépôts tenant
# ============================================================
# Compare les fichiers considérés comme "Core générique" entre CE dépôt et
# un autre dépôt tenant KREOVYA (chemin local). Objectif : repérer tout de
# suite qu'une copie a divergé silencieusement (le problème exact qui a
# motivé le chantier "KREOVYA CORE centralisé" du 29 septembre 2026 — voir
# KREOVYA-TEMPLATE.md), avant qu'un correctif de sécurité ou une évolution
# ne soit appliqué à un seul des deux tenants.
#
# Usage :
#   ./tests/check-core-drift.sh /chemin/vers/l-autre-depot-tenant
#
# Ne modifie jamais aucun fichier. Un fichier listé ci-dessous comme
# "différent" n'est pas forcément une erreur (ex. resolve-reservation-
# prefill.js de Salle Le Potier a des champs paymentEnabled/paypalClientId
# légitimement absents de Salle906) — mais toute différence doit être une
# décision consciente, jamais un oubli.
set -uo pipefail

OTHER_REPO="${1:-}"
if [ -z "$OTHER_REPO" ] || [ ! -d "$OTHER_REPO" ]; then
  echo "Usage: $0 /chemin/vers/l-autre-depot-tenant" >&2
  exit 2
fi

THIS_REPO="$(cd "$(dirname "$0")/.." && pwd)"

# Fichiers considérés comme le Core générique (voir KREOVYA-TEMPLATE.md).
CORE_FILES=(
  "kreovya/lib/supabaseRest.js"
  "kreovya/lib/postgresRange.js"
  "kreovya/lib/timezone.js"
  "kreovya/lib/pricingEngine.js"
  "kreovya/lib/tenantContext.js"
  "kreovya/lib/resolvePrefillToken.js"
  "kreovya/lib/log.js"
  "kreovya/tools/leadValidation.js"
  "kreovya/tools/checkAvailability.js"
  "kreovya/tools/createLead.js"
  "kreovya/tools/updateLead.js"
  "kreovya/tools/getLeadContext.js"
  "kreovya/tools/createHold.js"
  "kreovya/tools/prepareReservationLink.js"
  "kreovya-widget.js"
  "netlify/functions/kreovya-config.js"
  "netlify.toml"
)

IDENTICAL=0
DIFFERENT=0
MISSING=0

echo "Comparaison : $THIS_REPO"
echo "        vs  : $OTHER_REPO"
echo

for f in "${CORE_FILES[@]}"; do
  A="$THIS_REPO/$f"
  B="$OTHER_REPO/$f"
  if [ ! -f "$A" ] || [ ! -f "$B" ]; then
    echo "  MANQUANT  - $f"
    MISSING=$((MISSING + 1))
    continue
  fi
  if diff --strip-trailing-cr -q "$A" "$B" > /dev/null 2>&1; then
    echo "  identique - $f"
    IDENTICAL=$((IDENTICAL + 1))
  else
    echo "  DIFFÉRENT - $f"
    DIFFERENT=$((DIFFERENT + 1))
  fi
done

echo
echo "============================================================"
echo "${IDENTICAL} identiques, ${DIFFERENT} différents, ${MISSING} manquants"
echo "============================================================"
if [ "$DIFFERENT" -gt 0 ]; then
  echo "Lancez : diff --strip-trailing-cr \"$THIS_REPO/<fichier>\" \"$OTHER_REPO/<fichier>\""
  echo "pour chaque fichier DIFFÉRENT ci-dessus, et confirmez que l'écart est voulu."
fi
