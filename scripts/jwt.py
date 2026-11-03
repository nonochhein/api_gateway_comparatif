#!/usr/bin/env python3
"""Génère un JWT HS256 de test accepté par la gateway (claim iss = consommateur Kong).
Usage : python3 scripts/jwt.py [durée_en_secondes]   (secret : variable JWT_SECRET)"""
import base64, hashlib, hmac, json, os, sys, time

SECRET = os.environ.get("JWT_SECRET", "ammu-nation-dev-secret-change-me-0123456789").encode()
TTL = int(sys.argv[1]) if len(sys.argv) > 1 else 3600
b64 = lambda b: base64.urlsafe_b64encode(b).rstrip(b"=")
head = b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
body = b64(json.dumps({"iss": "ammu-client", "sub": "demo", "exp": int(time.time()) + TTL}).encode())
sig = b64(hmac.new(SECRET, head + b"." + body, hashlib.sha256).digest())
print((head + b"." + body + b"." + sig).decode())
