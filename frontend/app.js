const $ = (id) => document.getElementById(id);
const money = (n) => "GTA$ " + n.toLocaleString("fr-FR");
let products = [], cart = {}, filter = "Tous", token = null;
try { token = sessionStorage.getItem("token"); } catch (e) {}


// Silhouettes dessinées pour le projet (pas d'images officielles du jeu)
const ICON = {
  "Pistol": '<rect x="38" y="32" width="112" height="18" rx="3"/><rect x="146" y="36" width="22" height="8"/><polygon points="96,50 126,50 116,88 92,88"/><path d="M70 50v14h24" fill="none" stroke="currentColor" stroke-width="5"/>',
  "Combat Pistol": '<rect x="34" y="30" width="118" height="20" rx="3"/><rect x="150" y="35" width="24" height="9"/><polygon points="94,50 126,50 116,90 90,90"/><rect x="60" y="25" width="14" height="6"/><path d="M68 50v14h24" fill="none" stroke="currentColor" stroke-width="5"/>',
  "AP Pistol": '<rect x="30" y="30" width="124" height="18" rx="3"/><rect x="152" y="35" width="26" height="8"/><polygon points="92,48 124,48 114,78 90,78"/><rect x="96" y="78" width="16" height="22" rx="2"/><path d="M66 48v14h24" fill="none" stroke="currentColor" stroke-width="5"/>',
  "Micro SMG": '<rect x="40" y="36" width="96" height="18" rx="3"/><rect x="136" y="40" width="42" height="7"/><rect x="82" y="54" width="14" height="38"/><polygon points="108,54 128,54 122,80 106,80"/><path d="M40 40l-26 6v8l26 2" />',
  "SMG": '<rect x="46" y="34" width="104" height="20" rx="3"/><rect x="150" y="39" width="34" height="7"/><rect x="86" y="54" width="14" height="40"/><polygon points="112,54 132,54 126,80 110,80"/><polygon points="46,36 14,42 14,60 46,52"/><rect x="70" y="28" width="30" height="6"/>',
  "Assault Rifle": '<polygon points="6,40 52,38 52,60 6,70"/><rect x="52" y="38" width="86" height="18" rx="3"/><rect x="138" y="43" width="56" height="6"/><polygon points="92,56 112,56 118,90 98,90"/><polygon points="116,56 130,56 126,76 114,76"/><rect x="60" y="30" width="40" height="8"/>',
  "Carbine Rifle": '<polygon points="8,42 50,40 50,60 8,68"/><rect x="50" y="40" width="84" height="16" rx="3"/><rect x="134" y="44" width="58" height="6"/><rect x="92" y="56" width="16" height="36" rx="2"/><polygon points="114,56 128,56 124,76 112,76"/><rect x="62" y="30" width="46" height="10" rx="2"/>',
  "Pump Shotgun": '<polygon points="6,42 44,42 44,62 6,74"/><rect x="44" y="40" width="48" height="18" rx="3"/><rect x="92" y="42" width="102" height="8"/><rect x="104" y="52" width="46" height="12" rx="4"/>',
  "Sawed-Off Shotgun": '<polygon points="10,40 56,40 60,64 10,76"/><rect x="56" y="40" width="30" height="16" rx="3"/><rect x="86" y="42" width="64" height="7"/><rect x="86" y="51" width="64" height="7"/>',
  "Sniper Rifle": '<polygon points="6,46 44,44 44,66 6,76"/><rect x="44" y="44" width="62" height="16" rx="3"/><rect x="106" y="49" width="88" height="5"/><rect x="62" y="28" width="62" height="12" rx="6"/><rect x="72" y="40" width="6" height="6"/><rect x="108" y="40" width="6" height="6"/><path d="M150 54l-14 30M160 54l14 30" stroke="currentColor" stroke-width="4" fill="none"/>',
  "Knife": '<polygon points="52,50 150,36 176,52 52,62"/><rect x="14" y="48" width="40" height="16" rx="5"/>',
  "Baseball Bat": '<polygon points="14,56 150,38 184,40 184,56 150,60 14,66"/>',
  "Body Armor": '<path d="M52 20h24c4 10 44 10 48 0h24l22 24-16 14-8-6v44H54V52l-8 6-16-14z"/>',
  "Ammo Pack": '<rect x="30" y="52" width="140" height="42" rx="4"/><rect x="40" y="22" width="16" height="30" rx="8"/><rect x="66" y="22" width="16" height="30" rx="8"/><rect x="92" y="22" width="16" height="30" rx="8"/><rect x="118" y="22" width="16" height="30" rx="8"/><rect x="144" y="22" width="16" height="30" rx="8"/>'
};
const svg = (name) => `<svg viewBox="0 0 200 100" fill="currentColor" aria-label="${name}">${ICON[name] || ICON["Pistol"]}</svg>`;

// Journal des appels : montre ce que renvoie la gateway (statut, instance, id de corrélation)
function trace(method, url, res) {
  const tr = document.createElement("tr");
  const cls = "s" + String(res.status)[0];
  tr.innerHTML = `<td>${new Date().toLocaleTimeString("fr-FR")}</td><td>${method} ${url}</td>` +
    `<td class="${cls}">${res.status}</td><td>${res.headers.get("X-Instance") || "—"}</td>` +
    `<td>${res.headers.get("X-Request-Id") || "—"}</td>`;
  $("log").prepend(tr);
  while ($("log").children.length > 12) $("log").lastChild.remove();
}
async function api(method, url, body) {
  const headers = {};
  if (token) headers.Authorization = "Bearer " + token;
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  trace(method, url, res);
  return res;
}

async function loadCatalog() {
  try {
    const res = await api("GET", "/api/catalog/items");
    if (!res.ok) throw new Error(res.status);
    products = (await res.json()).items;
    renderFilters(); renderGrid();
  } catch (e) {
    $("grid").innerHTML = `<p class="msg err">Catalogue indisponible (${e.message}). La gateway ou le service est-il en panne ?</p>`;
  }
}
function renderFilters() {
  const cats = ["Tous", ...new Set(products.map((p) => p.category))];
  $("filters").innerHTML = "";
  cats.forEach((c) => {
    const b = document.createElement("button");
    b.className = "chip" + (c === filter ? " on" : ""); b.textContent = c;
    b.onclick = () => { filter = c; renderFilters(); renderGrid(); };
    $("filters").appendChild(b);
  });
}
function renderGrid() {
  $("grid").innerHTML = "";
  products.filter((p) => filter === "Tous" || p.category === filter).forEach((p) => {
    const d = document.createElement("div"); d.className = "card";
    d.innerHTML = `<div class="pic">${svg(p.name)}</div><span class="cat">${p.category}</span><h3>${p.name}</h3><p>${p.description}</p>` +
      `<div class="row"><span class="price">${money(p.price)}</span><button class="btn">Ajouter</button></div>`;
    d.querySelector("button").onclick = () => { cart[p.id] = (cart[p.id] || 0) + 1; renderCart(); };
    $("grid").appendChild(d);
  });
}
function renderCart() {
  const ids = Object.keys(cart);
  let total = 0, count = 0;
  $("cartItems").innerHTML = "";
  ids.forEach((id) => {
    const p = products.find((x) => x.id == id); const q = cart[id];
    total += p.price * q; count += q;
    const li = document.createElement("li");
    li.innerHTML = `<span>${q} × ${p.name}</span><span>${money(p.price * q)} <button title="Retirer">✕</button></span>`;
    li.querySelector("button").onclick = () => { delete cart[id]; renderCart(); };
    $("cartItems").appendChild(li);
  });
  $("cartTotal").textContent = money(total); $("cartCount").textContent = count;
}
function say(msg, ok) { $("orderMsg").textContent = msg; $("orderMsg").className = "msg " + (ok ? "ok" : "err"); }

async function login() {
  const res = await api("GET", "/auth/token");
  if (!res.ok) return say("Connexion impossible (" + res.status + ")", false);
  token = (await res.json()).access_token;
  try { sessionStorage.setItem("token", token); } catch (e) {}
  $("login").textContent = "Connecté ✓";
}
async function checkout() {
  const items = Object.entries(cart).map(([id, qty]) => ({ id: +id, qty }));
  if (!items.length) return say("Panier vide.", false);
  if (!token) await login();
  const total = items.reduce((s, i) => s + products.find((p) => p.id == i.id).price * i.qty, 0);
  const res = await api("POST", "/api/orders/items", { items, total });
  if (res.status === 201) {
    const o = await res.json(); cart = {}; renderCart();
    say(`Commande n°${o.order_id} confirmée (instance ${o.instance}).`, true);
  } else if (res.status === 401) { token = null; $("login").textContent = "Se connecter"; say("401 — authentification requise ou token invalide.", false); }
  else if (res.status === 429) say("429 — trop de requêtes, réessayez dans une seconde.", false);
  else say(`Erreur ${res.status} — service de commandes indisponible.`, false);
}

$("login").onclick = login;
$("cartBtn").onclick = () => $("cart").classList.toggle("hidden");
$("closeCart").onclick = () => $("cart").classList.add("hidden");
$("checkout").onclick = checkout;
if (token) $("login").textContent = "Connecté ✓";
loadCatalog();
