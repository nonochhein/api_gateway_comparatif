const $ = (id) => document.getElementById(id);
const money = (n) => "GTA$ " + Number(n).toLocaleString("fr-FR");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const PAGE_SIZE = 12;
let products = [], cats = [], cart = {}, token = null, page = 0, totalPages = 1, total = 0, catId = "", search = "";
let photos = {};   // sku -> fichier, listé dans /images/photos/manifest.json (vide tant qu'aucune photo n'est ajoutée)
try { token = sessionStorage.getItem("token"); } catch (e) {}
try { cart = JSON.parse(localStorage.getItem("ammu-cart")) || {}; } catch (e) { cart = {}; }
const saveCart = () => { try { localStorage.setItem("ammu-cart", JSON.stringify(cart)); } catch (e) {} };

/* ---------- Curseur noir et blanc : poing fermé en navigation, doigt d'honneur sur le cliquable (CSS) et au clic ---------- */
let flipTimer;
document.addEventListener("pointerdown", (e) => {
  document.documentElement.classList.add("flip");          // le curseur CSS passe en doigt d'honneur
  clearTimeout(flipTimer);
  flipTimer = setTimeout(() => document.documentElement.classList.remove("flip"), 450);
  const s = document.createElement("img");                  // + sprite qui jaillit (visible aussi au tactile)
  s.className = "pop"; s.src = "/cursors/flip.png?v=4"; s.alt = "";
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
  loadOrders();
}

/* ---------- Appels API (tous via la gateway) + journal ---------- */
function trace(method, url, res) {
  const tr = document.createElement("tr");
  tr.innerHTML = `<td>${new Date().toLocaleTimeString("fr-FR")}</td><td>${esc(method)} ${esc(url)}</td>` +
    `<td class="s${String(res.status)[0]}">${res.status}</td><td>${esc(res.headers.get("X-Request-Id") || "—")}</td>`;
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
  $("grid").innerHTML = "";
  if (!products.length) {
    $("grid").innerHTML = `<div class="empty"><p>Aucune arme trouvée${search ? ` pour « ${esc(search)} »` : ""}.</p>` +
      (search || catId ? '<button class="btn dark" id="reset">Réinitialiser les filtres</button>' : "") + "</div>";
    if ($("reset")) $("reset").onclick = () => { search = ""; catId = ""; page = 0; $("search").value = ""; renderFilters(); loadProducts(); };
  }
  const catName = (id) => (cats.find((c) => c.id === id) || {}).name || "";
  products.forEach((p, i) => {
    const out = p.stockQuantity <= 0, low = !out && p.stockQuantity <= 10;
    const d = document.createElement("article"); d.className = "card"; d.style.animationDelay = i * 25 + "ms";
    d.innerHTML = `<div class="pic clickable"><img src="${esc(imgOf(p))}" alt="${esc(p.name)}" loading="lazy" decoding="async">` +
      `<span class="cat">${esc(catName(p.categoryId))}</span>${out ? '<span class="flag out">Rupture</span>' : low ? '<span class="flag">Dernières pièces</span>' : ""}</div>` +
      `<div class="body"><h3 class="clickable" tabindex="0" role="button">${esc(p.name)}</h3><p>${esc(p.description)}</p>` +
      `<div class="stock ${low ? "low" : ""}">${out ? "Indisponible" : "Stock : " + p.stockQuantity}</div>` +
      `<div class="row"><span class="price"><small>GTA$</small>${Number(p.price).toLocaleString("fr-FR")}</span>` +
      `<button class="btn" ${out ? "disabled" : ""}>Ajouter</button></div></div>`;
    d.querySelector("img").onerror = (e) => { if (!e.target.dataset.fb) { e.target.dataset.fb = 1; e.target.src = p.imageUrl || "/images/pistol.svg"; } };
    d.querySelector(".row button").onclick = () => addToCart(p);
    d.querySelector(".pic").onclick = d.querySelector("h3").onclick = () => openProduct(p);
    d.querySelector("h3").onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openProduct(p); } };
    $("grid").appendChild(d);
  });
  $("pageInfo").textContent = `Page ${page + 1} / ${totalPages}`;
  $("countInfo").textContent = `${total} arme${total > 1 ? "s" : ""}`;
  $("prev").disabled = page <= 0; $("next").disabled = page >= totalPages - 1;
}

/* ---------- Panier ---------- */
const lockScroll = () => document.body.classList.toggle("lock", !$("cart").classList.contains("hidden") || !$("modal").classList.contains("hidden"));
function openCart(open) {
  $("cart").classList.toggle("hidden", !open); $("veil").classList.toggle("hidden", !open); lockScroll();
  if (open) $("closeCart").focus();
}
function addToCart(p, n = 1) {
  const cur = cart[p.id] ? cart[p.id].qty : 0;
  if (cur >= p.stockQuantity) return toast("Stock maximum atteint : " + p.name, true);
  const qty = Math.min(cur + n, p.stockQuantity);
  cart[p.id] = { p, qty }; renderCart(); toast(`${qty - cur > 1 ? qty - cur + " × " : ""}${p.name} ajouté au panier`);
  const b = $("cartCount"); b.classList.remove("bump"); void b.offsetWidth; b.classList.add("bump");
}

/* ---------- Fiche produit ---------- */
let shown = null, mQty = 1;
function openProduct(p) {
  shown = p; mQty = 1;
  const out = p.stockQuantity <= 0;
  $("mImg").src = imgOf(p); $("mImg").alt = p.name;
  $("mImg").onerror = (e) => { if (!e.target.dataset.fb) { e.target.dataset.fb = 1; e.target.src = p.imageUrl || "/images/pistol.svg"; } };
  delete $("mImg").dataset.fb;
  $("mCat").textContent = (cats.find((c) => c.id === p.categoryId) || {}).name || "Ammu-Nation";
  $("mTitle").textContent = p.name; $("mDesc").textContent = p.description || "";
  $("mSku").textContent = p.sku || "—";
  $("mStock").textContent = out ? "Indisponible" : "Stock : " + p.stockQuantity;
  $("mStock").className = "stock" + (!out && p.stockQuantity <= 10 ? " low" : "");
  $("mPrice").innerHTML = `<small>GTA$</small>${Number(p.price).toLocaleString("fr-FR")}`;
  renderQty();
  $("modal").classList.remove("hidden"); lockScroll(); $("mAdd").focus();
}
function renderQty() {
  const max = shown.stockQuantity - (cart[shown.id] ? cart[shown.id].qty : 0);
  $("mQty").textContent = mQty;
  $("mMinus").disabled = mQty <= 1; $("mPlus").disabled = mQty >= max;
  $("mAdd").disabled = max <= 0;
  $("mAdd").textContent = shown.stockQuantity <= 0 ? "Rupture de stock" : max <= 0 ? "Stock maximum dans le panier" : `Ajouter — ${money(shown.price * mQty)}`;
}
function closeProduct() { $("modal").classList.add("hidden"); lockScroll(); }
$("mMinus").onclick = () => { mQty--; renderQty(); };
$("mPlus").onclick = () => { mQty++; renderQty(); };
$("mAdd").onclick = () => { addToCart(shown, mQty); closeProduct(); };
$("closeModal").onclick = closeProduct;
$("modal").onclick = (e) => { if (e.target === $("modal")) closeProduct(); };
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
      if (q <= 0) delete cart[id]; else if (q <= p.stockQuantity) cart[id].qty = q; else toast("Stock maximum atteint : " + p.name, true);
      renderCart();
    });
    $("cartItems").appendChild(li);
  });
  if (!count) $("cartItems").innerHTML = '<li class="none" style="display:block">Votre panier est vide.</li>';
  $("cartTotal").textContent = money(total); $("cartCount").textContent = count;
  const lines = Object.keys(cart).length;
  $("cartLines").textContent = lines ? `${count} article${count > 1 ? "s" : ""}, ${lines} référence${lines > 1 ? "s" : ""}` : "";
  $("clearCart").disabled = $("checkout").disabled = !count;
  saveCart();
}
/* ---------- Mes commandes (order-service, toutes protégées par le jeton) ---------- */
const STATUS = { PENDING: "En attente", CONFIRMED: "Confirmée", COMPLETED: "Livrée", CANCELLED: "Annulée" };
const ORDER_SIZE = 5;
let orders = [], orderPage = 0, orderPages = 1, orderTotal = 0, orderStatus = "";
const fmtDate = (d) => d ? new Date(d).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" }) : "";
function renderOrderFilters() {
  $("orderFilters").innerHTML = "";
  [["", "Toutes"], ...Object.entries(STATUS)].forEach(([k, label]) => {
    const b = document.createElement("button");
    b.className = "chip" + (k === orderStatus ? " on" : ""); b.textContent = label;
    b.onclick = () => { orderStatus = k; renderOrderFilters(); loadOrders(); };
    $("orderFilters").appendChild(b);
  });
}
function ordersMessage(html) {
  $("orderList").innerHTML = `<div class="empty">${html}</div>`;
  $("moreOrders").classList.add("hidden"); $("ordersInfo").textContent = "";
}
async function loadOrders(more) {
  if (!token) {
    ordersMessage('<p>Connectez-vous pour voir vos commandes.</p><button class="btn" id="ordersLogin">Connexion SSO</button>');
    $("ordersLogin").onclick = () => $("login").click();
    return;
  }
  orderPage = more ? orderPage + 1 : 0;
  const q = new URLSearchParams({ userId: userFromToken(), page: orderPage, size: ORDER_SIZE });
  if (orderStatus) q.set("status", orderStatus);
  try {
    const res = await api("GET", "/api/orders?" + q);
    if (res.status === 401) { token = null; refreshWho(); return toast("Session expirée : reconnectez-vous.", true); }
    if (!res.ok) throw new Error("HTTP " + res.status);
    const d = await res.json();
    orders = (more ? orders : []).concat(d.content || []);
    orderPages = Math.max(1, d.totalPages || 1); orderTotal = d.totalElements ?? orders.length;
    renderOrders();
  } catch (e) {
    ordersMessage(`<p class="msg err">Commandes indisponibles (${esc(e.message)}). Le service de commandes est-il en panne ?</p>`);
  }
}
function steps(st) {
  if (st === "CANCELLED") return "";
  const n = ["PENDING", "CONFIRMED", "COMPLETED"].indexOf(st);
  return '<span class="steps">' + ["Passée", "Confirmée", "Livrée"].map((l, i) =>
    (i ? `<i class="${i <= n ? "on" : ""}"></i>` : "") + `<span class="${i <= n ? "on" : ""}">${l}</span>`).join("") + "</span>";
}
function renderOrders() {
  if (!orders.length) {
    ordersMessage(orderStatus ? `<p>Aucune commande « ${STATUS[orderStatus]} ».</p>`
      : '<p>Aucune commande pour l\'instant.</p><a class="btn" href="#catalogue" style="text-decoration:none;display:inline-block">Faire ses courses</a>');
    return;
  }
  $("orderList").innerHTML = "";
  orders.forEach((o) => {
    const items = o.items || [], n = items.reduce((t, i) => t + i.quantity, 0);
    const d = document.createElement("article"); d.className = "order " + o.status;
    d.innerHTML = `<div class="order-head"><div><div class="ref">#${esc(String(o.id).slice(0, 8))}</div><div class="date">${esc(fmtDate(o.createdAt))}</div></div>` +
      `${steps(o.status) || "<span></span>"}<span class="status ${esc(o.status)}">${esc(STATUS[o.status] || o.status)}</span><span class="sum">${money(o.totalAmount ?? 0)}</span></div>` +
      `<details><summary>${n} article${n > 1 ? "s" : ""}</summary><table>` +
      items.map((i) => `<tr><td>${i.quantity} × ${esc(i.productName)}</td><td>${money(i.lineTotal ?? i.unitPrice * i.quantity)}</td></tr>`).join("") +
      `</table></details><div class="order-actions">` +
      (o.status === "PENDING" ? '<button class="btn" data-a="confirm">Confirmer et réserver</button>' : "") +
      (o.status === "CONFIRMED" ? '<button class="btn dark" data-a="complete">Marquer comme livrée</button>' : "") +
      (o.status === "PENDING" || o.status === "CONFIRMED" ? '<button class="btn ghost dark-ghost" data-a="cancel">Annuler</button>' : "") +
      '<button class="btn ghost dark-ghost" data-a="reorder">Commander à nouveau</button></div>';
    d.querySelectorAll("[data-a]").forEach((b) => b.onclick = () => b.dataset.a === "reorder" ? reorder(o) : orderAction(o, b.dataset.a, b));
    $("orderList").appendChild(d);
  });
  $("ordersInfo").textContent = `${orderTotal} commande${orderTotal > 1 ? "s" : ""}`;
  $("moreOrders").classList.toggle("hidden", orderPage >= orderPages - 1);
}
async function orderAction(o, action, btn) {
  if (action === "cancel" && !confirm(`Annuler la commande #${String(o.id).slice(0, 8)} ?`)) return;
  btn.disabled = true;
  let res, body = {};
  try { res = await api("POST", `/api/orders/${o.id}/${action}`); body = await res.json().catch(() => ({})); }
  catch (e) { btn.disabled = false; return toast("Gateway injoignable — réessayez.", true); }
  if (res.ok) {
    Object.assign(o, body); renderOrders();
    toast({ confirm: "Commande confirmée : stock réservé.", cancel: "Commande annulée.", complete: "Commande livrée. Bonne chasse." }[action]);
    if (action !== "complete") loadProducts();             // le stock du catalogue a bougé
  } else {
    btn.disabled = false;
    if (res.status === 401) { token = null; refreshWho(); }
    toast(`Erreur ${res.status} — ${body.detail || body.title || "action impossible"}`, true);
    if (res.status === 409) loadOrders();                   // état changé ailleurs : on recharge
  }
}
async function reorder(o) {
  let added = 0;
  for (const i of o.items || []) {
    try {
      const res = await api("GET", "/api/products/" + i.productId);
      if (!res.ok) continue;
      const p = await res.json();
      const cur = cart[p.id] ? cart[p.id].qty : 0, qty = Math.min(cur + i.quantity, p.stockQuantity);
      if (qty > cur && p.active !== false) { cart[p.id] = { p, qty }; added += qty - cur; }
    } catch (e) {}
  }
  renderCart();
  if (!added) return toast("Ces armes ne sont plus disponibles.", true);
  toast(`${added} article${added > 1 ? "s" : ""} remis dans le panier`); openCart(true);
}

function say(msg, ok) { $("orderMsg").textContent = msg; $("orderMsg").className = "msg " + (ok ? "ok" : "err"); }

async function checkout() {
  const items = Object.entries(cart).map(([productId, { qty }]) => ({ productId, quantity: qty }));
  if (!items.length) return say("Panier vide.", false);
  if (!token) return say("Connexion SSO requise pour commander (le SSO n'est pas encore en place : collez un jeton).", false);
  $("checkout").disabled = true; $("checkout").textContent = "Envoi…";
  let res;
  try { res = await api("POST", "/api/orders", { userId: userFromToken(), items }); }
  catch (e) { say("Gateway injoignable — réessayez.", false); return; }
  finally { $("checkout").textContent = "Commander"; $("checkout").disabled = !Object.keys(cart).length; }
  let body = {}; try { body = await res.json(); } catch (e) {}
  if (res.status === 201 || res.status === 200) {
    cart = {}; renderCart();
    say(`Commande ${String(body.id || "").slice(0, 8)} enregistrée — statut ${body.status}, total ${money(body.totalAmount ?? 0)}.`, true);
    toast("Commande enregistrée. Confirmez-la dans « Mes commandes ».");
    orderStatus = ""; renderOrderFilters(); loadOrders();
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
$("clearCart").onclick = () => { if (confirm("Vider le panier ?")) { cart = {}; renderCart(); } };
$("clearLog").onclick = () => { $("log").innerHTML = ""; };
$("refreshOrders").onclick = () => loadOrders();
$("moreOrders").onclick = () => loadOrders(true);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { if (!$("modal").classList.contains("hidden")) closeProduct(); else openCart(false); }
  if (e.key === "/" && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); $("search").focus(); }
});
const onScroll = () => { $("top").classList.toggle("scrolled", scrollY > 8); $("toTop").classList.toggle("show", scrollY > 600); };
addEventListener("scroll", onScroll, { passive: true }); onScroll();
$("toTop").onclick = () => scrollTo({ top: 0 });
const toCatalogue = () => { const t = $("catalogue").getBoundingClientRect().top; if (t < 0) $("catalogue").scrollIntoView(); };
$("checkout").onclick = checkout;
$("prev").onclick = () => { page--; loadProducts(); toCatalogue(); };
$("next").onclick = () => { page++; loadProducts(); toCatalogue(); };
let tm; $("search").oninput = (e) => { clearTimeout(tm); tm = setTimeout(() => { search = e.target.value.trim(); page = 0; loadProducts(); }, 300); };
renderOrderFilters(); refreshWho(); renderCart();
Promise.all([loadPhotos(), loadCategories()]).then(loadProducts);
