"""Exécute les expériences contre une cible : baseline | kong | apisix | traefik. Sortie: results/<cible>.json"""
import http.client, json, subprocess, sys, time, statistics, os, threading
sys.path.insert(0, os.path.dirname(__file__))
import bench

TARGETS = {"baseline": ("127.0.0.1", 8081, 8082), "kong": ("127.0.0.1", 8000, 8000),
           "apisix": ("127.0.0.1", 9080, 9080), "traefik": ("127.0.0.1", 8088, 8088)}
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
name = sys.argv[1]
host, cat_port, ord_port = TARGETS[name]


def get(port, path, headers=None, h=host):
    c = http.client.HTTPConnection(h, port, timeout=15)
    t = time.perf_counter()
    try:
        c.request("GET", path, headers=headers or {})
        r = c.getresponse(); body = r.read()
        return r.status, dict(r.getheaders()), body, (time.perf_counter() - t) * 1000
    except Exception as e:
        return "ERR", {}, str(e).encode(), (time.perf_counter() - t) * 1000
    finally:
        c.close()


def dc(*a):
    subprocess.run(["docker", "compose", *a], cwd=ROOT, check=True, capture_output=True)


c, h, b, _ = get(8083, "/token")
TOKEN = json.loads(b)["access_token"]
AUTH = {"Authorization": f"Bearer {TOKEN}"}
BAD = {"Authorization": "Bearer " + TOKEN[:-3] + "xxx"}
out = {"target": name}
secure = name != "baseline"

# E1 Routage
r = {}
for p, port in [("/api/catalog/items", cat_port), ("/api/orders/items", ord_port), ("/api/unknown", cat_port)]:
    hdr = AUTH if (secure and "orders" in p) else {}
    code, _, body, ms = get(port, p, hdr)
    svc = json.loads(body).get("service") if code == 200 else None
    r[p] = {"code": code, "service": svc, "ms": round(ms, 2)}
out["E1_routage"] = r

# E2 Authentification
r = {}
for label, port, p, hdr in [("orders sans token", ord_port, "/api/orders/items", {}),
                            ("orders token falsifié", ord_port, "/api/orders/items", BAD),
                            ("orders token valide", ord_port, "/api/orders/items", AUTH),
                            ("catalog public sans token", cat_port, "/api/catalog/items", {})]:
    code, hd, _, ms = get(port, p, hdr)
    r[label] = {"code": code, "ms": round(ms, 2), "x_request_id": hd.get("X-Request-Id") or hd.get("X-Request-ID")}
out["E2_auth"] = r

# E3 Rate limiting : 200 requêtes, 10 clients concurrents, token unique (limite configurée : 20 req/s)
if secure:
    res = bench.run(host, ord_port, "/api/orders/items", 10, total=200, headers=AUTH)
    out["E3_ratelimit_burst"] = res
    # sur 5 s à débit soutenu (~10 clients) : nb de 200 acceptées par seconde
    t0 = time.time(); per_sec = {}
    stop = time.time() + 5
    lock = threading.Lock()
    def w():
        cn = http.client.HTTPConnection(host, ord_port, timeout=10)
        while time.time() < stop:
            cn.request("GET", "/api/orders/items", headers=AUTH)
            rr = cn.getresponse(); rr.read()
            s = int(time.time() - t0)
            with lock:
                per_sec.setdefault(s, {}).setdefault(rr.status, 0)
                per_sec[s][rr.status] += 1
    ths = [threading.Thread(target=w) for _ in range(6)]
    [t.start() for t in ths]; [t.join() for t in ths]
    out["E3_ratelimit_per_second_200_accepted"] = {str(k): v.get(200, 0) for k, v in sorted(per_sec.items())}
    time.sleep(1.5)

# E4 Latence (catalog, 8 clients, 3 répétitions après chauffe)
bench.run(host, cat_port, "/api/catalog/items", 8, total=800)
runs = [bench.run(host, cat_port, "/api/catalog/items", 8, total=4000) for _ in range(3)]
out["E4_latence_8clients"] = {"runs": runs,
    "median_p50_ms": statistics.median(x["p50_ms"] for x in runs),
    "median_p95_ms": statistics.median(x["p95_ms"] for x in runs),
    "median_p99_ms": statistics.median(x["p99_ms"] for x in runs)}

# E5 Débit (balayage de concurrence, 6 s par palier)
out["E5_debit"] = {str(cc): bench.run(host, cat_port, "/api/catalog/items", cc, duration=6) for cc in (8, 32, 64)}

# E6 Répartition (orders, 40 req séquentielles, sous la limite)
def orders_seq(n, gap=0.08):
    seen, codes, lats = {}, {}, []
    for _ in range(n):
        code, hd, _, ms = get(ord_port, "/api/orders/items", AUTH if secure else {})
        codes[str(code)] = codes.get(str(code), 0) + 1; lats.append(ms)
        inst = hd.get("X-Instance")
        if inst: seen[inst] = seen.get(inst, 0) + 1
        time.sleep(gap)
    return {"codes": codes, "instances": seen, "max_ms": round(max(lats), 1), "mean_ms": round(statistics.mean(lats), 1)}

if secure:
    out["E6_repartition"] = orders_seq(40)
    # E7 Indisponibilité : 1 instance orders coupée pendant le trafic, puis les 2, puis catalog
    dc("stop", "orders-1"); time.sleep(1)
    out["E7a_une_instance_orders_coupee"] = orders_seq(40)
    dc("stop", "orders-2"); time.sleep(1)
    out["E7b_orders_totalement_coupe"] = orders_seq(10, 0.1)
    dc("start", "orders-1", "orders-2")
    dc("stop", "catalog"); time.sleep(1)
    code, _, body, ms = get(cat_port, "/api/catalog/items")
    out["E7c_catalog_coupe"] = {"code": code, "ms": round(ms, 1)}
    dc("start", "catalog"); time.sleep(3)
    code, _, _, _ = get(cat_port, "/api/catalog/items")
    out["E7d_reprise_catalog"] = {"code": code}

os.makedirs(os.path.join(ROOT, "results"), exist_ok=True)
json.dump(out, open(os.path.join(ROOT, "results", f"{name}.json"), "w"), indent=2, ensure_ascii=False)
print(json.dumps(out, indent=1, ensure_ascii=False)[:3000])
