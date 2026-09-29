#!/usr/bin/env bash
# ============================================================
# KREOVYA CORE — Suite de non-régression (bash + curl)
# ============================================================
# Aucun framework de test (Jest/Mocha) n'est utilisé ici : l'environnement
# de développement de ce projet ne dispose pas de Node.js/npm localement.
# Ce script reproduit fidèlement, de façon rejouable, les vérifications
# manuelles effectuées lors des audits des 28-29 septembre 2026 — il teste
# le vrai HTTP/Supabase en conditions réelles, pas des mocks.
#
# Variables d'environnement requises :
#   BASE_URL              URL du site de CE tenant (ex. https://chic-marshmallow-007ee9.netlify.app)
#   TENANT_ID             tenantId de ce site (ex. salle-le-potier)
#   RESOURCE_ID            un id de ressource RÉEL et actif de ce tenant (uuid)
#   RESOURCE_SLUG          le slug correspondant (ex. principale, saphir)
#   SUPABASE_PROJECT_REF   référence du projet Supabase (ex. dkvdrmppzqdkuqrlrrbm)
#   SUPABASE_MGMT_TOKEN    Personal Access Token Supabase (lecture+écriture, temporaire)
#
# Variables optionnelles (activent les tests croisés inter-tenant) :
#   OTHER_BASE_URL, OTHER_TENANT_ID, OTHER_RESOURCE_ID, OTHER_RESOURCE_SLUG
#
# AUCUN paiement réel n'est jamais déclenché (orderID toujours factice).
# Toute donnée créée est supprimée avant la fin du script (trap EXIT).
set -uo pipefail

PASS=0
FAIL=0
TMP_LEAD_IDS=()
TMP_BOOKING_IDS=()
TMP_TOKEN_VALUES=()

sb_query() {
  curl -s -X POST "https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query" \
    -H "Authorization: Bearer ${SUPABASE_MGMT_TOKEN}" -H "Content-Type: application/json" \
    -d "{\"query\":\"$1\"}"
}

check() {
  local label="$1" condition="$2"
  if [ "$condition" = "1" ]; then
    echo "  PASS - $label"
    PASS=$((PASS + 1))
  else
    echo "  FAIL - $label"
    FAIL=$((FAIL + 1))
  fi
}

cleanup() {
  echo "--- Nettoyage des données temporaires ---"
  for t in "${TMP_TOKEN_VALUES[@]:-}"; do
    [ -n "$t" ] && sb_query "delete from public.prefill_tokens where token='${t}';" > /dev/null
  done
  for b in "${TMP_BOOKING_IDS[@]:-}"; do
    [ -n "$b" ] && sb_query "delete from public.bookings where id='${b}';" > /dev/null
  done
  for l in "${TMP_LEAD_IDS[@]:-}"; do
    [ -n "$l" ] && sb_query "delete from public.reservation_requests where id='${l}';" > /dev/null
  done
}
trap cleanup EXIT

extract_id() { sed -n 's/.*"id":"\([^"]*\)".*/\1/p' | head -1; }

echo "=== TENANT ==="
R=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/.netlify/functions/kreovya-config?tenantId=${TENANT_ID}")
check "tenant valide -> 200" "$([ "$R" = "200" ] && echo 1 || echo 0)"

R=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/.netlify/functions/kreovya-config?tenantId=ce-tenant-n-existe-pas")
check "tenant inconnu -> 404" "$([ "$R" = "404" ] && echo 1 || echo 0)"

echo "=== AVAILABILITY (via une conversation réelle) ==="
FUTURE_DATE="2028-01-15"
AVAIL=$(curl -s -X POST "${BASE_URL}/.netlify/functions/kreovya-agent" -H "Content-Type: application/json" \
  -d "{\"tenantId\":\"${TENANT_ID}\",\"messages\":[{\"role\":\"user\",\"content\":\"Est-ce que la salle est disponible le ${FUTURE_DATE} de 10h à 12h ?\"}]}")
check "reponse HTTP 200 sur une question de disponibilite" "$(echo "$AVAIL" | grep -q '"success":true' && echo 1 || echo 0)"

echo "=== CONFLICTS (Supabase direct, données temporaires) ==="
NOW_ISO=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
CONFLICT_QUERY_TMPL='resource_id=eq.%s&period=ov.%%5B2028-02-01T14%%3A00%%3A00-05%%3A00%%2C2028-02-01T18%%3A00%%3A00-05%%3A00%%29&or=(status.eq.confirmed,and(status.eq.hold,hold_expires_at.gt.%s))&select=id&limit=1'

L1=$(sb_query "insert into public.reservation_requests (tenant_id, full_name, email, status, source) values ('${TENANT_ID}','TEST CORE REG','test-core-regression@example.com','new','kreovya-chat') returning id;" | extract_id)
TMP_LEAD_IDS+=("$L1")

B_CONFIRMED=$(sb_query "insert into public.bookings (tenant_id, resource_id, period, status, reservation_request_id, hold_expires_at) values ('${TENANT_ID}','${RESOURCE_ID}','[2028-02-01T14:00:00-05:00,2028-02-01T18:00:00-05:00)'::tstzrange,'confirmed','${L1}', now() + interval '1 hour') returning id;" | extract_id)
TMP_BOOKING_IDS+=("$B_CONFIRMED")
URL=$(printf "$CONFLICT_QUERY_TMPL" "$RESOURCE_ID" "$NOW_ISO")
RESP=$(curl -s "https://${SUPABASE_PROJECT_REF}.supabase.co/rest/v1/bookings?${URL}" -H "apikey: ${SUPABASE_SERVICE_KEY}" -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}")
check "reservation confirmee exacte -> conflit detecte" "$(echo "$RESP" | grep -q '"id"' && echo 1 || echo 0)"
sb_query "delete from public.bookings where id='${B_CONFIRMED}';" > /dev/null

B_HOLD_ACTIVE=$(sb_query "insert into public.bookings (tenant_id, resource_id, period, status, reservation_request_id, hold_expires_at) values ('${TENANT_ID}','${RESOURCE_ID}','[2028-02-01T14:00:00-05:00,2028-02-01T18:00:00-05:00)'::tstzrange,'hold','${L1}', now() + interval '10 minutes') returning id;" | extract_id)
TMP_BOOKING_IDS+=("$B_HOLD_ACTIVE")
RESP=$(curl -s "https://${SUPABASE_PROJECT_REF}.supabase.co/rest/v1/bookings?${URL}" -H "apikey: ${SUPABASE_SERVICE_KEY}" -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}")
check "HOLD actif -> conflit detecte" "$(echo "$RESP" | grep -q '"id"' && echo 1 || echo 0)"
sb_query "update public.bookings set hold_expires_at = now() - interval '10 minutes' where id='${B_HOLD_ACTIVE}';" > /dev/null
RESP=$(curl -s "https://${SUPABASE_PROJECT_REF}.supabase.co/rest/v1/bookings?${URL}" -H "apikey: ${SUPABASE_SERVICE_KEY}" -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}")
check "HOLD expire -> ne bloque plus" "$(echo "$RESP" | grep -q '^\[\]$' && echo 1 || echo 0)"
sb_query "delete from public.bookings where id='${B_HOLD_ACTIVE}';" > /dev/null
sb_query "delete from public.reservation_requests where id='${L1}';" > /dev/null
TMP_LEAD_IDS=()
TMP_BOOKING_IDS=()

echo "=== SESSION / PREFILL ==="
R=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/.netlify/functions/resolve-reservation-prefill?session=CE_TOKEN_N_EXISTE_PAS")
check "token inexistant -> refus generique" "$([ "$R" = "404" ] && echo 1 || echo 0)"

if [ -n "${OTHER_BASE_URL:-}" ]; then
  echo "=== ISOLATION INTER-TENANT ==="
  L2=$(sb_query "insert into public.reservation_requests (tenant_id, full_name, email, status, source) values ('${TENANT_ID}','TEST CROSS','test-cross@example.com','new','kreovya-chat') returning id;" | extract_id)
  TMP_LEAD_IDS+=("$L2")
  B2=$(sb_query "insert into public.bookings (tenant_id, resource_id, period, status, reservation_request_id, hold_expires_at) values ('${TENANT_ID}','${RESOURCE_ID}','[2028-03-01T14:00:00-05:00,2028-03-01T18:00:00-05:00)'::tstzrange,'hold','${L2}', now() + interval '15 minutes') returning id;" | extract_id)
  TMP_BOOKING_IDS+=("$B2")
  TOK2=$(head -c 32 /dev/urandom | base64 | tr '+/' '-_' | tr -d '=')
  TMP_TOKEN_VALUES+=("$TOK2")
  sb_query "insert into public.prefill_tokens (token, tenant_id, booking_id, expires_at) values ('${TOK2}','${TENANT_ID}','${B2}', now() + interval '15 minutes');" > /dev/null

  R=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/.netlify/functions/resolve-reservation-prefill?session=${TOK2}")
  check "token propre sur son propre site -> succes" "$([ "$R" = "200" ] && echo 1 || echo 0)"

  R=$(curl -s -o /dev/null -w "%{http_code}" "${OTHER_BASE_URL}/.netlify/functions/resolve-reservation-prefill?session=${TOK2}")
  check "token etranger sur un autre site -> refus" "$([ "$R" = "404" ] && echo 1 || echo 0)"
fi

echo "=== PRICING (via une conversation reelle) ==="
PRICE=$(curl -s -X POST "${BASE_URL}/.netlify/functions/kreovya-agent" -H "Content-Type: application/json" \
  -d "{\"tenantId\":\"${TENANT_ID}\",\"messages\":[{\"role\":\"user\",\"content\":\"Quels sont vos tarifs ?\"}]}")
check "description tarifaire renvoyee" "$(echo "$PRICE" | grep -q '"success":true' && echo 1 || echo 0)"

echo "=== PAYMENT (aucun paiement reel) ==="
R=$(curl -s -X POST "${BASE_URL}/.netlify/functions/verify-payment" -H "Content-Type: application/json" \
  -d '{"orderID":"dummy-regression-test","sessionToken":"token-inexistant"}')
check "session invalide -> jamais verified:true" "$(echo "$R" | grep -q '"verified":true' && echo 0 || echo 1)"

echo
echo "============================================================"
echo "RÉSULTAT : ${PASS} succès, ${FAIL} échec(s)"
echo "============================================================"
[ "$FAIL" -eq 0 ]
