/* Connexion SSO (OpenID Connect, code + PKCE, sans secret) pour DEUX fournisseurs : Authentik et Authelia.
   Les deux sont toujours présents dans le code ; on choisit celui qu'on utilise :
     - bouton « SSO login » : fenêtre de choix ;
     - ou ?sso=authentik / ?sso=authelia dans l'URL (mémorisé), ?sso=ask pour redemander ;
     - ou window.SSO_DEFAULT (sso-config.js).
   Le jeton d'accès (JWT) obtenu est envoyé à Kong, qui accepte les deux émetteurs. */
(function () {
  const cfg = window.SSO_CONFIG, KEY = "sso.active";
  const redirectUri = () => location.origin + "/";
  const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const rand = (n) => b64url(crypto.getRandomValues(new Uint8Array(n)));
  const ss = { get: (k) => { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
               set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) {} },
               del: (k) => { try { sessionStorage.removeItem(k); } catch (e) {} } };

  function active() {
    const q = new URLSearchParams(location.search).get("sso");
    if (q && cfg.providers[q]) { ss.set(KEY, q); return q; }
    if (q === "ask") ss.del(KEY);
    const s = ss.get(KEY);
    return s && cfg.providers[s] ? s : (cfg.default && cfg.providers[cfg.default] ? cfg.default : null);
  }

  async function login(name) {
    const p = cfg.providers[name];
    if (!p) throw new Error("Unknown SSO: " + name);
    if (!window.crypto || !crypto.subtle) throw new Error("PKCE needs a secure context (use http://localhost:8000)");
    const verifier = rand(48), state = rand(16), nonce = rand(16);
    ss.set("sso.flow", JSON.stringify({ name, verifier, state }));
    ss.set(KEY, name);
    const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
    const u = new URL(p.authorize);
    for (const [k, v] of Object.entries({ response_type: "code", client_id: p.clientId, redirect_uri: redirectUri(),
        scope: p.scope, state, nonce, code_challenge: challenge, code_challenge_method: "S256" })) u.searchParams.set(k, v);
    if (p.audience) u.searchParams.set("audience", p.audience);
    location.assign(u.toString());
  }

  /* À appeler au chargement : si l'URL contient ?code=…&state=…, échange le code contre un jeton.
     Retourne {token, provider} ou null ; lève une erreur lisible en cas d'échec. */
  async function handleCallback() {
    const q = new URLSearchParams(location.search);
    if (!q.has("state") || !(q.has("code") || q.has("error"))) return null;
    const flow = JSON.parse(ss.get("sso.flow") || "null");
    history.replaceState(null, "", location.pathname + location.hash);
    ss.del("sso.flow");
    if (!flow || flow.state !== q.get("state")) throw new Error("SSO callback ignored (unknown state)");
    if (q.has("error")) throw new Error("SSO refused: " + (q.get("error_description") || q.get("error")));
    const p = cfg.providers[flow.name];
    const res = await fetch(p.token, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code: q.get("code"), redirect_uri: redirectUri(),
                                  client_id: p.clientId, code_verifier: flow.verifier }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.access_token) throw new Error("Token exchange failed (" + res.status + "): " + (body.error_description || body.error || "?"));
    return { token: body.access_token, provider: flow.name };
  }

  function issuerOf(token) {
    try { return JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).iss || null; } catch (e) { return null; }
  }
  function providerOf(token) {      // quel SSO a émis ce jeton (d'après la claim iss)
    const iss = issuerOf(token);
    return Object.keys(cfg.providers).find((n) => cfg.providers[n].issuer === iss) || null;
  }

  window.SSO = { providers: cfg.providers, active, login, handleCallback, providerOf };
})();
