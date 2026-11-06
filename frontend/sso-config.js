// Configuration publique du POC : jamais de client_secret dans le navigateur.
// Authentik : réutilise le provider PUBLIC du Swagger (même slug/issuer) :
// ajouter le callback de ce front aux redirect_uris de "ammu-nation-swagger".
window.AMMU_SSO = Object.freeze({
  authentik: {
    label: "Authentik",
    clientId: "ammu-nation-swagger",
    issuer: "http://localhost:9000/application/o/ammu-nation/",
    authorizationEndpoint: "http://localhost:9000/application/o/authorize/",
    tokenEndpoint: "http://localhost:9000/application/o/token/"
  },
  authelia: {
    label: "Authelia",
    clientId: "ammu-nation-front-authelia",
    issuer: "https://auth.ammu.lvh.me",
    authorizationEndpoint: "https://auth.ammu.lvh.me/api/oidc/authorization",
    tokenEndpoint: "https://auth.ammu.lvh.me/api/oidc/token"
  }
});
