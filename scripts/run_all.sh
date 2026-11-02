#!/usr/bin/env bash
# Usage: scripts/run_all.sh [baseline kong apisix traefik]
set -euo pipefail
cd "$(dirname "$0")/.."
TARGETS=${*:-baseline kong apisix traefik}
for t in $TARGETS; do
  echo "=== $t ==="
  docker compose --profile kong --profile apisix --profile traefik down -t 2 >/dev/null 2>&1 || true
  if [ "$t" = baseline ]; then docker compose up -d catalog orders-1 orders-2 auth >/dev/null
  else docker compose --profile "$t" up -d >/dev/null; fi
  for i in $(seq 1 40); do curl -sf localhost:8081/health >/dev/null && curl -sf localhost:8083/token >/dev/null && break; sleep 1; done
  sleep 6   # démarrage gateway
  python3 scripts/experiments.py "$t" > "results/$t.log"
  tail -n 3 "results/$t.log" | head -1 >/dev/null
done
docker compose --profile kong --profile apisix --profile traefik down -t 2 >/dev/null
python3 scripts/report.py
