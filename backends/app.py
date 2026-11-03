"""API factice (catalogue / commandes). Stdlib uniquement, identique pour toutes les gateways."""
import json, os, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

NAME = os.environ.get("SERVICE_NAME", "catalog")
INSTANCE = os.environ.get("INSTANCE", NAME)
DELAY_MS = float(os.environ.get("DELAY_MS", "0"))

WEAPONS = [
    ("Pistol", "Pistolets", 500, "Le classique fiable pour débuter à Los Santos."),
    ("Combat Pistol", "Pistolets", 750, "Chargeur étendu, cadence soutenue."),
    ("AP Pistol", "Pistolets", 1200, "Pistolet automatique, rafales courtes."),
    ("Micro SMG", "Mitraillettes", 1700, "Compacte, idéale en voiture."),
    ("SMG", "Mitraillettes", 2500, "Polyvalente à courte et moyenne distance."),
    ("Assault Rifle", "Fusils d'assaut", 3500, "L'arme de référence des équipes."),
    ("Carbine Rifle", "Fusils d'assaut", 3800, "Précise, légère, modulable."),
    ("Pump Shotgun", "Fusils à pompe", 1900, "Dévastateur à courte portée."),
    ("Sawed-Off Shotgun", "Fusils à pompe", 2200, "Format réduit, impact maximal."),
    ("Sniper Rifle", "Précision", 8000, "Portée extrême, lunette incluse."),
    ("Knife", "Mêlée", 100, "Discret et silencieux."),
    ("Baseball Bat", "Mêlée", 50, "Un classique de la rue."),
    ("Body Armor", "Équipement", 1000, "Gilet pare-balles léger."),
    ("Ammo Pack", "Équipement", 250, "Munitions universelles x100."),
]
DATA = {
    "catalog": [{"id": i, "name": n, "category": c, "price": p, "description": d}
                for i, (n, c, p, d) in enumerate(WEAPONS, 1)],
    "orders": [],
}
ORDERS = []  # en mémoire, propre à chaque instance (démo)


class H(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    wbufsize = 65536  # en-têtes + corps dans un seul paquet (évite le délai ACK/Nagle ~40 ms)

    def log_message(self, *a):
        pass

    def do_GET(self):
        if DELAY_MS:
            time.sleep(DELAY_MS / 1000)
        if self.path == "/health":
            body, code = b'{"status":"ok"}', 200
        else:
            items = ORDERS if NAME == "orders" else DATA.get(NAME, [])
            body = json.dumps({"service": NAME, "instance": INSTANCE, "path": self.path, "items": items}).encode()
            code = 200
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Instance", INSTANCE)
        self.end_headers()
        self.wfile.write(body)
        self.wfile.flush()

    def do_POST(self):
        n = int(self.headers.get("Content-Length", "0") or 0)
        try:
            data = json.loads(self.rfile.read(n) or b"{}")
            items = [{"id": int(i["id"]), "qty": max(1, int(i.get("qty", 1)))} for i in data.get("items", [])]
        except Exception:
            items = []
        if NAME != "orders" or not items:
            body, code = b'{"error":"commande invalide"}', 400
        else:
            order = {"order_id": len(ORDERS) + 1000, "instance": INSTANCE, "items": items,
                     "total": data.get("total", 0), "status": "confirmed"}
            ORDERS.append(order)
            body, code = json.dumps(order).encode(), 201
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
        self.wfile.flush()


ThreadingHTTPServer.daemon_threads = True
ThreadingHTTPServer(("0.0.0.0", 8080), H).serve_forever()
