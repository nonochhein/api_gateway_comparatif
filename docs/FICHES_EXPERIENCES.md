# Fiches d'expérimentation

Environnement commun : voir `README.md` (versions, limites CPU/RAM) et `docs/ARCHITECTURE.md`. Toutes les mesures :
`results/<cible>.json`, synthèse `results/RESULTS.md`. Commande : `scripts/run_all.sh`.
Les expériences E1–E7 sont exécutées par `scripts/experiments.py` (procédure = le code).

## E1 — Routage
* **Hypothèse** : les 3 gateways routent `/api/catalog` et `/api/orders` vers le bon service, et répondent 404 sur une route inconnue.
* **Procédure** : `GET /api/catalog/items`, `/api/orders/items` (avec token), `/api/unknown`.
* **Résultat** : conforme pour les 3 (200/200/404). La baseline renvoie 200 sur `/api/unknown` (le backend répond à tout) : c'est la gateway qui apporte la route fermée.
* **Décision** : routage par préfixe équivalent partout ; Traefik et APISIX/Kong comparables en simplicité (≈ 10 lignes de config par route).

## E2 — Authentification
* **Hypothèse** : sans token ou avec token falsifié → 401 ; token valide → 200 ; catalogue public inchangé.
* **Résultat** : 401 / 401 / 200 / 200 pour les 3. Kong et APISIX valident le JWT eux-mêmes ; **Traefik délègue à un service tiers** (`forwardAuth`), donc un composant et un saut réseau de plus à exploiter.
* **Limite** : seul HS256 testé ; pas d'OIDC/JWKS, pas de test d'expiration.

## E3 — Rate limiting (limite 20 req/s par client)
* **Hypothèse** : ≈ 20 réponses 200 par seconde, le reste en 429.
* **Procédure** : rafale de 200 req (10 clients) ; puis 5 s de charge avec comptage des 200 par seconde.
* **Résultat** : rafale → Kong 21 / APISIX 18 / Traefik 26 acceptées. Par seconde : Kong 22,22,20,22,20 ; APISIX 20 ×5 ; Traefik 20 ×5.
  Kong (fenêtre locale) dépasse légèrement la limite (jusqu'à +10 %) ; APISIX est le plus précis ; Traefik (token bucket) autorise le burst initial configuré.
* **Limite** : un seul client ; l'équité entre clients n'est pas mesurée. Quota local à une instance (pas de quota global en multi-instances).

## E4 — Latence (8 clients, catalogue, médiane de 3 × 4000 req après chauffe)
| Cible | P50 | P95 | P99 |
|---|---|---|---|
| baseline | 1,59 ms | 6,55 ms | 58,03 ms |
| Kong | 2,58 ms | 28,01 ms | 51,31 ms |
| APISIX | 2,36 ms | 47,41 ms | 55,84 ms |
| Traefik | 3,08 ms | 33,73 ms | 44,71 ms |
* **Résultat** : surcoût médian de 0,8 à 1,5 ms par gateway. Les P95/P99 sont dominés par le bruit de l'hôte partagé et du générateur Python : **aucun classement fiable** sur la queue de distribution.

## E5 — Débit (64 clients, 6 s)
* **Résultat** : baseline 1263 rps ; Kong 1312 ; APISIX 1242 ; Traefik 1254. Écart non significatif : le plafond vient du backend Python et du générateur, pas des gateways. Quelques erreurs : Kong 4 et APISIX 9 sur ≈ 8 000 requêtes (cause non investiguée).
* **Conclusion** : ce test **ne permet pas** de départager les gateways en débit maximal ; il faudrait un backend natif (ex. nginx) et un générateur dédié (k6, wrk) sur une machine séparée.

## E6 — Répartition
* **Résultat** : 20/20 (Kong, Traefik), 21/19 (APISIX) sur 40 requêtes : round-robin équitable. Affinité de session non testée.

## E7 — Service indisponible (instance coupée pendant le trafic, 40 req à ~12 req/s)
| Scénario | Kong | APISIX | Traefik (retry + healthcheck) | Traefik (retry seul) |
|---|---|---|---|---|
| 1 instance orders coupée | 40×200, pic 1006 ms | 40×200, pic 1005 ms | 40×200, pic 7,6 ms | 20×200 + **20×502** |
| 2 instances coupées | 10×504 (≈ 3,0 s) | 10×502 (≈ 2,0 s) | 10×503 (≈ 3 ms) | 10×502 |
| catalogue coupé | 504 (3,0 s) | 504 (3,0 s) | 502 (13 ms) | 502 |
| reprise après redémarrage | 200 | 200 | 200 | 200 |
* **Résultat** : Kong et APISIX masquent la panne via retry sur l'autre instance mais paient le timeout de connexion (1 s) sur les requêtes concernées. Traefik, sans health check, a laissé 50 % d'erreurs 502 malgré le retry ; avec health check actif (1 s) le trafic est dérouté sans erreur visible, mais sans protection tant que la panne n'est pas détectée.
* **Limite** : pas de circuit breaker testé ; les codes d'erreur diffèrent (502/503/504) et le client doit les traiter de façon homogène.

## Non réalisé (à signaler explicitement)
Observabilité complète (métriques Prometheus, traces), sécurité (CORS, TLS, en-têtes, requêtes malformées), déploiement à chaud d'une route,
Kubernetes / haute disponibilité. Seul l'identifiant de corrélation (`X-Request-Id`) a été observé : présent chez Kong et APISIX, non configuré chez Traefik.
Ces points sont notés dans la matrice sur la base de la documentation et sont marqués « non mesuré ».
