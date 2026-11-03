#!/usr/bin/env python3
"""Fabrique un JWT RS256 de TEST signé avec une clé privée PEM (via openssl).
Usage : make_token.py <clé_privée.pem> <iss> [durée_s (négatif = expiré)]"""
import base64, json, subprocess, sys, time
key, iss = sys.argv[1], sys.argv[2]
ttl = int(sys.argv[3]) if len(sys.argv) > 3 else 3600
b64 = lambda b: base64.urlsafe_b64encode(b).rstrip(b"=")
head = b64(json.dumps({"alg": "RS256", "typ": "JWT"}).encode())
body = b64(json.dumps({"iss": iss, "sub": "demo", "exp": int(time.time()) + ttl}).encode())
msg = head + b"." + body
sig = subprocess.run(["openssl", "dgst", "-sha256", "-sign", key], input=msg, capture_output=True, check=True).stdout
print((msg + b"." + b64(sig)).decode())
