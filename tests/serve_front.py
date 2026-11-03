#!/usr/bin/env python3
"""Aperçu du site sans Docker ni Kong : sert frontend/ et répond à /api avec les faux services de tests/mock/app.py.
Pas de contrôle de jeton (c'est le rôle de Kong). Usage : python3 tests/serve_front.py [port]   (défaut 8765)"""
import mimetypes, os, sys, threading

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(ROOT, "tests", "mock", "app.py"), encoding="utf-8").read()
src = src.replace("/db/gta-weapons.sql", os.path.join(ROOT, "db", "gta-weapons.sql"))
src = src.split("ThreadingHTTPServer.daemon_threads")[0]          # on garde les classes, pas le démarrage
mock = {"__name__": "mock"}
exec(src, mock)
lock = threading.Lock()                                            # SERVICE est global dans le mock


class Front(mock["H"]):
    def go(self, method):
        path = self.path.split("?")[0]
        if path.startswith("/api/"):
            with lock:
                mock["SERVICE"] = "order" if path.startswith("/api/orders") else "catalog"
                return self.handle_any(method)
        f = os.path.normpath(os.path.join(ROOT, "frontend", path.lstrip("/")))
        if os.path.isdir(f):
            f = os.path.join(f, "index.html")
        if not f.startswith(os.path.join(ROOT, "frontend")) or not os.path.isfile(f):
            return self.reply(404, {"title": "Not Found"})
        body = open(f, "rb").read()
        self.send_response(200)
        self.send_header("Content-Type", mimetypes.guess_type(f)[0] or "application/octet-stream")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    do_GET = lambda s: s.go("GET")
    do_POST = lambda s: s.go("POST")


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    mock["ThreadingHTTPServer"].daemon_threads = True
    print(f"http://127.0.0.1:{port}", flush=True)
    mock["ThreadingHTTPServer"](("127.0.0.1", port), Front).serve_forever()
