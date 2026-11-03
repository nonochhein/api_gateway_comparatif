#!/usr/bin/env bash
# Tests de fumée de la gateway. Usage : tests/smoke.sh [http://localhost:8000]
GW=${1:-http://localhost:8000}
cd "$(dirname "$0")/.."
TOKEN=$(python3 scripts/jwt.py)
BAD="${TOKEN%???}xxx"
fail=0
t() { # description attendu méthode chemin [en-tête] [corps]
  local desc=$1 exp=$2 m=$3 p=$4 h=$5 body=$6 code
  code=$(curl -s -o /dev/null -w '%{http_code}' -X "$m" ${h:+-H "$h"} ${body:+-H 'Content-Type: application/json' -d "$body"} "$GW$p")
  if [ "$code" = "$exp" ]; then echo "PASS  $desc ($code)"; else echo "FAIL  $desc : attendu $exp, reçu $code"; fail=1; fi
}
A="Authorization: Bearer $TOKEN"
t "catalogue public (produits)"          200 GET    /api/products
t "catalogue public (catégories)"        200 GET    /api/categories
t "création produit sans token"          401 POST   /api/products "" '{"name":"x"}'
t "création produit token falsifié"      401 POST   /api/products "Authorization: Bearer $BAD" '{"name":"x"}'
t "création produit token valide"        201 POST   /api/products "$A" '{"name":"x"}'
t "suppression produit sans token"       401 DELETE /api/products/1
t "commandes sans token"                 401 GET    /api/orders
t "commandes token valide (liste)"       200 GET    /api/orders "$A"
t "création commande token valide"       201 POST   /api/orders "$A" '{"items":[{"productId":1,"quantity":1}]}'
t "API interne bloquée"                  403 PUT    /internal/reservations/1 "$A" '{}'
t "actuator bloqué"                      403 GET    /actuator/health
t "route inconnue"                       404 GET    /api/inconnu
code=$(curl -s -o /dev/null -w '%{http_code}' -X OPTIONS -H 'Origin: http://localhost:3000' -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: authorization' "$GW/api/orders")
[ "$code" = 200 ] || [ "$code" = 204 ] && echo "PASS  préflight CORS ($code)" || { echo "FAIL  préflight CORS ($code)"; fail=1; }
rid=$(curl -si "$GW/api/products" | grep -i '^x-request-id' | wc -l)
[ "$rid" -ge 1 ] && echo "PASS  X-Request-Id présent" || { echo "FAIL  X-Request-Id absent"; fail=1; }
# quota : 60 requêtes rapides avec token => des 429 attendus (limite 20/s)
n429=$(for i in $(seq 1 60); do curl -s -o /dev/null -w '%{http_code}\n' -H "$A" "$GW/api/orders" & done | grep -c 429)
[ "$n429" -ge 1 ] && echo "PASS  rate limiting ($n429 réponses 429 sur 60)" || { echo "FAIL  aucun 429 sur 60 requêtes"; fail=1; }
exit $fail
