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
# Id d'un produit réel (lu via la gateway) : le backend exige des UUID
FIRST=$(curl -s "$GW/api/products?size=1&active=true")
PID=$(echo "$FIRST" | python3 -c 'import sys,json;print(json.load(sys.stdin)["content"][0]["id"])' 2>/dev/null)
CID=$(echo "$FIRST" | python3 -c 'import sys,json;print(json.load(sys.stdin)["content"][0]["categoryId"])' 2>/dev/null)
jid() { python3 -c 'import sys,json;print(json.load(sys.stdin).get("id",""))' 2>/dev/null; }
ok2xx() { case "$2" in 2??) echo "PASS  $1 ($2)";; *) echo "FAIL  $1 : attendu 2xx, reçu $2"; fail=1;; esac; }
t "site (page d'accueil)"               200 GET    /
t "site (image d'arme)"                200 GET    /images/pistol.svg
t "site (icône d'arme du jeu)"         200 GET    /images/weapons/weapon_pistol.png
t "catalogue public (produits)"            200 GET    /api/products
t "catalogue public (catégories)"          200 GET    /api/categories
t "création produit sans jeton"            401 POST   /api/products "" '{"name":"x"}'
t "suppression produit sans jeton"         401 DELETE /api/products/1
t "commandes sans jeton"                   401 GET    /api/orders
t "notifications sans jeton"               401 GET    "/api/notifications?userId=x"
t "jeton illisible"                        401 GET    /api/orders "Authorization: Bearer n.importe.quoi"
[ -n "$TOKEN_FORGED" ]      && t "jeton falsifié (mauvaise clé)"   401 GET /api/orders "$(bearer "$TOKEN_FORGED")"
[ -n "$TOKEN_EXPIRED" ]     && t "jeton expiré"                    401 GET /api/orders "$(bearer "$TOKEN_EXPIRED")"
[ -n "$TOKEN_UNKNOWN_ISS" ] && t "jeton d'un SSO inconnu"          401 GET /api/orders "$(bearer "$TOKEN_UNKNOWN_ISS")"
for sso in AUTHENTIK AUTHELIA; do
  v=TOKEN_$sso; tok=${!v}
  if [ -n "$tok" ]; then
    H="$(bearer "$tok")"
    t "[$sso] commandes (liste)"           200 GET  /api/orders "$H"
    t "[$sso] notifications (liste)"       200 GET  "/api/notifications?userId=smoke-$sso" "$H"
    # Commande réelle puis annulation (libère la réservation de stock)
    r=$(curl -s -w '\n%{http_code}' -X POST -H "$H" -H 'Content-Type: application/json' -d "{\"userId\":\"smoke-$sso\",\"items\":[{\"productId\":\"$PID\",\"quantity\":1}]}" "$GW/api/orders")
    code=${r##*$'\n'}; oid=$(echo "${r%$'\n'*}" | jid)
    ok2xx "[$sso] création commande" "$code"
    [ -n "$oid" ] && ok2xx "[$sso] annulation de la commande" "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "$H" "$GW/api/orders/$oid/cancel")"
    # Produit de test créé puis désactivé (la ligne reste en base, inactive)
    sku="SMOKE-$sso-$(date +%s)"
    r=$(curl -s -w '\n%{http_code}' -X POST -H "$H" -H 'Content-Type: application/json' -d "{\"categoryId\":\"$CID\",\"sku\":\"$sku\",\"name\":\"Test $sso\",\"description\":\"smoke\",\"price\":1.00,\"stockQuantity\":1,\"imageUrl\":null,\"active\":true}" "$GW/api/products")
    code=${r##*$'\n'}; pid2=$(echo "${r%$'\n'*}" | jid)
    ok2xx "[$sso] création produit" "$code"
    [ -n "$pid2" ] && ok2xx "[$sso] désactivation du produit de test" "$(curl -s -o /dev/null -w '%{http_code}' -X DELETE -H "$H" "$GW/api/products/$pid2")"
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
  n429=$(for _ in $(seq 1 100); do curl -s -o /dev/null -w '%{http_code}\n' -H "$(bearer "$TOKEN_AUTHENTIK")" "$GW/api/orders" & done | grep -c 429)
  [ "$n429" -ge 1 ] && echo "PASS  rate limiting par utilisateur ($n429 réponses 429 sur 100)" || { echo "FAIL  aucun 429 sur 100 requêtes"; fail=1; }
fi
exit $fail
