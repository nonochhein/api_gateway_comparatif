# API Gateway — Ammu-Nation (Kong)

Point d'entrée unique devant les microservices Spring Boot du backend
([`tp-cesi-ammu-nation-backend-kafka`](https://github.com/hubhed16/tp-cesi-ammu-nation-backend-kafka)) :
`catalog-service` et `order-service`.

**Authentification : deux SSO en même temps, Authentik et Authelia.** Kong valide la signature (RS256) et l'expiration des jetons JWT
des deux SSO sur les mêmes routes. Un « consommateur » Kong par SSO (`sso-authentik`, `sso-authelia`) ; Kong ajoute l'en-tête
`X-Consumer-Username` et transmet `Authorization` tel quel au backend, qui sait ainsi quel SSO a émis le jeton.

**Kafka** : le broker est utilisé entre services sur le réseau interne ; il n'est pas exposé par la gateway (Kong route du HTTP, pas le protocole Kafka).

```
 front / client ──► Kong :8000 ──┬─► catalog-service :8080  (/api/products, /api/categories)
                                 └─► order-service   :8080  (/api/orders)
```

## Site Ammu-Nation (front) et données

Le site (`frontend/`, HTML/CSS/JS, servi par nginx **derrière Kong**) imite la boutique d'armes d'Ammu-Nation de GTA V : charte rouge / blanc / noir,
curseur « doigt d'honneur » parodique, catalogue paginé avec filtres, recherche, panier et commande. **Aucune vente réelle** ; les images sont des silhouettes dessinées pour le projet (pas d'assets de Rockstar).
Il utilise les vrais formats du backend : `GET /api/products` (page), `GET /api/categories`, `POST /api/orders` `{userId, items:[{productId, quantity}]}`.

Ouvrir `http://localhost:8000`. Commander demande un jeton du SSO : le SSO n'existant pas encore, le bouton « Connexion SSO » accepte un JWT collé à la main.
Une console en bas de page affiche statut et `X-Request-Id` de chaque appel.

Curseur : **poing fermé** en navigation, **doigt d'honneur 8 bit** au clic (le curseur change 0,45 s et un petit sprite jaillit, y compris au tactile).
Les curseurs sont générés par `python3 scripts/make_cursors.py` (PNG 32×32 en pixel art, modifiables dans le script).

Photos : le site affiche des silhouettes dessinées par défaut. Pour mettre de vraies photos, déposer les fichiers dans `frontend/images/photos/` et les lister dans
`frontend/images/photos/manifest.json` sous la forme `{"GTA-PISTOL": "pistol.jpg", "GTA-SNIPER": "sniper.jpg"}` (clé = `sku` du produit). Aucun autre changement n'est nécessaire.
Vérifier le droit d'utiliser chaque image (pour un travail scolaire, citer la source).

### Armes du jeu dans la base

`db/gta-weapons.sql` ajoute 7 catégories et 28 armes (prix inspirés du jeu, approximatifs). Il est **rejouable** : il ne supprime rien (les 4 produits d'origine `AMMU-001..004` sont seulement désactivés)
et ne touche pas au stock d'un produit déjà présent. À lancer depuis le dossier du **backend**, une fois ses conteneurs démarrés :

```bash
docker compose exec -T catalog-db psql -U catalog -d catalog < ../api_gateway_comparatif/db/gta-weapons.sql
```

Ce script modifie la base locale en cours d'exécution, pas le dépôt du backend : après un `docker compose down -v`, la base repart du seed d'origine et il faut le rejouer.
Pour le rendre permanent, il faudrait en faire une migration Flyway (`V4__…sql`) dans le dépôt du backend, ce que je n'ai pas fait.

## Routes exposées

| Chemin | Méthodes | Politique appliquée |
|---|---|---|
| `/` (site), `/images/*` | GET | public, fichiers statiques |
| `/api/products`, `/api/categories` | GET, HEAD, OPTIONS | public, 50 req/s par IP |
| `/api/products`, `/api/categories` | POST, PUT, PATCH, DELETE | **jeton d'un des 2 SSO**, 20 req/s par utilisateur |
| `/api/orders` (et `/{id}`, `/{id}/confirm`…) | toutes | **jeton d'un des 2 SSO**, 30 req/s par utilisateur, corps ≤ 1 Mo |
| `/internal/*`, `/actuator/*` | toutes | **403** : API interne (réservations) et supervision jamais exposées |
| tout le reste | — | 404 |

Transverse : `X-Request-Id` (corrélation), CORS (origines `*` en dev, préflight sans jeton), timeout de connexion 1 s, 2 tentatives.
Swagger (`/swagger-ui`, `/v3/api-docs`) n'est volontairement pas routé.

## Brancher les deux SSO (à faire : les clés de `kong/kong.yml` sont des clés de démo)

Pour **chaque** SSO, deux valeurs à mettre dans `consumers:` de `kong/kong.yml` :
1. `key` = valeur exacte de la claim `iss` de ses jetons (décoder un jeton sur jwt.io, ou lire le champ `issuer` de son `/.well-known/openid-configuration`).
2. `rsa_public_key` = sa clé publique de signature, obtenue avec le script :
```bash
python3 scripts/jwks_to_pem.py https://<authentik>/application/o/<slug>/jwks/   # Authentik
python3 scripts/jwks_to_pem.py https://<authelia>/jwks.json                      # Authelia
```
Puis `docker compose restart kong`.

Points d'attention :
* **Rotation des clés** : Kong OSS ne relit pas le JWKS. Après une rotation de clé du SSO, refaire la commande et redémarrer Kong.
* **Authelia** : ses jetons d'accès sont opaques par défaut ; Kong ne sait valider que des JWT. Il faut configurer le client OIDC pour émettre des jetons d'accès JWT, ou envoyer l'ID token. Je ne l'ai pas vérifié sur une vraie instance.
* **Algorithme** : RS256 uniquement (ES256 ou EdDSA seraient à ajouter à la config).
* **Audience (`aud`)** : non vérifiée. Un jeton valide d'une autre application du même SSO passerait.

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
curl -i localhost:8000/api/products                                          # 200, public
curl -i localhost:8000/api/orders                                            # 401, pas de jeton
curl -i -H "Authorization: Bearer <jeton du SSO>" localhost:8000/api/orders   # 200 si jeton valide
curl -i localhost:8000/actuator/health                                       # 403, bloqué
```

Tests automatiques :
```bash
tests/run-with-mocks.sh        # sans backend ni SSO : faux services (alimentés par db/gta-weapons.sql) + 2 fausses paires de clés RSA
TOKEN_AUTHENTIK=<jeton> TOKEN_AUTHELIA=<jeton> tests/smoke.sh   # vrai backend et vrais SSO : crée puis annule une commande,
                                                                 # crée puis désactive un produit « SMOKE-… » (reste en base, inactif)
```

## Sécurité : à savoir

* Le backend n'a pas d'authentification : **la gateway est la seule barrière**. Ne jamais exposer `catalog-service` / `order-service` directement (ports 8081/8082 du compose backend liés à `127.0.0.1` : à conserver).
* Les quotas sont locaux à une instance Kong. L'API d'administration de Kong n'est pas exposée hors du conteneur. CORS `*` est à restreindre.

## Limites de la validation

La configuration a été validée avec de **faux services** (chemins et codes HTTP lus dans les contrôleurs du backend) et de **fausses clés RSA** simulant les deux SSO.
Elle n'a **pas** encore été exécutée contre le vrai backend Java ni contre de vraies instances Authentik / Authelia : à confirmer avec `tests/smoke.sh` une fois les deux lancés
(les tests de création produit/commande supposent que le backend accepte le corps envoyé ; en cas de 400, adapter les JSON de `tests/smoke.sh`).
Kafka (présent dans le nom du dépôt) n'apparaît pas dans le code : rien à router côté gateway.

L'ancien POC comparatif (Kong / APISIX / Traefik, résultats et note de décision) reste dans l'historique git : commit `9b32fc7`.
