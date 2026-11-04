-- ────────────────────────────────────────────────────────────────────────
-- 0009 — La largeur d'un tableau de bord, et l'accueil de chacun.
--
-- Un tableau de bord occupe toute la largeur de l'écran (« full »), ou la largeur d'une page A4
-- à l'italienne (« a4 »), centrée : il se lit alors comme il s'imprime.
-- L'accueil se compose : chacun y épingle ses indicateurs, y range ses favoris, ses alertes et
-- les questions qu'il veut voir, à la manière d'un tableau de bord. Sa disposition est à lui.
--
-- Appliquée au démarrage, dans sa propre transaction, après toutes les précédentes.
-- Ni transaction explicite, ni CREATE INDEX CONCURRENTLY : elle s'exécute déjà dans une.
-- Une fois publiée, elle ne change plus : la correction va dans la suivante.
-- ────────────────────────────────────────────────────────────────────────

ALTER TABLE dashboard ADD COLUMN IF NOT EXISTS width text NOT NULL DEFAULT 'full';

CREATE TABLE IF NOT EXISTS user_home (
  user_id uuid PRIMARY KEY REFERENCES app_user (id) ON DELETE CASCADE,
  layout jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
