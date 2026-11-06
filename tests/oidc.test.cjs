const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

const FRONT = path.resolve(__dirname, "../frontend");
const makeToken = (claims) => {
  const part = obj => Buffer.from(JSON.stringify(obj)).toString("base64url");
  return part({ alg: "RS256", typ: "at+jwt" }) + "." + part(claims) + ".signature";
};

function setup() {
  const data = new Map(), store = {
    getItem: k => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: k => data.delete(k)
  };
  const location = { origin: "http://localhost:8000", pathname: "/", search: "", hash: "", assigned: null,
    assign(url) { this.assigned = url; } };
  const history = { replaceState(_, __, url) { location.search = ""; location.hash = url.includes("#") ? url.split("#")[1] : ""; } };
  const win = {}, ctx = {
    window: win, sessionStorage: store, crypto: webcrypto, location, history,
    URL, URLSearchParams, TextEncoder, TextDecoder, Uint8Array, Date, Number,
    atob: encoded => Buffer.from(encoded, "base64").toString("binary"),
    btoa: raw => Buffer.from(raw, "binary").toString("base64")
  };
  vm.runInNewContext(fs.readFileSync(path.join(FRONT, "sso-config.js"), "utf8"), ctx);
  vm.runInNewContext(fs.readFileSync(path.join(FRONT, "oidc.js"), "utf8"), ctx);
  return { ctx, win, store, location };
}

test("Authentik login uses PKCE S256 with the SAME public client as Swagger", async () => {
  const { win, location, store } = setup();
  await win.AmmuOidc.start();
  const url = new URL(location.assigned);
  assert.equal(url.origin, "http://localhost:9000");
  assert.equal(url.searchParams.get("client_id"), "ammu-nation-swagger");
  assert.equal(url.searchParams.get("redirect_uri"), "http://localhost:8000/");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  const { verifier, state, nonce } = JSON.parse(store.getItem("ammu-sso-pending"));
  const digest = await webcrypto.subtle.digest("SHA-256", Buffer.from(verifier));
  assert.equal(url.searchParams.get("code_challenge"), Buffer.from(digest).toString("base64url"));
  assert.equal(url.searchParams.get("state"), state);
  assert.equal(url.searchParams.get("nonce"), nonce);
});

test("OIDC callback exchanges code, checks state and keeps the access token only in sessionStorage", async () => {
  const { win, ctx, location, store } = setup();
  await win.AmmuOidc.start();
  const pending = JSON.parse(store.getItem("ammu-sso-pending"));
  location.search = "?code=example&state=" + pending.state;
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const access_token = makeToken({ iss: win.AMMU_SSO.authentik.issuer, exp: expires, preferred_username: "john" });
  const id_token = makeToken({ nonce: pending.nonce });
  let requested;
  ctx.fetch = async (url, options) => {
    requested = { url, options };
    return { ok: true, json: async () => ({ access_token, id_token, expires_in: 3600 }) };
  };
  assert.equal(await win.AmmuOidc.completeCallback(), true);
  assert.equal(requested.url, "http://localhost:9000/application/o/token/");
  const body = new URLSearchParams(requested.options.body);
  assert.equal(body.get("code"), "example");
  assert.equal(body.get("code_verifier"), pending.verifier);
  assert.equal(body.has("client_secret"), false);
  assert.equal(location.search, "");
  assert.equal(win.AmmuOidc.current().accessToken, access_token);
  assert.equal(store.getItem("ammu-sso-pending"), null);
  win.AmmuOidc.chooseProvider("authelia");
  assert.equal(win.AmmuOidc.current(), null);
});

test("Reject a forged state before token exchange", async () => {
  const { win, ctx, location, store } = setup();
  await win.AmmuOidc.start();
  location.search = "?code=example&state=wrong";
  let called = false;
  ctx.fetch = async () => { called = true; };
  await assert.rejects(() => win.AmmuOidc.completeCallback(), /state invalide/);
  assert.equal(called, false);
  assert.equal(store.getItem("ammu-sso-pending"), null);
});
