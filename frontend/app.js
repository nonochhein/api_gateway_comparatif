const $ = (id) => document.getElementById(id);
const money = (n) => "GTA$ " + n.toLocaleString("fr-FR");
let products = [], cart = {}, filter = "Tous", token = null;
try { token = sessionStorage.getItem("token"); } catch (e) {}

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
    d.innerHTML = `<span class="cat">${p.category}</span><h3>${p.name}</h3><p>${p.description}</p>` +
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
