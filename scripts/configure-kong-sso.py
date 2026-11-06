#!/usr/bin/env python3
"""Configure Kong OSS with the *real* RS256 public keys of both SSO providers.

Generates .dev/kong-sso.yml. Never edits the checked-in Kong demo keys or a secret.
Local self-signed Authelia TLS: add --insecure-dev-tls (POC only).
"""
import argparse
import json
from pathlib import Path
import ssl
import sys
import urllib.request

from jwks_to_pem import to_pem

ROOT = Path(__file__).resolve().parent.parent


def jwks(source, insecure_tls=False):
    if source.startswith(("http://", "https://")):
        handlers = [urllib.request.ProxyHandler({})]
        if insecure_tls:
            handlers.append(urllib.request.HTTPSHandler(context=ssl._create_unverified_context()))
        with urllib.request.build_opener(*handlers).open(source, timeout=12) as response:
            raw = response.read()
    else:
        raw = Path(source).read_bytes()
    return json.loads(raw)


def signing_pem(document, name, key_id=None):
    keys = [key for key in document.get("keys", []) if key.get("kty") == "RSA"
            and key.get("use", "sig") == "sig" and key.get("alg", "RS256") == "RS256"]
    if key_id:
        keys = [key for key in keys if key.get("kid") == key_id]
    if len(keys) != 1:
        raise ValueError(f"{name}: {len(keys)} RS256 signing keys; use --{name}-kid to choose one")
    return to_pem(keys[0]["n"], keys[0]["e"])


def consumer(name, issuer, pem):
    indented = "".join("          " + line for line in pem.splitlines(keepends=True))
    return (f"  - username: sso-{name}\n"
            "    jwt_secrets:\n"
            "      - algorithm: RS256\n"
            f"        key: {json.dumps(issuer)}\n"
            "        rsa_public_key: |\n" + indented)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--authentik-jwks", default="http://localhost:9000/application/o/ammu-nation/jwks/")
    parser.add_argument("--authelia-jwks", default="https://auth.ammu.lvh.me/jwks.json")
    parser.add_argument("--authentik-issuer", default="http://localhost:9000/application/o/ammu-nation/")
    parser.add_argument("--authelia-issuer", default="https://auth.ammu.lvh.me")
    parser.add_argument("--authentik-kid")
    parser.add_argument("--authelia-kid")
    parser.add_argument("--insecure-dev-tls", action="store_true",
                        help="Skip certificate verification ONLY for local self-signed Authelia HTTPS")
    parser.add_argument("--backend-root", type=Path,
                        help="Also refresh the Authelia public PEM in the backend order-service resources")
    args = parser.parse_args()

    key_a = signing_pem(jwks(args.authentik_jwks, args.insecure_dev_tls), "authentik", args.authentik_kid)
    key_b = signing_pem(jwks(args.authelia_jwks, args.insecure_dev_tls), "authelia", args.authelia_kid)
    original = (ROOT / "kong" / "kong.yml").read_text()
    header = original.split("consumers:\n", 1)[0]
    routes = original.split("\nservices:\n", 1)[1]
    generated = (header + "consumers:\n" + consumer("authentik", args.authentik_issuer, key_a)
                 + consumer("authelia", args.authelia_issuer, key_b) + "\nservices:\n" + routes)
    target = ROOT / ".dev" / "kong-sso.yml"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(generated)
    print(f"Generated {target} with public keys only (no private key, no credentials).")
    if args.backend_root:
        backend_key = args.backend_root / "order-service" / "src" / "main" / "resources" / "authelia-public.pem"
        if not backend_key.parent.is_dir():
            raise ValueError(f"Backend order-service resources not found: {backend_key.parent}")
        backend_key.write_text(key_b)
        print(f"Updated backend public key: {backend_key}. Rebuild order-service afterwards.")
    print("Run: KONG_CONFIG=./.dev/kong-sso.yml docker compose up -d --force-recreate kong")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, json.JSONDecodeError) as e:
        sys.exit("Cannot configure Kong: " + str(e))
