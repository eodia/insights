-- ────────────────────────────────────────────────────────────────────────
-- 0002 — Questions de tableau de bord : une question créée depuis un tableau de bord
-- lui appartient. Elle n'est rangée dans aucun dossier, prend les droits du tableau et
-- disparaît avec lui.
--
-- Appliquée au démarrage, dans sa propre transaction, après toutes les précédentes.
-- Ni transaction explicite, ni CREATE INDEX CONCURRENTLY : elle s'exécute déjà dans une.
-- Une fois publiée, elle ne change plus : la correction va dans la suivante.
-- ────────────────────────────────────────────────────────────────────────

ALTER TABLE question ADD COLUMN IF NOT EXISTS dashboard_id uuid REFERENCES dashboard(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS question_dashboard_idx ON question (dashboard_id) WHERE dashboard_id IS NOT NULL;
