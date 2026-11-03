#!/usr/bin/env python3
"""Tests du site dans un vrai navigateur (Playwright, Chromium), sur tests/serve_front.py (faux services, sans Kong).
Usage : python3 tests/e2e/front.py [http://127.0.0.1:8765] [dossier des captures]
Prérequis : pip install playwright && python3 -m playwright install chromium"""
import base64, json, os, sys
from playwright.sync_api import sync_playwright, expect

URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8765"
SHOTS = sys.argv[2] if len(sys.argv) > 2 else "e2e-captures"
os.makedirs(SHOTS, exist_ok=True)
fails = 0


def check(desc, fn):
    global fails
    try:
        fn(); print("PASS  " + desc)
    except Exception as e:
        fails += 1; print(f"FAIL  {desc} : {str(e).splitlines()[0][:200]}")


def b64(o):
    return base64.urlsafe_b64encode(json.dumps(o).encode()).rstrip(b"=").decode()


TOKEN = f"{b64({'alg': 'none'})}.{b64({'preferred_username': 'e2e', 'exp': 9999999999})}.x"   # pas vérifié hors Kong
cursor = lambda page, sel: page.eval_on_selector(sel, "e => getComputedStyle(e).cursor")

with sync_playwright() as pw:
    browser = pw.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1280, "height": 900})
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: m.type == "error" and errors.append(m.text))
    page.on("dialog", lambda d: d.accept())
    page.goto(URL)

    def catalogue():
        expect(page.locator(".card")).to_have_count(12)
        expect(page.locator("#statCount")).not_to_have_text("—")
        expect(page.locator("#pageInfo")).to_contain_text("Page 1 /")
    check("catalogue : 12 armes affichées, compteur et pagination", catalogue)

    def cursors():
        assert "fist.png" in cursor(page, "body"), "body sans poing"
        assert "fist.png" in cursor(page, ".card p"), "texte sans poing"
        for sel in ("nav a", ".chip", ".card .row button", ".card .pic", "#cartCount", "#search"):
            assert "flip.png" in cursor(page, sel), sel + " sans doigt d'honneur"
    check("curseurs : poing par défaut, doigt d'honneur sur le cliquable", cursors)

    def click_pop():
        page.mouse.click(400, 200)
        expect(page.locator(".pop")).to_have_count(1)
        assert "grayscale(1)" in page.eval_on_selector(".pop", "e => getComputedStyle(e).filter")
    check("clic : sprite en noir et blanc", click_pop)

    def search():
        page.fill("#search", "pistol")
        expect(page.locator(".card").first).to_contain_text("Pistol", ignore_case=True)
        page.fill("#search", "zzzz-introuvable")
        expect(page.locator("#reset")).to_be_visible()
        page.click("#reset")
        expect(page.locator(".card")).to_have_count(12)
    check("recherche et réinitialisation", search)

    def filters():
        page.locator(".chip", has_text="Pistolets").click()
        expect(page.locator(".card .cat").first).to_have_text("Pistolets")
        page.locator(".chip", has_text="Tous").click()
    check("filtre par catégorie", filters)

    def modal():
        page.locator(".card .pic").first.click()
        expect(page.locator("#modal")).to_be_visible()
        page.click("#mPlus")
        expect(page.locator("#mQty")).to_have_text("2")
        page.screenshot(path=f"{SHOTS}/fiche-produit.png")
        page.click("#mAdd")
        expect(page.locator("#modal")).to_be_hidden()
        expect(page.locator("#cartCount")).to_have_text("2")
    check("fiche produit : quantité et ajout au panier", modal)

    def persist():
        page.reload()
        expect(page.locator("#cartCount")).to_have_text("2")
    check("panier conservé après rechargement", persist)

    def logged_out():
        page.locator("#commandes").scroll_into_view_if_needed()
        expect(page.locator("#ordersLogin")).to_be_visible()
        page.click("#cartBtn"); page.click("#checkout")
        expect(page.locator("#orderMsg")).to_contain_text("Connexion SSO requise")
        page.click("#closeCart")
    check("commande refusée sans connexion", logged_out)

    def orders():
        page.evaluate("t => sessionStorage.setItem('token', t)", TOKEN)
        page.reload()
        expect(page.locator("#login")).to_have_text("Déconnexion")
        page.click("#cartBtn"); page.click("#checkout")
        expect(page.locator("#orderMsg")).to_contain_text("enregistrée")
        expect(page.locator("#cartCount")).to_have_text("0")
        page.click("#closeCart")
        order = page.locator(".order").first
        expect(order.locator(".status")).to_have_text("En attente")
        order.locator("[data-a=confirm]").click()
        expect(order.locator(".status")).to_have_text("Confirmée")
        order.locator("[data-a=complete]").click()
        expect(order.locator(".status")).to_have_text("Livrée")
        expect(order.locator("[data-a=cancel]")).to_have_count(0)
        order.locator("[data-a=reorder]").click()
        expect(page.locator("#cartCount")).to_have_text("2")
        page.click("#closeCart")
        page.locator("#commandes").screenshot(path=f"{SHOTS}/mes-commandes.png")
    check("mes commandes : passer, confirmer, livrer, recommander", orders)

    def cancel():
        page.click("#cartBtn"); page.click("#checkout")
        expect(page.locator(".order")).to_have_count(2)
        page.click("#closeCart")
        page.locator(".order").first.locator("[data-a=cancel]").click()
        expect(page.locator(".order").first.locator(".status")).to_have_text("Annulée")
        page.locator("#orderFilters .chip", has_text="Annulée").click()
        expect(page.locator(".order")).to_have_count(1)
    check("mes commandes : annulation et filtre", cancel)

    def console_gw():
        assert page.locator("#log tr").count() > 0
        expect(page.locator("#log")).to_contain_text("/api/orders")
    check("console gateway : appels tracés", console_gw)

    page.screenshot(path=f"{SHOTS}/accueil.png")
    check("aucune erreur JavaScript", lambda: (_ for _ in ()).throw(AssertionError("; ".join(errors))) if errors else None)

    mobile = browser.new_context(viewport={"width": 375, "height": 812}, is_mobile=True, has_touch=True).new_page()
    mobile.goto(URL)

    def no_hscroll():
        expect(mobile.locator(".card")).to_have_count(12)
        w = mobile.evaluate("[document.documentElement.scrollWidth, innerWidth]")
        assert w[0] <= w[1], f"défilement horizontal ({w[0]} > {w[1]})"
        r = mobile.eval_on_selector("#cartBtn", "e => e.getBoundingClientRect().right")
        assert r <= 375, "bouton Panier coupé"
        mobile.screenshot(path=f"{SHOTS}/mobile.png", full_page=False)
    check("mobile : pas de défilement horizontal, en-tête entier", no_hscroll)
    browser.close()

print(f"\n{'OK' if not fails else str(fails) + ' échec(s)'} — captures dans {SHOTS}/")
sys.exit(1 if fails else 0)
