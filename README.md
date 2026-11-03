# API Gateway — Ammu-Nation (Kong)

Point d'entrée unique devant les microservices Spring Boot du backend
([`tp-cesi-ammu-nation-backend-kafka`](https://github.com/hubhed16/tp-cesi-ammu-nation-backend-kafka)) :
`catalog-service` et `order-service`.

**Authentification : gérée par le SSO, pas par la gateway.** Kong ne vérifie aucun jeton et transmet l'en-tête
`Authorization` tel quel au backend (vérifié par les tests). C'est donc au backend (ou à un filtre branché sur le SSO) de refuser un jeton invalide.

**Kafka** : le broker est utilisé entre services sur le réseau interne ; il n'est pas exposé par la gateway (Kong route du HTTP, pas le protocole Kafka).

```
 front / client ──► Kong :8000 ──┬─► catalog-service :8080  (/api/products, /api/categories)
                                 └─► order-service   :8080  (/api/orders)
```

## Routes exposées

| Chemin | Méthodes | Politique appliquée |
|---|---|---|
| `/api/products`, `/api/categories` | toutes | 50 req/s par IP |
| `/api/orders` (et `/{id}`, `/{id}/confirm`…) | toutes | 30 req/s par IP, corps ≤ 1 Mo |
| `/internal/*`, `/actuator/*` | toutes | **403** : API interne (réservations) et supervision jamais exposées |
| tout le reste | — | 404 |

Transverse : `X-Request-Id` (corrélation, renvoyé au client), CORS (origines `*` en dev), timeout de connexion 1 s, 2 tentatives.
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
curl -i localhost:8000/api/products                                          # 200
curl -i -H "Authorization: Bearer <jeton du SSO>" localhost:8000/api/orders  # transmis au backend
curl -i localhost:8000/actuator/health                                       # 403, bloqué
```

Tests automatiques (routes, 403/404, CORS, `X-Request-Id`, quota) :
```bash
tests/smoke.sh                 # contre le vrai backend lancé
tests/run-with-mocks.sh        # sans backend : faux services + Kong
```

## Sécurité : à savoir

* Sans authentification côté gateway, **tout** ce qui est exposé dépend du SSO et du backend : tant que le backend ne vérifie pas les jetons, `/api/orders` et l'écriture du catalogue sont ouverts.
* Les quotas sont par IP (pas de notion d'utilisateur à la gateway) et locaux à une instance Kong.
* L'API d'administration de Kong n'est pas exposée hors du conteneur. CORS `*` est à restreindre à l'origine du front.

## Limites de la validation

La configuration a été validée avec de **faux services** reprenant les chemins et codes HTTP du backend lus dans les contrôleurs.
Elle n'a **pas** encore été exécutée contre le vrai backend Java : à confirmer avec `tests/smoke.sh` une fois le backend lancé
(les tests de création produit/commande supposent que le backend accepte le corps envoyé ; en cas de 400, adapter les JSON de `tests/smoke.sh`).
Kafka (présent dans le nom du dépôt) n'apparaît pas dans le code : rien à router côté gateway.

L'ancien POC comparatif (Kong / APISIX / Traefik, résultats et note de décision) reste dans l'historique git : commit `9b32fc7`.
