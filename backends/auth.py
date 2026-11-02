"""Service d'identité de test : émet des JWT HS256 (/token) et les valide (/verify, forwardAuth Traefik)."""
import base64, hashlib, hmac, json, os, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SECRET = os.environ["JWT_SECRET"].encode()
CLIENT = "poc-client"


def b64(b): return base64.urlsafe_b64encode(b).rstrip(b"=")
def unb64(s): return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def make_token(ttl=3600):
    h = b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    # "iss" (Kong) et "key" (APISIX) = identifiant du consommateur
    p = b64(json.dumps({"iss": CLIENT, "key": CLIENT, "sub": "user-1", "exp": int(time.time()) + ttl}).encode())
    sig = b64(hmac.new(SECRET, h + b"." + p, hashlib.sha256).digest())
    return (h + b"." + p + b"." + sig).decode()


def valid(tok):
    try:
        h, p, s = tok.split(".")
        exp = b64(hmac.new(SECRET, f"{h}.{p}".encode(), hashlib.sha256).digest()).decode()
        return hmac.compare_digest(exp, s) and json.loads(unb64(p))["exp"] > time.time()
    except Exception:
        return False


class H(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    wbufsize = 65536
    def log_message(self, *a): pass

    def do_GET(self):
        code, body = 200, b"{}"
        if self.path.startswith("/token"):
            body = json.dumps({"access_token": make_token()}).encode()
        elif self.path.startswith("/verify"):
            tok = self.headers.get("Authorization", "").removeprefix("Bearer ")
            code = 200 if valid(tok) else 401
        self.send_response(code)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
        self.wfile.flush()


ThreadingHTTPServer.daemon_threads = True
ThreadingHTTPServer(("0.0.0.0", 8080), H).serve_forever()
