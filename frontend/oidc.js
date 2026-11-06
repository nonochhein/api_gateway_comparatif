/* Client OIDC pour navigateur (Authorization Code + PKCE S256).
 * Les access tokens sont vérifiés par Kong puis par order-service, jamais par le navigateur.
 * Pas de client_secret, pas de refresh token, pas de tokens dans l'URL ni dans localStorage.
 */
window.AmmuOidc = (() => {
  "use strict";
  const SELECTED = "ammu-sso-selected", PENDING = "ammu-sso-pending", SESSION = "ammu-sso-session";
  const providers = window.AMMU_SSO || {};

  function chosenProvider() {
    const chosen = sessionStorage.getItem(SELECTED);
    return providers[chosen] ? chosen : "authentik";
  }
  function chooseProvider(name) {
    if (!providers[name]) throw new Error("Fournisseur SSO inconnu");
    sessionStorage.setItem(SELECTED, name);
    sessionStorage.removeItem(SESSION); // un jeton d'un autre SSO ne doit pas être réutilisé
  }
  function decodePayload(jwt) {
    if (!jwt || jwt.split(".").length !== 3) throw new Error("Le serveur n'a pas renvoyé un JWT");
    const part = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(part.padEnd(Math.ceil(part.length / 4) * 4, "=")), c => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  function current() {
    try {
      const data = JSON.parse(sessionStorage.getItem(SESSION) || "null");
      if (!data || !providers[data.provider] || data.provider !== chosenProvider()) return null;
      if (!data.accessToken || Date.now() >= data.expiresAt) {
        sessionStorage.removeItem(SESSION);
        return null;
      }
      return data;
    } catch (_) { sessionStorage.removeItem(SESSION); return null; }
  }
  function logout() { sessionStorage.removeItem(SESSION); }
  function randomString() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
  }
  function b64url(bytes) {
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }
  async function start() {
    if (!crypto?.subtle) throw new Error("PKCE exige une origine sécurisée (localhost ou HTTPS)");
    const name = chosenProvider(), provider = providers[name];
    if (!provider || !provider.clientId) throw new Error("Client OIDC non configuré");
    const state = randomString(), nonce = randomString(), verifier = randomString() + randomString();
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    const redirectUri = location.origin + "/";
    sessionStorage.setItem(PENDING, JSON.stringify({ name, state, nonce, verifier, redirectUri, createdAt: Date.now() }));
    const url = new URL(provider.authorizationEndpoint);
    url.search = new URLSearchParams({
      response_type: "code", client_id: provider.clientId, redirect_uri: redirectUri,
      scope: "openid profile email", state, nonce,
      code_challenge: b64url(new Uint8Array(hash)), code_challenge_method: "S256"
    }).toString();
    location.assign(url.toString());
  }
  async function completeCallback() {
    const params = new URLSearchParams(location.search);
    if (!params.has("code") && !params.has("error")) return false;
    // Supprimer code et state de l'historique avant tout appel externe.
    history.replaceState({}, "", location.pathname + location.hash);
    let pending;
    try { pending = JSON.parse(sessionStorage.getItem(PENDING) || "null"); }
    finally { sessionStorage.removeItem(PENDING); }
    if (!pending || !providers[pending.name] || pending.name !== chosenProvider()
        || pending.state !== params.get("state") || Date.now() - pending.createdAt > 5 * 60 * 1000
        || pending.redirectUri !== location.origin + location.pathname) {
      throw new Error("Réponse SSO refusée (state invalide, délai dépassé ou URL incorrecte)");
    }
    if (params.has("error")) throw new Error("Connexion refusée par " + providers[pending.name].label + " : " + params.get("error"));
    const provider = providers[pending.name];
    const res = await fetch(provider.tokenEndpoint, {
      method: "POST", mode: "cors", cache: "no-store",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", client_id: provider.clientId,
        code: params.get("code"), redirect_uri: pending.redirectUri, code_verifier: pending.verifier })
    });
    if (!res.ok) throw new Error("Échange du code impossible (HTTP " + res.status + "). Vérifier client public, PKCE et CORS.");
    const payload = await res.json();
    const claims = decodePayload(payload.access_token); // affichage seulement ; validation côté serveur
    if (claims.iss !== provider.issuer) throw new Error("Issuer du jeton différent de la configuration");
    if (payload.id_token) {
      const idClaims = decodePayload(payload.id_token);
      if (idClaims.nonce !== pending.nonce) throw new Error("Nonce OIDC incorrect");
    }
    const expiresAt = Math.min(
      claims.exp ? claims.exp * 1000 : Number.MAX_SAFE_INTEGER,
      Date.now() + Math.max(0, Number(payload.expires_in) || 0) * 1000
    );
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) throw new Error("Jeton expiré ou durée non fournie");
    sessionStorage.setItem(SESSION, JSON.stringify({ provider: pending.name, accessToken: payload.access_token, expiresAt }));
    return true;
  }
  return { providers, chosenProvider, chooseProvider, decodePayload, current, logout, start, completeCallback };
})();
