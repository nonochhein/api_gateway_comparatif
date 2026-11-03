#!/usr/bin/env python3
"""Convertit une clé publique RSA d'un JWKS (Authentik / Authelia) en PEM pour kong/kong.yml (stdlib uniquement).
Usage : python3 scripts/jwks_to_pem.py <url-ou-fichier-jwks> [kid]
  Authentik : https://<hôte>/application/o/<slug>/jwks/
  Authelia  : https://<hôte>/jwks.json
Affiche aussi la valeur de l'issuer à mettre dans "key" si l'URL de discovery est fournie via ISSUER_URL."""
import base64, json, sys, textwrap, urllib.request

def b64d(s): return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))
def der_len(n):
    if n < 128: return bytes([n])
    b = n.to_bytes((n.bit_length() + 7) // 8, "big"); return bytes([0x80 | len(b)]) + b
def der(tag, content): return bytes([tag]) + der_len(len(content)) + content
def der_int(b):
    b = b.lstrip(b"\x00") or b"\x00"
    if b[0] & 0x80: b = b"\x00" + b
    return der(0x02, b)

def to_pem(n_b64, e_b64):
    rsa = der(0x30, der_int(b64d(n_b64)) + der_int(b64d(e_b64)))
    alg = der(0x30, der(0x06, bytes.fromhex("2a864886f70d010101")) + der(0x05, b""))
    spki = der(0x30, alg + der(0x03, b"\x00" + rsa))
    body = "\n".join(textwrap.wrap(base64.b64encode(spki).decode(), 64))
    return f"-----BEGIN PUBLIC KEY-----\n{body}\n-----END PUBLIC KEY-----\n"

if __name__ == "__main__":
    src = sys.argv[1]; kid = sys.argv[2] if len(sys.argv) > 2 else None
    raw = urllib.request.urlopen(src, timeout=10).read() if src.startswith("http") else open(src, "rb").read()
    keys = [k for k in json.loads(raw)["keys"] if k.get("kty") == "RSA" and k.get("use", "sig") == "sig"]
    if kid: keys = [k for k in keys if k.get("kid") == kid]
    if not keys: sys.exit("Aucune clé RSA de signature trouvée")
    for k in keys:
        print(f"# kid={k.get('kid')}  -> coller sous rsa_public_key: | (indenter de 10 espaces)")
        print(to_pem(k["n"], k["e"]))
