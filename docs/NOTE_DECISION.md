# Note de décision — API Gateway pour un contexte E-commerce

## Question
Quelle gateway pour exposer `catalogue` (public) et `commandes` (JWT, quotas), avec peu d'erreurs visibles en cas de panne ?

## Matrice de décision (note /5 ; poids = 100 %)
| Critère | Poids | Kong | APISIX | Traefik | Justification (preuve) |
|---|---|---|---|---|---|
| Routage et politiques | 15 | 4 | 4 | 4 | E1 identique ; Kong/APISIX offrent plus de politiques natives (non mesuré) |
| Sécurité / contrôle d'accès | 25 | 5 | 4 | 3 | E2/E3 : JWT et quota par consommateur natifs chez Kong et APISIX ; Traefik OSS exige un service `forwardAuth` ; APISIX plus précis sur le quota, Kong déborde jusqu'à +10 % |
| Débit et latence | 15 | 4 | 4 | 4 | E4/E5 : surcoût 0,8–1,5 ms, débit non discriminant (limité par le backend) |
| Résilience | 15 | 4 | 4 | 4 | E7 : failover OK chez les 3, mais Traefik seulement avec health check explicite ; Kong/APISIX paient 1 s de timeout |
| Observabilité | 10 | 4 | 4 | 3 | `X-Request-Id` natif chez Kong/APISIX (E2) ; reste **non mesuré** (métriques, traces) |
| Complexité d'exploitation | 10 | 4 | 3 | 5 | Traefik : un binaire, config courte ; APISIX : pièges rencontrés, etcd requis hors mode standalone (non testé) ; Kong : DB-less simple |
| Coûts / licences | 10 | 3 | 5 | 4 | Apache 2.0 pour APISIX ; Kong et Traefik ont des fonctions réservées aux éditions payantes (à vérifier avant achat, **non vérifié ici**) |
| **Score pondéré** | **100** | **4,15** | **4,00** | **3,75** | |

Les notes sont un jugement argumenté à partir des tests de ce dépôt : l'écart Kong/APISIX (0,15) est **plus petit que l'incertitude** des mesures.

## Recommandation
**Kong (OSS, DB-less) ou APISIX** pour ce contexte, car l'authentification JWT et le quota par consommateur sont natifs et validés (E2, E3) :
- choisir **Kong** si l'équipe privilégie l'écosystème et la documentation de plugins ;
- choisir **APISIX** si la licence libre et un quota plus précis comptent davantage.
**Traefik** reste le meilleur choix si la gateway sert surtout d'ingress Docker/Kubernetes et si l'authentification est déjà externalisée : son score plus bas vient de l'absence de JWT natif, pas d'un défaut de performance.

Aucune solution n'est la meilleure dans l'absolu : cette recommandation vaut pour un contexte E-commerce avec JWT natif et quotas par client.

## Compromis et limites
- Mesures sur machine partagée, backend Python plafonné, une exécution par cible : pas de conclusion sur le débit maximal ni sur les latences P95/P99.
- Non testés : Kubernetes, haute disponibilité de la gateway, sécurité TLS/CORS, observabilité complète, éditions payantes. La recommandation doit être confirmée par un second test sur l'infrastructure cible avant décision finale.
- Critères éliminatoires : aucun n'a éliminé une solution ; si « validation JWT sans composant tiers » devenait éliminatoire, Traefik OSS serait écarté.
