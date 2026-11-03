# API Gateway — Ammu-Nation (Kong)

Point d'entrée unique devant les microservices Spring Boot du backend
([`tp-cesi-ammu-nation-backend-kafka`](https://github.com/hubhed16/tp-cesi-ammu-nation-backend-kafka)) :
`catalog-service` et `order-service`. Les services n'ont **ni authentification ni limitation** : c'est la gateway qui les apporte.

```
 front / client ──► Kong :8000 ──┬─► catalog-service :8080  (/api/products, /api/categories)
                                 └─► order-service   :8080  (/api/orders)
```

## Routes exposées

| Chemin | Méthodes | Politique appliquée |
|---|---|---|
| `/api/products`, `/api/categories` | GET, HEAD, OPTIONS | public, 50 req/s par IP |
| `/api/products`, `/api/categories` | POST, PUT, PATCH, DELETE | **JWT obligatoire**, 20 req/s par client |
| `/api/orders` (et sous-chemins `/{id}`, `/{id}/confirm`…) | toutes | **JWT obligatoire**, 20 req/s par client, corps ≤ 1 Mo |
| `/internal/*`, `/actuator/*` | toutes | **403** : API interne (réservations) et supervision jamais exposées |
| tout le reste | — | 404 |

Transverse : en-tête `X-Request-Id` (corrélation, renvoyé au client), CORS (origines `*` en dev), timeout de connexion 1 s, 2 tentatives.
Swagger (`/swagger-ui`, `/v3/api-docs`) n'est volontairement pas routé.

## Lancer

1. Backend (dans le dépôt backend) :
```bash
docker compose up -d --build
```
2. Gateway (dans ce dépôt) :
```bash
docker compose up -d
```
La gateway rejoint le réseau du backend. Par défaut `tp-cesi-ammu-nation-backend-kafka_default` (nom du dossier + `_default`).
Si ton dossier s'appelle autrement : `docker network ls`, puis `BACKEND_NETWORK=<nom> docker compose up -d`.

Entrée unique : `http://localhost:8000`.

## Essayer

```bash
TOKEN=$(python3 scripts/jwt.py)
curl -i localhost:8000/api/products                                  # 200, public
curl -i localhost:8000/api/orders                                    # 401, pas de token
curl -i -H "Authorization: Bearer $TOKEN" localhost:8000/api/orders  # 200
curl -i localhost:8000/actuator/health                               # 403, bloqué
```

Tests automatiques (15 vérifications : routes, 401/403/404, CORS, `X-Request-Id`, quota) :
```bash
tests/smoke.sh                 # contre le vrai backend lancé
tests/run-with-mocks.sh        # sans backend : faux services + Kong
```

## Sécurité : à savoir

* Le secret JWT de `kong/kong.yml` (HS256) est un **secret de développement**. Le changer aussi dans `JWT_SECRET` pour `scripts/jwt.py`.
* Il n'y a pas de service de login : `scripts/jwt.py` émet un jeton de test. Pour la production, remplacer par un vrai fournisseur d'identité (OIDC/JWKS).
* L'API d'administration de Kong n'est pas exposée hors du conteneur. CORS `*` est à restreindre à l'origine du front.
* Les quotas sont locaux à une instance Kong.

## Limites de la validation

La configuration a été validée avec de **faux services** reprenant les chemins et codes HTTP du backend lus dans les contrôleurs.
Elle n'a **pas** encore été exécutée contre le vrai backend Java : à confirmer avec `tests/smoke.sh` une fois le backend lancé
(le test de création produit/commande suppose que le backend accepte le corps envoyé ; en cas de 400, adapter les JSON de `tests/smoke.sh`).
Kafka (présent dans le nom du dépôt) n'apparaît pas dans le code : rien à router côté gateway.

L'ancien POC comparatif (Kong / APISIX / Traefik, résultats et note de décision) reste dans l'historique git : commit `9b32fc7`.
