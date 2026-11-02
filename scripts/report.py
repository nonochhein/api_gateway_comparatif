"""Agrège results/*.json -> results/RESULTS.md + graphiques SVG (stdlib uniquement)."""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
R = os.path.join(ROOT, "results")
T = [t for t in ("baseline", "kong", "apisix", "traefik") if os.path.exists(f"{R}/{t}.json")]
D = {t: json.load(open(f"{R}/{t}.json")) for t in T}
COL = {"baseline": "#888", "kong": "#1a73e8", "apisix": "#e8710a", "traefik": "#188038"}


def bars(fn, title, series, unit):
    w, h, m = 640, 60 + 34 * len(series), 150
    mx = max(v for _, v in series) or 1
    s = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" font-family="sans-serif" font-size="13">',
         f'<rect width="{w}" height="{h}" fill="white"/><text x="10" y="24" font-weight="bold">{title}</text>']
    for i, (lab, v) in enumerate(series):
        y = 44 + 34 * i; bw = (w - m - 80) * v / mx
        c = COL.get(lab.split()[0], "#555")
        s.append(f'<text x="10" y="{y+16}">{lab}</text><rect x="{m}" y="{y}" width="{bw:.1f}" height="22" fill="{c}"/>'
                 f'<text x="{m+bw+6:.1f}" y="{y+16}">{v} {unit}</text>')
    open(f"{R}/{fn}", "w").write("\n".join(s) + "</svg>")


def g(t, *k):
    d = D[t]
    for x in k:
        d = d.get(x) if isinstance(d, dict) else None
        if d is None: return None
    return d


L = ["# Résultats mesurés (généré par `scripts/report.py`)\n",
     "Mesures réalisées dans un conteneur de développement partagé (4 vCPU) : le générateur de charge Python et les gateways "
     "se partagent la machine. Les valeurs servent à comparer les solutions entre elles, pas à établir des performances absolues.\n"]
L += ["## E1/E2 – Routage et authentification (codes HTTP)\n", "| Test | " + " | ".join(T) + " |", "|---|" + "---|" * len(T)]
for k in ("/api/catalog/items", "/api/orders/items", "/api/unknown"):
    L.append(f"| route {k} | " + " | ".join(str(g(t, "E1_routage", k, "code")) for t in T) + " |")
for k in ("orders sans token", "orders token falsifié", "orders token valide", "catalog public sans token"):
    L.append(f"| {k} | " + " | ".join(str(g(t, "E2_auth", k, "code")) for t in T) + " |")
L.append("| en-tête X-Request-Id renvoyé | " + " | ".join("oui" if g(t, "E2_auth", "orders token valide", "x_request_id") else "non" for t in T) + " |")

L += ["\n## E3 – Rate limiting (limite configurée : 20 req/s par client)\n",
      "| Cible | Rafale de 200 req : 200 / 429 | 200 acceptées par seconde (5 s de charge) |", "|---|---|---|"]
for t in T:
    if t == "baseline": continue
    c = g(t, "E3_ratelimit_burst", "codes") or {}
    L.append(f"| {t} | {c.get('200',0)} / {c.get('429',0)} | {list((g(t,'E3_ratelimit_per_second_200_accepted') or {}).values())} |")

L += ["\n## E4 – Latence (catalogue, 8 clients, médiane de 3 séries de 4000 req)\n",
      "| Cible | P50 ms | P95 ms | P99 ms | surcoût P50 vs baseline |", "|---|---|---|---|---|"]
b50 = g("baseline", "E4_latence_8clients", "median_p50_ms") if "baseline" in D else None
for t in T:
    e = D[t]["E4_latence_8clients"]
    sur = "–" if t == "baseline" or b50 is None else f"{e['median_p50_ms']-b50:+.2f} ms"
    L.append(f"| {t} | {e['median_p50_ms']} | {e['median_p95_ms']} | {e['median_p99_ms']} | {sur} |")
bars("latence_p50.svg", "Latence P50 (ms) – 8 clients", [(t, D[t]["E4_latence_8clients"]["median_p50_ms"]) for t in T], "ms")
bars("latence_p99.svg", "Latence P99 (ms) – 8 clients", [(t, D[t]["E4_latence_8clients"]["median_p99_ms"]) for t in T], "ms")

L += ["\n## E5 – Débit (catalogue, 6 s par palier)\n", "| Cible | 8 clients (rps / P99 ms) | 32 clients | 64 clients | erreurs |", "|---|---|---|---|---|"]
for t in T:
    e = D[t]["E5_debit"]
    err = sum(v for r in e.values() for k, v in r["codes"].items() if k != "200")
    L.append(f"| {t} | " + " | ".join(f"{e[c]['rps']} / {e[c]['p99_ms']}" for c in ("8", "32", "64")) + f" | {err} |")
bars("debit_64.svg", "Débit à 64 clients (req/s)", [(t, D[t]["E5_debit"]["64"]["rps"]) for t in T], "rps")

L += ["\n## E6/E7 – Répartition et indisponibilité (orders, 40 req)\n",
      "| Cible | Répartition orders-1/orders-2 | 1 instance coupée (codes) | 2 instances coupées (codes, latence moy.) | catalog coupé | reprise |", "|---|---|---|---|---|---|"]
for t in T:
    if t == "baseline": continue
    d = D[t]
    L.append(f"| {t} | {d['E6_repartition']['instances']} | {d['E7a_une_instance_orders_coupee']['codes']} (max {d['E7a_une_instance_orders_coupee']['max_ms']} ms) | "
             f"{d['E7b_orders_totalement_coupe']['codes']} ({d['E7b_orders_totalement_coupe']['mean_ms']} ms) | "
             f"{d['E7c_catalog_coupe']['code']} ({d['E7c_catalog_coupe']['ms']} ms) | {d['E7d_reprise_catalog']['code']} |")
open(f"{R}/RESULTS.md", "w").write("\n".join(L) + "\n")
print("\n".join(L))
