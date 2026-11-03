-- Armes du jeu GTA V (parodie) pour le catalogue Ammu-Nation. Idempotent : peut être rejoué sans risque.
-- Ne supprime rien : les 4 produits de démonstration d'origine (AMMU-001..004) sont seulement désactivés.
-- Prix inspirés du jeu, approximatifs. image_url pointe vers les silhouettes servies par le front (/images/*.svg).
-- Application : docker compose exec -T catalog-db psql -U catalog -d catalog < db/gta-weapons.sql   (dans le dossier du backend)
BEGIN;

INSERT INTO categories (name, slug, description) VALUES
    ('Pistolets', 'pistolets', 'Armes de poing'),
    ('Mitraillettes', 'mitraillettes', 'Pistolets-mitrailleurs'),
    ('Fusils d''assaut', 'fusils-assaut', 'Fusils automatiques'),
    ('Fusils à pompe', 'fusils-pompe', 'Courte portée'),
    ('Fusils de précision', 'precision', 'Longue portée'),
    ('Armes de mêlée', 'armes-de-melee', 'Couteaux, battes et autres'),
    ('Armures et munitions', 'armures-munitions', 'Protection et recharges')
ON CONFLICT (slug) DO NOTHING;

UPDATE products SET active = FALSE, updated_at = NOW()
 WHERE sku IN ('AMMU-001', 'AMMU-002', 'AMMU-003', 'AMMU-004');

INSERT INTO products (category_id, sku, name, description, price, stock_quantity, image_url, active)
SELECT c.id, v.sku, v.name, v.descr, v.price, v.stock, v.img, TRUE
FROM (VALUES
    ('armes-de-melee', 'GTA-KNIFE', 'Knife', 'Lame discrète pour les affaires silencieuses.', 100.00, 200, '/images/knife.svg'),
    ('armes-de-melee', 'GTA-BAT', 'Baseball Bat', 'Le classique de Los Santos.', 150.00, 200, '/images/bat.svg'),
    ('armes-de-melee', 'GTA-CROWBAR', 'Crowbar', 'Ouvre les portes, et parfois les débats.', 130.00, 150, '/images/bat.svg'),
    ('armes-de-melee', 'GTA-HAMMER', 'Hammer', 'Outil de chantier reconverti.', 120.00, 150, '/images/bat.svg'),
    ('armes-de-melee', 'GTA-NIGHTSTICK', 'Nightstick', 'Matraque réglementaire.', 160.00, 100, '/images/bat.svg'),
    ('pistolets', 'GTA-PISTOL', 'Pistol', 'Fiable, simple, parfait pour débuter.', 500.00, 120, '/images/pistol.svg'),
    ('pistolets', 'GTA-CPISTOL', 'Combat Pistol', 'Chargeur étendu, cadence soutenue.', 600.00, 100, '/images/pistol.svg'),
    ('pistolets', 'GTA-APPISTOL', 'AP Pistol', 'Pistolet automatique, tir en rafales.', 1500.00, 60, '/images/pistol.svg'),
    ('pistolets', 'GTA-SNSPISTOL', 'SNS Pistol', 'Compact, facile à dissimuler.', 1500.00, 80, '/images/pistol.svg'),
    ('pistolets', 'GTA-PISTOL50', 'Pistol .50', 'Calibre lourd, recul assumé.', 2500.00, 40, '/images/pistol.svg'),
    ('pistolets', 'GTA-HREVOLVER', 'Heavy Revolver', 'Un coup, un impact.', 3000.00, 30, '/images/pistol.svg'),
    ('mitraillettes', 'GTA-MICROSMG', 'Micro SMG', 'Compacte, idéale en voiture.', 700.00, 90, '/images/smg.svg'),
    ('mitraillettes', 'GTA-SMG', 'SMG', 'Polyvalente à courte et moyenne distance.', 1000.00, 80, '/images/smg.svg'),
    ('mitraillettes', 'GTA-ASMG', 'Assault SMG', 'Cadence élevée, chargeur large.', 2350.00, 50, '/images/smg.svg'),
    ('mitraillettes', 'GTA-CPDW', 'Combat PDW', 'Arme de défense personnelle modulable.', 4500.00, 35, '/images/smg.svg'),
    ('fusils-assaut', 'GTA-ARIFLE', 'Assault Rifle', 'L''arme de référence des équipes.', 3500.00, 60, '/images/rifle.svg'),
    ('fusils-assaut', 'GTA-CARBINE', 'Carbine Rifle', 'Précise, légère, modulable.', 5500.00, 50, '/images/rifle.svg'),
    ('fusils-assaut', 'GTA-ADVRIFLE', 'Advanced Rifle', 'Précision et puissance de feu.', 9500.00, 25, '/images/rifle.svg'),
    ('fusils-assaut', 'GTA-SPCARBINE', 'Special Carbine', 'Fusil polyvalent, chargeur étendu.', 14000.00, 20, '/images/rifle.svg'),
    ('fusils-pompe', 'GTA-PUMP', 'Pump Shotgun', 'Dévastateur à courte portée.', 700.00, 70, '/images/shotgun.svg'),
    ('fusils-pompe', 'GTA-SAWNOFF', 'Sawed-Off Shotgun', 'Format réduit, impact maximal.', 1100.00, 50, '/images/shotgun.svg'),
    ('fusils-pompe', 'GTA-ASHOTGUN', 'Assault Shotgun', 'Semi-automatique, gros chargeur.', 3500.00, 30, '/images/shotgun.svg'),
    ('fusils-pompe', 'GTA-BULLPUP', 'Bullpup Shotgun', 'Compact et maniable.', 6000.00, 25, '/images/shotgun.svg'),
    ('precision', 'GTA-MARKSMAN', 'Marksman Rifle', 'Tir précis à moyenne distance.', 9000.00, 20, '/images/sniper.svg'),
    ('precision', 'GTA-SNIPER', 'Sniper Rifle', 'Portée extrême, lunette incluse.', 10000.00, 25, '/images/sniper.svg'),
    ('precision', 'GTA-HSNIPER', 'Heavy Sniper', 'Calibre lourd, longue portée.', 22000.00, 10, '/images/sniper.svg'),
    ('armures-munitions', 'GTA-ARMOR', 'Body Armor', 'Gilet pare-balles léger.', 1000.00, 150, '/images/armor.svg'),
    ('armures-munitions', 'GTA-AMMO', 'Ammo Pack', 'Munitions universelles x100.', 250.00, 500, '/images/ammo.svg')
) AS v(cat, sku, name, descr, price, stock, img)
JOIN categories c ON c.slug = v.cat
ON CONFLICT (sku) DO UPDATE SET category_id = EXCLUDED.category_id, name = EXCLUDED.name,
    description = EXCLUDED.description, price = EXCLUDED.price, image_url = EXCLUDED.image_url,
    active = TRUE, updated_at = NOW();   -- le stock existant est conservé

COMMIT;
