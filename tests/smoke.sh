#!/usr/bin/env bash
# Tests de fumée de la gateway. Usage : tests/smoke.sh [http://localhost:8000]
GW=${1:-http://localhost:8000}
fail=0
t() { # description attendu méthode chemin [corps]
  local desc=$1 exp=$2 m=$3 p=$4 body=$5 code
  code=$(curl -s -o /dev/null -w '%{http_code}' -X "$m" ${body:+-H 'Content-Type: application/json' -d "$body"} "$GW$p")
  if [ "$code" = "$exp" ]; then echo "PASS  $desc ($code)"; else echo "FAIL  $desc : attendu $exp, reçu $code"; fail=1; fi
}
t "liste produits"                  200 GET    /api/products
t "liste catégories"                200 GET    /api/categories
t "création produit (acheminée)"    201 POST   /api/products '{"name":"x"}'
t "liste commandes"                 200 GET    /api/orders
t "création commande (acheminée)"   201 POST   /api/orders '{"items":[{"productId":1,"quantity":1}]}'
t "API interne bloquée"             403 PUT    /internal/reservations/1 '{}'
t "actuator bloqué"                 403 GET    /actuator/health
t "route inconnue"                  404 GET    /api/inconnu
code=$(curl -s -o /dev/null -w '%{http_code}' -X OPTIONS -H 'Origin: http://localhost:3000' -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: authorization' "$GW/api/orders")
{ [ "$code" = 200 ] || [ "$code" = 204 ]; } && echo "PASS  préflight CORS ($code)" || { echo "FAIL  préflight CORS ($code)"; fail=1; }
curl -si "$GW/api/products" | grep -qi '^x-request-id' && echo "PASS  X-Request-Id présent" || { echo "FAIL  X-Request-Id absent"; fail=1; }
# Transmission du jeton du SSO : l'en-tête Authorization doit arriver au backend (vérifié par le faux service)
if [ -n "$CHECK_AUTH_FORWARD" ]; then
  curl -s -H 'Authorization: Bearer abc.def.ghi' "$GW/api/orders" | grep -q 'Bearer abc.def.ghi' && echo "PASS  Authorization transmis au backend" || { echo "FAIL  Authorization non transmis"; fail=1; }
fi
# quota : 100 requêtes rapides => des 429 attendus (limite 30/s sur les commandes)
n429=$(for i in $(seq 1 100); do curl -s -o /dev/null -w '%{http_code}\n' "$GW/api/orders" & done | grep -c 429)
[ "$n429" -ge 1 ] && echo "PASS  rate limiting ($n429 réponses 429 sur 100)" || { echo "FAIL  aucun 429 sur 100 requêtes"; fail=1; }
exit $fail
