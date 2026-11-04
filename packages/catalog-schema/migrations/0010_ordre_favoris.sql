-- ────────────────────────────────────────────────────────────────────────
-- 0010 — L'ordre des favoris.
--
-- Chacun range ses favoris comme il l'entend (sur l'accueil, dans la barre latérale) : leur
-- place est gardée ; sans place, un favori suit les autres, par date d'ajout.
--
-- Appliquée au démarrage, dans sa propre transaction, après toutes les précédentes.
-- Ni transaction explicite, ni CREATE INDEX CONCURRENTLY : elle s'exécute déjà dans une.
-- Une fois publiée, elle ne change plus : la correction va dans la suivante.
-- ────────────────────────────────────────────────────────────────────────

ALTER TABLE bookmark ADD COLUMN IF NOT EXISTS position integer;
