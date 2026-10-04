-- Base d'exemple « boutique » : Maison Arvor, une boutique en ligne française, trois ans
-- d'activité jusqu'au jour où la base est créée — les dates sont relatives, la démo reste fraîche.
--
-- Les données racontent des histoires que la démo met en scène :
--   · une croissance d'environ 35 % par an, la saisonnalité (Noël, août creux), les soldes,
--     le Black Friday et son Cyber Monday ;
--   · le lancement de l'application mobile, dont la part monte en quelques mois ;
--   · une campagne TV qui fait bondir les inscriptions en accès direct ;
--   · l'ouverture de l'entrepôt de Rennes : l'Ouest est livré deux fois plus vite et s'envole ;
--   · les écouteurs Kerys Air 2 : un succès, un défaut de batterie, des avis qui s'effondrent,
--     des remboursements, le rappel ;
--   · une grève chez le transporteur : retards, annulations, mauvaises notes (et tickets côté
--     MongoDB, base « support ») ;
--   · des dépenses marketing et des objectifs mensuels pour le coût d'acquisition et le pilotage.
SELECT setseed(0.42);

-- ── Les repères de l'histoire ────────────────────────────────────────────────
CREATE TEMP TABLE p AS
SELECT current_date - 1095 AS debut, 1095 AS duree, 16000 AS nb_clients, ln(1.35) / 365 AS k,
  current_date - 560 AS appli,
  current_date - 520 AS tv, current_date - 499 AS tv_fin,
  current_date - 380 AS rennes,
  current_date - 230 AS kerys, current_date - 170 AS defaut, current_date - 128 AS rappel,
  current_date - 68 AS greve, current_date - 48 AS greve_fin,
  current_date - 35 AS bug, current_date - 31 AS bug_fin;

-- ── Schéma ───────────────────────────────────────────────────────────────────
CREATE TABLE categories (
  id serial PRIMARY KEY,
  nom text NOT NULL,
  rayon text NOT NULL
);
COMMENT ON TABLE categories IS 'Catégories du catalogue, regroupées en rayons';

CREATE TABLE produits (
  id serial PRIMARY KEY,
  categorie_id int NOT NULL REFERENCES categories(id),
  nom text NOT NULL,
  marque text NOT NULL,
  prix numeric(10,2) NOT NULL,
  cout numeric(10,2) NOT NULL,
  note_moyenne numeric(3,2),
  actif boolean NOT NULL DEFAULT true,
  image_url text,
  cree_le timestamptz NOT NULL
);
COMMENT ON TABLE produits IS 'Produits vendus en ligne';
COMMENT ON COLUMN produits.prix IS 'Prix de vente public TTC';
COMMENT ON COLUMN produits.cout IS 'Coût d''achat unitaire HT';
COMMENT ON COLUMN produits.actif IS 'Faux pour un produit retiré de la vente';
COMMENT ON COLUMN produits.cree_le IS 'Mise en vente';

CREATE TABLE clients (
  id serial PRIMARY KEY,
  prenom text NOT NULL,
  nom text NOT NULL,
  email text NOT NULL UNIQUE,
  ville text NOT NULL,
  region text NOT NULL,
  pays text NOT NULL DEFAULT 'France',
  latitude double precision,
  longitude double precision,
  segment text NOT NULL,
  canal_acquisition text NOT NULL,
  date_naissance date,
  inscrit_le timestamptz NOT NULL
);
COMMENT ON TABLE clients IS 'Clients inscrits sur la boutique';
COMMENT ON COLUMN clients.segment IS 'Particulier, Premium (les 10 % qui dépensent le plus) ou Professionnel';
COMMENT ON COLUMN clients.canal_acquisition IS 'Le canal par lequel la personne est arrivée';

CREATE TABLE entrepots (
  id serial PRIMARY KEY,
  nom text NOT NULL,
  ville text NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  ouvert_le date NOT NULL
);
COMMENT ON TABLE entrepots IS 'Entrepôts d''où partent les colis';

CREATE TABLE commandes (
  id serial PRIMARY KEY,
  client_id int NOT NULL REFERENCES clients(id),
  statut text NOT NULL,
  canal text NOT NULL,
  montant_total numeric(12,2) NOT NULL DEFAULT 0,
  remise numeric(12,2) NOT NULL DEFAULT 0,
  code_promo text,
  frais_port numeric(8,2) NOT NULL DEFAULT 0,
  mode_livraison text NOT NULL,
  entrepot text NOT NULL,
  passee_le timestamptz NOT NULL,
  livree_le timestamptz
);
COMMENT ON TABLE commandes IS 'Commandes passées par les clients';
COMMENT ON COLUMN commandes.montant_total IS 'Montant TTC des articles, hors frais de port, avant remise';
COMMENT ON COLUMN commandes.remise IS 'Remise accordée par un code promo';
COMMENT ON COLUMN commandes.canal IS 'Site web, application mobile ou marketplace';

CREATE TABLE lignes_commande (
  id serial PRIMARY KEY,
  commande_id int NOT NULL REFERENCES commandes(id),
  produit_id int NOT NULL REFERENCES produits(id),
  quantite int NOT NULL,
  prix_unitaire numeric(10,2) NOT NULL,
  cout_unitaire numeric(10,2) NOT NULL
);
COMMENT ON TABLE lignes_commande IS 'Articles de chaque commande';
COMMENT ON COLUMN lignes_commande.prix_unitaire IS 'Prix payé, soldes comprises';

CREATE TABLE avis (
  id serial PRIMARY KEY,
  produit_id int NOT NULL REFERENCES produits(id),
  client_id int NOT NULL REFERENCES clients(id),
  note int NOT NULL CHECK (note BETWEEN 1 AND 5),
  commentaire text,
  publie_le timestamptz NOT NULL
);
COMMENT ON TABLE avis IS 'Avis laissés après livraison';

CREATE TABLE evenements (
  id serial PRIMARY KEY,
  nom text NOT NULL,
  categorie text NOT NULL,
  debut date NOT NULL,
  fin date NOT NULL,
  description text
);
COMMENT ON TABLE evenements IS 'Le calendrier de la boutique : temps forts commerciaux et incidents';

CREATE TABLE objectifs (
  mois date PRIMARY KEY,
  objectif_ca numeric(12,2) NOT NULL,
  objectif_commandes int NOT NULL
);
COMMENT ON TABLE objectifs IS 'Objectifs mensuels fixés par la direction';
COMMENT ON COLUMN objectifs.objectif_ca IS 'Chiffre d''affaires net visé (TTC, remises déduites)';

CREATE TABLE depenses_marketing (
  id serial PRIMARY KEY,
  mois date NOT NULL,
  canal text NOT NULL,
  montant numeric(12,2) NOT NULL,
  impressions int,
  clics int
);
COMMENT ON TABLE depenses_marketing IS 'Dépenses d''acquisition par mois et par canal';

-- ── Le calendrier ────────────────────────────────────────────────────────────
INSERT INTO evenements (nom, categorie, debut, fin, description)
SELECT e.* FROM (
  SELECT 'Black Friday ' || y, 'Temps fort', bf, bf + 3, 'Du vendredi au Cyber Monday : le pic de l''année.'
  FROM generate_series(2000, 2100) y,
    LATERAL (SELECT make_date(y, 11, 1) + ((4 - extract(isodow FROM make_date(y, 11, 1))::int + 7) % 7) + 22 AS bf) s
  UNION ALL
  SELECT 'Soldes d''hiver ' || y, 'Temps fort', d, d + 27, 'Quatre semaines de démarque.'
  FROM generate_series(2000, 2100) y,
    LATERAL (SELECT make_date(y, 1, 1) + ((3 - extract(isodow FROM make_date(y, 1, 1))::int + 7) % 7) + 7 AS d) s
  UNION ALL
  SELECT 'Soldes d''été ' || y, 'Temps fort', d, d + 27, 'Quatre semaines de démarque.'
  FROM generate_series(2000, 2100) y,
    LATERAL (SELECT make_date(y, 6, 30) - ((extract(isodow FROM make_date(y, 6, 30))::int - 3 + 7) % 7) AS d) s
  UNION ALL
  SELECT 'Lancement de l''application mobile', 'Produit', appli, appli, 'L''application iOS et Android arrive dans les stores.' FROM p
  UNION ALL
  SELECT 'Campagne TV nationale', 'Marketing', tv, tv_fin, 'Trois semaines de spots en prime time.' FROM p
  UNION ALL
  SELECT 'Ouverture de l''entrepôt de Rennes', 'Logistique', rennes, rennes, 'L''Ouest est désormais livré depuis Rennes.' FROM p
  UNION ALL
  SELECT 'Lancement des Kerys Air 2', 'Produit', kerys, kerys, 'Les nouveaux écouteurs sans fil de Kerys.' FROM p
  UNION ALL
  SELECT 'Défaut de batterie des Kerys Air 2', 'Incident', defaut, rappel, 'Un lot défectueux : autonomie divisée par quatre, retours en masse.' FROM p
  UNION ALL
  SELECT 'Rappel des Kerys Air 2', 'Incident', rappel, rappel, 'Le produit est retiré de la vente.' FROM p
  UNION ALL
  SELECT 'Grève chez le transporteur', 'Incident', greve, greve_fin, 'Trois semaines de retards sur les livraisons à domicile et en point relais.' FROM p
  UNION ALL
  SELECT 'Bug de paiement sur l''application', 'Incident', bug, bug_fin, 'Le paiement échoue sur l''application mobile pendant cinq jours.' FROM p
) e(nom, categorie, debut, fin, description), p
WHERE e.fin >= p.debut AND e.debut <= current_date
ORDER BY e.debut;

-- ── Le catalogue ─────────────────────────────────────────────────────────────
INSERT INTO categories (nom, rayon) VALUES
 ('Smartphones','High-tech'),('Ordinateurs','High-tech'),('Audio','High-tech'),('Photo','High-tech'),
 ('Cuisine','Maison'),('Décoration','Maison'),('Jardin','Maison'),('Literie','Maison'),
 ('Running','Sport'),('Vélo','Sport'),('Fitness','Sport'),('Randonnée','Sport'),
 ('Romans','Culture'),('BD','Culture'),('Jeux de société','Culture'),('Musique','Culture');

-- Saisonnalité de chaque catégorie, mois par mois.
CREATE TEMP TABLE saisons (categorie text, coef float8[]);
INSERT INTO saisons VALUES
 ('Smartphones','{0.9,0.8,0.85,0.9,0.9,0.9,0.9,0.85,1.1,1.0,1.6,1.7}'),
 ('Audio','{0.9,0.8,0.85,0.9,0.9,0.95,0.95,0.9,1.0,1.0,1.6,1.9}'),
 ('Photo','{0.8,0.8,0.9,1.0,1.1,1.2,1.2,1.0,0.9,0.9,1.4,1.6}'),
 ('Ordinateurs','{0.9,0.8,0.8,0.8,0.8,0.9,1.1,1.6,1.7,1.0,1.4,1.3}'),
 ('Cuisine','{1.0,0.9,0.9,0.9,1.0,0.9,0.85,0.8,1.0,1.0,1.3,1.7}'),
 ('Décoration','{0.8,0.75,0.85,0.9,0.9,0.85,0.8,0.8,1.0,1.1,1.5,2.3}'),
 ('Jardin','{0.4,0.6,1.2,1.9,2.2,1.9,1.4,0.9,0.7,0.5,0.4,0.5}'),
 ('Literie','{1.2,1.0,0.9,0.9,0.9,0.9,0.85,0.9,1.1,1.1,1.3,1.4}'),
 ('Running','{1.5,1.2,1.3,1.3,1.2,1.0,0.8,0.8,1.2,1.0,0.9,0.9}'),
 ('Vélo','{0.5,0.6,1.1,1.7,2.0,1.9,1.6,1.1,0.9,0.6,0.6,0.7}'),
 ('Fitness','{2.0,1.4,1.1,0.9,0.8,0.7,0.6,0.6,1.0,1.0,1.1,1.0}'),
 ('Randonnée','{0.5,0.6,0.9,1.3,1.6,1.8,1.9,1.4,1.0,0.8,0.6,0.7}'),
 ('Romans','{0.9,0.8,0.9,0.9,0.9,1.0,1.4,1.3,0.9,0.9,1.2,1.8}'),
 ('BD','{1.1,0.8,0.8,0.8,0.8,0.8,0.9,0.9,0.9,1.0,1.4,2.4}'),
 ('Jeux de société','{0.8,0.7,0.7,0.7,0.7,0.7,0.9,0.9,0.8,1.0,1.6,2.8}'),
 ('Musique','{0.9,0.8,0.8,0.8,0.8,0.9,0.9,0.9,1.0,1.0,1.4,2.0}');

-- popularité relative, qualité (la note autour de laquelle tournent les avis), mise en vente
-- (jours avant aujourd'hui ; NULL : avant les trois ans d'historique).
CREATE TEMP TABLE catalogue (categorie text, nom text, marque text, prix numeric, pop float8, qualite float8, lancement int);
INSERT INTO catalogue VALUES
 ('Smartphones','Smartphone Lumen S24','Lumen',649,1.4,4.4,NULL),
 ('Smartphones','Smartphone Lumen S24 Ultra','Lumen',1099,1.0,4.6,340),
 ('Smartphones','Smartphone Novéa 12','Novéa',399,1.6,4.1,NULL),
 ('Smartphones','Smartphone Novéa 12 Lite','Novéa',249,1.5,3.8,NULL),
 ('Smartphones','Coque renforcée Novéa 12','Brise',19.90,3.2,4.0,NULL),
 ('Smartphones','Chargeur rapide 65 W','Kerys',34.90,2.8,4.3,NULL),
 ('Ordinateurs','Ordinateur portable Altitude 14','Altitude',1199,0.9,4.3,NULL),
 ('Ordinateurs','Ultrabook Lumen Air 13','Lumen',1449,0.7,4.7,NULL),
 ('Ordinateurs','Chromebook Novéa 11','Novéa',329,1.0,3.9,NULL),
 ('Ordinateurs','Écran 27" QHD Opaline','Opaline',279,1.1,4.4,NULL),
 ('Ordinateurs','Clavier mécanique Sillage','Sillage',89,1.4,4.5,NULL),
 ('Ordinateurs','Souris ergonomique Brise','Brise',49.90,2.0,4.2,NULL),
 ('Audio','Écouteurs Kerys Air 2','Kerys',129,4.5,4.5,230),
 ('Audio','Écouteurs Kerys Air','Kerys',89,2.2,4.2,NULL),
 ('Audio','Casque Kerys Studio ANC','Kerys',249,1.3,4.6,NULL),
 ('Audio','Enceinte Bluetooth Sillage Go','Sillage',79,2.0,4.3,NULL),
 ('Audio','Barre de son Opaline 300','Opaline',299,0.8,4.1,NULL),
 ('Audio','Platine vinyle Arvor Classic','Arvor',219,0.7,4.4,NULL),
 ('Photo','Hybride Lumen Z50','Lumen',899,0.6,4.7,NULL),
 ('Photo','Objectif 35 mm f/1.8','Lumen',349,0.6,4.6,NULL),
 ('Photo','Caméra sport Altitude 4K','Altitude',279,1.0,4.0,NULL),
 ('Photo','Trépied carbone Sillage','Sillage',129,0.7,4.3,NULL),
 ('Photo','Carte SD 128 Go','Kerys',24.90,2.5,4.5,NULL),
 ('Photo','Sac photo Arvor','Arvor',89,0.7,4.2,NULL),
 ('Cuisine','Robot pâtissier Opaline','Opaline',399,1.0,4.6,NULL),
 ('Cuisine','Cafetière à grain Arvor','Arvor',449,0.8,4.3,NULL),
 ('Cuisine','Friteuse sans huile Brise XL','Brise',129,2.6,4.4,500),
 ('Cuisine','Bouilloire inox Novéa','Novéa',49,1.6,4.0,NULL),
 ('Cuisine','Set de couteaux Arvor','Arvor',159,0.9,4.7,NULL),
 ('Cuisine','Cocotte en fonte 28 cm','Arvor',179,1.0,4.8,NULL),
 ('Décoration','Lampe à poser Opaline','Opaline',89,1.2,4.3,NULL),
 ('Décoration','Miroir rond laiton','Opaline',129,0.8,4.4,NULL),
 ('Décoration','Plaid en laine Arvor','Arvor',69,1.5,4.6,NULL),
 ('Décoration','Bougie parfumée Brise','Brise',29,2.4,4.2,NULL),
 ('Décoration','Vase en grès','Arvor',45,1.2,4.5,NULL),
 ('Décoration','Guirlande lumineuse 10 m','Sillage',24.90,2.0,3.9,NULL),
 ('Jardin','Tondeuse sans fil Altitude 40','Altitude',349,0.9,4.2,NULL),
 ('Jardin','Barbecue charbon Arvor','Arvor',259,1.0,4.4,NULL),
 ('Jardin','Salon de jardin en teck','Arvor',899,0.4,4.5,NULL),
 ('Jardin','Tuyau extensible 30 m','Brise',39.90,2.0,3.6,NULL),
 ('Jardin','Kit potager en bois','Sillage',79,1.2,4.3,NULL),
 ('Jardin','Hamac Sillage','Sillage',59,1.0,4.1,NULL),
 ('Literie','Matelas Arvor Mémoire 160','Arvor',699,0.8,4.5,NULL),
 ('Literie','Oreiller ergonomique','Novéa',59,1.8,4.1,NULL),
 ('Literie','Couette 4 saisons','Arvor',129,1.2,4.4,NULL),
 ('Literie','Parure de lit en lin','Opaline',149,1.0,4.6,NULL),
 ('Literie','Surmatelas 140','Novéa',189,0.7,4.0,NULL),
 ('Literie','Lit bébé évolutif','Arvor',249,0.5,4.7,NULL),
 ('Running','Chaussures Altitude Trail 3','Altitude',139,1.6,4.5,NULL),
 ('Running','Chaussures Brise Road','Brise',119,1.5,4.2,NULL),
 ('Running','Montre GPS Kerys Run','Kerys',249,1.4,4.6,150),
 ('Running','Gilet d''hydratation','Altitude',69,0.9,4.3,NULL),
 ('Running','Collant thermique','Brise',49,1.1,4.1,NULL),
 ('Running','Lampe frontale 400 lm','Altitude',39,1.3,4.4,NULL),
 ('Vélo','Vélo électrique Altitude E-City','Altitude',1899,0.5,4.6,700),
 ('Vélo','Vélo gravel Sillage G2','Sillage',1299,0.4,4.5,NULL),
 ('Vélo','Casque vélo urbain','Brise',79,1.4,4.3,NULL),
 ('Vélo','Antivol en U renforcé','Altitude',59,1.5,4.4,NULL),
 ('Vélo','Sacoche de porte-bagages','Sillage',69,1.0,4.2,NULL),
 ('Vélo','Compteur GPS vélo','Kerys',179,0.7,4.3,NULL),
 ('Fitness','Tapis de yoga Brise','Brise',39,2.0,4.4,NULL),
 ('Fitness','Haltères réglables 24 kg','Altitude',299,0.8,4.5,NULL),
 ('Fitness','Vélo d''appartement Novéa','Novéa',449,0.6,3.9,NULL),
 ('Fitness','Élastiques de résistance','Brise',24.90,1.8,4.2,NULL),
 ('Fitness','Banc de musculation','Altitude',189,0.6,4.1,NULL),
 ('Fitness','Rameur pliable','Novéa',599,0.4,4.0,NULL),
 ('Randonnée','Sac à dos 40 L Altitude','Altitude',129,1.3,4.6,NULL),
 ('Randonnée','Tente 2 places ultralégère','Sillage',299,0.6,4.4,NULL),
 ('Randonnée','Chaussures de randonnée Arvor','Arvor',159,1.2,4.5,NULL),
 ('Randonnée','Bâtons en carbone','Altitude',89,0.8,4.3,NULL),
 ('Randonnée','Veste imperméable Sillage','Sillage',179,1.0,4.2,NULL),
 ('Randonnée','Gourde isotherme','Brise',29,2.2,4.6,NULL),
 ('Romans','Les Marées d''Ouessant','Éditions du Phare',22,1.6,4.5,NULL),
 ('Romans','Le Dernier Été à Arles','Éditions du Phare',21,1.3,4.2,NULL),
 ('Romans','Nuit blanche à Lyon','Rivages Noirs',19.90,1.2,4.0,NULL),
 ('Romans','L''Héritière des Glénan','Éditions du Phare',23,1.0,4.4,NULL),
 ('Romans','Coffret polar nordique','Rivages Noirs',39,0.7,4.3,NULL),
 ('Romans','Classiques en poche','Éditions du Phare',8.90,2.0,4.6,NULL),
 ('BD','Les Mondes d''Isée — tome 4','Studio Brise',15.95,1.8,4.7,90),
 ('BD','Intégrale Capitaine Mistral','Studio Brise',49,0.7,4.6,NULL),
 ('BD','Kaze no Michi — tome 12','Studio Brise',7.20,2.4,4.5,NULL),
 ('BD','Rivages, roman graphique','Rivages Noirs',25,0.8,4.4,NULL),
 ('BD','Coffret jeunesse de Noël','Studio Brise',34.90,0.9,4.3,NULL),
 ('BD','Artbook Studio Brise','Studio Brise',39,0.5,4.8,NULL),
 ('Jeux de société','Les Bâtisseurs de Kerys','Ludo Arvor',44.90,1.5,4.6,NULL),
 ('Jeux de société','Mot de passe Party','Ludo Arvor',24.90,1.6,4.2,NULL),
 ('Jeux de société','Puzzle 1000 pièces Bretagne','Ludo Arvor',19.90,1.4,4.4,NULL),
 ('Jeux de société','Expédition polaire (coopératif)','Ludo Arvor',39.90,1.1,4.5,NULL),
 ('Jeux de société','Échiquier en bois','Arvor',59,0.6,4.6,NULL),
 ('Jeux de société','Duel, jeu de cartes','Ludo Arvor',14.90,1.4,4.1,NULL),
 ('Musique','Ukulélé soprano','Arvor',59,0.9,4.3,NULL),
 ('Musique','Guitare folk Arvor','Arvor',249,0.6,4.5,NULL),
 ('Musique','Clavier 61 touches','Novéa',179,0.6,4.1,NULL),
 ('Musique','Vinyle « Jazz à Saint-Germain »','Rivages Noirs',29.90,0.8,4.7,NULL),
 ('Musique','Micro USB pour podcast','Kerys',99,0.8,4.2,NULL),
 ('Musique','Casque DJ Kerys','Kerys',129,0.5,4.3,NULL);

CREATE TEMP TABLE prod AS
SELECT row_number() OVER (ORDER BY c.id, cat.nom)::int AS id, c.id AS categorie_id, c.rayon, cat.*,
  coalesce(current_date - cat.lancement, (SELECT debut FROM p) - 30 - floor(random() * 600)::int) AS mise_en_vente
FROM catalogue cat JOIN categories c ON c.nom = cat.categorie;

INSERT INTO produits (id, categorie_id, nom, marque, prix, cout, actif, image_url, cree_le)
SELECT id, categorie_id, nom, marque, prix,
  round((prix / 1.2 * (CASE rayon WHEN 'High-tech' THEN 0.68 WHEN 'Culture' THEN 0.62 ELSE 0.5 END + random() * 0.12))::numeric, 2),
  nom <> 'Écouteurs Kerys Air 2',
  'https://picsum.photos/seed/arvor' || id || '/400',
  mise_en_vente + time '09:00'
FROM prod ORDER BY id;
SELECT setval('produits_id_seq', (SELECT max(id) FROM produits));

-- ── Les clients ──────────────────────────────────────────────────────────────
CREATE TEMP TABLE villes (ville text, region text, lat float8, lon float8, poids int, ouest boolean);
INSERT INTO villes VALUES
 ('Paris','Île-de-France',48.8566,2.3522,20,false),('Boulogne-Billancourt','Île-de-France',48.8397,2.2399,3,false),
 ('Versailles','Île-de-France',48.8049,2.1204,3,false),('Saint-Denis','Île-de-France',48.9362,2.3574,3,false),
 ('Lyon','Auvergne-Rhône-Alpes',45.764,4.8357,8,false),('Grenoble','Auvergne-Rhône-Alpes',45.1885,5.7245,3,false),
 ('Clermont-Ferrand','Auvergne-Rhône-Alpes',45.7772,3.087,2,false),
 ('Marseille','Provence-Alpes-Côte d''Azur',43.2965,5.3698,7,false),('Nice','Provence-Alpes-Côte d''Azur',43.7102,7.262,4,false),
 ('Toulon','Provence-Alpes-Côte d''Azur',43.1242,5.928,2,false),
 ('Toulouse','Occitanie',43.6047,1.4442,6,false),('Montpellier','Occitanie',43.6108,3.8767,4,false),
 ('Bordeaux','Nouvelle-Aquitaine',44.8378,-0.5792,6,false),('Limoges','Nouvelle-Aquitaine',45.8336,1.2611,1,false),
 ('La Rochelle','Nouvelle-Aquitaine',46.1603,-1.1511,2,false),
 ('Nantes','Pays de la Loire',47.2184,-1.5536,5,true),('Angers','Pays de la Loire',47.4784,-0.5632,2,true),
 ('Le Mans','Pays de la Loire',48.0061,0.1996,2,true),
 ('Rennes','Bretagne',48.1173,-1.6778,4,true),('Brest','Bretagne',48.3904,-4.4861,2,true),
 ('Vannes','Bretagne',47.6582,-2.7608,1,true),('Quimper','Bretagne',47.996,-4.1024,1,true),
 ('Saint-Malo','Bretagne',48.6493,-2.0257,1,true),
 ('Caen','Normandie',49.1829,-0.3707,2,true),('Rouen','Normandie',49.4432,1.0999,2,true),
 ('Lille','Hauts-de-France',50.6292,3.0573,5,false),('Amiens','Hauts-de-France',49.8941,2.2958,1,false),
 ('Strasbourg','Grand Est',48.5734,7.7521,4,false),('Reims','Grand Est',49.2583,4.0317,2,false),
 ('Metz','Grand Est',49.1193,6.1757,1,false),
 ('Dijon','Bourgogne-Franche-Comté',47.322,5.0415,2,false),('Besançon','Bourgogne-Franche-Comté',47.2378,6.0241,1,false),
 ('Orléans','Centre-Val de Loire',47.9029,1.9093,2,false),('Tours','Centre-Val de Loire',47.3941,0.6848,2,false),
 ('Ajaccio','Corse',41.9192,8.7386,1,false);
CREATE TEMP TABLE pondere AS
  SELECT row_number() OVER ()::int AS n, v.* FROM villes v, generate_series(1, 100) g WHERE g <= v.poids;
CREATE TEMP TABLE pondere_ouest AS
  SELECT row_number() OVER ()::int AS n, v.* FROM villes v, generate_series(1, 100) g WHERE g <= v.poids AND v.ouest;

-- Les inscriptions suivent la croissance : le i-ème client arrive au temps où la courbe
-- exponentielle atteint i / N. Les identifiants suivent donc l'ordre d'inscription.
CREATE TEMP TABLE c0 AS
SELECT i, ins, (extract(epoch FROM ins - p.debut) / 86400) / p.duree AS f,
  random() AS r_seg, random() AS r_canal, random() AS r_tv, random() AS r_ouest, random() AS r_ville
FROM p, generate_series(1, (SELECT nb_clients FROM p)) i,
  LATERAL (SELECT p.debut + make_interval(secs => ln(1 + ((i - random()) / p.nb_clients) * (exp(p.k * p.duree) - 1)) / p.k * 86400) AS ins) s;

INSERT INTO clients (id, prenom, nom, email, ville, region, latitude, longitude, segment, canal_acquisition, date_naissance, inscrit_le)
SELECT c.i, n.prenom, n.nom,
  lower(translate(n.prenom, 'éèëêçïîôÉ', 'eeeeciioe')) || '.' || lower(translate(replace(n.nom, ' ', ''), 'éèëêçïîôÉ', 'eeeeciioe')) || c.i || '@exemple.fr',
  v.ville, v.region, v.lat + (random() - 0.5) * 0.08, v.lon + (random() - 0.5) * 0.08,
  CASE WHEN c.r_seg < 0.07 THEN 'Professionnel' ELSE 'Particulier' END,
  CASE
    WHEN c.ins BETWEEN p.tv AND p.tv_fin + 1 AND c.r_tv < 0.45 THEN 'Direct'
    WHEN c.r_canal < 0.27 THEN 'SEA'
    WHEN c.r_canal < 0.53 - 0.06 * c.f THEN 'SEO'
    WHEN c.r_canal < 0.62 + 0.04 * c.f THEN 'Réseaux sociaux'
    WHEN c.r_canal < 0.71 + 0.04 * c.f THEN 'Parrainage'
    WHEN c.r_canal < 0.79 + 0.04 * c.f THEN 'Newsletter'
    ELSE 'Direct'
  END,
  date '1950-01-01' + floor(random() * 19000)::int,
  c.ins
FROM c0 c CROSS JOIN p
JOIN LATERAL (
  SELECT
    (ARRAY['Camille','Léa','Manon','Chloé','Inès','Jade','Louise','Emma','Alice','Zoé','Lina','Rose','Anna','Mila','Juliette','Sarah','Margaux','Clara','Élise','Agathe',
           'Lucas','Hugo','Louis','Gabriel','Arthur','Jules','Nathan','Théo','Sacha','Noah','Raphaël','Adam','Tom','Paul','Maël','Ethan','Victor','Antoine','Yanis','Mathis'])[1 + floor(random() * 40)::int + 0 * c.i] AS prenom,
    (ARRAY['Martin','Bernard','Dubois','Thomas','Robert','Richard','Petit','Durand','Leroy','Moreau','Simon','Laurent','Lefèvre','Michel','Garcia','David','Bertrand','Roux','Vincent','Fournier',
           'Morel','Girard','André','Mercier','Dupont','Lambert','Bonnet','François','Martinez','Le Gall','Le Goff','Guillou','Kerboul','Rivière','Fontaine','Chevalier','Robin','Masson','Henry','Perrin'])[1 + floor(random() * 40)::int + 0 * c.i] AS nom
) n ON true
JOIN pondere v ON v.n = 1 + floor(c.r_ville * (SELECT count(*) FROM pondere))::int
WHERE NOT (c.ins >= p.rennes AND c.r_ouest < 0.12)
UNION ALL
SELECT c.i, n.prenom, n.nom,
  lower(translate(n.prenom, 'éèëêçïîôÉ', 'eeeeciioe')) || '.' || lower(translate(replace(n.nom, ' ', ''), 'éèëêçïîôÉ', 'eeeeciioe')) || c.i || '@exemple.fr',
  v.ville, v.region, v.lat + (random() - 0.5) * 0.08, v.lon + (random() - 0.5) * 0.08,
  CASE WHEN c.r_seg < 0.07 THEN 'Professionnel' ELSE 'Particulier' END,
  CASE WHEN c.r_canal < 0.3 THEN 'Parrainage' WHEN c.r_canal < 0.6 THEN 'SEA' ELSE 'Réseaux sociaux' END,
  date '1950-01-01' + floor(random() * 19000)::int,
  c.ins
FROM c0 c CROSS JOIN p
JOIN LATERAL (
  SELECT
    (ARRAY['Maëlle','Nolwenn','Gwenaëlle','Enora','Lou','Rozenn','Anaïs','Solène','Yann','Erwan','Loïc','Gaël','Ronan','Tristan','Mathéo','Corentin'])[1 + floor(random() * 16)::int + 0 * c.i] AS prenom,
    (ARRAY['Le Bihan','Le Roux','Le Gall','Tanguy','Morvan','Guillou','Kerboul','Le Floch','Jaouen','Hamon','Riou','Cadiou'])[1 + floor(random() * 12)::int + 0 * c.i] AS nom
) n ON true
JOIN pondere_ouest v ON v.n = 1 + floor(c.r_ville * (SELECT count(*) FROM pondere_ouest))::int
WHERE c.ins >= p.rennes AND c.r_ouest < 0.12;
SELECT setval('clients_id_seq', (SELECT max(id) FROM clients));

-- Les plus fidèles reviennent plus souvent : le parrainage et la newsletter bien plus que la
-- publicité payante ; les professionnels commandent par lots.
CREATE TEMP TABLE fidelite AS
SELECT id, segment = 'Professionnel' AS pro,
  CASE WHEN segment = 'Professionnel' THEN 1.0 ELSE
    CASE canal_acquisition WHEN 'Parrainage' THEN 1.0 WHEN 'Newsletter' THEN 0.9 WHEN 'Direct' THEN 0.75
      WHEN 'SEO' THEN 0.6 WHEN 'SEA' THEN 0.4 ELSE 0.35 END
  END AS w
FROM clients;
ALTER TABLE fidelite ADD PRIMARY KEY (id);

-- ── Les jours ────────────────────────────────────────────────────────────────
CREATE TEMP TABLE jours AS
SELECT j::date AS jour, (j::date - p.debut) AS t,
  exp(p.k * (j::date - p.debut))
    * (ARRAY[1.04,0.86,0.92,0.96,1.0,0.98,1.03,0.78,0.95,1.0,1.16,1.48])[extract(month FROM j)::int]
    * (ARRAY[1.04,0.97,1.0,0.98,0.94,0.9,1.17])[extract(isodow FROM j)::int]
    * exp(random_normal(0, 0.11)) AS f,
  false AS bf, false AS soldes
FROM p, generate_series(p.debut::timestamp, current_date::timestamp, interval '1 day') j;

-- (Le Cyber Monday tombe parfois en décembre : il garde le niveau de novembre.)
UPDATE jours j SET f = f * CASE j.jour - e.debut WHEN 0 THEN 3.0 WHEN 1 THEN 1.8 WHEN 2 THEN 1.7 ELSE 1.6 END
    * CASE WHEN extract(month FROM j.jour) = 12 THEN 1.16 / 1.48 ELSE 1 END, bf = true
FROM evenements e WHERE e.nom LIKE 'Black Friday%' AND j.jour BETWEEN e.debut AND e.fin;
UPDATE jours j SET f = f * 0.88
FROM evenements e WHERE e.nom LIKE 'Black Friday%' AND j.jour BETWEEN e.debut - 7 AND e.debut - 1;
UPDATE jours j SET f = f * CASE WHEN j.jour - e.debut < 7 THEN 1.55 ELSE 1.15 END, soldes = true
FROM evenements e WHERE e.nom LIKE 'Soldes%' AND j.jour BETWEEN e.debut AND e.fin;
UPDATE jours SET f = f * CASE
    WHEN extract(month FROM jour) = 12 AND extract(day FROM jour) BETWEEN 21 AND 24 THEN 0.85
    WHEN extract(month FROM jour) = 12 AND extract(day FROM jour) = 25 THEN 0.4
    WHEN extract(month FROM jour) = 12 AND extract(day FROM jour) = 31 THEN 0.75
    WHEN extract(month FROM jour) = 1 AND extract(day FROM jour) = 1 THEN 0.5
    ELSE 1 END;
UPDATE jours j SET f = f * 1.25 FROM p WHERE j.jour BETWEEN p.tv AND p.tv_fin + 7;
UPDATE jours j SET f = f * 0.9 FROM p WHERE j.jour BETWEEN p.greve AND p.greve_fin;

-- ── Les commandes ────────────────────────────────────────────────────────────
CREATE TEMP TABLE cmd AS
SELECT s.*,
  greatest(1, floor(p.nb_clients * (exp(p.k * s.tf) - 1) / (exp(p.k * p.duree) - 1)))::int AS idmax,
  greatest(1, floor(p.nb_clients * (exp(p.k * greatest(s.tf - 3, 0)) - 1) / (exp(p.k * p.duree) - 1)))::int AS idmin_nouveau,
  random() < CASE WHEN s.bf THEN 0.38 ELSE 0.3 END AS nouveau,
  CASE
    WHEN s.r_canal < s.mobile THEN 'Mobile'
    WHEN s.r_canal < s.mobile + 0.22 - 0.12 * s.tf / p.duree THEN 'Marketplace'
    ELSE 'Web'
  END AS canal,
  (ARRAY['Domicile','Domicile','Domicile','Domicile','Domicile','Point relais','Point relais','Point relais','Point relais','Express'])[1 + floor(random() * 10)::int] AS mode_livraison
FROM p, (
  SELECT j.jour, j.bf, j.soldes, ts AS passee_le, tf, random() AS r_canal,
    -- La part du mobile : le site mobile, puis l'application qui décolle en quelques mois ;
    -- pendant le bug de paiement, elle s'effondre.
    (0.07 + 0.38 / (1 + exp(-((tf - (p.appli - p.debut) - 90) / 45.0))))
      * CASE WHEN ts::date BETWEEN p.bug AND p.bug_fin THEN 0.3 ELSE 1 END AS mobile
  FROM p, jours j
  CROSS JOIN LATERAL generate_series(1, greatest(1, round(30 * j.f)::int)) g
  CROSS JOIN LATERAL (SELECT j.jour + make_interval(
      hours => (ARRAY[0,1,7,8,8,9,9,10,10,11,11,12,12,12,13,13,13,14,14,15,15,16,16,17,17,18,18,19,19,20,20,20,21,21,21,21,22,22,22,23])[1 + floor(random() * 40)::int + 0 * g],
      mins => floor(random() * 60)::int, secs => floor(random() * 60)::int) AS ts) h
  CROSS JOIN LATERAL (SELECT j.t + extract(epoch FROM h.ts - j.jour)::float8 / 86400 AS tf) x
) s
WHERE s.passee_le <= now();

ALTER TABLE cmd ADD client_id int;
UPDATE cmd o SET client_id = (
  SELECT c.cand FROM (
    SELECT k, greatest(1, least(o.idmax, CASE
      WHEN o.nouveau THEN o.idmin_nouveau + floor(random() * (o.idmax - o.idmin_nouveau + 1))::int
      ELSE o.idmax - floor((o.idmax - 1) * power(random(), 2.2))::int END)) AS cand
    FROM generate_series(1, 5) k OFFSET 0
  ) c JOIN fidelite f ON f.id = c.cand
  WHERE c.k = 5 OR o.nouveau OR random() < f.w
  ORDER BY c.k LIMIT 1);

INSERT INTO commandes (id, client_id, statut, canal, mode_livraison, entrepot, passee_le)
SELECT row_number() OVER (ORDER BY o.passee_le), o.client_id, 'payée',
  CASE WHEN o.canal = 'Mobile' AND o.passee_le < (SELECT appli FROM p) AND random() < 0.5 THEN 'Web' ELSE o.canal END,
  o.mode_livraison,
  CASE
    WHEN c.region IN ('Bretagne','Pays de la Loire','Normandie') AND o.passee_le >= (SELECT rennes FROM p) THEN 'Rennes'
    WHEN c.region IN ('Auvergne-Rhône-Alpes','Provence-Alpes-Côte d''Azur','Occitanie','Corse','Bourgogne-Franche-Comté') THEN 'Lyon'
    ELSE 'Paris-Nord'
  END,
  greatest(o.passee_le, c.inscrit_le + interval '4 minutes')
FROM cmd o JOIN clients c ON c.id = o.client_id
ORDER BY o.passee_le;
SELECT setval('commandes_id_seq', (SELECT max(id) FROM commandes));

-- ── Les articles ─────────────────────────────────────────────────────────────
-- Chaque mois, le poids de chaque produit : sa popularité, la saison de sa catégorie, sa vie
-- (un lancement fait un pic ; les Kerys Air 2 cartonnent, puis sont retirées au rappel).
CREATE TEMP TABLE poids AS
WITH m AS (
  SELECT generate_series(date_trunc('month', p.debut), date_trunc('month', current_date), interval '1 month')::date AS mois FROM p
), w AS (
  SELECT to_char(m.mois, 'YYYY-MM') AS cle, pr.id AS produit_id, pr.prix,
    pr.pop * power(40 / pr.prix, 0.5) * s.coef[extract(month FROM m.mois)::int]
      * CASE
          WHEN pr.mise_en_vente > (m.mois + interval '1 month' - interval '1 day')::date THEN 0
          WHEN pr.nom = 'Écouteurs Kerys Air 2' AND m.mois >= date_trunc('month', p.rappel) + interval '1 month' THEN 0
          WHEN pr.nom = 'Écouteurs Kerys Air 2' AND m.mois >= date_trunc('month', p.defaut) + interval '1 month' THEN 0.5
          WHEN m.mois - pr.mise_en_vente < 75 THEN 2.4
          ELSE 1 END AS w
  FROM m CROSS JOIN prod pr JOIN saisons s ON s.categorie = pr.categorie CROSS JOIN p
  UNION ALL
  -- Le Black Friday : la moitié des articles vient de la high-tech déjà en vente.
  SELECT 'hightech', pr.id, pr.prix, pr.pop * power(40 / pr.prix, 0.5) FROM prod pr, p WHERE pr.rayon = 'High-tech' AND pr.mise_en_vente < p.debut
)
SELECT cle, produit_id, prix,
  (sum(w) OVER (PARTITION BY cle ORDER BY produit_id) - w) / sum(w) OVER (PARTITION BY cle) AS lo,
  sum(w) OVER (PARTITION BY cle ORDER BY produit_id) / sum(w) OVER (PARTITION BY cle) AS hi
FROM w WHERE w > 0;
CREATE INDEX ON poids (cle, lo);

CREATE TEMP TABLE lig AS
SELECT o.id AS commande_id, o.passee_le, j.bf, j.soldes, f.pro,
  CASE WHEN j.bf AND random() < 0.5 THEN 'hightech' ELSE to_char(o.passee_le, 'YYYY-MM') END AS cle,
  random() AS r
FROM commandes o
JOIN jours j ON j.jour = o.passee_le::date
JOIN fidelite f ON f.id = o.client_id
CROSS JOIN LATERAL generate_series(1, 1 + floor(power(random(), 1.8) * 3.3)::int + 0 * o.id) g;

INSERT INTO lignes_commande (commande_id, produit_id, quantite, prix_unitaire, cout_unitaire)
SELECT l.commande_id, w.produit_id,
  CASE WHEN l.pro AND w.prix < 150 THEN 1 + floor(random() * 6)::int
       WHEN w.prix < 30 THEN 1 + floor(power(random(), 2) * 3)::int
       ELSE 1 + (random() < 0.05)::int END,
  CASE
    WHEN l.soldes AND random() < 0.45 THEN round(w.prix * (1 - (ARRAY[0.2,0.3,0.3,0.4,0.5])[1 + floor(random() * 5)::int]), 2)
    WHEN l.bf AND random() < 0.55 THEN round(w.prix * (1 - (ARRAY[0.15,0.2,0.25,0.3])[1 + floor(random() * 4)::int]), 2)
    ELSE w.prix END,
  pr.cout
FROM lig l
JOIN poids w ON w.cle = l.cle AND l.r >= w.lo AND l.r < w.hi
JOIN produits pr ON pr.id = w.produit_id;

-- Un produit lancé en cours de mois ne se vend qu'à partir de son lancement : avant, la
-- commande prend le premier produit de sa catégorie déjà en vente.
UPDATE lignes_commande l SET produit_id = x.remplacant, prix_unitaire = x.prix, cout_unitaire = x.cout
FROM (
  SELECT l2.id, r.id AS remplacant, r.prix, r.cout
  FROM lignes_commande l2
  JOIN commandes o ON o.id = l2.commande_id
  JOIN produits p ON p.id = l2.produit_id
  CROSS JOIN LATERAL (
    SELECT r.id, r.prix, r.cout FROM produits r
    WHERE r.categorie_id = p.categorie_id AND r.cree_le <= o.passee_le
    ORDER BY r.id LIMIT 1
  ) r
  WHERE p.cree_le > o.passee_le
) x
WHERE x.id = l.id;

-- Le rappel retire les Kerys Air 2 de la vente : la première génération reprend le relais.
UPDATE lignes_commande l SET produit_id = v1.id, prix_unitaire = v1.prix, cout_unitaire = v1.cout
FROM commandes o, produits v2, produits v1, p
WHERE o.id = l.commande_id AND v2.id = l.produit_id AND v2.nom = 'Écouteurs Kerys Air 2'
  AND v1.nom = 'Écouteurs Kerys Air' AND o.passee_le::date > p.rappel;

-- Montants, codes promo et frais de port.
UPDATE commandes o SET montant_total = s.total
FROM (SELECT commande_id, sum(quantite * prix_unitaire) AS total FROM lignes_commande GROUP BY commande_id) s
WHERE s.commande_id = o.id;
DELETE FROM commandes o WHERE NOT EXISTS (SELECT 1 FROM lignes_commande l WHERE l.commande_id = o.id);

UPDATE commandes o SET code_promo = x.code
FROM (
  SELECT o2.id,
    CASE
      WHEN j.bf AND random() < 0.4 THEN 'BLACKFRIDAY'
      WHEN extract(month FROM o2.passee_le) = 12 AND extract(day FROM o2.passee_le) <= 20 AND random() < 0.18 THEN 'NOEL20'
      WHEN c.canal_acquisition = 'Newsletter' AND random() < 0.2 THEN 'NEWS15'
      WHEN c.canal_acquisition = 'Parrainage' AND random() < 0.15 THEN 'PARRAIN10'
      WHEN o2.passee_le < c.inscrit_le + interval '1 day' AND random() < 0.35 THEN 'BIENVENUE10'
    END AS code
  FROM commandes o2 JOIN clients c ON c.id = o2.client_id JOIN jours j ON j.jour = o2.passee_le::date
) x
WHERE x.id = o.id AND x.code IS NOT NULL;
UPDATE commandes SET remise = round(montant_total * CASE code_promo
    WHEN 'BLACKFRIDAY' THEN 0.1 WHEN 'NOEL20' THEN 0.2 WHEN 'NEWS15' THEN 0.15 ELSE 0.1 END, 2)
WHERE code_promo IS NOT NULL;
UPDATE commandes SET frais_port = CASE
    WHEN mode_livraison = 'Express' THEN 9.90
    WHEN montant_total - remise >= 60 THEN 0
    WHEN canal = 'Marketplace' THEN 5.90
    WHEN mode_livraison = 'Point relais' THEN 3.90
    ELSE 4.90 END;

-- ── Livraisons, annulations, remboursements ─────────────────────────────────
-- L'entrepôt et la région font le délai ; l'entrepôt de Rennes divise celui de l'Ouest par
-- deux ; la grève l'allonge de quatre à huit jours, sauf en express.
CREATE TEMP TABLE livraison AS
SELECT o.id,
  greatest(0.6,
    CASE o.entrepot
      WHEN 'Rennes' THEN CASE c.region WHEN 'Bretagne' THEN 1.3 WHEN 'Pays de la Loire' THEN 1.5 ELSE 1.8 END
      WHEN 'Lyon' THEN CASE c.region WHEN 'Auvergne-Rhône-Alpes' THEN 1.7 WHEN 'Bourgogne-Franche-Comté' THEN 2.1
        WHEN 'Provence-Alpes-Côte d''Azur' THEN 2.4 WHEN 'Occitanie' THEN 2.6 ELSE 4.5 END
      ELSE CASE c.region WHEN 'Île-de-France' THEN 1.6 WHEN 'Hauts-de-France' THEN 2.0 WHEN 'Centre-Val de Loire' THEN 2.1
        WHEN 'Grand Est' THEN 2.4 WHEN 'Nouvelle-Aquitaine' THEN 3.0 WHEN 'Bretagne' THEN 3.9 ELSE 3.4 END
    END
    * CASE WHEN o.mode_livraison = 'Express' THEN 0.5 ELSE 1 END
    * (0.65 + random() * 0.7)
    + CASE WHEN o.passee_le::date BETWEEN p.greve - 4 AND p.greve_fin AND o.mode_livraison <> 'Express'
        THEN 4 + random() * 4 ELSE 0 END
  ) AS jours_livraison,
  o.passee_le::date BETWEEN p.greve - 4 AND p.greve_fin AND o.mode_livraison <> 'Express' AS greve,
  EXISTS (
    SELECT 1 FROM lignes_commande l JOIN produits pr ON pr.id = l.produit_id
    WHERE l.commande_id = o.id AND pr.nom = 'Écouteurs Kerys Air 2' AND o.passee_le::date BETWEEN p.defaut - 30 AND p.rappel
  ) AS kerys_defaut
FROM commandes o JOIN clients c ON c.id = o.client_id CROSS JOIN p;
ALTER TABLE livraison ADD PRIMARY KEY (id);

UPDATE commandes o SET
  statut = CASE
    WHEN random() < CASE WHEN l.greve THEN 0.11 ELSE 0.025 END THEN 'annulée'
    WHEN o.passee_le + make_interval(secs => l.jours_livraison * 86400) > now() THEN
      CASE WHEN o.passee_le > now() - interval '14 hours' THEN 'payée' ELSE 'expédiée' END
    WHEN random() < CASE WHEN l.kerys_defaut THEN 0.45 ELSE 0.02 END THEN 'remboursée'
    ELSE 'livrée' END,
  livree_le = o.passee_le + make_interval(secs => l.jours_livraison * 86400)
FROM livraison l WHERE l.id = o.id;
UPDATE commandes SET livree_le = NULL WHERE statut IN ('annulée', 'payée', 'expédiée');

-- ── Les avis ─────────────────────────────────────────────────────────────────
INSERT INTO avis (produit_id, client_id, note, commentaire, publie_le)
SELECT x.produit_id, x.client_id, x.note,
  CASE
    WHEN x.kerys AND x.note <= 2 AND random() < 0.7 THEN
      (ARRAY['La batterie ne tient pas plus d''une heure.','L''écouteur gauche s''est éteint au bout de deux semaines.','Autonomie catastrophique, renvoyé.','Défaut de charge, je demande le remboursement.'])[1 + floor(random() * 4)::int]
    WHEN x.greve AND x.note <= 3 AND random() < 0.6 THEN
      (ARRAY['Colis arrivé avec une semaine de retard.','Produit correct, mais la livraison a été interminable.','Suivi du colis bloqué pendant des jours.'])[1 + floor(random() * 3)::int]
    WHEN random() < 0.25 THEN NULL
    WHEN x.note = 5 THEN (ARRAY['Parfait, je recommande.','Excellent produit, conforme à la description.','Très bonne qualité, livraison rapide.','Super rapport qualité-prix.','Je rachèterai sans hésiter.','Offert à Noël, grand succès.'])[1 + floor(random() * 6)::int]
    WHEN x.note = 4 THEN (ARRAY['Bon produit, quelques finitions perfectibles.','Satisfait de mon achat.','Conforme, mais l''emballage était abîmé.','Très bien pour le prix.'])[1 + floor(random() * 4)::int]
    WHEN x.note = 3 THEN (ARRAY['Correct sans plus.','Qualité moyenne pour le prix.','La notice mériterait d''être plus claire.'])[1 + floor(random() * 3)::int]
    ELSE (ARRAY['Déçu par la qualité.','Ne correspond pas à la description.','Produit retourné, remboursement en attente.'])[1 + floor(random() * 3)::int]
  END,
  x.publie_le
FROM (
  SELECT l.produit_id, o.client_id, lv.greve, lv.kerys_defaut AND pr.nom = 'Écouteurs Kerys Air 2' AS kerys,
    least(5, greatest(1, round(pr.qualite + random_normal(0, 0.85)
      - CASE WHEN lv.greve THEN 1.3 ELSE 0 END
      - CASE WHEN lv.kerys_defaut AND pr.nom = 'Écouteurs Kerys Air 2' THEN 2.8 ELSE 0 END)))::int AS note,
    o.livree_le + make_interval(days => 1 + floor(random() * 12)::int, hours => floor(random() * 14)::int) AS publie_le
  FROM lignes_commande l
  JOIN commandes o ON o.id = l.commande_id
  JOIN livraison lv ON lv.id = o.id
  JOIN prod pr ON pr.id = l.produit_id
  WHERE o.statut IN ('livrée', 'remboursée') AND o.livree_le IS NOT NULL
    AND random() < CASE WHEN lv.greve OR lv.kerys_defaut THEN 0.3 ELSE 0.15 END
) x
WHERE x.publie_le <= now()
ORDER BY x.publie_le;

UPDATE produits p SET note_moyenne = s.moy
FROM (SELECT produit_id, round(avg(note), 2) AS moy FROM avis GROUP BY produit_id) s
WHERE s.produit_id = p.id;

-- ── Segments : les 10 % de particuliers qui dépensent le plus deviennent Premium ──
UPDATE clients c SET segment = 'Premium'
FROM (
  SELECT client_id, ntile(10) OVER (ORDER BY sum(montant_total - remise) DESC) AS decile
  FROM commandes o JOIN clients c2 ON c2.id = o.client_id
  WHERE o.statut NOT IN ('annulée', 'remboursée') AND c2.segment = 'Particulier'
  GROUP BY client_id
) s
WHERE s.client_id = c.id AND s.decile = 1;

-- ── Entrepôts ────────────────────────────────────────────────────────────────
INSERT INTO entrepots (nom, ville, latitude, longitude, ouvert_le)
SELECT 'Paris-Nord', 'Gonesse', 48.9866, 2.4497, debut - 900 FROM p
UNION ALL SELECT 'Lyon', 'Saint-Priest', 45.6966, 4.9437, debut - 400 FROM p
UNION ALL SELECT 'Rennes', 'Chantepie', 48.0889, -1.6155, rennes FROM p;

-- ── Objectifs : 30 % de plus que l'an passé, et trois mois à venir ──────────
WITH ca AS (
  SELECT date_trunc('month', passee_le)::date AS m, sum(montant_total - remise) AS ca, count(*) AS n
  FROM commandes WHERE statut NOT IN ('annulée', 'remboursée') GROUP BY 1
), mois AS (
  SELECT generate_series(date_trunc('month', p.debut) + interval '1 month', date_trunc('month', current_date) + interval '3 months', interval '1 month')::date AS m FROM p
)
INSERT INTO objectifs (mois, objectif_ca, objectif_commandes)
SELECT mois.m,
  round(coalesce(prev.ca * 1.3, cur.ca * (0.95 + random() * 0.12)::numeric), -3),
  round(coalesce(prev.n * 1.25, cur.n * (0.95 + random() * 0.1)::numeric), -1)::int
FROM mois LEFT JOIN ca prev ON prev.m = (mois.m - interval '12 months')::date LEFT JOIN ca cur ON cur.m = mois.m
WHERE coalesce(prev.ca, cur.ca) IS NOT NULL;

-- ── Dépenses marketing : le coût d'acquisition de chaque canal (le SEA s'enchérit) ──
INSERT INTO depenses_marketing (mois, canal, montant, impressions, clics)
SELECT s.mois, s.canal, s.montant,
  CASE s.canal WHEN 'SEA' THEN round(s.montant * 55) WHEN 'Réseaux sociaux' THEN round(s.montant * 140) END,
  CASE s.canal WHEN 'SEA' THEN round(s.montant * 55 * 0.034) WHEN 'Réseaux sociaux' THEN round(s.montant * 140 * 0.011) END
FROM (
  SELECT date_trunc('month', c.inscrit_le)::date AS mois, c.canal_acquisition AS canal,
    round((count(*) * CASE c.canal_acquisition WHEN 'SEA' THEN 38 WHEN 'Réseaux sociaux' THEN 29 WHEN 'Parrainage' THEN 15
      WHEN 'SEO' THEN 9 WHEN 'Newsletter' THEN 3 END
      * (1 + 0.35 * min(extract(epoch FROM c.inscrit_le - p.debut) / 86400 / p.duree)) * (0.88 + random() * 0.24))::numeric, 2) AS montant
  FROM clients c CROSS JOIN p
  WHERE c.canal_acquisition IN ('SEA', 'Réseaux sociaux', 'Parrainage', 'SEO', 'Newsletter')
  GROUP BY 1, 2
) s
UNION ALL
SELECT date_trunc('month', d)::date, 'Télévision', 95000, 18000000, NULL
FROM p, generate_series(p.tv, p.tv_fin, interval '1 day') d
WHERE p.tv_fin >= p.debut
GROUP BY 1
ORDER BY 1, 2;

CREATE INDEX ON commandes (client_id);
CREATE INDEX ON commandes (passee_le);
CREATE INDEX ON lignes_commande (commande_id);
CREATE INDEX ON lignes_commande (produit_id);
CREATE INDEX ON avis (produit_id);
ANALYZE;

-- ── Le compte de la démo : il lit, rien d'autre ─────────────────────────────
-- La source de la démo se connecte avec lui : même le SQL natif, envoyé tel quel à
-- PostgreSQL, ne peut ni écrire ni lire hors des tables (le compte « demo » de l'image est
-- superutilisateur).
CREATE ROLE lecteur LOGIN PASSWORD 'lecteur' NOSUPERUSER NOCREATEDB NOCREATEROLE;
GRANT CONNECT ON DATABASE boutique TO lecteur;
GRANT USAGE ON SCHEMA public TO lecteur;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO lecteur;
