const $ = (id) => document.getElementById(id);
const money = (n) => "GTA$ " + Number(n).toLocaleString("en-US");
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

/* ---------- Bandeau boursier façon Wall Street (BAWSAQ) : fausses actions, brèves absurdes, cours des armes ---------- */
const STOCKS = [   // [symbole, cours, variation %, commentaire]
  ["AMMU", 1337, 6.66, "Second Amendment Day sale"], ["LSPD", 12.5, -12.4, "donut reserves critically low"],
  ["FLEECA", 48.2, -8.2, "robbed again, 4th time this week"], ["MAZE", 911, 3.1, "vault door “just resting”"],
  ["LIFINV", 0.42, -41, "CEO keynote ended in an explosion"], ["SPRUNK", 69.4, 2.4, "now with 30% more sugar"],
  ["CLUCK", 7.99, -5.5, "chicken origin still unknown"], ["PISSWS", 4.2, 4.2, "shareholders drank the dividends"],
  ["EGOCHS", 77.7, 7.7, "energy bars reach orbit"], ["WEAZEL", 13.13, 0.1, "fear index at an all-time high"],
  ["MRRYWT", 666, 19.9, "private army, public problems"], ["BINCO", 1.99, -0.3, "still selling the same shirt"],
];
const NEWS = [
  "BREAKING: man in a tank on the freeway, police “not surprised”", "WEATHER: 100% chance of stray bullets",
  "SPORTS: golfer hits caddie, calls it a birdie", "ADVICE: always tip your getaway driver",
  "MARKETS: trading halted after a rampage on Vespucci Beach", "TRAFFIC: Del Perro pier closed, someone parked a jet on it",
  "REAL ESTATE: Vinewood hills home with only 3 bullet holes, a steal", "HEALTH: doctors say lead is now part of a balanced diet",
];
let tickerItems = STOCKS.map(([sym, px, chg, note]) => ({ sym, px, chg, note }));
const fmtPx = (n) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function tickerHtml() {
  const out = [], news = [...NEWS];
  tickerItems.forEach((t, i) => {
    out.push(`<span class="tk" data-i="${i}"><b>${esc(t.sym)}</b> <span class="px">${fmtPx(t.px)}</span> ` +
      `<span class="chg ${t.chg < 0 ? "down" : "up"}">${t.chg < 0 ? "▼" : "▲"} ${Math.abs(t.chg).toFixed(2)}%</span>${t.note ? ` <em>${esc(t.note)}</em>` : ""}</span>`);
    if (i % 3 === 2 && news.length) out.push(`<span class="tk news"><b>●</b> ${esc(news.shift())}</span>`);
  });
  return out.join("");
}
function renderTicker() {
  const html = tickerHtml();
  $("ticker").innerHTML = html + html;                       // deux copies : la boucle tourne sans à-coup
  $("ticker").style.setProperty("--dur", Math.max(40, $("ticker").scrollWidth / 2 / 70) + "s");
}
function tickWeapons(list) {                                   // les armes du catalogue cotent aussi en bourse
  const weapons = list.slice(0, 8).map((p) => ({ sym: (p.sku || p.name).replace(/^GTA-/, "").slice(0, 8), px: Number(p.price),
    chg: Math.round((Math.random() * 14 - 5) * 100) / 100, note: "" }));
  tickerItems = STOCKS.map(([sym, px, chg, note]) => ({ sym, px, chg, note }));
  weapons.forEach((w, i) => tickerItems.splice(2 + i * 2, 0, w));
  renderTicker();
}
setInterval(() => {                                            // cours « en direct » : on fait bouger quelques lignes
  for (let n = 0; n < 4; n++) {
    const i = Math.floor(Math.random() * tickerItems.length), t = tickerItems[i];
    const move = (Math.random() - 0.48) * 3;
    t.chg = Math.round((t.chg + move) * 100) / 100; t.px = Math.max(0.01, t.px * (1 + move / 100));
    document.querySelectorAll(`#ticker .tk[data-i="${i}"]`).forEach((el) => {
      el.querySelector(".px").textContent = fmtPx(t.px);
      const c = el.querySelector(".chg"); c.className = "chg " + (t.chg < 0 ? "down" : "up");
      c.textContent = `${t.chg < 0 ? "▼" : "▲"} ${Math.abs(t.chg).toFixed(2)}%`;
      el.classList.remove("flash", "dn", "upf"); void el.offsetWidth; el.classList.add("flash", move < 0 ? "dn" : "upf");
      setTimeout(() => el.classList.remove("flash", "dn", "upf"), 700);
    });
  }
}, 2500);
renderTicker();

function toast(msg, err) {
  const t = document.createElement("div"); t.className = "toast" + (err ? " err" : ""); t.textContent = msg;
  $("toasts").appendChild(t); setTimeout(() => t.remove(), 2600);
}

/* ---------- SSO : Authentik et Authelia (voir sso.js / sso-config.js) ---------- */
function userFromToken() {
  if (!token) return null;
  try {
    const p = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return p.preferred_username || p.email || p.sub || "client";
  } catch (e) { return "client"; }
}
function refreshWho() {
  const u = userFromToken();
  const prov = token && SSO.providerOf(token);
  $("who").textContent = u ? "● " + u + (prov ? " (" + SSO.providers[prov].label + ")" : "") : "";
  $("login").textContent = u ? "Log out" : "SSO login";
  loadOrders(); loadNotifs();
}

/* ---------- Appels API (tous via la gateway) + journal ---------- */
function trace(method, url, res) {
  const tr = document.createElement("tr");
  tr.innerHTML = `<td>${new Date().toLocaleTimeString("en-US")}</td><td>${esc(method)} ${esc(url)}</td>` +
    `<td class="s${String(res.status)[0]}">${res.status}</td><td>${esc(res.headers.get("X-Request-Id") || "—")}</td>`;
  $("log").prepend(tr);
  while ($("log").children.length > 12) $("log").lastChild.remove();
}
async function api(method, url, body, quiet) {            // quiet : appel périodique, pas tracé dans la console
  const headers = {};
  if (token) headers.Authorization = "Bearer " + token;
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!quiet || !res.ok) trace(method, url, res);
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
  [{ id: "", name: "All" }, ...used].forEach((c) => {
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
    if (!catId && !search && page === 0) tickWeapons(products);
    renderGrid();
  } catch (e) {
    $("grid").innerHTML = `<p class="empty msg err">Catalog unavailable (${esc(e.message)}). Is the gateway or the service down?</p>`;
  }
}
function renderGrid() {
  $("grid").innerHTML = "";
  if (!products.length) {
    $("grid").innerHTML = `<div class="empty"><p>No weapons found${search ? ` for “${esc(search)}”` : ""}.</p>` +
      (search || catId ? '<button class="btn dark" id="reset">Reset filters</button>' : "") + "</div>";
    if ($("reset")) $("reset").onclick = () => { search = ""; catId = ""; page = 0; $("search").value = ""; renderFilters(); loadProducts(); };
  }
  const catName = (id) => (cats.find((c) => c.id === id) || {}).name || "";
  products.forEach((p, i) => {
    const out = p.stockQuantity <= 0, low = !out && p.stockQuantity <= 10;
    const d = document.createElement("article"); d.className = "card"; d.style.animationDelay = i * 25 + "ms";
    d.innerHTML = `<div class="pic clickable"><img src="${esc(imgOf(p))}" alt="${esc(p.name)}" loading="lazy" decoding="async">` +
      `<span class="cat">${esc(catName(p.categoryId))}</span>${out ? '<span class="flag out">Sold out</span>' : low ? '<span class="flag">Last ones</span>' : ""}</div>` +
      `<div class="body"><h3 class="clickable" tabindex="0" role="button">${esc(p.name)}</h3><p>${esc(p.description)}</p>` +
      `<div class="stock ${low ? "low" : ""}">${out ? "Unavailable" : "In stock: " + p.stockQuantity}</div>` +
      `<div class="row"><span class="price"><small>GTA$</small>${Number(p.price).toLocaleString("en-US")}</span>` +
      `<button class="btn" ${out ? "disabled" : ""}>Add</button></div></div>`;
    d.querySelector("img").onerror = (e) => { if (!e.target.dataset.fb) { e.target.dataset.fb = 1; e.target.src = p.imageUrl || "/images/pistol.svg"; } };
    d.querySelector(".row button").onclick = () => addToCart(p);
    d.querySelector(".pic").onclick = d.querySelector("h3").onclick = () => openProduct(p);
    d.querySelector("h3").onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openProduct(p); } };
    $("grid").appendChild(d);
  });
  $("pageInfo").textContent = `Page ${page + 1} / ${totalPages}`;
  $("countInfo").textContent = `${total} weapon${total !== 1 ? "s" : ""}`;
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
  if (cur >= p.stockQuantity) return toast("Max stock reached: " + p.name, true);
  const qty = Math.min(cur + n, p.stockQuantity);
  cart[p.id] = { p, qty }; renderCart(); toast(`${qty - cur > 1 ? qty - cur + " × " : ""}${p.name} added to cart`);
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
  $("mStock").textContent = out ? "Unavailable" : "In stock: " + p.stockQuantity;
  $("mStock").className = "stock" + (!out && p.stockQuantity <= 10 ? " low" : "");
  $("mPrice").innerHTML = `<small>GTA$</small>${Number(p.price).toLocaleString("en-US")}`;
  renderQty();
  $("modal").classList.remove("hidden"); lockScroll(); $("mAdd").focus();
}
function renderQty() {
  const max = shown.stockQuantity - (cart[shown.id] ? cart[shown.id].qty : 0);
  $("mQty").textContent = mQty;
  $("mMinus").disabled = mQty <= 1; $("mPlus").disabled = mQty >= max;
  $("mAdd").disabled = max <= 0;
  $("mAdd").textContent = shown.stockQuantity <= 0 ? "Sold out" : max <= 0 ? "Max stock already in cart" : `Add — ${money(shown.price * mQty)}`;
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
      `<span class="ctl"><button data-d="-1" aria-label="Less">−</button>${qty}<button data-d="1" aria-label="More">+</button></span>`;
    li.querySelector("img").onerror = (e) => { e.target.src = p.imageUrl || "/images/pistol.svg"; };
    li.querySelectorAll("button").forEach((b) => b.onclick = () => {
      const q = qty + Number(b.dataset.d);
      if (q <= 0) delete cart[id]; else if (q <= p.stockQuantity) cart[id].qty = q; else toast("Max stock reached: " + p.name, true);
      renderCart();
    });
    $("cartItems").appendChild(li);
  });
  if (!count) $("cartItems").innerHTML = '<li class="none" style="display:block">Your cart is empty.</li>';
  $("cartTotal").textContent = money(total); $("cartCount").textContent = count;
  const lines = Object.keys(cart).length;
  $("cartLines").textContent = lines ? `${count} item${count !== 1 ? "s" : ""}, ${lines} product${lines !== 1 ? "s" : ""}` : "";
  $("clearCart").disabled = $("checkout").disabled = !count;
  saveCart();
}
/* ---------- Mes commandes (order-service, toutes protégées par le jeton) ---------- */
const STATUS = { PENDING: "Pending", CONFIRMED: "Confirmed", COMPLETED: "Delivered", CANCELLED: "Cancelled" };
const ORDER_SIZE = 5;
let orders = [], orderPage = 0, orderPages = 1, orderTotal = 0, orderStatus = "";
const fmtDate = (d) => d ? new Date(d).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "";
function renderOrderFilters() {
  $("orderFilters").innerHTML = "";
  [["", "All"], ...Object.entries(STATUS)].forEach(([k, label]) => {
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
    ordersMessage('<p>Log in to see your orders.</p><button class="btn" id="ordersLogin">SSO login</button>');
    $("ordersLogin").onclick = () => $("login").click();
    return;
  }
  orderPage = more ? orderPage + 1 : 0;
  const q = new URLSearchParams({ userId: userFromToken(), page: orderPage, size: ORDER_SIZE });
  if (orderStatus) q.set("status", orderStatus);
  try {
    const res = await api("GET", "/api/orders?" + q);
    if (res.status === 401) { token = null; refreshWho(); return toast("Session expired: please log in again.", true); }
    if (!res.ok) throw new Error("HTTP " + res.status);
    const d = await res.json();
    orders = (more ? orders : []).concat(d.content || []);
    orderPages = Math.max(1, d.totalPages || 1); orderTotal = d.totalElements ?? orders.length;
    renderOrders();
  } catch (e) {
    ordersMessage(`<p class="msg err">Orders unavailable (${esc(e.message)}). Is the order service down?</p>`);
  }
}
function steps(st) {
  if (st === "CANCELLED") return "";
  const n = ["PENDING", "CONFIRMED", "COMPLETED"].indexOf(st);
  return '<span class="steps">' + ["Placed", "Confirmed", "Delivered"].map((l, i) =>
    (i ? `<i class="${i <= n ? "on" : ""}"></i>` : "") + `<span class="${i <= n ? "on" : ""}">${l}</span>`).join("") + "</span>";
}
function renderOrders() {
  if (!orders.length) {
    ordersMessage(orderStatus ? `<p>No ${STATUS[orderStatus].toLowerCase()} orders.</p>`
      : '<p>No orders yet.</p><a class="btn" href="#catalogue" style="text-decoration:none;display:inline-block">Go shopping</a>');
    return;
  }
  $("orderList").innerHTML = "";
  orders.forEach((o) => {
    const items = o.items || [], n = items.reduce((t, i) => t + i.quantity, 0);
    const d = document.createElement("article"); d.className = "order " + o.status;
    d.innerHTML = `<div class="order-head"><div><div class="ref">#${esc(String(o.id).slice(0, 8))}</div><div class="date">${esc(fmtDate(o.createdAt))}</div></div>` +
      `${steps(o.status) || "<span></span>"}<span class="status ${esc(o.status)}">${esc(STATUS[o.status] || o.status)}</span><span class="sum">${money(o.totalAmount ?? 0)}</span></div>` +
      `<details><summary>${n} item${n !== 1 ? "s" : ""}</summary><table>` +
      items.map((i) => `<tr><td>${i.quantity} × ${esc(i.productName)}</td><td>${money(i.lineTotal ?? i.unitPrice * i.quantity)}</td></tr>`).join("") +
      `</table></details><div class="order-actions">` +
      (o.status === "PENDING" ? '<button class="btn" data-a="confirm">Confirm &amp; reserve</button>' : "") +
      (o.status === "CONFIRMED" ? '<button class="btn dark" data-a="complete">Mark as delivered</button>' : "") +
      (o.status === "PENDING" || o.status === "CONFIRMED" ? '<button class="btn ghost dark-ghost" data-a="cancel">Cancel</button>' : "") +
      '<button class="btn ghost dark-ghost" data-a="reorder">Order again</button></div>';
    d.querySelectorAll("[data-a]").forEach((b) => b.onclick = () => b.dataset.a === "reorder" ? reorder(o) : orderAction(o, b.dataset.a, b));
    $("orderList").appendChild(d);
  });
  $("ordersInfo").textContent = `${orderTotal} order${orderTotal !== 1 ? "s" : ""}`;
  $("moreOrders").classList.toggle("hidden", orderPage >= orderPages - 1);
}
async function orderAction(o, action, btn) {
  if (action === "cancel" && !confirm(`Cancel order #${String(o.id).slice(0, 8)}?`)) return;
  btn.disabled = true;
  let res, body = {};
  try { res = await api("POST", `/api/orders/${o.id}/${action}`); body = await res.json().catch(() => ({})); }
  catch (e) { btn.disabled = false; return toast("Gateway unreachable — try again.", true); }
  if (res.ok) {
    Object.assign(o, body); renderOrders();
    toast({ confirm: "Order confirmed: stock reserved.", cancel: "Order cancelled.", complete: "Order delivered. Happy hunting." }[action]);
    if (action !== "complete") loadProducts();             // le stock du catalogue a bougé
    setTimeout(loadNotifs, 2500);                          // l'événement part par l'outbox puis Kafka : on regarde un peu après
  } else {
    btn.disabled = false;
    if (res.status === 401) { token = null; refreshWho(); }
    toast(`Error ${res.status} — ${body.detail || body.title || "action not allowed"}`, true);
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
  if (!added) return toast("These weapons are no longer available.", true);
  toast(`${added} item${added !== 1 ? "s" : ""} put back in your cart`); openCart(true);
}

/* ---------- Notifications (notification-service, alimenté par Kafka) ---------- */
const NOTIF = { OrderConfirmed: ["✅", "confirmed — stock reserved"], OrderCancelled: ["✖", "cancelled — stock released"],
  OrderCompleted: ["📦", "delivered. Happy hunting."] };
let notifs = [], notifSeen = null, notifTimer;
const ago = (d) => {
  const s = Math.max(0, (Date.now() - new Date(d)) / 1000);
  return s < 60 ? "just now" : s < 3600 ? Math.floor(s / 60) + " min ago" : s < 86400 ? Math.floor(s / 3600) + " h ago" : new Date(d).toLocaleDateString("en-US");
};
const notifText = (n) => `Order #${String(n.orderId).slice(0, 8)} ${(NOTIF[n.type] || ["", n.type])[1]}`;
async function loadNotifs() {
  clearTimeout(notifTimer);
  if (!token) { notifs = []; notifSeen = null; renderNotifs(); return; }
  try {
    const res = await api("GET", "/api/notifications?" + new URLSearchParams({ userId: userFromToken(), size: 20 }), null, notifSeen !== null);
    if (res.ok) {
      notifs = (await res.json()).content || [];
      const fresh = notifSeen ? notifs.filter((n) => !notifSeen.has(n.id)) : [];
      notifSeen = new Set(notifs.map((n) => n.id));
      if (fresh.length) {                                   // un événement Kafka vient d'arriver
        fresh.slice(0, 3).forEach((n) => toast("🔔 " + notifText(n)));
        const b = $("notifBtn"); b.classList.remove("ring"); void b.offsetWidth; b.classList.add("ring");
        loadOrders();
      }
      renderNotifs();
    }
  } catch (e) {}
  if (token) notifTimer = setTimeout(loadNotifs, document.hidden ? 30000 : 5000);
}
function renderNotifs() {
  $("notifBtn").classList.toggle("hidden", !token);
  const unread = notifs.filter((n) => !n.readAt).length;
  $("notifCount").textContent = unread > 9 ? "9+" : unread; $("notifCount").classList.toggle("hidden", !unread);
  $("readAll").disabled = !unread;
  $("notifList").innerHTML = notifs.length ? "" : '<li class="none">No notifications yet. Confirm an order to get one.</li>';
  notifs.forEach((n) => {
    const li = document.createElement("li"); li.className = n.readAt ? "" : "unread clickable"; li.tabIndex = 0;
    li.innerHTML = `<span class="ic">${(NOTIF[n.type] || ["🔔"])[0]}</span><span>${esc(notifText(n))}<br><span class="when">${esc(ago(n.occurredAt || n.createdAt))}</span></span><span class="dot"></span>`;
    li.onclick = () => markRead(n);
    $("notifList").appendChild(li);
  });
}
async function markRead(n) {
  if (n.readAt) return;
  try { const res = await api("POST", `/api/notifications/${n.id}/read`); if (res.ok) Object.assign(n, await res.json()); } catch (e) {}
  renderNotifs();
}
function toggleNotifs(open) {
  $("notifPanel").classList.toggle("hidden", !open); $("notifBtn").setAttribute("aria-expanded", open);
}
$("notifBtn").onclick = (e) => { e.stopPropagation(); toggleNotifs($("notifPanel").classList.contains("hidden")); };
$("notifPanel").onclick = (e) => e.stopPropagation();
document.addEventListener("click", () => toggleNotifs(false));
$("readAll").onclick = async () => { for (const n of notifs.filter((x) => !x.readAt)) await markRead(n); };
document.addEventListener("visibilitychange", () => { if (!document.hidden && token) loadNotifs(); });

function say(msg, ok) { $("orderMsg").textContent = msg; $("orderMsg").className = "msg " + (ok ? "ok" : "err"); }

async function checkout() {
  const items = Object.entries(cart).map(([productId, { qty }]) => ({ productId, quantity: qty }));
  if (!items.length) return say("Your cart is empty.", false);
  if (!token) return say("SSO login required to order.", false);
  $("checkout").disabled = true; $("checkout").textContent = "Sending…";
  let res;
  try { res = await api("POST", "/api/orders", { userId: userFromToken(), items }); }
  catch (e) { say("Gateway unreachable — try again.", false); return; }
  finally { $("checkout").textContent = "Place order"; $("checkout").disabled = !Object.keys(cart).length; }
  let body = {}; try { body = await res.json(); } catch (e) {}
  if (res.status === 201 || res.status === 200) {
    cart = {}; renderCart();
    say(`Order ${String(body.id || "").slice(0, 8)} placed — status ${body.status}, total ${money(body.totalAmount ?? 0)}.`, true);
    toast("Order placed. Confirm it in “My orders”.");
    orderStatus = ""; renderOrderFilters(); loadOrders();
    loadProducts();
  } else if (res.status === 401) { token = null; refreshWho(); say("401 — token missing, invalid or expired.", false); }
  else if (res.status === 429) say("429 — too many requests, try again in a second.", false);
  else say(`Error ${res.status} — ${body.detail || body.title || "order service unavailable"}.`, false);
}

function setToken(t) { token = t; try { t ? sessionStorage.setItem("token", t) : sessionStorage.removeItem("token"); } catch (e) {} }
function startSso(name) { SSO.login(name).catch((e) => toast(e.message, true)); }
function chooseSso() {                                   // fenêtre de choix du SSO (les deux sont disponibles)
  const dlg = $("ssoDialog"), box = $("ssoChoices"); box.innerHTML = "";
  for (const [name, p] of Object.entries(SSO.providers)) {
    const b = document.createElement("button"); b.className = "btn"; b.dataset.sso = name;
    b.textContent = "Log in with " + p.label + (SSO.active() === name ? " (last used)" : "");
    b.onclick = () => { dlg.close(); startSso(name); };
    box.appendChild(b);
  }
  dlg.showModal();
}
$("ssoPaste").onclick = () => {                           // secours : coller un jeton à la main
  $("ssoDialog").close();
  const t = prompt("Paste a JWT (Authentik / Authelia):");
  if (t && t.split(".").length === 3) { setToken(t.trim()); refreshWho(); toast("Logged in"); }
};
$("ssoCancel").onclick = () => $("ssoDialog").close();
$("login").onclick = () => {
  if (token) { setToken(null); return refreshWho(); }
  const forced = new URLSearchParams(location.search).get("sso");
  if (SSO.active() && (forced || window.SSO_CONFIG.default)) return startSso(SSO.active());
  chooseSso();
};
SSO.handleCallback().then((r) => { if (r) { setToken(r.token); refreshWho(); toast("Logged in with " + SSO.providers[r.provider].label); } })
  .catch((e) => toast(e.message, true));
$("cartBtn").onclick = () => openCart($("cart").classList.contains("hidden"));
$("closeCart").onclick = () => openCart(false);
$("veil").onclick = () => openCart(false);
$("clearCart").onclick = () => { if (confirm("Empty your cart?")) { cart = {}; renderCart(); } };
$("clearLog").onclick = () => { $("log").innerHTML = ""; };
$("refreshOrders").onclick = () => loadOrders();
$("moreOrders").onclick = () => loadOrders(true);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { toggleNotifs(false); if (!$("modal").classList.contains("hidden")) closeProduct(); else openCart(false); }
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
