-- ────────────────────────────────────────────────────────────────────────
-- 0005 — Ce qu'est une table pour Trino : une table, une vue ou une vue matérialisée.
--
-- La synchronisation le relève ; l'explorateur et l'éditeur SQL montrent une vue par son
-- propre picto, et l'onglet « Vues » d'une source sait laquelle se rafraîchit.
--
-- Appliquée au démarrage, dans sa propre transaction, après toutes les précédentes.
-- Ni transaction explicite, ni CREATE INDEX CONCURRENTLY : elle s'exécute déjà dans une.
-- Une fois publiée, elle ne change plus : la correction va dans la suivante.
-- ────────────────────────────────────────────────────────────────────────

ALTER TABLE db_table ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'table';

DO $$ BEGIN
  ALTER TABLE db_table ADD CONSTRAINT db_table_kind_check CHECK (kind IN ('table', 'view', 'materialized_view'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
