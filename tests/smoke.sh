#!/usr/bin/env bash
# Tests de fumée. Usage : tests/smoke.sh [http://localhost:8000]
# Tests avec jetons : exporter TOKEN_AUTHENTIK et/ou TOKEN_AUTHELIA (jetons réels des SSO) ; sinon ils sont ignorés.
# Option : TOKEN_FORGED, TOKEN_EXPIRED, TOKEN_UNKNOWN_ISS (jetons invalides attendus en 401), CHECK_FORWARD=1 (faux services).
GW=${1:-http://localhost:8000}
fail=0
t() { # description attendu méthode chemin [en-tête] [corps]
  local desc=$1 exp=$2 m=$3 p=$4 h=$5 body=$6 code
  code=$(curl -s -o /dev/null -w '%{http_code}' -X "$m" ${h:+-H "$h"} ${body:+-H 'Content-Type: application/json' -d "$body"} "$GW$p")
  if [ "$code" = "$exp" ]; then echo "PASS  $desc ($code)"; else echo "FAIL  $desc : attendu $exp, reçu $code"; fail=1; fi
}
bearer() { echo "Authorization: Bearer $1"; }
ORD='{"items":[{"productId":1,"quantity":1}]}'
t "catalogue public (produits)"            200 GET    /api/products
t "catalogue public (catégories)"          200 GET    /api/categories
t "création produit sans jeton"            401 POST   /api/products "" '{"name":"x"}'
t "suppression produit sans jeton"         401 DELETE /api/products/1
t "commandes sans jeton"                   401 GET    /api/orders
t "jeton illisible"                        401 GET    /api/orders "Authorization: Bearer n.importe.quoi"
[ -n "$TOKEN_FORGED" ]      && t "jeton falsifié (mauvaise clé)"   401 GET /api/orders "$(bearer "$TOKEN_FORGED")"
[ -n "$TOKEN_EXPIRED" ]     && t "jeton expiré"                    401 GET /api/orders "$(bearer "$TOKEN_EXPIRED")"
[ -n "$TOKEN_UNKNOWN_ISS" ] && t "jeton d'un SSO inconnu"          401 GET /api/orders "$(bearer "$TOKEN_UNKNOWN_ISS")"
for sso in AUTHENTIK AUTHELIA; do
  v=TOKEN_$sso; tok=${!v}
  if [ -n "$tok" ]; then
    t "[$sso] commandes (liste)"           200 GET  /api/orders "$(bearer "$tok")"
    t "[$sso] création commande"           201 POST /api/orders "$(bearer "$tok")" "$ORD"
    t "[$sso] création produit"            201 POST /api/products "$(bearer "$tok")" '{"name":"x"}'
  else echo "SKIP  [$sso] pas de jeton fourni ($v)"; fi
done
t "API interne bloquée"                    403 PUT    /internal/reservations/1 "" '{}'
t "actuator bloqué"                        403 GET    /actuator/health
t "route inconnue"                         404 GET    /api/inconnu
code=$(curl -s -o /dev/null -w '%{http_code}' -X OPTIONS -H 'Origin: http://localhost:3000' -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: authorization' "$GW/api/orders")
{ [ "$code" = 200 ] || [ "$code" = 204 ]; } && echo "PASS  préflight CORS sans jeton ($code)" || { echo "FAIL  préflight CORS ($code)"; fail=1; }
curl -si "$GW/api/products" | grep -qi '^x-request-id' && echo "PASS  X-Request-Id présent" || { echo "FAIL  X-Request-Id absent"; fail=1; }
if [ -n "$CHECK_FORWARD" ] && [ -n "$TOKEN_AUTHENTIK" ]; then
  r=$(curl -s -H "$(bearer "$TOKEN_AUTHENTIK")" "$GW/api/orders")
  echo "$r" | grep -q "Bearer $TOKEN_AUTHENTIK" && echo "PASS  Authorization transmis au backend" || { echo "FAIL  Authorization non transmis"; fail=1; }
  echo "$r" | grep -q '"consumer": "sso-authentik"' && echo "PASS  X-Consumer-Username transmis (sso-authentik)" || { echo "FAIL  X-Consumer-Username absent"; fail=1; }
fi
if [ -n "$TOKEN_AUTHENTIK" ]; then
  n429=$(for i in $(seq 1 100); do curl -s -o /dev/null -w '%{http_code}\n' -H "$(bearer "$TOKEN_AUTHENTIK")" "$GW/api/orders" & done | grep -c 429)
  [ "$n429" -ge 1 ] && echo "PASS  rate limiting par utilisateur ($n429 réponses 429 sur 100)" || { echo "FAIL  aucun 429 sur 100 requêtes"; fail=1; }
fi
exit $fail
