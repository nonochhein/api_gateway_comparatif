const $ = (id) => document.getElementById(id);
const money = (n) => "GTA$ " + Number(n).toLocaleString("fr-FR");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const PAGE_SIZE = 12;
let products = [], cats = [], cart = {}, token = null, page = 0, totalPages = 1, total = 0, catId = "", search = "";
let photos = {};   // sku -> fichier, listé dans /images/photos/manifest.json (vide tant qu'aucune photo n'est ajoutée)
try { token = sessionStorage.getItem("token"); } catch (e) {}

/* ---------- Curseur : poing fermé en navigation, doigt d'honneur 8 bit au clic ---------- */
let flipTimer;
document.addEventListener("pointerdown", (e) => {
  document.documentElement.classList.add("flip");          // le curseur CSS passe en doigt d'honneur
  clearTimeout(flipTimer);
  flipTimer = setTimeout(() => document.documentElement.classList.remove("flip"), 450);
  const s = document.createElement("img");                  // + sprite qui jaillit (visible aussi au tactile)
  s.className = "pop"; s.src = "/cursors/flip.png?v=3"; s.alt = "";
  s.style.left = e.clientX + "px"; s.style.top = e.clientY + "px";
  document.body.appendChild(s); setTimeout(() => s.remove(), 750);
}, true);

function toast(msg, err) {
  const t = document.createElement("div"); t.className = "toast" + (err ? " err" : ""); t.textContent = msg;
  $("toasts").appendChild(t); setTimeout(() => t.remove(), 2600);
}

/* ---------- SSO : pas encore en place, on colle un jeton en attendant ---------- */
function userFromToken() {
  if (!token) return null;
  try {
    const p = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return p.preferred_username || p.email || p.sub || "client";
  } catch (e) { return "client"; }
}
function refreshWho() {
  const u = userFromToken();
  $("who").textContent = u ? "● " + u : "";
  $("login").textContent = u ? "Déconnexion" : "Connexion SSO";
}

/* ---------- Appels API (tous via la gateway) + journal ---------- */
function trace(method, url, res) {
  const tr = document.createElement("tr");
  tr.innerHTML = `<td>${new Date().toLocaleTimeString("fr-FR")}</td><td>${esc(method)} ${esc(url)}</td>` +
    `<td class="s${String(res.status)[0]}">${res.status}</td><td>${esc(res.headers.get("X-Request-Id") || "—")}</td>`;
  $("log").prepend(tr);
  while ($("log").children.length > 8) $("log").lastChild.remove();
}
async function api(method, url, body) {
  const headers = {};
  if (token) headers.Authorization = "Bearer " + token;
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  trace(method, url, res);
  return res;
}
const imgOf = (p) => (photos[p.sku] ? "/images/photos/" + photos[p.sku] : p.imageUrl || "/images/pistol.svg");

/* ---------- Catalogue ---------- */
async function loadPhotos() {
  try { const r = await fetch("/images/photos/manifest.json"); if (r.ok) photos = await r.json(); } catch (e) {}
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
function skeletons() { $("grid").innerHTML = Array.from({ length: 8 }, () => '<div class="skeleton"></div>').join(""); }
async function loadProducts() {
  skeletons();
  const q = new URLSearchParams({ active: "true", page, size: PAGE_SIZE });
  if (catId) q.set("categoryId", catId);
  if (search) q.set("search", search);
  try {
    const res = await api("GET", "/api/products?" + q);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const d = await res.json();
    products = d.content || []; totalPages = Math.max(1, d.totalPages || 1); total = d.totalElements ?? products.length;
    if (!catId && !search) $("statCount").textContent = total;
    renderGrid();
  } catch (e) {
    $("grid").innerHTML = `<p class="empty msg err">Catalogue indisponible (${esc(e.message)}). La gateway ou le service est-il en panne ?</p>`;
  }
}
function renderGrid() {
  $("grid").innerHTML = products.length ? "" : '<p class="empty">Aucune arme trouvée.</p>';
  const catName = (id) => (cats.find((c) => c.id === id) || {}).name || "";
  products.forEach((p, i) => {
    const out = p.stockQuantity <= 0, low = !out && p.stockQuantity <= 10;
    const d = document.createElement("article"); d.className = "card"; d.style.animationDelay = i * 25 + "ms";
    d.innerHTML = `<div class="pic"><img src="${esc(imgOf(p))}" alt="${esc(p.name)}" loading="lazy">` +
      `<span class="cat">${esc(catName(p.categoryId))}</span>${out ? '<span class="flag out">Rupture</span>' : low ? '<span class="flag">Dernières pièces</span>' : ""}</div>` +
      `<div class="body"><h3>${esc(p.name)}</h3><p>${esc(p.description)}</p>` +
      `<div class="stock ${low ? "low" : ""}">${out ? "Indisponible" : "Stock : " + p.stockQuantity}</div>` +
      `<div class="row"><span class="price"><small>GTA$</small>${Number(p.price).toLocaleString("fr-FR")}</span>` +
      `<button class="btn" ${out ? "disabled" : ""}>Ajouter</button></div></div>`;
    d.querySelector("img").onerror = (e) => { if (!e.target.dataset.fb) { e.target.dataset.fb = 1; e.target.src = p.imageUrl || "/images/pistol.svg"; } };
    d.querySelector("button").onclick = () => addToCart(p);
    $("grid").appendChild(d);
  });
  $("pageInfo").textContent = `Page ${page + 1} / ${totalPages}`;
  $("countInfo").textContent = `${total} arme${total > 1 ? "s" : ""}`;
  $("prev").disabled = page <= 0; $("next").disabled = page >= totalPages - 1;
}

/* ---------- Panier ---------- */
function openCart(open) {
  $("cart").classList.toggle("hidden", !open); $("veil").classList.toggle("hidden", !open);
}
function addToCart(p) {
  const cur = cart[p.id] ? cart[p.id].qty : 0;
  if (cur >= p.stockQuantity) return toast("Stock maximum atteint : " + p.name, true);
  cart[p.id] = { p, qty: cur + 1 }; renderCart(); toast(p.name + " ajouté au panier");
}
function renderCart() {
  let total = 0, count = 0; $("cartItems").innerHTML = "";
  Object.entries(cart).forEach(([id, { p, qty }]) => {
    total += p.price * qty; count += qty;
    const li = document.createElement("li");
    li.innerHTML = `<img src="${esc(imgOf(p))}" alt=""><span class="nm">${esc(p.name)}<br><small>${money(p.price * qty)}</small></span>` +
      `<span class="ctl"><button data-d="-1" aria-label="Moins">−</button>${qty}<button data-d="1" aria-label="Plus">+</button></span>`;
    li.querySelector("img").onerror = (e) => { e.target.src = p.imageUrl || "/images/pistol.svg"; };
    li.querySelectorAll("button").forEach((b) => b.onclick = () => {
      const q = qty + Number(b.dataset.d);
      if (q <= 0) delete cart[id]; else if (q <= p.stockQuantity) cart[id].qty = q;
      renderCart();
    });
    $("cartItems").appendChild(li);
  });
  if (!count) $("cartItems").innerHTML = '<li class="none" style="display:block">Votre panier est vide.</li>';
  $("cartTotal").textContent = money(total); $("cartCount").textContent = count;
}
function say(msg, ok) { $("orderMsg").textContent = msg; $("orderMsg").className = "msg " + (ok ? "ok" : "err"); }

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
  if (t && t.split(".").length === 3) { token = t.trim(); try { sessionStorage.setItem("token", token); } catch (e) {} refreshWho(); toast("Connecté"); }
};
$("cartBtn").onclick = () => openCart($("cart").classList.contains("hidden"));
$("closeCart").onclick = () => openCart(false);
$("veil").onclick = () => openCart(false);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") openCart(false); });
$("checkout").onclick = checkout;
$("prev").onclick = () => { page--; loadProducts(); };
$("next").onclick = () => { page++; loadProducts(); };
let tm; $("search").oninput = (e) => { clearTimeout(tm); tm = setTimeout(() => { search = e.target.value.trim(); page = 0; loadProducts(); }, 300); };
refreshWho(); renderCart();
Promise.all([loadPhotos(), loadCategories()]).then(loadProducts);
