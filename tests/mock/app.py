"""Faux services Spring pour tester la gateway sans le backend Java : mêmes chemins, mêmes codes HTTP attendus.
SERVICE=catalog|order|notification. Ne sert qu'à valider la configuration Kong."""
import datetime, json, os, re, uuid, urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SERVICE = os.environ.get("SERVICE", "catalog")
ORDERS = {}   # commandes créées pendant la vie du mock (id -> commande), plus récente en dernier
NOTIFS = []   # notifications (comme notification-service) : remplies par les transitions quand tout tourne dans un seul process
EVENT = {"CONFIRMED": "OrderConfirmed", "CANCELLED": "OrderCancelled", "COMPLETED": "OrderCompleted"}
MOVES = {"confirm": ({"PENDING"}, "CONFIRMED"), "cancel": ({"PENDING", "CONFIRMED"}, "CANCELLED"), "complete": ({"CONFIRMED"}, "COMPLETED")}
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
        if SERVICE == "catalog" and method == "GET" and path.startswith("/api/products/"):
            x = next((x for x in PRODUCTS if x["id"] == path.rsplit("/", 1)[1]), None)
            return self.reply(200, x) if x else self.reply(404, {"title": "Not Found"})
        if SERVICE == "catalog" and method == "POST" and path == "/api/products":
            return self.reply(201, {"id": str(uuid.uuid4()), "sku": "mock"})
        m = re.fullmatch(r"/api/orders/([0-9a-f-]{36})(?:/(confirm|cancel|complete))?", path)
        if SERVICE == "order" and m and m.group(1) not in ORDERS and method == "POST" and m.group(2) == "cancel":
            return self.reply(200, {"status": "CANCELLED"})
        if SERVICE == "order" and m and (method == "GET") == (m.group(2) is None):
            o = ORDERS.get(m.group(1))
            if not o:
                return self.reply(404, {"title": "Not Found", "detail": "Commande introuvable"})
            if m.group(2):
                allowed, to = MOVES[m.group(2)]
                if o["status"] != to:
                    if o["status"] not in allowed:
                        return self.reply(409, {"title": "Conflict", "detail": f"Transition {o['status']} -> {to} interdite"})
                    o["status"] = to
                    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
                    NOTIFS.insert(0, {"id": str(uuid.uuid4()), "eventId": str(uuid.uuid4()), "orderId": o["id"], "userId": o["userId"],
                                      "type": EVENT[to], "message": "", "occurredAt": now, "createdAt": now, "readAt": None})
            return self.reply(200, o)
        if SERVICE == "order" and method == "GET" and path == "/api/orders":
            items = [o for o in reversed(ORDERS.values()) if (not q.get("userId") or o["userId"] == q["userId"][0])
                     and (not q.get("status") or o["status"] == q["status"][0])]
            size, pg = int(q.get("size", ["20"])[0]), int(q.get("page", ["0"])[0])
            return self.reply(200, {"content": items[pg * size:(pg + 1) * size], "page": pg, "size": size,
                                    "totalElements": len(items), "totalPages": max(1, -(-len(items) // size)),
                                    # en-têtes reçus, pour vérifier ce que Kong transmet (tests/smoke.sh)
                                    "authorization": self.headers.get("Authorization"), "consumer": self.headers.get("X-Consumer-Username")})
        if SERVICE == "order" and method == "POST" and path == "/api/orders":
            try:
                req = json.loads(body_raw or b"{}"); lines = req["items"]; assert req["userId"] and lines
            except Exception:
                return self.reply(400, {"title": "Bad Request", "detail": "userId et items sont obligatoires"})
            by = {x["id"]: x for x in PRODUCTS}
            its = [{"id": str(uuid.uuid4()), "productId": l["productId"], "productName": by.get(l["productId"], {}).get("name", "?"),
                    "quantity": l["quantity"], "unitPrice": by.get(l["productId"], {}).get("price", 0),
                    "lineTotal": by.get(l["productId"], {}).get("price", 0) * l["quantity"]} for l in lines]
            now = datetime.datetime.now(datetime.timezone.utc).isoformat()
            o = {"id": str(uuid.uuid4()), "userId": req["userId"], "status": "PENDING",
                 "totalAmount": sum(i["lineTotal"] for i in its), "items": its, "createdAt": now, "updatedAt": now}
            ORDERS[o["id"]] = o
            return self.reply(201, o)
        if SERVICE == "notification" and method == "GET" and path == "/api/notifications":
            items = [n for n in NOTIFS if not q.get("userId") or n["userId"] == q["userId"][0]]
            size, pg = int(q.get("size", ["20"])[0]), int(q.get("page", ["0"])[0])
            return self.reply(200, {"content": items[pg * size:(pg + 1) * size], "page": pg, "size": size,
                                    "totalElements": len(items), "totalPages": max(1, -(-len(items) // size))})
        m = re.fullmatch(r"/api/notifications/([0-9a-f-]{36})/read", path)
        if SERVICE == "notification" and m and method == "POST":
            n = next((n for n in NOTIFS if n["id"] == m.group(1)), None)
            if not n:
                return self.reply(404, {"title": "Not Found"})
            n["readAt"] = n["readAt"] or datetime.datetime.now(datetime.timezone.utc).isoformat()
            return self.reply(200, n)
        ok = {"catalog": ("/api/products", "/api/categories", "/internal/"), "order": ("/api/orders",),
              "notification": ("/api/notifications",)}[SERVICE]
        if not path.startswith(ok):
            return self.reply(404, {"title": "Not Found"})
        self.reply(201 if method == "POST" else 200, {"service": SERVICE, "method": method, "path": p, "authorization": self.headers.get("Authorization"), "consumer": self.headers.get("X-Consumer-Username")})

    do_GET = lambda s: s.handle_any("GET")
    do_POST = lambda s: s.handle_any("POST")
    do_PUT = lambda s: s.handle_any("PUT")
    do_DELETE = lambda s: s.handle_any("DELETE")


ThreadingHTTPServer.daemon_threads = True
ThreadingHTTPServer(("0.0.0.0", 8080), H).serve_forever()
