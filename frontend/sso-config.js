/* Configuration des deux SSO. Adapter les URL si les instances ne tournent pas en local.
   « issuer » doit être EXACTEMENT la claim iss des jetons (c'est aussi la clé du consommateur dans kong/kong.yml
   et la valeur attendue par order-service). Le client OIDC « ammu-nation-swagger » (le même que le Swagger du backend) est public (PKCE, pas de secret)
   et doit avoir comme redirect URI : http://localhost:8000/ (voir README, section SSO). */
window.SSO_CONFIG = {
  default: null,            // "authentik" | "authelia" | null (= demander au clic)
  providers: {
    authentik: {
      label: "Authentik",
      issuer: "http://localhost:9000/application/o/ammu-nation/",
      authorize: "http://localhost:9000/application/o/authorize/",
      token: "http://localhost:9000/application/o/token/",
      clientId: "ammu-nation-swagger",
      scope: "openid profile email",
    },
    authelia: {
      label: "Authelia",
      issuer: "https://auth.ammu.lvh.me",
      authorize: "https://auth.ammu.lvh.me/api/oidc/authorization",
      token: "https://auth.ammu.lvh.me/api/oidc/token",
      clientId: "ammu-nation-swagger",
      scope: "openid profile email",
      audience: "http://localhost:8082",     // Authelia : audience que order-service exige
    },
  },
};
