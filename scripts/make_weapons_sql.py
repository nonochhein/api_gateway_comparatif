"""Génère db/gta-weapons.sql à partir de db/weapons.json (liste et icônes d'armes de GTA V, source : wiki.rage.mp).
Usage : python3 scripts/make_weapons_sql.py   (depuis la racine du dépôt). Icônes servies par le front : /images/weapons/<id>.png.
Prix et descriptions : approximatifs, inspirés du jeu. Les SKU déjà en base (GTA-PISTOL, GTA-KNIFE...) sont conservés."""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent

# catégorie du JSON -> (slug, nom, description)
# Slugs inchangés (identifiants déjà en base) ; noms et descriptions en anglais, comme le site.
CATS = {
    "Melee": ("armes-de-melee", "Melee", "Knives, bats and more"),
    "Handguns": ("pistolets", "Handguns", "Sidearms"),
    "Submachine Guns": ("mitraillettes", "SMGs", "Submachine guns"),
    "Shotguns": ("fusils-pompe", "Shotguns", "Short range"),
    "Assault Rifles": ("fusils-assaut", "Assault Rifles", "Automatic rifles"),
    "Light Machine Guns": ("mitrailleuses", "Machine Guns", "Light machine guns"),
    "Sniper Rifles": ("precision", "Sniper Rifles", "Long range"),
    "Heavy Weapons": ("armes-lourdes", "Heavy Weapons", "Rocket launchers, miniguns and more"),
    "Throwables": ("armes-de-jet", "Throwables", "Grenades, explosives and projectiles"),
    "Miscellaneous": ("divers", "Misc", "Useful gear"),
}
EXTRA_CAT = ("armures-munitions", "Armor & Ammo", "Protection and refills")

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
    "weapon_dagger": (2000, 60, "Collector's blade, for old-school duels."),
    "weapon_bat": (150, 200, "A Los Santos classic."),
    "weapon_bottle": (50, 300, "The final argument of a party gone wrong."),
    "weapon_crowbar": (130, 150, "Opens doors, and sometimes debates."),
    "weapon_flashlight": (100, 200, "Lights up the alley before you settle it."),
    "weapon_golfclub": (250, 120, "A swing that never misses."),
    "weapon_hammer": (120, 150, "Construction tool, career change pending."),
    "weapon_hatchet": (750, 90, "Hunting hatchet, firm grip."),
    "weapon_knuckle": (7500, 40, "Brass knuckles, finish of your choice."),
    "weapon_knife": (100, 200, "A discreet blade for quiet business."),
    "weapon_machete": (900, 80, "Clears the jungle and the conversation."),
    "weapon_switchblade": (1900, 70, "Flicks open in the blink of an eye."),
    "weapon_nightstick": (160, 100, "Regulation baton."),
    "weapon_wrench": (1500, 80, "Pipe wrench for very persuasive plumbers."),
    "weapon_battleaxe": (9500, 30, "Battle axe, biker-club style."),
    "weapon_poolcue": (650, 100, "Pool cue, eight ball included."),
    "weapon_stone_hatchet": (2500, 40, "Stone hatchet, back to basics."),
    "weapon_candycane": (1000, 120, "Festive candy cane, use in moderation."),
    "weapon_stunrod": (3500, 40, "Electric baton. It stings."),
    "weapon_pistol": (500, 120, "Reliable, simple, perfect for beginners."),
    "weapon_pistol_mk2": (10500, 40, "The standard pistol, Mk II edition, fully customizable."),
    "weapon_combatpistol": (600, 100, "Extended mag, steady fire rate."),
    "weapon_appistol": (1500, 60, "Automatic pistol, fires in bursts."),
    "weapon_stungun": (1000, 80, "Stops without killing, reload between shots."),
    "weapon_pistol50": (2500, 40, "Heavy caliber, recoil fully owned."),
    "weapon_snspistol": (1500, 80, "Compact, easy to conceal."),
    "weapon_snspistol_mk2": (9500, 40, "The SNS, Mk II edition."),
    "weapon_heavypistol": (3750, 50, "Heavy pistol, sturdy and accurate."),
    "weapon_vintagepistol": (3450, 50, "Retro pistol with a period silencer."),
    "weapon_flaregun": (1750, 60, "Get noticed, up close or from afar."),
    "weapon_marksmanpistol": (4350, 30, "One shot, but what a shot."),
    "weapon_revolver": (3000, 30, "One shot, one impact."),
    "weapon_revolver_mk2": (9900, 25, "The heavy revolver, Mk II edition."),
    "weapon_doubleaction": (3500, 30, "Double-action revolver, western style."),
    "weapon_raypistol": (4900, 25, "Retro-futuristic ray pistol."),
    "weapon_ceramicpistol": (2000, 40, "Ceramic pistol, very discreet."),
    "weapon_navyrevolver": (5000, 20, "Navy revolver, a collector's item."),
    "weapon_gadgetpistol": (1950, 40, "Compact pistol straight from Cayo Perico."),
    "weapon_pistolxm3": (7500, 30, "WM 29 pistol, modern lines."),
    "weapon_microsmg": (700, 90, "Compact, ideal for drive-bys."),
    "weapon_smg": (1000, 80, "Versatile at short and medium range."),
    "weapon_smg_mk2": (8500, 35, "The SMG, Mk II edition, special ammo."),
    "weapon_assaultsmg": (2350, 50, "High fire rate, large magazine."),
    "weapon_combatpdw": (4500, 35, "Modular personal defense weapon."),
    "weapon_machinepistol": (6250, 40, "Compact machine pistol, tight bursts."),
    "weapon_minismg": (8900, 35, "Fits in the glove box."),
    "weapon_raycarbine": (44900, 10, "Ray carbine straight out of hell."),
    "weapon_tecpistol": (18000, 20, "Tactical SMG, light and snappy."),
    "weapon_pumpshotgun": (700, 70, "Devastating at close range."),
    "weapon_pumpshotgun_mk2": (12000, 25, "The pump shotgun, Mk II edition."),
    "weapon_sawnoffshotgun": (1100, 50, "Reduced size, maximum impact."),
    "weapon_assaultshotgun": (3500, 30, "Semi-automatic, big magazine."),
    "weapon_bullpupshotgun": (6000, 25, "Compact and easy to handle."),
    "weapon_heavyshotgun": (13550, 20, "Heavy magazine-fed shotgun."),
    "weapon_dbshotgun": (15450, 20, "Two barrels, two decisions."),
    "weapon_autoshotgun": (14900, 20, "Automatic drum, clears the room."),
    "weapon_combatshotgun": (29500, 15, "Modern combat shotgun."),
    "weapon_assaultrifle": (3500, 60, "The crew's weapon of choice."),
    "weapon_assaultrifle_mk2": (9800, 30, "The assault rifle, Mk II edition."),
    "weapon_carbinerifle": (5500, 50, "Accurate, light, modular."),
    "weapon_carbinerifle_mk2": (10700, 30, "The carbine, Mk II edition."),
    "weapon_advancedrifle": (9500, 25, "Precision and firepower."),
    "weapon_specialcarbine": (14000, 20, "Versatile rifle, extended magazine."),
    "weapon_specialcarbine_mk2": (13500, 20, "The special carbine, Mk II edition."),
    "weapon_bullpuprifle": (14500, 20, "Compact bullpup rifle."),
    "weapon_bullpuprifle_mk2": (15500, 20, "The bullpup rifle, Mk II edition."),
    "weapon_compactrifle": (14650, 20, "Short assault rifle, folding stock."),
    "weapon_militaryrifle": (39750, 10, "Military rifle, fearsome accuracy."),
    "weapon_heavyrifle": (41000, 10, "Special forces heavy rifle."),
    "weapon_tacticalrifle": (30000, 15, "Service-issue tactical rifle."),
    "weapon_mg": (13500, 15, "Light machine gun, suppressing fire."),
    "weapon_combatmg": (14800, 15, "Combat machine gun, big magazine."),
    "weapon_combatmg_mk2": (16500, 10, "The combat MG, Mk II edition."),
    "weapon_gusenberg": (14600, 15, "The Prohibition-era Tommy gun."),
    "weapon_sniperrifle": (10000, 25, "Extreme range, scope included."),
    "weapon_heavysniper": (22000, 10, "Heavy caliber, long range."),
    "weapon_heavysniper_mk2": (32000, 8, "The heavy sniper, Mk II edition."),
    "weapon_marksmanrifle": (9000, 20, "Accurate shooting at medium range."),
    "weapon_marksmanrifle_mk2": (15500, 15, "The marksman rifle, Mk II edition."),
    "weapon_precisionrifle": (17000, 12, "Bolt-action rifle, one shot at a time."),
    "weapon_musket": (21400, 10, "Period musket, old-fashioned reload."),
    "weapon_rpg": (26250, 10, "Rocket launcher, for final arguments."),
    "weapon_grenadelauncher": (32400, 8, "Revolving grenade launcher."),
    "weapon_minigun": (50000, 5, "Six barrels, zero subtlety."),
    "weapon_firework": (3000, 30, "Fireworks... in every direction."),
    "weapon_railgun": (250000, 3, "Experimental electromagnetic cannon."),
    "weapon_hominglauncher": (75000, 5, "Heat-seeking missiles."),
    "weapon_compactlauncher": (45000, 8, "Compact one-handed grenade launcher."),
    "weapon_rayminigun": (74900, 5, "Ray minigun, the Widowmaker."),
    "weapon_emplauncher": (25000, 10, "EMP launcher, cuts the power from afar."),
    "weapon_grenade": (250, 300, "The classic hand grenade."),
    "weapon_bzgas": (150, 200, "BZ gas grenade, for crowd dispersal."),
    "weapon_molotov": (400, 200, "Homemade incendiary cocktail."),
    "weapon_stickybomb": (600, 150, "Sticky bomb, remote detonation."),
    "weapon_proxmine": (1000, 100, "Proximity mines, place with care."),
    "weapon_snowball": (10, 500, "Snowballs, it's the season."),
    "weapon_pipebomb": (500, 150, "Homemade pipe bomb."),
    "weapon_ball": (100, 300, "Baseball, throw it hard."),
    "weapon_smokegrenade": (200, 200, "Tear gas."),
    "weapon_flare": (75, 300, "Signal flare."),
    "weapon_acidpackage": (350, 100, "Acid package... handle with care."),
    "weapon_petrolcan": (100, 200, "Jerry can, to fill up (or worse)."),
    "gadget_parachute": (500, 100, "For a damage-free landing."),
    "weapon_fireextinguisher": (200, 100, "To put out your mistakes."),
}

# Produits sans icône dans le JSON : gardent leur silhouette SVG.
EXTRA = [
    ("armures-munitions", "GTA-ARMOR", "Body Armor", "Lightweight bulletproof vest.", 1000, 150, "/images/armor.svg"),
    ("armures-munitions", "GTA-AMMO", "Ammo Pack", "Universal ammo x100.", 250, 500, "/images/ammo.svg"),
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
        "ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;",
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
