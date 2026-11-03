"""Génère db/gta-weapons.sql à partir de db/weapons.json (liste et icônes d'armes de GTA V, source : wiki.rage.mp).
Usage : python3 scripts/make_weapons_sql.py   (depuis la racine du dépôt). Icônes servies par le front : /images/weapons/<id>.png.
Prix et descriptions : approximatifs, inspirés du jeu. Les SKU déjà en base (GTA-PISTOL, GTA-KNIFE...) sont conservés."""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent

# catégorie du JSON -> (slug, nom, description)
CATS = {
    "Melee": ("armes-de-melee", "Armes de mêlée", "Couteaux, battes et autres"),
    "Handguns": ("pistolets", "Pistolets", "Armes de poing"),
    "Submachine Guns": ("mitraillettes", "Mitraillettes", "Pistolets-mitrailleurs"),
    "Shotguns": ("fusils-pompe", "Fusils à pompe", "Courte portée"),
    "Assault Rifles": ("fusils-assaut", "Fusils d'assaut", "Fusils automatiques"),
    "Light Machine Guns": ("mitrailleuses", "Mitrailleuses", "Mitrailleuses légères"),
    "Sniper Rifles": ("precision", "Fusils de précision", "Longue portée"),
    "Heavy Weapons": ("armes-lourdes", "Armes lourdes", "Lance-roquettes, miniguns et autres"),
    "Throwables": ("armes-de-jet", "Armes de jet", "Grenades, explosifs et projectiles"),
    "Miscellaneous": ("divers", "Divers", "Équipement utile"),
}
EXTRA_CAT = ("armures-munitions", "Armures et munitions", "Protection et recharges")

# Doublons d'icône ou d'arme dans le JSON, et le poing (rien à vendre).
SKIP = {"weapon_unarmed", "weapon_stungun_mp", "weapon_grenadelauncher_smoke", "weapon_railgunxm3",
        "weapon_hazardcan", "weapon_fertilizercan"}

# SKU historiques (déjà en base) : on les garde pour ne pas créer de doublons.
OLD_SKU = {
    "weapon_knife": "GTA-KNIFE", "weapon_bat": "GTA-BAT", "weapon_crowbar": "GTA-CROWBAR", "weapon_hammer": "GTA-HAMMER",
    "weapon_nightstick": "GTA-NIGHTSTICK", "weapon_pistol": "GTA-PISTOL", "weapon_combatpistol": "GTA-CPISTOL",
    "weapon_appistol": "GTA-APPISTOL", "weapon_snspistol": "GTA-SNSPISTOL", "weapon_pistol50": "GTA-PISTOL50",
    "weapon_revolver": "GTA-HREVOLVER", "weapon_microsmg": "GTA-MICROSMG", "weapon_smg": "GTA-SMG",
    "weapon_assaultsmg": "GTA-ASMG", "weapon_combatpdw": "GTA-CPDW", "weapon_assaultrifle": "GTA-ARIFLE",
    "weapon_carbinerifle": "GTA-CARBINE", "weapon_advancedrifle": "GTA-ADVRIFLE", "weapon_specialcarbine": "GTA-SPCARBINE",
    "weapon_pumpshotgun": "GTA-PUMP", "weapon_sawnoffshotgun": "GTA-SAWNOFF", "weapon_assaultshotgun": "GTA-ASHOTGUN",
    "weapon_bullpupshotgun": "GTA-BULLPUP", "weapon_marksmanrifle": "GTA-MARKSMAN", "weapon_sniperrifle": "GTA-SNIPER",
    "weapon_heavysniper": "GTA-HSNIPER",
}

# id -> (prix GTA$, stock initial, description)
INFO = {
    "weapon_dagger": (2000, 60, "Lame de collection, pour les duels à l'ancienne."),
    "weapon_bat": (150, 200, "Le classique de Los Santos."),
    "weapon_bottle": (50, 300, "Le dernier argument d'une soirée qui tourne mal."),
    "weapon_crowbar": (130, 150, "Ouvre les portes, et parfois les débats."),
    "weapon_flashlight": (100, 200, "Éclaire la ruelle avant de la régler."),
    "weapon_golfclub": (250, 120, "Pour un swing qui ne rate jamais sa cible."),
    "weapon_hammer": (120, 150, "Outil de chantier reconverti."),
    "weapon_hatchet": (750, 90, "Hachette de chasse, prise ferme."),
    "weapon_knuckle": (7500, 40, "Poing américain, finitions au choix."),
    "weapon_knife": (100, 200, "Lame discrète pour les affaires silencieuses."),
    "weapon_machete": (900, 80, "Défriche la jungle comme les débats."),
    "weapon_switchblade": (1900, 70, "Se déplie en un clin d'œil."),
    "weapon_nightstick": (160, 100, "Matraque réglementaire."),
    "weapon_wrench": (1500, 80, "Clé à molette pour plombiers très persuasifs."),
    "weapon_battleaxe": (9500, 30, "Hache de guerre, façon club de motards."),
    "weapon_poolcue": (650, 100, "Queue de billard, la bille noire en prime."),
    "weapon_stone_hatchet": (2500, 40, "Hachette en pierre, retour aux sources."),
    "weapon_candycane": (1000, 120, "Sucre d'orge festif, à manier avec modération."),
    "weapon_stunrod": (3500, 40, "Matraque électrique, ça pique."),
    "weapon_pistol": (500, 120, "Fiable, simple, parfait pour débuter."),
    "weapon_pistol_mk2": (10500, 40, "Le pistolet de base en version Mk II, personnalisable."),
    "weapon_combatpistol": (600, 100, "Chargeur étendu, cadence soutenue."),
    "weapon_appistol": (1500, 60, "Pistolet automatique, tir en rafales."),
    "weapon_stungun": (1000, 80, "Neutralise sans tuer, à recharger entre deux tirs."),
    "weapon_pistol50": (2500, 40, "Calibre lourd, recul assumé."),
    "weapon_snspistol": (1500, 80, "Compact, facile à dissimuler."),
    "weapon_snspistol_mk2": (9500, 40, "Le SNS en version Mk II."),
    "weapon_heavypistol": (3750, 50, "Pistolet lourd, robuste et précis."),
    "weapon_vintagepistol": (3450, 50, "Pistolet rétro, silencieux d'époque."),
    "weapon_flaregun": (1750, 60, "Pour se faire remarquer, de près comme de loin."),
    "weapon_marksmanpistol": (4350, 30, "Un seul coup, mais quel coup."),
    "weapon_revolver": (3000, 30, "Un coup, un impact."),
    "weapon_revolver_mk2": (9900, 25, "Le revolver lourd en version Mk II."),
    "weapon_doubleaction": (3500, 30, "Revolver double action, style western."),
    "weapon_raypistol": (4900, 25, "Pistolet à rayons rétro-futuriste."),
    "weapon_ceramicpistol": (2000, 40, "Pistolet en céramique, très discret."),
    "weapon_navyrevolver": (5000, 20, "Revolver de marine, pièce de collection."),
    "weapon_gadgetpistol": (1950, 40, "Pistolet compact venu de Cayo Perico."),
    "weapon_pistolxm3": (7500, 30, "Pistolet WM 29, ligne moderne."),
    "weapon_microsmg": (700, 90, "Compacte, idéale en voiture."),
    "weapon_smg": (1000, 80, "Polyvalente à courte et moyenne distance."),
    "weapon_smg_mk2": (8500, 35, "La SMG en version Mk II, munitions spéciales."),
    "weapon_assaultsmg": (2350, 50, "Cadence élevée, chargeur large."),
    "weapon_combatpdw": (4500, 35, "Arme de défense personnelle modulable."),
    "weapon_machinepistol": (6250, 40, "Pistolet-mitrailleur compact, rafales serrées."),
    "weapon_minismg": (8900, 35, "Tient dans la boîte à gants."),
    "weapon_raycarbine": (44900, 10, "Carabine à rayons tout droit sortie de l'enfer."),
    "weapon_tecpistol": (18000, 20, "SMG tactique, légère et nerveuse."),
    "weapon_pumpshotgun": (700, 70, "Dévastateur à courte portée."),
    "weapon_pumpshotgun_mk2": (12000, 25, "Le fusil à pompe en version Mk II."),
    "weapon_sawnoffshotgun": (1100, 50, "Format réduit, impact maximal."),
    "weapon_assaultshotgun": (3500, 30, "Semi-automatique, gros chargeur."),
    "weapon_bullpupshotgun": (6000, 25, "Compact et maniable."),
    "weapon_heavyshotgun": (13550, 20, "Fusil à pompe lourd à chargeur."),
    "weapon_dbshotgun": (15450, 20, "Deux canons, deux décisions."),
    "weapon_autoshotgun": (14900, 20, "Tambour automatique, nettoie la pièce."),
    "weapon_combatshotgun": (29500, 15, "Fusil à pompe de combat moderne."),
    "weapon_assaultrifle": (3500, 60, "L'arme de référence des équipes."),
    "weapon_assaultrifle_mk2": (9800, 30, "Le fusil d'assaut en version Mk II."),
    "weapon_carbinerifle": (5500, 50, "Précise, légère, modulable."),
    "weapon_carbinerifle_mk2": (10700, 30, "La carabine en version Mk II."),
    "weapon_advancedrifle": (9500, 25, "Précision et puissance de feu."),
    "weapon_specialcarbine": (14000, 20, "Fusil polyvalent, chargeur étendu."),
    "weapon_specialcarbine_mk2": (13500, 20, "La carabine spéciale en version Mk II."),
    "weapon_bullpuprifle": (14500, 20, "Fusil bullpup compact."),
    "weapon_bullpuprifle_mk2": (15500, 20, "Le fusil bullpup en version Mk II."),
    "weapon_compactrifle": (14650, 20, "Fusil d'assaut raccourci, crosse pliante."),
    "weapon_militaryrifle": (39750, 10, "Fusil militaire, précision redoutable."),
    "weapon_heavyrifle": (41000, 10, "Fusil lourd des forces spéciales."),
    "weapon_tacticalrifle": (30000, 15, "Fusil tactique de service."),
    "weapon_mg": (13500, 15, "Mitrailleuse légère, tir de suppression."),
    "weapon_combatmg": (14800, 15, "Mitrailleuse de combat, gros chargeur."),
    "weapon_combatmg_mk2": (16500, 10, "La mitrailleuse de combat en version Mk II."),
    "weapon_gusenberg": (14600, 15, "La sulfateuse de la prohibition."),
    "weapon_sniperrifle": (10000, 25, "Portée extrême, lunette incluse."),
    "weapon_heavysniper": (22000, 10, "Calibre lourd, longue portée."),
    "weapon_heavysniper_mk2": (32000, 8, "Le sniper lourd en version Mk II."),
    "weapon_marksmanrifle": (9000, 20, "Tir précis à moyenne distance."),
    "weapon_marksmanrifle_mk2": (15500, 15, "Le fusil de tireur d'élite en version Mk II."),
    "weapon_precisionrifle": (17000, 12, "Fusil à verrou, un tir à la fois."),
    "weapon_musket": (21400, 10, "Mousquet d'époque, rechargement à l'ancienne."),
    "weapon_rpg": (26250, 10, "Lance-roquettes, pour les arguments définitifs."),
    "weapon_grenadelauncher": (32400, 8, "Lance-grenades à barillet."),
    "weapon_minigun": (50000, 5, "Six canons, zéro discrétion."),
    "weapon_firework": (3000, 30, "Feu d'artifice... dans tous les sens."),
    "weapon_railgun": (250000, 3, "Canon électromagnétique expérimental."),
    "weapon_hominglauncher": (75000, 5, "Missiles à tête chercheuse."),
    "weapon_compactlauncher": (45000, 8, "Lance-grenades compact, à une main."),
    "weapon_rayminigun": (74900, 5, "Minigun à rayons, la veuve noire."),
    "weapon_emplauncher": (25000, 10, "Lanceur IEM, coupe le courant à distance."),
    "weapon_grenade": (250, 300, "La grenade à main classique."),
    "weapon_bzgas": (150, 200, "Grenade au gaz BZ, pour disperser la foule."),
    "weapon_molotov": (400, 200, "Cocktail incendiaire artisanal."),
    "weapon_stickybomb": (600, 150, "Bombe collante, déclenchement à distance."),
    "weapon_proxmine": (1000, 100, "Mines de proximité, à poser avec soin."),
    "weapon_snowball": (10, 500, "Boules de neige, saison oblige."),
    "weapon_pipebomb": (500, 150, "Bombe artisanale en tube."),
    "weapon_ball": (100, 300, "Balle de baseball, à lancer fort."),
    "weapon_smokegrenade": (200, 200, "Gaz lacrymogène."),
    "weapon_flare": (75, 300, "Fusée éclairante."),
    "weapon_acidpackage": (350, 100, "Colis d'acide... à manipuler avec soin."),
    "weapon_petrolcan": (100, 200, "Jerrican d'essence, pour faire le plein (ou pire)."),
    "gadget_parachute": (500, 100, "Pour atterrir sans casse."),
    "weapon_fireextinguisher": (200, 100, "Pour éteindre vos erreurs."),
}

# Produits sans icône dans le JSON : gardent leur silhouette SVG.
EXTRA = [
    ("armures-munitions", "GTA-ARMOR", "Body Armor", "Gilet pare-balles léger.", 1000, 150, "/images/armor.svg"),
    ("armures-munitions", "GTA-AMMO", "Ammo Pack", "Munitions universelles x100.", 250, 500, "/images/ammo.svg"),
]


def q(s):
    return "'" + str(s).replace("'", "''") + "'"


def main():
    weapons = json.loads((ROOT / "db/weapons.json").read_text(encoding="utf-8"))
    rows, used_cats = [], []
    for w in weapons:
        if w["id"] in SKIP:
            continue
        slug = CATS[w["category"]][0]
        if slug not in used_cats:
            used_cats.append(slug)
        price, stock, desc = INFO[w["id"]]
        sku = OLD_SKU.get(w["id"]) or "GTA-" + w["id"].split("_", 1)[1].upper().replace("_", "-")
        img = "/images/weapons/" + w["file"].split("/")[-1]
        rows.append((slug, sku, w["name"], desc, price, stock, img))
    rows += EXTRA
    skus = [r[1] for r in rows]
    assert len(skus) == len(set(skus)), "SKU en double"

    cats = [c for c in CATS.values() if c[0] in used_cats] + [EXTRA_CAT]
    out = [
        "-- GÉNÉRÉ par scripts/make_weapons_sql.py à partir de db/weapons.json : ne pas modifier à la main.",
        "-- Armes du jeu GTA V (parodie) pour le catalogue Ammu-Nation. Idempotent : peut être rejoué sans risque.",
        "-- Ne supprime rien : les 4 produits de démonstration d'origine (AMMU-001..004) sont seulement désactivés.",
        "-- Prix inspirés du jeu, approximatifs. image_url pointe vers les icônes servies par le front (/images/weapons/*.png).",
        "-- Application : docker compose exec -T catalog-db psql -U catalog -d catalog < db/gta-weapons.sql   (dans le dossier du backend)",
        "BEGIN;",
        "",
        "INSERT INTO categories (name, slug, description) VALUES",
        ",\n".join(f"    ({q(n)}, {q(s)}, {q(d)})" for s, n, d in cats),
        "ON CONFLICT (slug) DO NOTHING;",
        "",
        "UPDATE products SET active = FALSE, updated_at = NOW()",
        " WHERE sku IN ('AMMU-001', 'AMMU-002', 'AMMU-003', 'AMMU-004');",
        "",
        "INSERT INTO products (category_id, sku, name, description, price, stock_quantity, image_url, active)",
        "SELECT c.id, v.sku, v.name, v.descr, v.price, v.stock, v.img, TRUE",
        "FROM (VALUES",
        ",\n".join(f"    ({q(c)}, {q(s)}, {q(n)}, {q(d)}, {p:.2f}, {st}, {q(i)})" for c, s, n, d, p, st, i in rows),
        ") AS v(cat, sku, name, descr, price, stock, img)",
        "JOIN categories c ON c.slug = v.cat",
        "ON CONFLICT (sku) DO UPDATE SET category_id = EXCLUDED.category_id, name = EXCLUDED.name,",
        "    description = EXCLUDED.description, price = EXCLUDED.price, image_url = EXCLUDED.image_url,",
        "    active = TRUE, updated_at = NOW();   -- le stock existant est conservé",
        "",
        "COMMIT;",
        "",
    ]
    (ROOT / "db/gta-weapons.sql").write_text("\n".join(out), encoding="utf-8")
    print(f"db/gta-weapons.sql : {len(cats)} catégories, {len(rows)} produits")


if __name__ == "__main__":
    main()
