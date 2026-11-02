"""Générateur de charge minimal (stdlib) : connexions keep-alive, 1 processus par client."""
import http.client, multiprocessing as mp, time, statistics


def _worker(args):
    host, port, path, headers, duration, n_max = args
    conn = http.client.HTTPConnection(host, port, timeout=10)
    lat, codes = [], {}
    end = time.perf_counter() + duration
    n = 0
    while time.perf_counter() < end and n < n_max:
        t = time.perf_counter()
        try:
            conn.request("GET", path, headers=headers)
            r = conn.getresponse(); r.read()
            code = r.status
        except Exception:
            code = "ERR"
            conn.close(); conn = http.client.HTTPConnection(host, port, timeout=10)
        lat.append((time.perf_counter() - t) * 1000)
        codes[code] = codes.get(code, 0) + 1
        n += 1
    return lat, codes


def pct(sorted_l, p):
    return sorted_l[min(len(sorted_l) - 1, int(len(sorted_l) * p / 100))]


def run(host, port, path, concurrency, duration=None, total=None, headers=None):
    headers = headers or {}
    n_max = (total // concurrency) if total else 10**9
    dur = duration if duration else 120
    t0 = time.perf_counter()
    with mp.Pool(concurrency) as pool:
        res = pool.map(_worker, [(host, port, path, headers, dur, n_max)] * concurrency)
    elapsed = time.perf_counter() - t0
    lat = sorted(x for r in res for x in r[0])
    codes = {}
    for r in res:
        for k, v in r[1].items():
            codes[str(k)] = codes.get(str(k), 0) + v
    return {
        "requests": len(lat), "rps": round(len(lat) / elapsed, 1), "codes": codes,
        "p50_ms": round(pct(lat, 50), 2), "p95_ms": round(pct(lat, 95), 2),
        "p99_ms": round(pct(lat, 99), 2), "mean_ms": round(statistics.mean(lat), 2),
    }
