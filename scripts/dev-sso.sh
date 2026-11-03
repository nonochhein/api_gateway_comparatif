#!/usr/bin/env bash
# SSO de développement, UNIQUEMENT pour la machine locale, en attendant les vrais Authentik / Authelia.
# Ajoute à Kong un 3e consommateur « sso-dev-local » (clé RSA générée ici) et fabrique un jeton pour se connecter sur le site.
# Usage : scripts/dev-sso.sh        -> Kong relancé avec .dev/kong.yml, jeton (12 h) dans .dev/token.txt
#         scripts/dev-sso.sh off    -> Kong relancé avec kong/kong.yml (config du dépôt)
# Tout est dans .dev/ (ignoré par git). Ne jamais utiliser ce consommateur hors de la machine locale.
set -euo pipefail
cd "$(dirname "$0")/.."
DEV=.dev; ISS="http://localhost/dev-sso"

if [ "${1:-}" = off ]; then
  docker compose up -d --force-recreate kong >/dev/null
  echo "Kong relancé avec kong/kong.yml (SSO de dev désactivé)."; exit 0
fi

mkdir -p "$DEV"
[ -f "$DEV/dev-sso.key" ] || { openssl genrsa -out "$DEV/dev-sso.key" 2048 2>/dev/null; openssl rsa -in "$DEV/dev-sso.key" -pubout -out "$DEV/dev-sso.pub" 2>/dev/null; }
python3 - "$DEV" "$ISS" <<'PY'
import sys
dev, iss = sys.argv[1], sys.argv[2]
s = open("kong/kong.yml", encoding="utf-8").read()
pem = "".join("          " + l + "\n" for l in open(f"{dev}/dev-sso.pub").read().strip().splitlines())
consumer = ("  # Ajouté par scripts/dev-sso.sh : SSO de développement local (ne pas commiter)\n"
            "  - username: sso-dev-local\n    jwt_secrets:\n      - algorithm: RS256\n"
            f'        key: "{iss}"\n        rsa_public_key: |\n{pem}')
assert "\nconsumers:\n" in s
open(f"{dev}/kong.yml", "w", encoding="utf-8").write(s.replace("\nconsumers:\n", "\nconsumers:\n" + consumer, 1))
PY
python3 tests/make_token.py "$DEV/dev-sso.key" "$ISS" 43200 > "$DEV/token.txt"
KONG_CONFIG="./$DEV/kong.yml" docker compose up -d --force-recreate kong >/dev/null
for _ in $(seq 1 40); do curl -sf -o /dev/null localhost:8000/api/products && break; sleep 1; done
code=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $(cat "$DEV/token.txt")" localhost:8000/api/orders)
echo "Kong relancé avec le SSO de dev (GET /api/orders avec le jeton : $code)."
echo "Jeton valable 12 h dans $DEV/token.txt : sur http://localhost:8000, « SSO login », coller le contenu du fichier."
