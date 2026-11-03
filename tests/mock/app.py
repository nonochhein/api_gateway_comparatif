"""Faux services Spring pour tester la gateway sans le backend Java : mêmes chemins, mêmes codes HTTP attendus.
SERVICE=catalog|order. Ne sert qu'à valider la configuration Kong."""
import json, os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SERVICE = os.environ.get("SERVICE", "catalog")


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
        if n: self.rfile.read(n)
        p = self.path
        if p.startswith("/actuator"):
            return self.reply(200, {"status": "UP"})
        ok = {"catalog": ("/api/products", "/api/categories", "/internal/"), "order": ("/api/orders",)}[SERVICE]
        if not p.startswith(ok):
            return self.reply(404, {"title": "Not Found"})
        self.reply(201 if method == "POST" else 200, {"service": SERVICE, "method": method, "path": p})

    do_GET = lambda s: s.handle_any("GET")
    do_POST = lambda s: s.handle_any("POST")
    do_PUT = lambda s: s.handle_any("PUT")
    do_DELETE = lambda s: s.handle_any("DELETE")


ThreadingHTTPServer.daemon_threads = True
ThreadingHTTPServer(("0.0.0.0", 8080), H).serve_forever()
