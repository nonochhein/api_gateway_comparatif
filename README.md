# API Gateway — Ammu-Nation (Kong)

[![CI](https://github.com/nonochhein/api_gateway_comparatif/actions/workflows/ci.yml/badge.svg)](https://github.com/nonochhein/api_gateway_comparatif/actions/workflows/ci.yml)

Point d'entrée unique devant les microservices Spring Boot du backend
([`tp-cesi-ammu-nation-backend-kafka`](https://github.com/hubhed16/tp-cesi-ammu-nation-backend-kafka)) :
`catalog-service`, `order-service` et `notification-service` (branche `notification-service` du backend, avec Kafka).

**Authentification : deux SSO en même temps, Authentik et Authelia.** Kong valide la signature (RS256) et l'expiration des jetons JWT
des deux SSO sur les mêmes routes. Un « consommateur » Kong par SSO (`sso-authentik`, `sso-authelia`) ; Kong ajoute l'en-tête
`X-Consumer-Username` et transmet `Authorization` tel quel au backend, qui sait ainsi quel SSO a émis le jeton.

**Kafka** : order-service publie les changements d'état des commandes (`orders.events.v1`, Avro) ; notification-service les consomme et les expose en HTTP.
Le broker reste sur le réseau interne : Kong route du HTTP, pas le protocole Kafka. Le site lit donc les notifications via `GET /api/notifications`.

```
 front / client ──► Kong :8000 ──┬─► catalog-service :8080  (/api/products, /api/categories)
                                 ├─► order-service   :8080  (/api/orders) ──► Kafka orders.events.v1
                                 └─► notification-service :8080 (/api/notifications) ◄──┘
```

## Site Ammu-Nation (front) et données

Le site (`frontend/`, HTML/CSS/JS, servi par nginx **derrière Kong**, **en anglais**, catalogue compris) imite la boutique d'armes d'Ammu-Nation de GTA V : charte rouge / blanc / noir,
bandeau boursier façon Wall Street en haut (fausses actions du jeu qui bougent en direct, brèves absurdes et cours des armes du catalogue ; pause au survol),
curseur « doigt d'honneur » parodique, catalogue paginé avec filtres, recherche, panier et commande. **Aucune vente réelle**. Les images des armes sont les icônes du jeu (© Rockstar Games), récupérées sur [wiki.rage.mp](https://wiki.rage.mp) et utilisées ici pour un travail scolaire non commercial. La source de chaque icône est indiquée dans `db/weapons.json`.
Il utilise les vrais formats du backend : `GET /api/products` (page), `GET /api/categories`, `POST /api/orders` `{userId, items:[{productId, quantity}]}`.

Ouvrir `http://localhost:8000`. Le bouton « SSO login » utilise **Authorization Code + PKCE** : choisir Authentik ou Authelia dans le menu, se connecter chez le fournisseur et revenir sur le site. Pas de mot de passe ni de jeton à coller dans le front.
La mise en route avec les deux dépôts, les clients OAuth, les clés publiques de Kong et Swagger est décrite dans **[SSO-INTEGRATION.md](SSO-INTEGRATION.md)**.
Le mode historique de faux jetons `scripts/dev-sso.sh` reste utilisable pour les tests de la gateway, mais n'authentifie pas un utilisateur réel dans le navigateur.
Kafbat (http://localhost:8083) montre les messages du topic `orders.events.v1`.
Une console en bas de page affiche statut et `X-Request-Id` de chaque appel.

Curseur 8 bit **noir et blanc** : **poing fermé** en navigation, **doigt d'honneur** dès qu'on survole un élément cliquable (liens, boutons, filtres, fiches produit, champ de recherche) et au clic (un petit sprite jaillit, y compris au tactile).
Les curseurs sont générés par `python3 scripts/make_cursors.py` (PNG 32×32 en pixel art, modifiables dans le script).

**Mes commandes** (connecté) : liste des commandes de l'utilisateur du jeton (`GET /api/orders?userId=…`), filtre par statut, détail des lignes, actions *Confirmer et réserver* (`/confirm`, réserve le stock), *Marquer comme livrée* (`/complete`), *Annuler* (`/cancel`, libère le stock) et *Commander à nouveau* (remet les armes encore disponibles dans le panier via `GET /api/products/{id}`).
Le backend ne vérifie pas que la commande appartient bien à l'utilisateur du jeton : le filtre `userId` est fait côté site.

**Notifications** (connecté) : cloche dans l'en-tête avec le nombre de non lues ; le site interroge `GET /api/notifications?userId=…` toutes les 5 s (30 s si l'onglet est masqué, appels non tracés dans la console), affiche une notification à chaque nouvel événement Kafka et marque comme lu (`POST /api/notifications/{id}/read`). Même limite que les commandes : `userId` n'est pas contrôlé par le backend.

Autres fonctions du site : fiche produit au clic sur l'image ou le nom (choix de la quantité), panier conservé dans le navigateur (`localStorage`) avec bouton « Vider », raccourci `/` pour la recherche, `Échap` pour fermer, bouton de retour en haut, console gateway effaçable.

Images : chaque produit affiche l'icône indiquée par son `imageUrl` (`/images/weapons/*.png`), ou une silhouette SVG dessinée pour le projet (armure, munitions, produits créés sans image). Pour remplacer une image par une photo, déposer les fichiers dans `frontend/images/photos/` et les lister dans
`frontend/images/photos/manifest.json` sous la forme `{"GTA-PISTOL": "pistol.jpg", "GTA-SNIPER": "sniper.jpg"}` (clé = `sku` du produit). Aucun autre changement n'est nécessaire.
Vérifier le droit d'utiliser chaque image (pour un travail scolaire, citer la source).

### Armes du jeu dans la base

`db/gta-weapons.sql` ajoute 11 catégories et 106 produits (104 armes et objets du jeu, plus l'armure et les munitions ; prix inspirés du jeu, approximatifs).
Il est généré par `python3 scripts/make_weapons_sql.py` à partir de `db/weapons.json`, qui donne la liste des armes et le fichier de chaque icône (dans `frontend/images/weapons/`). Les prix et descriptions se modifient dans ce script. Il est **rejouable** : il ne supprime rien (les 4 produits d'origine `AMMU-001..004` sont seulement désactivés)
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
| `/api/notifications` (et `/{id}`, `/{id}/read`) | GET, POST | **jeton d'un des 2 SSO**, 20 req/s par utilisateur, corps ≤ 1 Ko |
| `/internal/*`, `/actuator/*` | toutes | **403** : API interne (réservations) et supervision jamais exposées |
| tout le reste | — | 404 |

Transverse : `X-Request-Id` (corrélation), CORS (origines `*` en dev, préflight sans jeton), timeout de connexion 1 s, 2 tentatives.
Swagger (`/swagger-ui`, `/v3/api-docs`) n'est volontairement pas routé.

## Brancher les deux SSO (à faire : les clés de `kong/kong.yml` sont des clés de démo)

Préférer la commande automatisée suivante :

```bash
python3 scripts/configure-kong-sso.py --insecure-dev-tls --backend-root ../tp-cesi-ammu-nation-backend-kafka
KONG_CONFIG=./.dev/kong-sso.yml docker compose up -d --force-recreate kong
```

`--insecure-dev-tls` est réservé au certificat autosigné de développement. Le fichier `.dev/kong-sso.yml` contient **uniquement des clés publiques** et n'est pas à commiter. Il faut reconstruire `order-service` après une mise à jour de la clé Authelia. Voir le guide détaillé.

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
* **Authelia** : Kong et Spring doivent recevoir un **access token JWT signé RS256**, pas un ID token ; les deux clients OIDC fournis sont configurés en conséquence. À vérifier avec les vrais conteneurs.
* **Algorithme** : RS256 uniquement (ES256 ou EdDSA seraient à ajouter à la config).
* **Audience (`aud`)** : non vérifiée. Un jeton valide d'une autre application du même SSO passerait.

## Lancer

1. Backend (dans le dépôt backend, le Compose est dans un sous-répertoire) :
```bash
docker compose -p tp-cesi-ammu-nation-backend-kafka -f "docker compose/docker-compose.yaml" up -d --build
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

Site sans Docker ni Kong (faux services, pas de contrôle de jeton) et tests dans un vrai navigateur :
```bash
python3 tests/serve_front.py                     # http://127.0.0.1:8765
pip install -r tests/e2e/requirements.txt && python3 -m playwright install chromium
python3 tests/e2e/front.py http://127.0.0.1:8765  # catalogue, curseurs, recherche, fiche, panier, commandes, mobile ; captures dans e2e-captures/
```

### Intégration continue (GitHub Actions)

`.github/workflows/ci.yml` tourne à chaque push et pull request (et à la main depuis l'onglet *Actions*). Quatre jobs :

| Job | Ce qu'il vérifie |
|---|---|
| **Vérifications** | syntaxe JS et Python, `shellcheck` des scripts, fichiers générés à jour (`db/gta-weapons.sql`, curseurs), images des produits et fichiers référencés présents |
| **Config Kong** | `kong config parse kong/kong.yml` |
| **Gateway** | `tests/run-with-mocks.sh` : Kong + faux services + 2 SSO simulés (401, 403, 404, 429, CORS, en-têtes transmis) |
| **Site** | `tests/e2e/front.py` dans Chromium ; les captures d'écran sont jointes au run (*Artifacts*) |

Les résultats PASS / FAIL s'affichent dans le résumé du run. Le backend Java et les vrais SSO ne sont pas testés par la CI.

## Sécurité : à savoir

* **order-service vérifie aussi les JWT** avec Spring Security (profil `dual` pour les deux issuers). `catalog-service` et `notification-service` ne vérifient pas eux-mêmes les JWT : les routes correspondantes restent protégées par Kong. Ne pas exposer directement ces deux services en production.
* Les quotas sont locaux à une instance Kong. L'API d'administration de Kong n'est pas exposée hors du conteneur. CORS `*` est à restreindre.

## Limites de la validation

La configuration a été validée avec de **faux services** (chemins et codes HTTP lus dans les contrôleurs du backend) et de **fausses clés RSA** simulant les deux SSO.
Elle n'a **pas** encore été exécutée contre le vrai backend Java ni contre de vraies instances Authentik / Authelia : à confirmer avec `tests/smoke.sh` une fois les deux lancés
(les tests de création produit/commande supposent que le backend accepte le corps envoyé ; en cas de 400, adapter les JSON de `tests/smoke.sh`).
Kafka (présent dans le nom du dépôt) n'apparaît pas dans le code : rien à router côté gateway.

L'ancien POC comparatif (Kong / APISIX / Traefik, résultats et note de décision) reste dans l'historique git : commit `9b32fc7`.
