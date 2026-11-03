"""Faux services Spring pour tester la gateway sans le backend Java : mêmes chemins, mêmes codes HTTP attendus.
SERVICE=catalog|order. Ne sert qu'à valider la configuration Kong."""
import json, os, re, uuid, urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SERVICE = os.environ.get("SERVICE", "catalog")
NS = uuid.UUID("00000000-0000-4000-8000-000000000000")

# Données lues dans le vrai script db/gta-weapons.sql (monté en /db) : le mock sert les mêmes armes que la base.
CATS, PRODUCTS = [], []
try:
    sql = open("/db/gta-weapons.sql", encoding="utf-8").read()
    for slug_row in re.findall(r"^    \('((?:[^']|'')+)', '([a-z-]+)', '((?:[^']|'')+)'\)", sql, re.M):
        name, slug, desc = (x.replace("''", "'") for x in slug_row)
        CATS.append({"id": str(uuid.uuid5(NS, slug)), "name": name, "slug": slug, "description": desc, "createdAt": "2026-01-01T00:00:00Z"})
    for m in re.findall(r"^    \('([a-z-]+)', '([A-Z0-9-]+)', '((?:[^']|'')+)', '((?:[^']|'')+)', ([0-9.]+), (\d+), '([^']+)'\)", sql, re.M):
        cat, sku, name, desc, price, stock, img = m
        PRODUCTS.append({"id": str(uuid.uuid5(NS, sku)), "categoryId": str(uuid.uuid5(NS, cat)), "sku": sku,
                         "name": name.replace("''", "'"), "description": desc.replace("''", "'"), "price": float(price),
                         "stockQuantity": int(stock), "imageUrl": img, "active": True,
                         "createdAt": "2026-01-01T00:00:00Z", "updatedAt": "2026-01-01T00:00:00Z"})
except FileNotFoundError:
    pass


class H(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    wbufsize = 65536
    def log_message(self, *a): pass

    def reply(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers(); self.wfile.write(body); self.wfile.flush()

    def handle_any(self, method):
        n = int(self.headers.get("Content-Length", "0") or 0)
        body_raw = self.rfile.read(n) if n else b""
        p = self.path
        if p.startswith("/actuator"):
            return self.reply(200, {"status": "UP"})
        path, _, qs = p.partition("?")
        q = urllib.parse.parse_qs(qs)
        if SERVICE == "catalog" and method == "GET" and path == "/api/categories":
            return self.reply(200, CATS)
        if SERVICE == "catalog" and method == "GET" and path == "/api/products":
            items = [x for x in PRODUCTS if (not q.get("categoryId") or x["categoryId"] == q["categoryId"][0])
                     and (not q.get("search") or q["search"][0].lower() in x["name"].lower())]
            size, pg = int(q.get("size", ["20"])[0]), int(q.get("page", ["0"])[0])
            return self.reply(200, {"content": items[pg * size:(pg + 1) * size], "page": pg, "size": size,
                                    "totalElements": len(items), "totalPages": max(1, -(-len(items) // size))})
        if SERVICE == "catalog" and method == "POST" and path == "/api/products":
            return self.reply(201, {"id": str(uuid.uuid4()), "sku": "mock"})
        if SERVICE == "order" and method == "POST" and path.endswith("/cancel"):
            return self.reply(200, {"status": "CANCELLED"})
        if SERVICE == "order" and method == "POST" and path == "/api/orders":
            try:
                req = json.loads(body_raw or b"{}"); lines = req["items"]; assert req["userId"] and lines
            except Exception:
                return self.reply(400, {"title": "Bad Request", "detail": "userId et items sont obligatoires"})
            by = {x["id"]: x for x in PRODUCTS}
            its = [{"id": str(uuid.uuid4()), "productId": l["productId"], "productName": by.get(l["productId"], {}).get("name", "?"),
                    "quantity": l["quantity"], "unitPrice": by.get(l["productId"], {}).get("price", 0),
                    "lineTotal": by.get(l["productId"], {}).get("price", 0) * l["quantity"]} for l in lines]
            return self.reply(201, {"id": str(uuid.uuid4()), "userId": req["userId"], "status": "PENDING",
                                    "totalAmount": sum(i["lineTotal"] for i in its), "items": its,
                                    "createdAt": "2026-01-01T00:00:00Z", "updatedAt": "2026-01-01T00:00:00Z"})
        ok = {"catalog": ("/api/products", "/api/categories", "/internal/"), "order": ("/api/orders",)}[SERVICE]
        if not path.startswith(ok):
            return self.reply(404, {"title": "Not Found"})
        self.reply(201 if method == "POST" else 200, {"service": SERVICE, "method": method, "path": p, "authorization": self.headers.get("Authorization"), "consumer": self.headers.get("X-Consumer-Username")})

    do_GET = lambda s: s.handle_any("GET")
    do_POST = lambda s: s.handle_any("POST")
    do_PUT = lambda s: s.handle_any("PUT")
    do_DELETE = lambda s: s.handle_any("DELETE")


ThreadingHTTPServer.daemon_threads = True
ThreadingHTTPServer(("0.0.0.0", 8080), H).serve_forever()
