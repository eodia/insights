-- ────────────────────────────────────────────────────────────────────────
-- 0003 — Thèmes : polices, couleurs, palette des graphiques et logo, posés sur un dossier
-- (ses sous-dossiers, questions et tableaux de bord en héritent) ou sur un tableau de bord.
--
-- Appliquée au démarrage, dans sa propre transaction, après toutes les précédentes.
-- Ni transaction explicite, ni CREATE INDEX CONCURRENTLY : elle s'exécute déjà dans une.
-- Une fois publiée, elle ne change plus : la correction va dans la suivante.
-- ────────────────────────────────────────────────────────────────────────


CREATE TABLE IF NOT EXISTS theme (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  settings jsonb NOT NULL DEFAULT '{}',
  created_by uuid REFERENCES app_user(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE folder ADD COLUMN IF NOT EXISTS theme_id uuid REFERENCES theme(id) ON DELETE SET NULL;
ALTER TABLE dashboard ADD COLUMN IF NOT EXISTS theme_id uuid REFERENCES theme(id) ON DELETE SET NULL;
