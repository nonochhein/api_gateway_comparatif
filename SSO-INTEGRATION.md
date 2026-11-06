# POC CESI — connexion réelle du frontend à Authentik et Authelia

Cette livraison relie les deux dépôts : le front statique (port `8000`) déclenche un login OAuth2/OIDC **Authorization Code + PKCE S256**. Kong valide la signature des tokens JWT RS256 avant d'envoyer les requêtes, et le `order-service` Spring les revalide. Le profil Spring `dual` accepte **les deux issuers simultanément** : le sélecteur du front permet donc de changer de SSO sans redémarrer le backend.

**Pré-requis :** placer les deux dépôts côte à côte, sur la même machine :

```
.../tp-cesi-ammu-nation-backend-kafka/
.../api_gateway_comparatif/
```

Conserver les fichiers `.env` et `infra/authelia/secrets/` **existants**, absents de cette archive pour des raisons de sécurité. Ne jamais commiter les clés privées ou les secrets.

## 1. Configurer Authentik (http://localhost:9000)

Dans l'interface admin, ouvrir le **Provider OAuth2/OIDC existant** qui sert déjà au Swagger `ammu-nation`. Ne pas créer un second provider avec un autre slug : dans Authentik, le slug influence l'issuer. Ajouter le callback du front au provider existant.

| Paramètre | Valeur |
|---|---|
| Application slug | `ammu-nation` |
| Client ID | `ammu-nation-swagger` (le **même client public** pour Swagger et le front, pour ce POC) |
| Client type | **Public** (aucun client secret dans le JavaScript) |
| Grant | **Authorization Code**, PKCE `S256` |
| Signing key | Une **clé RSA** (jetons RS256), pas de HS256 |
| Scopes | `openid`, `profile`, `email` |
| Redirect URI front (strict) | `http://localhost:8000/` |
| Redirect URI front variante (strict) | `http://127.0.0.1:8000/` |
| Redirect URI Swagger (strict) | `http://127.0.0.1:8082/swagger-ui/oauth2-redirect.html` et/ou `http://localhost:8082/swagger-ui/oauth2-redirect.html` |

Dans `frontend/sso-config.js`, changer les URLs si votre Authentik n'est pas sur `http://localhost:9000` ; elles doivent correspondre **exactement** à son issuer et aux endpoints de discovery : `http://localhost:9000/application/o/ammu-nation/.well-known/openid-configuration`.

Vérifier que son `client_id` et son `issuer` correspondent à ceux reçus. Si un vieux provider Authentik est `Confidential`, le convertir en `Public` ou en créer un nouveau public et mettre à jour **aussi** le slug/issuer côté backend, Kong et Swagger.

## 2. Configurer Authelia (https://auth.ammu.lvh.me)

`infra/authelia/config/configuration.yml` contient maintenant **deux clients** :

- `ammu-nation-swagger` : redirections Swagger sur le port 8082.
- `ammu-nation-front-authelia` : redirections front sur le port 8000, sans secret, PKCE S256, jeton d'accès RS256 avec audience `http://localhost:8082`.

La configuration CORS autorise désormais les origines des deux ports. Depuis la racine du backend :

```bash
sudo docker compose -f infra/authelia/compose.yml up -d --force-recreate authelia
```

Si HTTPS est autosigné, ouvrir `https://auth.ammu.lvh.me` dans Chrome et faire confiance **explicitement** au certificat de développement, sinon le navigateur bloquera le POST du token endpoint. Le flag `--insecure-dev-tls` du script Python ci-dessous ne supprime pas cette vérification de certificat dans Chrome.

## 3. Préparer la gateway Kong avec les vraies clés publiques

Depuis le dépôt du **front** :

```bash
python3 scripts/configure-kong-sso.py \
  --insecure-dev-tls \
  --backend-root ../tp-cesi-ammu-nation-backend-kafka
```

Cette commande contacte les JWKS **publics** des deux serveurs, produit `.dev/kong-sso.yml` (issuers + clés publiques) et remet à jour `order-service/src/main/resources/authelia-public.pem` en fonction de la clé publique actuelle d'Authelia. Pas de secret ni de clé privée créée/committée. `--insecure-dev-tls` ne sert qu'à récupérer le JWKS depuis un Authelia local utilisant un certificat autosigné : **à enlever** dès que le certificat est fiable.

Si les repos ne sont pas voisins, remplacer `--backend-root` par son vrai chemin. Si un issuer diffère des valeurs par défaut, passer `--authentik-issuer` / `--authelia-issuer` et synchroniser aussi `frontend/sso-config.js` et le backend. Le script accepte également un fichier JWKS local au lieu d'une URL, via `--authentik-jwks` et `--authelia-jwks`.

**Important :** ces clés changent parfois (rotation). Relancer le script, reconstruire le backend et recréer Kong en cas de rotation. Laisser `kong/kong.yml` dans le dépôt comme configuration de démonstration, ne pas le prendre pour une clé réelle !

## 4. Lancer les deux dépôts connectés

Dans la racine du **backend**, après avoir démarré Authentik et Authelia :

```bash
sudo env SPRING_PROFILES_ACTIVE=dual docker compose -p tp-cesi-ammu-nation-backend-kafka -f "docker compose/docker-compose.yaml" up -d --build
sudo docker compose -p tp-cesi-ammu-nation-backend-kafka -f "docker compose/docker-compose.yaml" ps order-service
```

Le profil `dual` active un `JwtDecoder` qui sait sélectionner Authentik ou Authelia **uniquement** parmi les deux issuers approuvés, puis valide signature, issuer, expiration et (pour Authelia) audience, type de token et client ID. Le backend écoute `127.0.0.1:8082` via Docker.

Dans la racine du **front** :

```bash
sudo env KONG_CONFIG=./.dev/kong-sso.yml docker compose up -d --force-recreate
```

La valeur `-p tp-cesi-ammu-nation-backend-kafka` garantit le nom du réseau externe attendu par Kong et Authelia (`tp-cesi-ammu-nation-backend-kafka_default`), même si le Compose backend est dans un sous-dossier. Si le réseau Docker du backend porte déjà un nom différent : `sudo docker network ls` puis ajouter `BACKEND_NETWORK=<nom>` à `sudo env` et mettre à jour le réseau externe d'Authelia.

*Avertissement sur l'environnement :* tous ces services nécessitent Docker, les bases, Kafka et des comptes SSO que vous possédez sur votre PC. Le code seul ne crée pas les comptes Authentik, qui peuvent être provisionnés dans son interface et via ses flux d'inscription.

## 5. Tester l'authentification de bout en bout

1. Ouvrir **`http://localhost:8000/`** (conserver **localhost** lors de tout le parcours, ne pas alterner avec 127.0.0.1).
2. Choisir **Authentik** puis **SSO login**. Le navigateur part vers `http://localhost:9000`, puis revient au front. Le bouton passe à **Log out** et le pseudo s'affiche en haut (sur grand écran).
3. Cliquer **My orders** : les appels à `/api/orders` doivent répondre **200** (ou 200 avec une liste vide), pas 401 ; la console Gateway en bas montre les codes HTTP.
4. Déconnecter le **front**, choisir **Authelia**, se connecter avec son utilisateur (ex. `john`, pas son display name), vérifier de nouveau les commandes.
5. Ouvrir **`http://127.0.0.1:8082/swagger-ui/index.html`**, bouton **Authorize** : le profil `dual` présente les **deux** schémas OAuth2. Choisir le même fournisseur, se connecter/autoriser, et tester `GET /api/orders`.
6. Pour démontrer le **SSO**, refaire Swagger après la connexion au front **sans se déconnecter du fournisseur d'identité** : si sa session IdP est toujours active, le fournisseur réutilise cette session (un écran de consentement peut encore s'afficher). Chaque application obtient son propre token : le token du front n'est pas injecté automatiquement dans Swagger.

Tests rapides sans connexion :

```bash
curl -i http://localhost:8000/api/products                    # 200 si catalogue en route
curl -i http://localhost:8000/api/orders                      # 401 sans Bearer
curl -i http://127.0.0.1:8082/api/orders                      # 401 sans Bearer
node --test tests/oidc.test.cjs                               # tests PKCE, state, callback
```

### Si ça bloque

| Symptôme | Diagnostic courant |
|---|---|
| `invalid_redirect_uri` | Ajouter **exactement** `http://localhost:8000/` au client, y compris le slash final |
| `invalid_client` à `/token` | Le client Authentik n'est pas `Public` ou les `client_id` diffèrent |
| Erreur CORS dans Chrome | Origine `http://localhost:8000` non autorisée par l'IdP ; vérifier config et logs |
| Authentik login OK, mais front `401` | Kong a encore ses clés de démonstration, les issuers diffèrent, ou Spring ne tourne pas en profil `dual` |
| Authelia `401` malgré login | Clé publique Authelia périmée, mauvais `aud` ou token qui n'est pas un JWT d'accès RS256 |
| Site `502/503` | Kong ne joint pas les conteneurs backend / mauvais `BACKEND_NETWORK` |
| Swagger n'affiche qu'un seul SSO | `order-service` n'a pas été **rebuild** avec `SPRING_PROFILES_ACTIVE=dual` |

Voir les logs :

```bash
sudo docker compose logs --tail=100 kong
# Depuis le backend :
sudo docker compose -p tp-cesi-ammu-nation-backend-kafka -f "docker compose/docker-compose.yaml" logs --tail=100 order-service
```

## Sécurité et périmètre du POC

- Ce montage démontre le SSO/OIDC et la validation des JWT **en local**. Ne pas publier `localhost`, des clés privées, `.env`, ni utiliser `--insecure-dev-tls` en production.
- Les access tokens sont conservés dans le **sessionStorage** de l'onglet (pas dans une URL) ; la déconnexion du front supprime son token, mais **ne ferme pas la session centrale** du fournisseur d'identité.
- Kong OSS utilise des clés publiques **statiques**, donc relancer le générateur après rotation.
- Les endpoints `catalog-service` et `notification-service` n'appliquent pas eux-mêmes de contrôle OAuth2 : seul Kong les protège. `order-service` vérifie aussi les tokens.
- Le backend existant accepte un `userId` envoyé par le client pour voir/agir sur les commandes : il n'en vérifie pas encore la correspondance avec le `sub` du JWT. **Il faut corriger l'autorisation par propriétaire avant une utilisation réelle.**
