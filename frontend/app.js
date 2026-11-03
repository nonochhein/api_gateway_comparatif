const $ = (id) => document.getElementById(id);
const money = (n) => "GTA$ " + Number(n).toLocaleString("fr-FR");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const PAGE_SIZE = 12;
let products = [], cats = [], cart = {}, token = null, page = 0, totalPages = 1, catId = "", search = "";
try { token = sessionStorage.getItem("token"); } catch (e) {}

// Le SSO n'existe pas encore : en attendant, on colle un jeton (JWT) obtenu auprès du SSO.
function userFromToken() {
  if (!token) return null;
  try {
    const p = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return p.preferred_username || p.email || p.sub || "client";
  } catch (e) { return "client"; }
}
function refreshWho() {
  const u = userFromToken();
  $("who").textContent = u ? "Connecté : " + u : "";
  $("login").textContent = u ? "Déconnexion" : "Connexion SSO";
}

// Journal des appels : montre ce que renvoie la gateway
function trace(method, url, res) {
  const tr = document.createElement("tr");
  tr.innerHTML = `<td>${new Date().toLocaleTimeString("fr-FR")}</td><td>${esc(method)} ${esc(url)}</td>` +
    `<td class="s${String(res.status)[0]}">${res.status}</td><td>${esc(res.headers.get("X-Request-Id") || "—")}</td>`;
  $("log").prepend(tr);
  while ($("log").children.length > 10) $("log").lastChild.remove();
}
async function api(method, url, body) {
  const headers = {};
  if (token) headers.Authorization = "Bearer " + token;
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  trace(method, url, res);
  return res;
}

async function loadCategories() {
  try {
    const res = await api("GET", "/api/categories");
    if (res.ok) { const d = await res.json(); cats = Array.isArray(d) ? d : d.content || []; }
  } catch (e) {}
  renderFilters();
}
function renderFilters() {
  const used = cats.filter((c) => !["equipement", "accessoires", "protection"].includes(c.slug));
  $("filters").innerHTML = "";
  [{ id: "", name: "Tous" }, ...used].forEach((c) => {
    const b = document.createElement("button");
    b.className = "chip" + (c.id === catId ? " on" : ""); b.textContent = c.name;
    b.onclick = () => { catId = c.id; page = 0; renderFilters(); loadProducts(); };
    $("filters").appendChild(b);
  });
}
async function loadProducts() {
  const q = new URLSearchParams({ active: "true", page, size: PAGE_SIZE });
  if (catId) q.set("categoryId", catId);
  if (search) q.set("search", search);
  try {
    const res = await api("GET", "/api/products?" + q);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const d = await res.json();
    products = d.content || []; totalPages = Math.max(1, d.totalPages || 1);
    renderGrid();
  } catch (e) {
    $("grid").innerHTML = `<p class="msg err">Catalogue indisponible (${esc(e.message)}). La gateway ou le service est-il en panne ?</p>`;
  }
}
function renderGrid() {
  $("grid").innerHTML = products.length ? "" : '<p class="muted">Aucune arme trouvée.</p>';
  const catName = (id) => (cats.find((c) => c.id === id) || {}).name || "";
  products.forEach((p) => {
    const d = document.createElement("div"); d.className = "card";
    const low = p.stockQuantity > 0 && p.stockQuantity <= 10;
    d.innerHTML = `<div class="pic"><img src="${esc(p.imageUrl || "/images/pistol.svg")}" alt="${esc(p.name)}" loading="lazy"></div>` +
      `<span class="cat">${esc(catName(p.categoryId))}</span><h3>${esc(p.name)}</h3><p>${esc(p.description)}</p>` +
      `<div class="stock ${low ? "low" : ""}">${p.stockQuantity > 0 ? "Stock : " + p.stockQuantity : "Rupture de stock"}</div>` +
      `<div class="row"><span class="price">${money(p.price)}</span><button class="btn" ${p.stockQuantity > 0 ? "" : "disabled"}>Ajouter</button></div>`;
    d.querySelector("button").onclick = () => addToCart(p);
    $("grid").appendChild(d);
  });
  $("pageInfo").textContent = `Page ${page + 1} / ${totalPages}`;
  $("prev").disabled = page <= 0; $("next").disabled = page >= totalPages - 1;
}

function addToCart(p) {
  const cur = cart[p.id] ? cart[p.id].qty : 0;
  if (cur >= p.stockQuantity) return say("Stock maximum atteint pour " + p.name, false);
  cart[p.id] = { p, qty: cur + 1 }; renderCart();
}
function renderCart() {
  let total = 0, count = 0; $("cartItems").innerHTML = "";
  Object.entries(cart).forEach(([id, { p, qty }]) => {
    total += p.price * qty; count += qty;
    const li = document.createElement("li");
    li.innerHTML = `<span>${esc(p.name)}</span><span class="ctl"><button data-d="-1">−</button>${qty}<button data-d="1">+</button> ${money(p.price * qty)}</span>`;
    li.querySelectorAll("button").forEach((b) => b.onclick = () => {
      const q = qty + Number(b.dataset.d);
      if (q <= 0) delete cart[id]; else if (q <= p.stockQuantity) cart[id].qty = q;
      renderCart();
    });
    $("cartItems").appendChild(li);
  });
  $("cartTotal").textContent = money(total); $("cartCount").textContent = count;
}
function say(msg, ok) { $("orderMsg").textContent = msg; $("orderMsg").className = "msg " + (ok ? "ok" : "err"); $("cart").classList.remove("hidden"); }

async function checkout() {
  const items = Object.entries(cart).map(([productId, { qty }]) => ({ productId, quantity: qty }));
  if (!items.length) return say("Panier vide.", false);
  if (!token) return say("Connexion SSO requise pour commander (le SSO n'est pas encore en place : collez un jeton).", false);
  const res = await api("POST", "/api/orders", { userId: userFromToken(), items });
  let body = {}; try { body = await res.json(); } catch (e) {}
  if (res.status === 201 || res.status === 200) {
    cart = {}; renderCart();
    say(`Commande ${String(body.id || "").slice(0, 8)} enregistrée — statut ${body.status}, total ${money(body.totalAmount ?? 0)}.`, true);
    loadProducts();
  } else if (res.status === 401) { token = null; refreshWho(); say("401 — jeton absent, invalide ou expiré.", false); }
  else if (res.status === 429) say("429 — trop de requêtes, réessayez dans une seconde.", false);
  else say(`Erreur ${res.status} — ${body.detail || body.title || "service de commandes indisponible"}.`, false);
}

$("login").onclick = () => {
  if (token) { token = null; try { sessionStorage.removeItem("token"); } catch (e) {} return refreshWho(); }
  const t = prompt("SSO pas encore branché.\nColler ici un jeton JWT (Authentik / Authelia) :");
  if (t && t.split(".").length === 3) { token = t.trim(); try { sessionStorage.setItem("token", token); } catch (e) {} refreshWho(); }
};
$("cartBtn").onclick = () => $("cart").classList.toggle("hidden");
$("closeCart").onclick = () => $("cart").classList.add("hidden");
$("checkout").onclick = checkout;
$("prev").onclick = () => { page--; loadProducts(); };
$("next").onclick = () => { page++; loadProducts(); };
let tm; $("search").oninput = (e) => { clearTimeout(tm); tm = setTimeout(() => { search = e.target.value.trim(); page = 0; loadProducts(); }, 300); };
refreshWho(); loadCategories().then(loadProducts);
