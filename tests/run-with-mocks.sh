#!/usr/bin/env bash
# Valide la gateway sans le vrai backend : faux catalog-service / order-service + Kong, puis tests/smoke.sh.
set -euo pipefail
cd "$(dirname "$0")/.."
NET=ammu-gateway-test
docker network create $NET >/dev/null 2>&1 || true
for s in catalog order; do
  docker rm -f mock-$s >/dev/null 2>&1 || true
  docker run -d --name mock-$s --network $NET --network-alias $s-service -e SERVICE=$s \
    -v "$PWD/tests/mock/app.py:/app.py:ro" python:3.12-alpine python /app.py >/dev/null
done
export BACKEND_NETWORK=$NET
docker compose up -d --force-recreate >/dev/null 2>&1
for i in $(seq 1 40); do curl -sf -o /dev/null localhost:8000/api/products && break; sleep 1; done
rc=0; tests/smoke.sh || rc=$?
docker compose down -t 2 >/dev/null 2>&1
docker rm -f mock-catalog mock-order >/dev/null 2>&1
docker network rm $NET >/dev/null 2>&1 || true
exit $rc
