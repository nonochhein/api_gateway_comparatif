# Comparatif de solutions API Gateway — Kong · Apache APISIX · Traefik

POC reproductible (Docker Compose) comparant trois gateways sur un **même périmètre** : contexte **E-commerce**
(API catalogue + commandes), avec routage, authentification JWT, rate limiting, latence/débit, répartition de charge et résilience.

> Réponse courte : voir [`docs/NOTE_DECISION.md`](docs/NOTE_DECISION.md). Résultats bruts : [`results/RESULTS.md`](results/RESULTS.md).

## Application : site « Ammu-Nation » (parodie GTA V)

Un front statique (`frontend/`) simule la boutique d'armes fictive d'Ammu-Nation (univers GTA V, **aucune vente réelle**).
Il ne parle qu'à la gateway : `/` (site), `/api/catalog/*` (public), `/api/orders/*` (JWT + quota), `/auth/token` (jeton de démo).
Une console en bas de page affiche statut, instance et `X-Request-Id` de chaque appel.

```bash
docker compose --profile kong up -d      # ou apisix / traefik
# puis ouvrir http://localhost:8000       (APISIX : 9080, Traefik : 8088)
```

Captures : `docs/captures/`. Cliquer sur « Commander » se connecte automatiquement (jeton de démo) et envoie `POST /api/orders/items`.
Les commandes sont gardées en mémoire par instance de backend (démo, rien n'est persisté).

## Contenu

| Chemin | Rôle |
|---|---|
| `docker-compose.yml` | Backends factices, service d'identité, 3 gateways (profils `kong` / `apisix` / `traefik`) |
| `frontend/` | Site Ammu-Nation (HTML/CSS/JS), servi par nginx derrière la gateway |
| `backends/` | `app.py` (API factice catalogue/commandes), `auth.py` (émet et valide des JWT HS256) |
| `gateways/` | Configuration de chaque gateway (déclarative, équivalente) |
| `scripts/` | `bench.py` (générateur de charge), `experiments.py` (expériences), `run_all.sh`, `report.py` |
| `results/` | JSON bruts, journaux, `RESULTS.md`, graphiques SVG |
| `docs/` | Architecture, fiches d'expérimentation, note de décision |

## Lancer

Prérequis : Docker + Compose v2, Python 3.

```bash
scripts/run_all.sh                 # baseline + kong + apisix + traefik, puis génère results/RESULTS.md
scripts/run_all.sh kong            # une seule cible
```

Démo manuelle :

```bash
docker compose --profile kong up -d            # ou apisix (port 9080) / traefik (port 8088)
TOKEN=$(curl -s localhost:8083/token | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')
curl -i localhost:8000/api/catalog/items                                  # public
curl -i localhost:8000/api/orders/items                                   # 401
curl -i -H "Authorization: Bearer $TOKEN" localhost:8000/api/orders/items # 200
```

| Cible | Port |
|---|---|
| baseline (sans gateway) | 8081 catalogue, 8082 commandes |
| Kong | 8000 |
| APISIX | 9080 |
| Traefik | 8088 |
| service d'identité (`/token`, `/verify`) | 8083 |

## Versions et limites de ressources

Kong `3.8` (OSS, DB-less) · Apache APISIX `3.11.0` (mode standalone YAML, sans etcd) · Traefik `v3.2` (OSS) · Python `3.12-alpine`.
Chaque gateway : 1 CPU / 512 Mo. Backends : 0,5 CPU / 128 Mo. Une seule gateway tourne à la fois.
Le secret JWT dans `.env` est un secret **de démonstration** sans valeur.

## Honnêteté méthodologique

* Les gateways, les backends et le générateur de charge partagent une machine de 4 vCPU : la comparaison est **relative**.
* Les backends Python plafonnent à ~1,3–1,9 k req/s : le test de débit mesure donc surtout le backend et le générateur, pas le plafond des gateways.
* Une seule exécution complète par cible (E4 : médiane de 3 séries). Pas d'intervalle de confiance : les écarts de quelques ms sont dans le bruit.
* Édition comparées : uniquement les versions OSS. Les fonctions Enterprise (Kong Enterprise, Traefik Hub) ne sont pas évaluées.
* Les résultats chiffrés de `results/` ont été mesurés **avant** l'ajout du site (routes `/` et `/auth`) ; le catalogue y contenait des données génériques.
* Non testés : Kubernetes, haute disponibilité de la gateway elle-même, TLS/CORS/requêtes malformées, traces distribuées, mise à jour à chaud d'une route (voir `docs/FICHES_EXPERIENCES.md`).
