# Architecture du POC

## Contexte métier : E-commerce

* **Acteurs** : application web/mobile (clients authentifiés), visiteurs anonymes (consultation du catalogue), service d'identité.
* **Flux** : `GET /api/catalog/*` (public) ; `GET /api/orders/*` (JWT obligatoire, 20 req/s max par client).
* **Contraintes de sécurité** : commandes protégées par JWT HS256 ; rejet des tokens absents/falsifiés ; limitation anti-abus.
* **Volumes visés par le POC** : jusqu'à 64 clients concurrents ; pic de trafic simulé par rafale de 200 requêtes.
* **Critères de succès** : routage exact, 401 sans token valide, ≤ 20 req/s acceptées par client, surcoût de latence faible,
  pas d'erreur visible côté client quand une instance tombe.

## Schéma

```
                          ┌────────────┐      ┌───────────────┐
 client ──► GATEWAY ───►  │  catalog   │      │ auth (JWT)    │ ◄── /token  (client de test)
 (kong | apisix | traefik)│  :8080     │      │ /token /verify│ ◄── /verify (forwardAuth Traefik)
            │             └────────────┘      └───────────────┘
            │  /api/orders  ┌────────────┐ ┌────────────┐
            └──────────────►│ orders-1   │ │ orders-2   │   (même API, 2 instances)
                            └────────────┘ └────────────┘
```

Réseau Compose unique. Une seule gateway démarrée à la fois pour un partage CPU équitable ; la baseline appelle les backends directement.

## Gateway vs reverse proxy vs API management

| Notion | Ce que le POC couvre |
|---|---|
| Reverse proxy | routage par chemin, répartition round-robin (les 3 solutions) |
| API gateway | authentification JWT, rate limiting par consommateur, corrélation de requêtes (Kong, APISIX natifs) |
| API management complet (portail développeur, monétisation, analytics, cycle de vie) | **Non couvert** : hors périmètre OSS testé |

## Configuration équivalente

| Élément | Kong | APISIX | Traefik |
|---|---|---|---|
| Config | `gateways/kong/kong.yml` (DB-less) | `gateways/apisix/conf/apisix.yaml` (standalone) | `gateways/traefik/dynamic.yml` (file provider) |
| JWT | plugin `jwt` natif | plugin `jwt-auth` natif | **pas de JWT natif en OSS** → `forwardAuth` vers `auth` |
| Rate limit | `rate-limiting` (20/s, par consumer) | `limit-count` (20/1s, par consumer) | `rateLimit` (average 20/s, burst 20, clé = en-tête Authorization) |
| ID de corrélation | `correlation-id` | `request-id` | non configuré (hors périmètre) |
| Résilience | connect timeout 1 s, 2 retries | connect timeout 1 s, 2 retries | retry (2 tentatives) + health check actif 1 s |

## Pièges rencontrés (utiles à qui reproduit)

* APISIX : le `username` d'un consumer n'accepte pas le tiret (`^[a-zA-Z0-9_]+$`) ; sans cela le consumer est ignoré et le JWT renvoie 401.
* APISIX : sur un hôte sans IPv6, désactiver `apisix.enable_ipv6`, sinon nginx refuse de démarrer.
* Kong : les timeouts par défaut sont longs (connexion 60 s) ; sans réglage explicite, un backend coupé bloque le client (>15 s observés lors d'une première exécution).
* Traefik : sans `healthCheck`, une instance coupée reste dans la rotation (voir E7).
* Backend Python : sans tampon d'écriture, en-têtes et corps partent en deux paquets et déclenchent le délai ACK de ~40 ms qui faussait la première série de mesures (corrigé, `wbufsize`).
