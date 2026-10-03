-- Base d'exemple « boutique » : un commerce en ligne français, deux ans d'activité.
SELECT setseed(0.42);

CREATE TABLE categories (
  id serial PRIMARY KEY,
  nom text NOT NULL,
  rayon text NOT NULL
);
COMMENT ON TABLE categories IS 'Catégories du catalogue produit';

CREATE TABLE produits (
  id serial PRIMARY KEY,
  categorie_id int NOT NULL REFERENCES categories(id),
  nom text NOT NULL,
  marque text NOT NULL,
  prix numeric(10,2) NOT NULL,
  cout numeric(10,2) NOT NULL,
  note_moyenne numeric(3,2),
  image_url text,
  cree_le timestamptz NOT NULL
);
COMMENT ON TABLE produits IS 'Produits vendus en ligne';
COMMENT ON COLUMN produits.cout IS 'Coût d''achat unitaire HT';

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

CREATE TABLE commandes (
  id serial PRIMARY KEY,
  client_id int NOT NULL REFERENCES clients(id),
  statut text NOT NULL,
  canal text NOT NULL,
  montant_total numeric(12,2) NOT NULL DEFAULT 0,
  remise numeric(12,2) NOT NULL DEFAULT 0,
  frais_port numeric(8,2) NOT NULL DEFAULT 0,
  passee_le timestamptz NOT NULL,
  livree_le timestamptz
);
COMMENT ON TABLE commandes IS 'Commandes passées par les clients';

CREATE TABLE lignes_commande (
  id serial PRIMARY KEY,
  commande_id int NOT NULL REFERENCES commandes(id),
  produit_id int NOT NULL REFERENCES produits(id),
  quantite int NOT NULL,
  prix_unitaire numeric(10,2) NOT NULL
);

CREATE TABLE avis (
  id serial PRIMARY KEY,
  produit_id int NOT NULL REFERENCES produits(id),
  client_id int NOT NULL REFERENCES clients(id),
  note int NOT NULL CHECK (note BETWEEN 1 AND 5),
  commentaire text,
  publie_le timestamptz NOT NULL
);

INSERT INTO categories (nom, rayon) VALUES
 ('Smartphones','High-tech'),('Ordinateurs','High-tech'),('Audio','High-tech'),('Photo','High-tech'),
 ('Cuisine','Maison'),('Décoration','Maison'),('Jardin','Maison'),('Literie','Maison'),
 ('Running','Sport'),('Vélo','Sport'),('Fitness','Sport'),('Randonnée','Sport'),
 ('Romans','Culture'),('BD','Culture'),('Jeux de société','Culture'),('Musique','Culture');

INSERT INTO produits (categorie_id, nom, marque, prix, cout, image_url, cree_le)
SELECT s.c,
  (ARRAY['Pro','Max','Lite','Air','One','Plus','Neo','Studio'])[1 + floor(random()*8)::int] || ' ' ||
  (SELECT nom FROM categories WHERE id = s.c) || ' ' || (100 + i),
  (ARRAY['Arvor','Lumen','Kerys','Novéa','Altitude','Opaline','Brise','Sillage'])[1 + floor(random()*8)::int],
  round((15 + random() * (CASE WHEN s.c <= 4 THEN 900 WHEN s.c <= 8 THEN 250 WHEN s.c <= 12 THEN 400 ELSE 45 END))::numeric, 2),
  0,
  'https://picsum.photos/seed/p' || i || '/200',
  now() - interval '800 days' + (random() * interval '300 days')
FROM generate_series(1, 160) AS i, LATERAL (SELECT 1 + (i % 16) AS c) s;
UPDATE produits SET cout = round(prix * (0.45 + random() * 0.25)::numeric, 2);

CREATE TEMP TABLE villes(ville text, region text, lat float8, lon float8, poids int);
INSERT INTO villes VALUES
  ('Paris','Île-de-France',48.8566,2.3522,22),('Boulogne-Billancourt','Île-de-France',48.8397,2.2399,4),
  ('Lyon','Auvergne-Rhône-Alpes',45.764,4.8357,9),('Grenoble','Auvergne-Rhône-Alpes',45.1885,5.7245,4),
  ('Marseille','Provence-Alpes-Côte d''Azur',43.2965,5.3698,8),('Nice','Provence-Alpes-Côte d''Azur',43.7102,7.262,5),
  ('Toulouse','Occitanie',43.6047,1.4442,7),('Montpellier','Occitanie',43.6108,3.8767,5),
  ('Bordeaux','Nouvelle-Aquitaine',44.8378,-0.5792,6),('Nantes','Pays de la Loire',47.2184,-1.5536,6),
  ('Rennes','Bretagne',48.1173,-1.6778,5),('Brest','Bretagne',48.3904,-4.4861,2),
  ('Lille','Hauts-de-France',50.6292,3.0573,6),('Strasbourg','Grand Est',48.5734,7.7521,5),
  ('Dijon','Bourgogne-Franche-Comté',47.322,5.0415,2),('Rouen','Normandie',49.4432,1.0999,3),
  ('Orléans','Centre-Val de Loire',47.9029,1.9093,2),('Ajaccio','Corse',41.9192,8.7386,1);
CREATE TEMP TABLE pondere AS
  SELECT row_number() OVER () AS n, v.* FROM villes v, generate_series(1, 200) g WHERE g <= v.poids;

INSERT INTO clients (prenom, nom, email, ville, region, latitude, longitude, segment, canal_acquisition, date_naissance, inscrit_le)
SELECT t.prenom, t.nom,
  lower(translate(t.prenom, 'éèëçï', 'eeeci')) || '.' || lower(translate(t.nom, 'éèëçï', 'eeeci')) || t.i || '@exemple.fr',
  v.ville, v.region, v.lat + (random()-0.5)*0.1, v.lon + (random()-0.5)*0.1,
  t.segment, t.canal, t.naissance, t.inscrit
FROM (
  SELECT i,
    (ARRAY['Camille','Léa','Manon','Chloé','Inès','Jade','Louise','Emma','Lucas','Hugo','Louis','Gabriel','Arthur','Jules','Nathan','Théo','Sacha','Noah','Alice','Zoé'])[1 + floor(random()*20)::int] AS prenom,
    (ARRAY['Martin','Bernard','Dubois','Thomas','Robert','Richard','Petit','Durand','Leroy','Moreau','Simon','Laurent','Lefèbvre','Michel','Garcia','David','Bertrand','Roux','Vincent','Fournier'])[1 + floor(random()*20)::int] AS nom,
    (ARRAY['Particulier','Particulier','Particulier','Premium','Professionnel'])[1 + floor(random()*5)::int] AS segment,
    (ARRAY['SEO','SEA','Réseaux sociaux','Parrainage','Newsletter','Direct'])[1 + floor(random()*6)::int] AS canal,
    date '1950-01-01' + floor(random() * 20000)::int AS naissance,
    now() - interval '730 days' + (random()^0.8) * interval '725 days' AS inscrit,
    1 + floor(random() * (SELECT count(*) FROM pondere))::int AS pick
  FROM generate_series(1, 2500) i
) t JOIN pondere v ON v.n = t.pick;

INSERT INTO commandes (client_id, statut, canal, frais_port, passee_le)
SELECT c.id,
  (ARRAY['livrée','livrée','livrée','livrée','livrée','livrée','expédiée','payée','annulée','remboursée'])[1 + floor(random()*10)::int],
  (ARRAY['Web','Web','Web','Mobile','Mobile','Marketplace'])[1 + floor(random()*6)::int],
  (ARRAY[0, 0, 4.90, 6.90, 9.90])[1 + floor(random()*5)::int],
  greatest(c.inscrit_le, now() - interval '730 days' + (random()^0.7) * interval '729 days')
FROM clients c CROSS JOIN LATERAL generate_series(1, 1 + floor(random()*12)::int + c.id*0) g;

INSERT INTO lignes_commande (commande_id, produit_id, quantite, prix_unitaire)
SELECT o.id, p.id, 1 + floor(random()^3 * 4)::int, p.prix
FROM commandes o
CROSS JOIN LATERAL generate_series(1, 1 + floor(random()*3)::int + o.id*0) g
JOIN produits p ON p.id = 1 + floor(random() * 160 + g*0)::int;

UPDATE commandes o SET montant_total = s.total,
  remise = CASE WHEN random() < 0.2 THEN round(s.total * 0.1, 2) ELSE 0 END,
  livree_le = CASE WHEN o.statut = 'livrée' THEN o.passee_le + (1 + floor(random()*6)::int) * interval '1 day' END
FROM (SELECT commande_id, sum(quantite * prix_unitaire) AS total FROM lignes_commande GROUP BY commande_id) s
WHERE s.commande_id = o.id;

INSERT INTO avis (produit_id, client_id, note, commentaire, publie_le)
SELECT l.produit_id, o.client_id,
  (ARRAY[1,2,3,4,4,5,5,5])[1 + floor(random()*8)::int],
  (ARRAY['Parfait, je recommande.','Conforme à la description.','Livraison rapide.','Qualité décevante.','Bon rapport qualité-prix.', NULL])[1 + floor(random()*6)::int],
  o.passee_le + interval '10 days'
FROM lignes_commande l JOIN commandes o ON o.id = l.commande_id
WHERE o.statut = 'livrée' AND random() < 0.18;

UPDATE produits p SET note_moyenne = s.moy
FROM (SELECT produit_id, round(avg(note), 2) AS moy FROM avis GROUP BY produit_id) s
WHERE s.produit_id = p.id;

CREATE INDEX ON commandes (client_id);
CREATE INDEX ON commandes (passee_le);
CREATE INDEX ON lignes_commande (commande_id);
CREATE INDEX ON lignes_commande (produit_id);
ANALYZE;
