# Résultats mesurés (généré par `scripts/report.py`)

Mesures réalisées dans un conteneur de développement partagé (4 vCPU) : le générateur de charge Python et les gateways se partagent la machine. Les valeurs servent à comparer les solutions entre elles, pas à établir des performances absolues.

## E1/E2 – Routage et authentification (codes HTTP)

| Test | baseline | kong | apisix | traefik |
|---|---|---|---|---|
| route /api/catalog/items | 200 | 200 | 200 | 200 |
| route /api/orders/items | 200 | 200 | 200 | 200 |
| route /api/unknown | 200 | 404 | 404 | 404 |
| orders sans token | 200 | 401 | 401 | 401 |
| orders token falsifié | 200 | 401 | 401 | 401 |
| orders token valide | 200 | 200 | 200 | 200 |
| catalog public sans token | 200 | 200 | 200 | 200 |
| en-tête X-Request-Id renvoyé | non | oui | oui | non |

## E3 – Rate limiting (limite configurée : 20 req/s par client)

| Cible | Rafale de 200 req : 200 / 429 | 200 acceptées par seconde (5 s de charge) |
|---|---|---|
| kong | 21 / 179 | [22, 22, 20, 22, 20, 0] |
| apisix | 18 / 182 | [20, 20, 20, 20, 20, 0] |
| traefik | 26 / 174 | [20, 20, 20, 20, 20, 2] |

## E4 – Latence (catalogue, 8 clients, médiane de 3 séries de 4000 req)

| Cible | P50 ms | P95 ms | P99 ms | surcoût P50 vs baseline |
|---|---|---|---|---|
| baseline | 1.59 | 6.55 | 58.03 | – |
| kong | 2.58 | 28.01 | 51.31 | +0.99 ms |
| apisix | 2.36 | 47.41 | 55.84 | +0.77 ms |
| traefik | 3.08 | 33.73 | 44.71 | +1.49 ms |

## E5 – Débit (catalogue, 6 s par palier)

| Cible | 8 clients (rps / P99 ms) | 32 clients | 64 clients | erreurs |
|---|---|---|---|---|
| baseline | 1880.4 / 58.44 | 1742.3 / 82.22 | 1263.3 / 123.95 | 0 |
| kong | 1442.2 / 51.3 | 1361.0 / 92.45 | 1312.0 / 216.68 | 4 |
| apisix | 1418.0 / 56.5 | 1340.1 / 93.9 | 1241.9 / 264.47 | 9 |
| traefik | 1404.1 / 46.17 | 1410.5 / 89.62 | 1253.9 / 259.61 | 0 |

## E6/E7 – Répartition et indisponibilité (orders, 40 req)

| Cible | Répartition orders-1/orders-2 | 1 instance coupée (codes) | 2 instances coupées (codes, latence moy.) | catalog coupé | reprise |
|---|---|---|---|---|---|
| kong | {'orders-2': 20, 'orders-1': 20} | {'200': 40} (max 1005.9 ms) | {'504': 10} (2990.8 ms) | 504 (3007.0 ms) | 200 |
| apisix | {'orders-1': 21, 'orders-2': 19} | {'200': 40} (max 1004.9 ms) | {'502': 10} (1982.0 ms) | 504 (3005.0 ms) | 200 |
| traefik | {'orders-2': 20, 'orders-1': 20} | {'200': 40} (max 7.6 ms) | {'503': 10} (2.6 ms) | 502 (13.3 ms) | 200 |
