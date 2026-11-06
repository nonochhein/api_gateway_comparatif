"""Tests sans Docker ni service externe du générateur de configuration Kong."""
import base64
import importlib.util
from pathlib import Path
import sys
import unittest

BASE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE / "scripts"))
spec = importlib.util.spec_from_file_location("configure_kong_sso", BASE / "scripts" / "configure-kong-sso.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class KongGeneratorTests(unittest.TestCase):
    def test_generated_consumer_contains_real_issuer_and_pem(self):
        modulus = base64.urlsafe_b64encode(bytes([1]) * 256).decode().rstrip("=")
        doc = {"keys": [{"kty": "RSA", "use": "sig", "alg": "RS256", "kid": "sample",
                          "n": modulus, "e": "AQAB"}]}
        pem = module.signing_pem(doc, "authentik")
        block = module.consumer("authentik", "http://localhost:9000/application/o/ammu-nation/", pem)
        self.assertIn('key: "http://localhost:9000/application/o/ammu-nation/"', block)
        self.assertIn("          -----BEGIN PUBLIC KEY-----", block)
        self.assertIn("          -----END PUBLIC KEY-----", block)

    def test_multiple_keys_are_rejected_without_kid(self):
        sample = {"kty": "RSA", "use": "sig", "alg": "RS256", "n": "AQAB", "e": "AQAB"}
        doc = {"keys": [dict(sample, kid="a"), dict(sample, kid="b")]}
        with self.assertRaisesRegex(ValueError, "choose one"):
            module.signing_pem(doc, "authelia")
        self.assertIn("BEGIN PUBLIC KEY", module.signing_pem(doc, "authelia", "a"))


if __name__ == "__main__":
    unittest.main()
