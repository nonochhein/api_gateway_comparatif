#!/usr/bin/env python3
"""Récupère les clés publiques (JWKS) d'Authentik et d'Authelia et les écrit dans kong/kong.yml (consommateurs sso-authentik / sso-authelia).
Usage : python3 scripts/sync_sso_keys.py [--authentik URL_JWKS] [--authelia URL_JWKS] [--insecure]
  défauts : http://localhost:9000/application/o/ammu-nation/jwks/  et  https://auth.ammu.lvh.me/jwks.json
  --insecure : n'oblige pas le certificat HTTPS (certificat local mkcert / auto-signé d'Authelia)
Un SSO injoignable est ignoré (son bloc reste inchangé). Ensuite : docker compose up -d --force-recreate kong
À refaire après chaque rotation de clé d'un SSO (Kong OSS ne relit pas le JWKS tout seul)."""
import argparse, json, os, re, ssl, sys, urllib.request
sys.path.insert(0, os.path.dirname(__file__))
from jwks_to_pem import to_pem

ap = argparse.ArgumentParser()
ap.add_argument("--authentik", default="http://localhost:9000/application/o/ammu-nation/jwks/")
ap.add_argument("--authelia", default="https://auth.ammu.lvh.me/jwks.json")
ap.add_argument("--insecure", action="store_true")
ap.add_argument("--kong", default=os.path.join(os.path.dirname(__file__), "..", "kong", "kong.yml"))
a = ap.parse_args()
ctx = ssl._create_unverified_context() if a.insecure else None
text = open(a.kong, encoding="utf-8").read(); changed = 0
for user, url in (("sso-authentik", a.authentik), ("sso-authelia", a.authelia)):
    try:
        raw = urllib.request.urlopen(url, timeout=10, context=ctx).read() if url.startswith("http") else open(url, "rb").read()
        keys = [k for k in json.loads(raw)["keys"]
                if k.get("kty") == "RSA" and k.get("use", "sig") == "sig" and k.get("alg", "RS256") == "RS256"]
        if not keys: raise ValueError("aucune clé RSA RS256")
    except Exception as e:
        print(f"IGNORÉ  {user} : {url} -> {e}"); continue
    # Kong exige une clé (iss) unique par jwt_secret : on n'écrit que la première clé de signature
    m = re.search(rf"(  - username: {user}\n    jwt_secrets:\n)((?:      - algorithm: RS256\n        key: \"[^\"]*\"\n        rsa_public_key: \|\n(?:          .*\n)+)+)", text)
    if not m: sys.exit(f"bloc {user} introuvable dans {a.kong}")
    iss = re.search(r'key: "([^"]*)"', m.group(2)).group(1)
    blocks = "".join(f'      - algorithm: RS256\n        key: "{iss}"\n        rsa_public_key: |\n' +
                     "".join("          " + l + "\n" for l in to_pem(k["n"], k["e"]).strip().splitlines()) for k in keys[:1])
    text = text.replace(m.group(0), m.group(1) + blocks); changed += 1
    print(f"OK      {user} : clé kid={keys[0].get('kid')} écrite (iss {iss})")
open(a.kong, "w", encoding="utf-8").write(text)
sys.exit(0 if changed else 1)
