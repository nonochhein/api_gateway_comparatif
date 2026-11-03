#!/usr/bin/env bash
# Valide la gateway sans backend ni SSO : faux services + deux fausses paires de clés RSA (une par SSO) + Kong.
set -euo pipefail
cd "$(dirname "$0")/.."
TMP=$(mktemp -d); NET=ammu-gateway-test
trap 'docker compose down -t 2 >/dev/null 2>&1 || true; docker rm -f mock-catalog mock-order >/dev/null 2>&1 || true; docker network rm $NET >/dev/null 2>&1 || true; rm -rf "$TMP"' EXIT
for n in authentik authelia forged; do openssl genrsa -out $TMP/$n.key 2048 2>/dev/null; openssl rsa -in $TMP/$n.key -pubout -out $TMP/$n.pub 2>/dev/null; done
# Test du convertisseur JWKS -> PEM : le PEM reconstruit doit être identique à celui d'openssl
python3 - "$TMP" <<'PY'
import base64, subprocess, sys
sys.path.insert(0, "scripts"); from jwks_to_pem import to_pem
t = sys.argv[1]; out = subprocess.run(["openssl", "rsa", "-pubin", "-in", f"{t}/authentik.pub", "-noout", "-text", "-modulus"], capture_output=True, text=True).stdout
n = bytes.fromhex(out.split("Modulus=")[1].strip()); e = (65537).to_bytes(3, "big")
b = lambda x: base64.urlsafe_b64encode(x).rstrip(b"=").decode()
ok = to_pem(b(n), b(e)).strip() == open(f"{t}/authentik.pub").read().strip()
print(("PASS" if ok else "FAIL") + "  scripts/jwks_to_pem.py (JWKS -> PEM identique à openssl)"); sys.exit(0 if ok else 1)
PY
# Config Kong de test : on remplace les clés publiques de démo par celles générées
python3 - "$TMP" <<'PY'
import re, sys
t = sys.argv[1]; s = open("kong/kong.yml").read()
pem = lambda n: "".join("          " + l + "\n" for l in open(f"{t}/{n}.pub").read().strip().splitlines())
blocks = re.findall(r"(        rsa_public_key: \|\n(?:          .*\n)+)", s)
assert len(blocks) == 2
s = s.replace(blocks[0], "        rsa_public_key: |\n" + pem("authentik")).replace(blocks[1], "        rsa_public_key: |\n" + pem("authelia"))
open(f"{t}/kong.yml", "w").write(s)
PY
docker network create $NET >/dev/null 2>&1 || true
for s in catalog order; do
  docker rm -f mock-$s >/dev/null 2>&1 || true
  docker run -d --name mock-$s --network $NET --network-alias $s-service -e SERVICE=$s \
    -v "$PWD/tests/mock/app.py:/app.py:ro" -v "$PWD/db:/db:ro" python:3.12-alpine python /app.py >/dev/null
done
export BACKEND_NETWORK=$NET KONG_CONFIG=$TMP/kong.yml
docker compose up -d --force-recreate >/dev/null 2>&1
for _ in $(seq 1 40); do curl -sf -o /dev/null localhost:8000/api/products && break; sleep 1; done
ISS_A="https://authentik.example.com/application/o/ammu-nation/"; ISS_B="https://auth.example.com"
TOKEN_AUTHENTIK=$(python3 tests/make_token.py "$TMP/authentik.key" "$ISS_A")
TOKEN_AUTHELIA=$(python3 tests/make_token.py "$TMP/authelia.key" "$ISS_B")
TOKEN_FORGED=$(python3 tests/make_token.py "$TMP/forged.key" "$ISS_A")
TOKEN_EXPIRED=$(python3 tests/make_token.py "$TMP/authentik.key" "$ISS_A" -60)
TOKEN_UNKNOWN_ISS=$(python3 tests/make_token.py "$TMP/authentik.key" "https://inconnu.example.com")
export TOKEN_AUTHENTIK TOKEN_AUTHELIA TOKEN_FORGED TOKEN_EXPIRED TOKEN_UNKNOWN_ISS
CHECK_FORWARD=1 tests/smoke.sh
