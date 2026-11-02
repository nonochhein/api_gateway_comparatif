"""API factice (catalogue / commandes). Stdlib uniquement, identique pour toutes les gateways."""
import json, os, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

NAME = os.environ.get("SERVICE_NAME", "catalog")
INSTANCE = os.environ.get("INSTANCE", NAME)
DELAY_MS = float(os.environ.get("DELAY_MS", "0"))

DATA = {
    "catalog": [{"id": i, "name": f"produit-{i}", "price": 10 + i} for i in range(1, 21)],
    "orders": [{"id": i, "product": i, "qty": 1 + i % 3} for i in range(1, 21)],
}


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
            body = json.dumps({"service": NAME, "instance": INSTANCE, "path": self.path,
                               "items": DATA.get(NAME, [])}).encode()
            code = 200
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Instance", INSTANCE)
        self.end_headers()
        self.wfile.write(body)
        self.wfile.flush()


ThreadingHTTPServer.daemon_threads = True
ThreadingHTTPServer(("0.0.0.0", 8080), H).serve_forever()
